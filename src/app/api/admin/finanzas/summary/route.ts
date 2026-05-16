import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdminClient(): Promise<any> {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

// Argentina UTC-3: adjust "local midnight" to UTC
function getPeriodRange(period: string): { from: string; to: string } {
  // Argentina is UTC-3
  const AR_OFFSET_MS = 3 * 60 * 60 * 1000

  const nowUTC = Date.now()
  const nowAR = new Date(nowUTC - AR_OFFSET_MS)

  const arYear = nowAR.getUTCFullYear()
  const arMonth = nowAR.getUTCMonth()
  // const arDay = nowAR.getUTCDate()

  let fromAR: Date
  let toAR: Date

  switch (period) {
    case 'prev_month': {
      const prevMonth = arMonth === 0 ? 11 : arMonth - 1
      const prevYear = arMonth === 0 ? arYear - 1 : arYear
      fromAR = new Date(Date.UTC(prevYear, prevMonth, 1))
      toAR = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59, 999))
      break
    }
    case 'last_3_months': {
      const start = new Date(Date.UTC(arYear, arMonth - 2, 1))
      fromAR = start
      toAR = new Date(Date.UTC(arYear, arMonth + 1, 0, 23, 59, 59, 999))
      break
    }
    case 'year': {
      fromAR = new Date(Date.UTC(arYear, 0, 1))
      toAR = new Date(Date.UTC(arYear, 11, 31, 23, 59, 59, 999))
      break
    }
    case 'current_month':
    default: {
      fromAR = new Date(Date.UTC(arYear, arMonth, 1))
      toAR = new Date(Date.UTC(arYear, arMonth + 1, 0, 23, 59, 59, 999))
      break
    }
  }

  // Convert AR local times to UTC for DB queries (add 3 hours)
  const fromUTC = new Date(fromAR.getTime() + AR_OFFSET_MS)
  const toUTC = new Date(toAR.getTime() + AR_OFFSET_MS)

  return { from: fromUTC.toISOString(), to: toUTC.toISOString() }
}

