/*
 * ============================================================
 * SQL — ejecutar en Supabase Dashboard → SQL Editor:
 * ============================================================
 *
 * ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pin text;
 * CREATE UNIQUE INDEX IF NOT EXISTS employees_pin_unique ON public.employees(pin) WHERE pin IS NOT NULL;
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

// POST /api/empleados/pin — busca empleado por PIN y retorna data + estado de fichaje
// body: { pin: string }
// Retorna error genérico si no encuentra (no revela si PIN existe o no)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { pin } = body ?? {}

  // Validate PIN format
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any

  // Find employee by PIN (service role bypasses RLS)
  const { data: employee, error: empErr } = await sb
    .from('employees')
    .select('id, name, role, active')
    .eq('pin', pin)
    .eq('active', true)
    .maybeSingle()

  if (empErr || !employee) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  // Get today's time entry for this employee (Argentina date)
  const today = argDateString()
  const { data: entries } = await sb
    .from('time_entries')
    .select('id, clock_in, clock_out')
    .eq('employee_id', employee.id)
    .eq('date', today)
    .order('clock_in', { ascending: false })

  const openEntry = (entries ?? []).find((e: { clock_out: string | null }) => !e.clock_out) ?? null

  // Check if there is an open (unfinished) pause for the open entry
  let has_open_pause = false
  if (openEntry) {
    const { data: openPause } = await sb
      .from('pause_entries')
      .select('id')
      .eq('time_entry_id', openEntry.id)
      .is('pause_end', null)
      .maybeSingle()
    has_open_pause = !!openPause
  }

  return NextResponse.json({
    employee: {
      id: employee.id,
      name: employee.name,
      role: employee.role,
    },
    status: openEntry
      ? 'working'
      : 'not_clocked',
    open_entry: openEntry
      ? { id: openEntry.id, clock_in: openEntry.clock_in }
      : null,
    has_open_pause,
  })
}
