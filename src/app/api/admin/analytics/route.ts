import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase(serviceRole = false) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

// Argentina is UTC-3. All period boundaries are computed in Argentina local time,
// then converted to UTC for Supabase queries.
const ARG_OFFSET_MS = -3 * 60 * 60 * 1000 // -3 hours in ms

/** Returns the current date/time in Argentina as a plain Date whose UTC values
 *  represent the Argentina wall-clock time (i.e. argNow.getUTCFullYear() etc.
 *  give the Argentina calendar fields). */
function nowInArgentina(): Date {
  return new Date(Date.now() + ARG_OFFSET_MS)
}

/** Converts a "fake UTC" Argentina date back to a real UTC ISO string. */
function argToUtcIso(argDate: Date): string {
  return new Date(argDate.getTime() - ARG_OFFSET_MS).toISOString()
}

function getPeriodRange(period: string): { from: string; to: string } {
  const argNow = nowInArgentina()
  const y = argNow.getUTCFullYear()
  const m = argNow.getUTCMonth()
  const d = argNow.getUTCDate()

  let argFrom: Date

  switch (period) {
    case 'today':
      // Start of today 00:00:00 Argentina
      argFrom = new Date(Date.UTC(y, m, d, 0, 0, 0))
      break
    case 'week':
      // Start of 6 days ago 00:00:00 Argentina
      argFrom = new Date(Date.UTC(y, m, d - 6, 0, 0, 0))
      break
    case 'month':
      // Start of this month Argentina
      argFrom = new Date(Date.UTC(y, m, 1, 0, 0, 0))
      break
    case 'year':
      // Start of this year Argentina
      argFrom = new Date(Date.UTC(y, 0, 1, 0, 0, 0))
      break
    default:
      argFrom = new Date(Date.UTC(y, m, d, 0, 0, 0))
  }

  return {
    from: argToUtcIso(argFrom),
    to: new Date().toISOString(), // "now" in real UTC — upper bound is always current moment
  }
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const period = req.nextUrl.searchParams.get('period') || 'today'
  const { from, to } = getPeriodRange(period)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Fetch all non-cancelled orders in range
  const { data: orders, error: ordersError } = await sb
    .from('orders')
    .select('id, total, status, source, channel, created_at, payment_method, dining_option, persons')
    .neq('status', 'cancelled')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true })

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 })

  const orderList: {
    id: string
    total: number
    source: string | null
    channel: string | null
    created_at: string
    payment_method: string | null
    dining_option: string | null
  }[] = orders ?? []

  const orderIds = orderList.map((o) => o.id)

  // Fetch order items for top products (including category via menu_items → categories)
  let itemRows: { menu_item_id: string; quantity: number; unit_price: number; menu_items: { name: string; categories: { name: string } | null } | null }[] = []
  if (orderIds.length > 0) {
    const { data: items } = await sb
      .from('order_items')
      .select('menu_item_id, quantity, unit_price, menu_items(name, categories(name))')
      .in('order_id', orderIds)
    itemRows = items ?? []
  }

  // --- KPIs ---
  const totalSales = orderList.reduce((s, o) => s + (o.total ?? 0), 0)
  const orderCount = orderList.length
  const avgTicket = orderCount > 0 ? totalSales / orderCount : 0

  // Hours in range
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const hoursInPeriod = Math.max(1, (toMs - fromMs) / (1000 * 60 * 60))
  const ordersPerHour = orderCount / hoursInPeriod

  // --- Sales by day ---
  const dayMap = new Map<string, number>()
  for (const o of orderList) {
    // Convert UTC timestamp to Argentina date string (UTC-3)
    const argDate = new Date(new Date(o.created_at).getTime() + ARG_OFFSET_MS)
    const day = argDate.toISOString().slice(0, 10) // YYYY-MM-DD in Argentina time
    dayMap.set(day, (dayMap.get(day) ?? 0) + (o.total ?? 0))
  }
  const salesByDay = Array.from(dayMap.entries()).map(([date, total]) => ({ date, total }))

  // --- Sales by hour ---
  const hourMap = new Map<number, number>()
  for (let h = 0; h < 24; h++) hourMap.set(h, 0)
  for (const o of orderList) {
    const argDate = new Date(o.created_at)
    const h = (argDate.getUTCHours() - 3 + 24) % 24
    hourMap.set(h, (hourMap.get(h) ?? 0) + (o.total ?? 0))
  }
  const salesByHour = Array.from(hourMap.entries()).map(([hour, total]) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    total,
  }))

  // --- Top products ---
  const productMap = new Map<string, { name: string; category: string; quantity: number; revenue: number }>()
  const categorySet = new Set<string>()
  for (const item of itemRows) {
    const name = item.menu_items?.name ?? item.menu_item_id
    const category = item.menu_items?.categories?.name ?? 'Sin categoría'
    categorySet.add(category)
    const existing = productMap.get(name)
    if (existing) {
      existing.quantity += item.quantity
      existing.revenue += item.quantity * item.unit_price
    } else {
      productMap.set(name, { name, category, quantity: item.quantity, revenue: item.quantity * item.unit_price })
    }
  }
  const totalItemRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0)
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .map((p) => ({
      ...p,
      percentage: totalItemRevenue > 0 ? (p.revenue / totalItemRevenue) * 100 : 0,
    }))
  const availableCategories = Array.from(categorySet).sort()

  // --- Payment methods ---
  const paymentMap = new Map<string, number>()
  for (const o of orderList) {
    const m = o.payment_method ?? 'Desconocido'
    paymentMap.set(m, (paymentMap.get(m) ?? 0) + (o.total ?? 0))
  }
  const paymentMethods = Array.from(paymentMap.entries()).map(([name, value]) => ({ name, value }))

  // --- Dining options ---
  const diningMap = new Map<string, number>()
  for (const o of orderList) {
    const d = o.dining_option ?? 'Desconocido'
    diningMap.set(d, (diningMap.get(d) ?? 0) + (o.total ?? 0))
  }
  const diningOptions = Array.from(diningMap.entries()).map(([name, value]) => ({ name, value }))

  // --- Sales by source (channel) ---
  const sourceMap = new Map<string, number>()
  for (const o of orderList) {
    let src: string
    if (o.channel === 'pos') src = 'POS'
    else if (o.channel === 'web') src = 'Web'
    else if (o.channel === 'whatsapp') src = 'WhatsApp'
    else src = 'Otro'
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + (o.total ?? 0))
  }
  const salesBySource = Array.from(sourceMap.entries()).map(([name, value]) => ({ name, value }))

  return NextResponse.json({
    totalSales,
    orderCount,
    avgTicket,
    ordersPerHour,
    salesByDay,
    salesByHour,
    topProducts,
    availableCategories,
    paymentMethods,
    diningOptions,
    salesBySource,
  })
}
