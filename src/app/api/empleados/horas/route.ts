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

// GET /api/empleados/horas?employee_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const employee_id = searchParams.get('employee_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!employee_id) return NextResponse.json({ error: 'employee_id es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = await getServiceClient() as any

  let query = sb
    .from('time_entries')
    .select('id, clock_in, clock_out, hours_worked, date, employee_id, employees(name, role, hourly_rate)')
    .eq('employee_id', employee_id)
    .not('clock_out', 'is', null) // only completed entries
    .order('date', { ascending: true })
    .order('clock_in', { ascending: true })

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries = data ?? []

  // Aggregate totals
  const totalHours = entries.reduce((sum: number, e: { hours_worked: number | null }) =>
    sum + (e.hours_worked ?? 0), 0)

  const hourlyRate = entries[0]?.employees?.hourly_rate ?? 0
  const totalAmount = Math.round(totalHours * hourlyRate * 100) / 100

  return NextResponse.json({ entries, totalHours: Math.round(totalHours * 100) / 100, totalAmount })
}
