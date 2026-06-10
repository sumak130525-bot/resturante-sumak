import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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

// GET /api/empleados/pagos/calcular
// Query params: employee_id, period_from (YYYY-MM-DD), period_to (YYYY-MM-DD)
// Returns: hours_worked, hourly_rate, gross_amount, advances_total, net_amount
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const employee_id = searchParams.get('employee_id')
  const period_from = searchParams.get('period_from')
  const period_to = searchParams.get('period_to')

  if (!employee_id) return NextResponse.json({ error: 'employee_id es requerido' }, { status: 400 })
  if (!period_from || !period_to) {
    return NextResponse.json({ error: 'period_from y period_to son requeridos' }, { status: 400 })
  }

  const sb = getServiceClient()

  // 1. Get employee info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: employee, error: empErr } = await (sb as any)
    .from('employees')
    .select('id, name, role, hourly_rate')
    .eq('id', employee_id)
    .single()

  if (empErr || !employee) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
  }

  // 2. Sum completed time_entries in period (by date range)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: timeEntries, error: timeErr } = await (sb as any)
    .from('time_entries')
    .select('hours_worked')
    .eq('employee_id', employee_id)
    .not('clock_out', 'is', null)
    .gte('date', period_from)
    .lte('date', period_to)

  if (timeErr) return NextResponse.json({ error: timeErr.message }, { status: 500 })

  const hours_worked = (timeEntries ?? []).reduce(
    (sum: number, e: { hours_worked: number | null }) => sum + (e.hours_worked ?? 0), 0
  )
  const hours_rounded = Math.round(hours_worked * 100) / 100
  const hourly_rate = Number(employee.hourly_rate)
  const gross_amount = Math.round(hours_rounded * hourly_rate * 100) / 100

  // 3. Sum advances not yet deducted in the same period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: advances, error: advErr } = await (sb as any)
    .from('employee_payments')
    .select('amount')
    .eq('employee_id', employee_id)
    .eq('type', 'advance')
    .gte('created_at', `${period_from}T00:00:00.000Z`)
    .lte('created_at', `${period_to}T23:59:59.999Z`)

  if (advErr) return NextResponse.json({ error: advErr.message }, { status: 500 })

  const advances_total = (advances ?? []).reduce(
    (sum: number, a: { amount: number }) => sum + Number(a.amount), 0
  )

  // 4. Sum bonuses in the same period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bonuses, error: bonErr } = await (sb as any)
    .from('employee_payments')
    .select('amount, description, period_from, period_to')
    .eq('employee_id', employee_id)
    .eq('type', 'bonus')
    .gte('created_at', `${period_from}T00:00:00.000Z`)
    .lte('created_at', `${period_to}T23:59:59.999Z`)

  if (bonErr) return NextResponse.json({ error: bonErr.message }, { status: 500 })

  const bonuses_total = (bonuses ?? []).reduce(
    (sum: number, b: { amount: number }) => sum + Number(b.amount), 0
  )

  const net_amount = Math.max(0, Math.round((gross_amount + bonuses_total - advances_total) * 100) / 100)

  return NextResponse.json({
    employee: {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      hourly_rate,
    },
    period_from,
    period_to,
    hours_worked: hours_rounded,
    hourly_rate,
    gross_amount,
    bonuses_total: Math.round(bonuses_total * 100) / 100,
    bonuses: bonuses ?? [],
    advances_total: Math.round(advances_total * 100) / 100,
    net_amount,
  })
}
