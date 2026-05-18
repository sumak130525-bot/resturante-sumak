/*
 * ============================================================
 * SQL — ejecutar en Supabase Dashboard → SQL Editor:
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.pause_entries (
 *   id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   time_entry_id  uuid        NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
 *   pause_start    timestamptz NOT NULL,
 *   pause_end      timestamptz,
 *   reason         text        NOT NULL,
 *   created_at     timestamptz DEFAULT now()
 * );
 *
 * -- Index for fast lookups by time_entry_id
 * CREATE INDEX IF NOT EXISTS pause_entries_time_entry_id_idx
 *   ON public.pause_entries(time_entry_id);
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Argentina UTC-3
const ARG_OFFSET_MS = -3 * 60 * 60 * 1000

function nowArgentina(): Date {
  return new Date(Date.now() + ARG_OFFSET_MS)
}

function argDateString(): string {
  const arg = nowArgentina()
  const y = arg.getUTCFullYear()
  const m = String(arg.getUTCMonth() + 1).padStart(2, '0')
  const d = String(arg.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function getServiceClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list: { name: string; value: string; options: CookieOptions }[]) {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

async function requireAuth() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list: { name: string; value: string; options: CookieOptions }[]) {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (authClient as any).auth.getUser()
  return user
}

// GET /api/empleados/fichaje?date=YYYY-MM-DD — fichajes del día (default: hoy Argentina)
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? argDateString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any
  const { data, error } = await sb
    .from('time_entries')
    .select('*, employees(name, role, hourly_rate)')
    .eq('date', date)
    .order('clock_in', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/empleados/fichaje — registrar entrada, salida, pausa o regresar
// body: { employee_id, action: 'entrada' | 'salida' | 'pausa' | 'regresar', reason?: string }
// No requiere auth — la verificación de identidad se hace por PIN en el frontend
export async function POST(req: NextRequest) {

  const { employee_id, action, reason } = await req.json()
  if (!employee_id || !action) {
    return NextResponse.json({ error: 'employee_id y action son requeridos' }, { status: 400 })
  }
  if (!['entrada', 'salida', 'pausa', 'regresar'].includes(action)) {
    return NextResponse.json({ error: 'action debe ser "entrada", "salida", "pausa" o "regresar"' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const today = argDateString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any

  // ── ENTRADA ──────────────────────────────────────────────────────────────────
  if (action === 'entrada') {
    // Check no open entry already exists for today
    const { data: existing } = await sb
      .from('time_entries')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('date', today)
      .is('clock_out', null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Ya existe una entrada abierta para hoy' }, { status: 409 })
    }

    const { data, error } = await sb
      .from('time_entries')
      .insert({ employee_id, clock_in: now, date: today })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── SALIDA ────────────────────────────────────────────────────────────────────
  if (action === 'salida') {
    // Find open entry for today
    const { data: openEntry, error: findErr } = await sb
      .from('time_entries')
      .select('id, clock_in')
      .eq('employee_id', employee_id)
      .eq('date', today)
      .is('clock_out', null)
      .maybeSingle()

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
    if (!openEntry) {
      return NextResponse.json({ error: 'No hay entrada abierta para registrar salida' }, { status: 404 })
    }

    // Auto-close any open pause before registering clock_out
    const { data: openPause } = await sb
      .from('pause_entries')
      .select('id')
      .eq('time_entry_id', openEntry.id)
      .is('pause_end', null)
      .maybeSingle()

    if (openPause) {
      await sb
        .from('pause_entries')
        .update({ pause_end: now })
        .eq('id', openPause.id)
    }

    // Calculate hours_worked = clock_out - clock_in (gross, without subtracting pauses)
    // Effective hours are computed in the frontend using pause_entries data
    const clockInMs = new Date(openEntry.clock_in).getTime()
    const clockOutMs = new Date(now).getTime()
    const hours_worked = Math.round((clockOutMs - clockInMs) / (1000 * 60 * 60) * 100) / 100

    const { data, error } = await sb
      .from('time_entries')
      .update({ clock_out: now, hours_worked })
      .eq('id', openEntry.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── PAUSA ─────────────────────────────────────────────────────────────────────
  if (action === 'pausa') {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'El motivo de la pausa es obligatorio' }, { status: 400 })
    }

    // Find open entry for today
    const { data: openEntry, error: findErr } = await sb
      .from('time_entries')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('date', today)
      .is('clock_out', null)
      .maybeSingle()

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
    if (!openEntry) {
      return NextResponse.json({ error: 'No hay entrada abierta para iniciar una pausa' }, { status: 404 })
    }

    // Check no open pause already exists
    const { data: existingPause } = await sb
      .from('pause_entries')
      .select('id')
      .eq('time_entry_id', openEntry.id)
      .is('pause_end', null)
      .maybeSingle()

    if (existingPause) {
      return NextResponse.json({ error: 'Ya hay una pausa abierta para este turno' }, { status: 409 })
    }

    const { data, error } = await sb
      .from('pause_entries')
      .insert({ time_entry_id: openEntry.id, pause_start: now, reason: reason.trim() })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── REGRESAR ──────────────────────────────────────────────────────────────────
  if (action === 'regresar') {
    // Find open entry for today
    const { data: openEntry, error: findErr } = await sb
      .from('time_entries')
      .select('id')
      .eq('employee_id', employee_id)
      .eq('date', today)
      .is('clock_out', null)
      .maybeSingle()

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
    if (!openEntry) {
      return NextResponse.json({ error: 'No hay entrada abierta' }, { status: 404 })
    }

    // Find open pause for this entry
    const { data: openPause, error: pauseErr } = await sb
      .from('pause_entries')
      .select('id')
      .eq('time_entry_id', openEntry.id)
      .is('pause_end', null)
      .maybeSingle()

    if (pauseErr) return NextResponse.json({ error: pauseErr.message }, { status: 500 })
    if (!openPause) {
      return NextResponse.json({ error: 'No hay pausa abierta para cerrar' }, { status: 404 })
    }

    const { data, error } = await sb
      .from('pause_entries')
      .update({ pause_end: now })
      .eq('id', openPause.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}

// PUT /api/empleados/fichaje — editar entrada/salida de un fichaje existente
// body: { id, clock_in?, clock_out? }
export async function PUT(req: NextRequest) {
  const { id, clock_in, clock_out } = await req.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {}

  if (clock_in !== undefined) {
    updates.clock_in = clock_in
  }
  if (clock_out !== undefined) {
    updates.clock_out = clock_out
  }

  // Recalculate hours_worked if both timestamps are present
  if (updates.clock_in || updates.clock_out) {
    // Fetch current entry to fill missing values
    const { data: current, error: fetchErr } = await sb
      .from('time_entries')
      .select('clock_in, clock_out')
      .eq('id', id)
      .single()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const finalClockIn = updates.clock_in ?? current.clock_in
    const finalClockOut = updates.clock_out ?? current.clock_out

    if (finalClockIn && finalClockOut) {
      const ms = new Date(finalClockOut).getTime() - new Date(finalClockIn).getTime()
      updates.hours_worked = Math.round(ms / (1000 * 60 * 60) * 100) / 100
    }
  }

  const { data, error } = await sb
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/empleados/fichaje?id=entry_id — eliminar un fichaje
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any

  const { error } = await sb
    .from('time_entries')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
