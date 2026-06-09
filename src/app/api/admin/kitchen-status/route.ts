/*
 * ============================================================
 * TABLAS REQUERIDAS EN SUPABASE (ejecutar manualmente):
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.kitchen_status (
 *   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   is_closed       boolean NOT NULL DEFAULT false,
 *   reason          text,
 *   schedule_start  timestamptz,
 *   schedule_end    timestamptz,
 *   manual          boolean NOT NULL DEFAULT true,
 *   created_at      timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE public.kitchen_status ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "public_read" ON public.kitchen_status
 *   FOR SELECT USING (true);
 *
 * CREATE POLICY "admin_write" ON public.kitchen_status
 *   FOR ALL USING (auth.role() = 'authenticated');
 *
 * -- Insertar fila inicial
 * INSERT INTO public.kitchen_status (is_closed, reason, manual)
 * VALUES (false, null, true);
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const TZ = 'America/Argentina/Mendoza'

async function getClient(useServiceRole = false) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useServiceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

/**
 * Formato weekly_schedule:
 * { "mon": { "open": "08:00", "close": "22:30" }, "tue": { ... }, "sun": null }
 * null = cerrado todo el día
 */
type DaySchedule = { open: string; close: string } | null
type WeeklySchedule = Record<string, DaySchedule>

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * Calcula si la cocina está efectivamente cerrada.
 * Prioridad: manual > weekly_schedule > schedule_start/end
 */
function computeEffectiveClosed(row: {
  is_closed: boolean
  manual: boolean
  schedule_start: string | null
  schedule_end: string | null
  weekly_schedule: WeeklySchedule | null
}): boolean {
  if (row.manual) return row.is_closed

  // Hora actual en Mendoza
  const nowArg = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))

  // Horario semanal recurrente
  if (row.weekly_schedule) {
    const dayKey = DAY_KEYS[nowArg.getDay()]
    const dayConf = row.weekly_schedule[dayKey]
    if (dayConf === null || dayConf === undefined) return true // día cerrado

    const nowMinutes = nowArg.getHours() * 60 + nowArg.getMinutes()
    const [oh, om] = dayConf.open.split(':').map(Number)
    const [ch, cm] = dayConf.close.split(':').map(Number)
    const openMin = oh * 60 + om
    const closeMin = ch * 60 + cm

    // Fuera del rango open-close = cocina cerrada
    return nowMinutes < openMin || nowMinutes >= closeMin
  }

  // Programación puntual (legacy)
  const start = row.schedule_start ? new Date(row.schedule_start) : null
  const end = row.schedule_end ? new Date(row.schedule_end) : null

  if (start && end) {
    return nowArg >= start && nowArg <= end
  }
  if (start && !end) {
    return nowArg >= start
  }
  return false
}

// GET — devuelve el estado actual de la cocina (lectura pública)
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await getClient(false) as any
  const { data, error } = await supabase
    .from('kitchen_status')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    // Si no hay filas, devolver estado por defecto
    if (error.code === 'PGRST116') {
      return NextResponse.json({
        id: null,
        is_closed: false,
        reason: null,
        schedule_start: null,
        schedule_end: null,
        manual: true,
        created_at: null,
        effective_closed: false,
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const effective_closed = computeEffectiveClosed(data)
  return NextResponse.json({ ...data, effective_closed })
}

// PATCH — actualiza el estado de la cocina (requiere auth)
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { is_closed, reason, schedule_start, schedule_end, manual, weekly_schedule } = body

  // Verificar auth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authClient = await getClient(false) as any
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  // Obtener la fila existente
  const { data: existing } = await admin
    .from('kitchen_status')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const updates: Record<string, unknown> = {}
  if (typeof is_closed === 'boolean') updates.is_closed = is_closed
  if (reason !== undefined) updates.reason = reason || null
  if (schedule_start !== undefined) updates.schedule_start = schedule_start || null
  if (schedule_end !== undefined) updates.schedule_end = schedule_end || null
  if (typeof manual === 'boolean') updates.manual = manual
  if (weekly_schedule !== undefined) updates.weekly_schedule = weekly_schedule

  let data, error

  if (existing?.id) {
    // Actualizar fila existente
    const res = await admin
      .from('kitchen_status')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()
    data = res.data
    error = res.error
  } else {
    // Crear fila inicial si no existe
    const res = await admin
      .from('kitchen_status')
      .insert({ is_closed: false, manual: true, ...updates })
      .select()
      .single()
    data = res.data
    error = res.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const effective_closed = computeEffectiveClosed(data)
  return NextResponse.json({ ...data, effective_closed })
}
