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

// POST /api/empleados/fichaje — registrar entrada o salida
// body: { employee_id, action: 'entrada' | 'salida' }
// No requiere auth — la verificación de identidad se hace por PIN en el frontend
export async function POST(req: NextRequest) {

  const { employee_id, action } = await req.json()
  if (!employee_id || !action) {
    return NextResponse.json({ error: 'employee_id y action son requeridos' }, { status: 400 })
  }
  if (action !== 'entrada' && action !== 'salida') {
    return NextResponse.json({ error: 'action debe ser "entrada" o "salida"' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const today = argDateString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any

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
  } else {
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

    // Calculate hours worked
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
}