// Build monthly buckets for chart data (up to 12 months back)
function getMonthlyBuckets(period: string): { label: string; fromDate: string; toDate: string }[] {
  const AR_OFFSET_MS = 3 * 60 * 60 * 1000
  const nowAR = new Date(Date.now() - AR_OFFSET_MS)
  const arYear = nowAR.getUTCFullYear()
  const arMonth = nowAR.getUTCMonth()

  const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  let count: number
  switch (period) {
    case 'last_3_months': count = 3; break
    case 'year': count = 12; break
    default: count = 6
  }

  const buckets: { label: string; fromDate: string; toDate: string }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const m = ((arMonth - i) % 12 + 12) % 12
    const y = arYear + Math.floor((arMonth - i) / 12)
    const fromAR = new Date(Date.UTC(y, m, 1))
    const toAR = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
    const fromUTC = new Date(fromAR.getTime() + AR_OFFSET_MS)
    const toUTC = new Date(toAR.getTime() + AR_OFFSET_MS)
    buckets.push({
      label: `${MONTH_NAMES[m]} ${y}`,
      fromDate: fromUTC.toISOString(),
      toDate: toUTC.toISOString(),
    })
  }
  return buckets
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'current_month'

  const admin = await getAdminClient()
  const { from, to } = getPeriodRange(period)

  // 1. Ingresos: orders (no canceladas) en el período
  const { data: orders, error: ordersError } = await admin
    .from('orders')
    .select('total')
    .neq('status', 'cancelled')
    .gte('created_at', from)
    .lte('created_at', to)

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 })

  const totalIngresos = (orders ?? []).reduce(
    (sum: number, o: { total: number }) => sum + Number(o.total), 0
  )

  // 2. Gastos manuales por categoría en el período
  const { data: expenses, error: expensesError } = await admin
    .from('expenses')
    .select(`
      amount,
      expense_categories:category_id (name)
    `)
    .gte('date', from.slice(0, 10))
    .lte('date', to.slice(0, 10))

  if (expensesError) return NextResponse.json({ error: expensesError.message }, { status: 500 })

  const totalGastosManuales = (expenses ?? []).reduce(
    (sum: number, e: { amount: number }) => sum + Number(e.amount), 0
  )

  // Breakdown por categoría
  const categoryMap: Record<string, number> = {}
  for (const e of (expenses ?? [])) {
    const cat = (e.expense_categories as { name: string } | null)?.name ?? 'Sin categoría'
    categoryMap[cat] = (categoryMap[cat] ?? 0) + Number(e.amount)
  }

  // 3. Costo mercadería: inventory_movements tipo 'purchase' en el período
  // join con ingredients para obtener last_purchase_price (unit_cost no existe en inventory_movements)
  const { data: movements, error: movError } = await admin
    .from('inventory_movements')
    .select('quantity, ingredients(last_purchase_price)')
    .eq('type', 'purchase')
    .gte('created_at', from)
    .lte('created_at', to)

  if (movError) return NextResponse.json({ error: movError.message }, { status: 500 })

  const totalMercaderia = (movements ?? []).reduce(
    (sum: number, m: { quantity: number; ingredients: { last_purchase_price: number } | null }) =>
      sum + (Number(m.ingredients?.last_purchase_price ?? 0) * Number(m.quantity ?? 0)), 0
  )

  // 4. Sueldos: employee_payments en el período
  const { data: payments, error: payError } = await admin
    .from('employee_payments')
    .select('amount')
    .gte('created_at', from)
    .lte('created_at', to)

  // If table doesn't exist yet, default to 0
  const totalSueldos = payError ? 0 : (payments ?? []).reduce(
    (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
  )

  // Build full breakdown (merge manual expenses + mercadería from inventory + sueldos from employee_payments)
  const breakdown: { category: string; amount: number }[] = []

  // Add inventory purchases as "Mercadería (inventario)"
  if (totalMercaderia > 0) {
    categoryMap['Mercadería (inventario)'] = (categoryMap['Mercadería (inventario)'] ?? 0) + totalMercaderia
  }

  // Add employee payments as "Sueldos (nómina)"
  if (totalSueldos > 0) {
    categoryMap['Sueldos (nómina)'] = (categoryMap['Sueldos (nómina)'] ?? 0) + totalSueldos
  }

  for (const [category, amount] of Object.entries(categoryMap)) {
    breakdown.push({ category, amount })
  }
  breakdown.sort((a, b) => b.amount - a.amount)

  const totalGastos = totalGastosManuales + totalMercaderia + totalSueldos
  const gananciaNeta = totalIngresos - totalGastos
  const margenGanancia = totalIngresos > 0 ? (gananciaNeta / totalIngresos) * 100 : 0

  // 5. Monthly chart data
  const buckets = getMonthlyBuckets(period)

  const monthlyData: { mes: string; ingresos: number; gastos: number; ganancia: number }[] = []

  for (const bucket of buckets) {
    const [mOrders, mExpenses, mMovements, mPayments] = await Promise.all([
      admin.from('orders')
        .select('total')
        .neq('status', 'cancelled')
        .gte('created_at', bucket.fromDate)
        .lte('created_at', bucket.toDate),
      admin.from('expenses')
        .select('amount')
        .gte('date', bucket.fromDate.slice(0, 10))
        .lte('date', bucket.toDate.slice(0, 10)),
      admin.from('inventory_movements')
        .select('quantity, ingredients(last_purchase_price)')
        .eq('type', 'purchase')
        .gte('created_at', bucket.fromDate)
        .lte('created_at', bucket.toDate),
      admin.from('employee_payments')
        .select('amount')
        .gte('created_at', bucket.fromDate)
        .lte('created_at', bucket.toDate),
    ])

    const mIngresos = (mOrders.data ?? []).reduce(
      (s: number, o: { total: number }) => s + Number(o.total), 0
    )
    const mGastosManuales = (mExpenses.data ?? []).reduce(
      (s: number, e: { amount: number }) => s + Number(e.amount), 0
    )
    const mMercaderia = (mMovements.data ?? []).reduce(
      (s: number, m: { quantity: number; ingredients: { last_purchase_price: number } | null }) =>
        s + Number(m.ingredients?.last_purchase_price ?? 0) * Number(m.quantity ?? 0), 0
    )
    const mSueldos = mPayments.error ? 0 : (mPayments.data ?? []).reduce(
      (s: number, p: { amount: number }) => s + Number(p.amount), 0
    )
    const mGastos = mGastosManuales + mMercaderia + mSueldos
    monthlyData.push({
      mes: bucket.label,
      ingresos: mIngresos,
      gastos: mGastos,
      ganancia: mIngresos - mGastos,
    })
  }

  return NextResponse.json({
    period,
    from,
    to,
    kpis: {
      totalIngresos,
      totalGastos,
      totalMercaderia,
      totalSueldos,
      totalGastosManuales,
      gananciaNeta,
      margenGanancia,
    },
    breakdown,
    monthly: monthlyData,
  })
}
