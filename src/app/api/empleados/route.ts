/*
 * ============================================================
 * SQL — ejecutar en Supabase Dashboard → SQL Editor:
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.employees (
 *   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   name        text NOT NULL,
 *   role        text NOT NULL DEFAULT '',
 *   hourly_rate numeric NOT NULL DEFAULT 0,
 *   active      boolean NOT NULL DEFAULT true,
 *   created_at  timestamptz NOT NULL DEFAULT now()
 * );
 *
 * -- Add PIN column (run if table already exists):
 * ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pin text;
 * CREATE UNIQUE INDEX IF NOT EXISTS employees_pin_unique ON public.employees(pin) WHERE pin IS NOT NULL;
 *
 * CREATE TABLE IF NOT EXISTS public.time_entries (
 *   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 *   clock_in     timestamptz NOT NULL,
 *   clock_out    timestamptz,
 *   hours_worked numeric,
 *   date         date NOT NULL,
 *   created_at   timestamptz NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "service_role_all_employees" ON public.employees
 *   FOR ALL TO service_role USING (true) WITH CHECK (true);
 * CREATE POLICY "service_role_all_time_entries" ON public.time_entries
 *   FOR ALL TO service_role USING (true) WITH CHECK (true);
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

// GET /api/empleados — list all employees
export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any
  const { data, error } = await sb
    .from('employees')
    .select('*')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/empleados — create employee
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { name, role, hourly_rate, pin } = body
  if (!name) return NextResponse.json({ error: 'name es requerido' }, { status: 400 })

  // Validate PIN if provided
  if (pin !== undefined && pin !== null && pin !== '') {
    if (!/^\d{4}$/.test(String(pin))) {
      return NextResponse.json({ error: 'El PIN debe ser exactamente 4 dígitos' }, { status: 400 })
    }
    // Check uniqueness
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbCheck = await getServiceClient() as any
    const { data: existing } = await sbCheck
      .from('employees')
      .select('id')
      .eq('pin', String(pin))
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Este PIN ya está asignado a otro empleado' }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any
  const insertData: Record<string, unknown> = {
    name,
    role: role ?? '',
    hourly_rate: hourly_rate ?? 0,
    active: true,
  }
  if (pin !== undefined && pin !== null && pin !== '') insertData.pin = String(pin)

  const { data, error } = await sb
    .from('employees')
    .insert(insertData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PUT /api/empleados — update employee
export async function PUT(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, name, role, hourly_rate, active, pin } = body
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // Validate PIN if being set
  if (pin !== undefined && pin !== null && pin !== '') {
    if (!/^\d{4}$/.test(String(pin))) {
      return NextResponse.json({ error: 'El PIN debe ser exactamente 4 dígitos' }, { status: 400 })
    }
    // Check uniqueness (exclude self)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbCheck = await getServiceClient() as any
    const { data: existing } = await sbCheck
      .from('employees')
      .select('id')
      .eq('pin', String(pin))
      .neq('id', id)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Este PIN ya está asignado a otro empleado' }, { status: 409 })
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate
  if (active !== undefined) updates.active = active
  if (pin !== undefined) updates.pin = (pin === null || pin === '') ? null : String(pin)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any
  const { data, error } = await sb
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/empleados — delete employee
export async function DELETE(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any
  const { error } = await sb.from('employees').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
