import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

interface OrderRow {
  id: string
  total: number
  created_at: string
  payment_method: string | null
  dining_option: string | null
  persons: number | null
}

interface ItemRow {
  menu_item_id: string
  quantity: number
  menu_items: { name: string } | null
}

export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const now = new Date()

  // ── 90 days of orders ────────────────────────────────────────────────────
  const from90 = new Date(now)
  from90.setDate(now.getDate() - 90)
  from90.setHours(0, 0, 0, 0)

  const { data: orders90, error: err90 } = await db
    .from('orders')
    .select('id, total, created_at, payment_method, dining_option, persons')
    .neq('status', 'cancelled')
    .gte('created_at', from90.toISOString())
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: true })

  if (err90) return NextResponse.json({ error: err90.message }, { status: 500 })

  const orders: OrderRow[] = orders90 ?? []
  const orderIds = orders.map((o) => o.id)

  // ── Order items for product growth analysis ───────────────────────────────
  let items: ItemRow[] = []
  if (orderIds.length > 0) {
    const { data: itemData } = await db
      .from('order_items')
      .select('menu_item_id, quantity, menu_items(name)')
      .in('order_id', orderIds)
    items = itemData ?? []
  }

  // ── Plate costs for margin projection ────────────────────────────────────
  const { data: plateCostsData } = await db
    .from('plate_costs')
    .select('menu_item_id, packaging, labor, indirect')
  const { data: recipeData } = await db
    .from('recipe_items')
    .select('menu_item_id, ingredient_id, quantity')
  const { data: ingredientsData } = await db
    .from('ingredients')
    .select('id, price_per_unit')
  const { data: menuData } = await db
    .from('menu_items')
    .select('id, price')

  // Build cost map
  const ingredientPriceMap: Record<string, number> = {}
  for (const ing of (ingredientsData ?? [])) {
    ingredientPriceMap[ing.id] = Number(ing.price_per_unit)
  }
  const recipeByItem: Record<string, { ingredient_id: string; quantity: number }[]> = {}
  for (const ri of (recipeData ?? [])) {
    if (!recipeByItem[ri.menu_item_id]) recipeByItem[ri.menu_item_id] = []
    recipeByItem[ri.menu_item_id].push({ ingredient_id: ri.ingredient_id, quantity: Number(ri.quantity) })
  }
  const plateCostMap: Record<string, { packaging: number; labor: number; indirect: number }> = {}
  for (const pc of (plateCostsData ?? [])) {
    plateCostMap[pc.menu_item_id] = {
      packaging: Number(pc.packaging ?? 0),
      labor: Number(pc.labor ?? 0),
      indirect: Number(pc.indirect ?? 0),
    }
  }
  const menuPriceMap: Record<string, number> = {}
  for (const m of (menuData ?? [])) {
    menuPriceMap[m.id] = Number(m.price)
  }

  function calcCost(menuItemId: string): number | null {
    const recipe = recipeByItem[menuItemId] ?? []
    const hasCost = recipe.length > 0 || plateCostMap[menuItemId] !== undefined
    if (!hasCost) return null
    const ingredientCost = recipe.reduce((sum: number, ri: { ingredient_id: string; quantity: number }) => {
      return sum + (ingredientPriceMap[ri.ingredient_id] ?? 0) * ri.quantity
    }, 0)
    const pc = plateCostMap[menuItemId] ?? { packaging: 0, labor: 0, indirect: 0 }
    return ingredientCost + pc.packaging + pc.labor + pc.indirect
  }

  // ── Helper: get date string (YYYY-MM-DD) from order ──────────────────────
  function dateOf(o: OrderRow) { return o.created_at.slice(0, 10) }
  function hourOf(o: OrderRow) { return new Date(o.created_at).getHours() }
  function dayOfWeek(o: OrderRow) {
    // 0=Sun, 1=Mon, ..., 6=Sat  →  convert to 0=Mon..5=Sat
    const d = new Date(o.created_at).getDay()
    return d === 0 ? 6 : d - 1
  }

  // ── Daily average ─────────────────────────────────────────────────────────
  const dayTotalMap = new Map<string, number>()
  for (const o of orders) {
    const d = dateOf(o)
    dayTotalMap.set(d, (dayTotalMap.get(d) ?? 0) + (o.total ?? 0))
  }
  const dailyTotals = Array.from(dayTotalMap.values())
  const dailyAverage = dailyTotals.length > 0
    ? dailyTotals.reduce((s, v) => s + v, 0) / dailyTotals.length
    : 0

  // ── Peak hours: average orders-count per hour slot ───────────────────────
  const hourCountMap = new Map<number, number[]>() // hour -> [countPerDay]
  const hourDayMap = new Map<string, Map<number, number>>() // day -> hour -> count
  for (const o of orders) {
    const d = dateOf(o)
    const h = hourOf(o)
    if (!hourDayMap.has(d)) hourDayMap.set(d, new Map())
    const hm = hourDayMap.get(d)!
    hm.set(h, (hm.get(h) ?? 0) + 1)
  }
  for (let h = 0; h < 24; h++) hourCountMap.set(h, [])
  Array.from(hourDayMap.values()).forEach((hm) => {
    for (let h = 0; h < 24; h++) {
      hourCountMap.get(h)!.push(hm.get(h) ?? 0)
    }
  })
  const numDays = hourDayMap.size || 1
  const peakHours = Array.from({ length: 24 }, (_, h) => {
    const counts = hourCountMap.get(h)!
    const avg = counts.length > 0 ? counts.reduce((s, v) => s + v, 0) / numDays : 0
    return { hour: h, label: `${String(h).padStart(2, '0')}:00`, avgOrders: +avg.toFixed(2) }
  })

  // ── Peak days: average sales per day-of-week (Mon-Sat) ───────────────────
  const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const dowSalesMap = new Map<number, number[]>() // dow -> [daily totals]
  const dowDayMap = new Map<string, Map<number, number>>()
  for (const o of orders) {
    const d = dateOf(o)
    const dow = dayOfWeek(o)
    if (!dowDayMap.has(d)) dowDayMap.set(d, new Map())
    const dm = dowDayMap.get(d)!
    dm.set(dow, (dm.get(dow) ?? 0) + (o.total ?? 0))
  }
  for (let i = 0; i < 7; i++) dowSalesMap.set(i, [])
  Array.from(dowDayMap.entries()).forEach(([, dm]) => {
    Array.from(dm.entries()).forEach(([dow, total]) => {
      dowSalesMap.get(dow)!.push(total)
    })
  })
  const peakDays = Array.from({ length: 6 }, (_, i) => {
    const totals = dowSalesMap.get(i)!
    const avg = totals.length > 0 ? totals.reduce((s, v) => s + v, 0) / totals.length : 0
    return { dow: i, label: DOW_LABELS[i], avgSales: +avg.toFixed(0) }
  })

  // ── Weekly trend: compare last 4 weeks ───────────────────────────────────
  const weekTotals: number[] = []
  for (let w = 0; w < 4; w++) {
    const wEnd = new Date(now)
    wEnd.setDate(now.getDate() - w * 7)
    const wStart = new Date(wEnd)
    wStart.setDate(wEnd.getDate() - 6)
    wStart.setHours(0, 0, 0, 0)
    wEnd.setHours(23, 59, 59, 999)
    const total = orders
      .filter((o) => {
        const t = new Date(o.created_at).getTime()
        return t >= wStart.getTime() && t <= wEnd.getTime()
      })
      .reduce((s, o) => s + (o.total ?? 0), 0)
    weekTotals.unshift(total) // oldest first
  }

  let weeklyTrend: 'subiendo' | 'bajando' | 'estable' = 'estable'
  if (weekTotals.length >= 2) {
    const last = weekTotals[weekTotals.length - 1]
    const prev = weekTotals[weekTotals.length - 2]
    const change = prev > 0 ? (last - prev) / prev : 0
    if (change > 0.05) weeklyTrend = 'subiendo'
    else if (change < -0.05) weeklyTrend = 'bajando'
  }

  // Weekly chart data (last 4 weeks, week labels)
  const weeksData = weekTotals.map((total, i) => {
    const weeksAgo = 3 - i
    const label = weeksAgo === 0 ? 'Esta semana' : weeksAgo === 1 ? 'Sem -1' : weeksAgo === 2 ? 'Sem -2' : 'Sem -3'
    return { label, total: +total.toFixed(0) }
  })

  // ── Monthly projection ────────────────────────────────────────────────────
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const daysRemaining = daysInMonth - dayOfMonth

  const soldThisMonth = orders
    .filter((o) => new Date(o.created_at) >= monthStart)
    .reduce((s, o) => s + (o.total ?? 0), 0)

  const monthlyProjection = soldThisMonth + dailyAverage * daysRemaining

  // ── Top growing / declining products ─────────────────────────────────────
  const twoWeeksAgo = new Date(now)
  twoWeeksAgo.setDate(now.getDate() - 14)
  const oneWeekAgo = new Date(now)
  oneWeekAgo.setDate(now.getDate() - 7)

  // Map orderId -> created_at
  const orderDateMap = new Map<string, Date>()
  for (const o of orders) orderDateMap.set(o.id, new Date(o.created_at))

  const productWeek1 = new Map<string, { name: string; qty: number }>()
  const productWeek2 = new Map<string, { name: string; qty: number }>()

  for (const item of items) {
    // We need to find the order date - find via orderIds
    const orderIndex = orderIds.indexOf(item.menu_item_id)
    // item doesn't have order_id here... fetch differently
    // We'll use a different approach: compare via order fetch per window
    void item; void orderIndex
  }

  // Re-fetch items with order_id for growth analysis
  const week1OrderIds = orders
    .filter((o) => {
      const t = new Date(o.created_at).getTime()
      return t >= twoWeeksAgo.getTime() && t < oneWeekAgo.getTime()
    })
    .map((o) => o.id)

  const week2OrderIds = orders
    .filter((o) => new Date(o.created_at) >= oneWeekAgo)
    .map((o) => o.id)

  async function getProductSales(ids: string[]): Promise<Map<string, { name: string; qty: number }>> {
    const map = new Map<string, { name: string; qty: number }>()
    if (ids.length === 0) return map
    const { data } = await db
      .from('order_items')
      .select('menu_item_id, quantity, menu_items(name)')
      .in('order_id', ids)
    for (const row of (data ?? [])) {
      const name = row.menu_items?.name ?? row.menu_item_id
      const ex = map.get(row.menu_item_id)
      if (ex) { ex.qty += Number(row.quantity) }
      else { map.set(row.menu_item_id, { name, qty: Number(row.quantity) }) }
    }
    return map
  }

  const [w1Map, w2Map] = await Promise.all([
    getProductSales(week1OrderIds),
    getProductSales(week2OrderIds),
  ])

  // Populate unused variables to avoid TS errors
  Array.from(w1Map.entries()).forEach(([, v]) => productWeek1.set('', v))
  Array.from(w2Map.entries()).forEach(([, v]) => productWeek2.set('', v))
  productWeek1.clear(); productWeek2.clear()

  // Build growth list
  const allProductIds = Array.from(new Set([...Array.from(w1Map.keys()), ...Array.from(w2Map.keys())]))
  const growthList: { name: string; week1: number; week2: number; delta: number; pct: number }[] = []
  for (const mid of allProductIds) {
    const w1 = w1Map.get(mid)?.qty ?? 0
    const w2 = w2Map.get(mid)?.qty ?? 0
    const name = w2Map.get(mid)?.name ?? w1Map.get(mid)?.name ?? mid
    const delta = w2 - w1
    const pct = w1 > 0 ? (delta / w1) * 100 : (w2 > 0 ? 100 : 0)
    growthList.push({ name, week1: w1, week2: w2, delta, pct: +pct.toFixed(1) })
  }
  growthList.sort((a, b) => b.pct - a.pct)

  const topGrowingProducts = growthList
    .filter((p) => p.delta > 0)
    .slice(0, 5)
    .map(({ name, week1, week2, pct }) => ({ name, week1, week2, pct }))

  const decliningProducts = [...growthList]
    .sort((a, b) => a.pct - b.pct)
    .filter((p) => p.delta < 0)
    .slice(0, 5)
    .map(({ name, week1, week2, pct }) => ({ name, week1, week2, pct }))

  // ── Customer patterns ─────────────────────────────────────────────────────
  const personsValues = orders
    .map((o) => Number(o.persons ?? 0))
    .filter((v) => v > 0)
  const avgPersons = personsValues.length > 0
    ? personsValues.reduce((s, v) => s + v, 0) / personsValues.length
    : 0

  const diningCount = new Map<string, number>()
  const paymentCount = new Map<string, number>()
  for (const o of orders) {
    const d = o.dining_option ?? 'Desconocido'
    diningCount.set(d, (diningCount.get(d) ?? 0) + 1)
    const p = o.payment_method ?? 'Desconocido'
    paymentCount.set(p, (paymentCount.get(p) ?? 0) + 1)
  }
  const favDining = Array.from(diningCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'
  const favPayment = Array.from(paymentCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'

  const customerPatterns = {
    avgPersons: +avgPersons.toFixed(1),
    favoriteDining: favDining,
    favoritePayment: favPayment,
  }

  // ── Estimated monthly profit projection ───────────────────────────────────
  // Use orders from this month + projected via cost map
  const monthOrders = orders.filter((o) => new Date(o.created_at) >= monthStart)
  const monthOrderIds = monthOrders.map((o) => o.id)

  let estimatedMonthlyProfit: number | null = null
  if (monthOrderIds.length > 0) {
    const { data: monthItems } = await db
      .from('order_items')
      .select('menu_item_id, quantity, unit_price')
      .in('order_id', monthOrderIds)

    let totalRevenue = 0
    let totalCost = 0
    let hasCostData = false

    for (const item of (monthItems ?? [])) {
      const qty = Number(item.quantity)
      const unitPrice = Number(item.unit_price)
      totalRevenue += qty * unitPrice
      const cost = calcCost(item.menu_item_id)
      if (cost !== null) {
        totalCost += cost * qty
        hasCostData = true
      }
    }

    if (hasCostData && totalRevenue > 0) {
      const currentProfit = totalRevenue - totalCost
      const avgDailyProfit = dayOfMonth > 0 ? currentProfit / dayOfMonth : 0
      estimatedMonthlyProfit = currentProfit + avgDailyProfit * daysRemaining
    }
  }

  // ── Identify best hour and best day ──────────────────────────────────────
  const bestHour = peakHours.reduce((best, h) => h.avgOrders > best.avgOrders ? h : best, peakHours[0])
  const bestDay = peakDays.reduce((best, d) => d.avgSales > best.avgSales ? d : best, peakDays[0])

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations: { type: 'info' | 'warning' | 'success'; text: string }[] = []

  // Peak hour recommendation
  const topHours = [...peakHours].sort((a, b) => b.avgOrders - a.avgOrders).slice(0, 3)
  if (topHours[0]?.avgOrders > 0) {
    const hLabel = topHours.map((h) => h.label).join(', ')
    recommendations.push({
      type: 'info',
      text: `Horario pico detectado: ${hLabel}. Preparar más stock y personal en esos turnos.`,
    })
  }

  // Growing products
  if (topGrowingProducts.length > 0) {
    recommendations.push({
      type: 'success',
      text: `"${topGrowingProducts[0].name}" creció ${topGrowingProducts[0].pct > 0 ? '+' : ''}${topGrowingProducts[0].pct}% esta semana. Considera promocionarlo.`,
    })
  }

  // Declining products
  if (decliningProducts.length > 0) {
    recommendations.push({
      type: 'warning',
      text: `"${decliningProducts[0].name}" cayó ${decliningProducts[0].pct}% esta semana. Revisar precio o visibilidad en el menú.`,
    })
  }

  // Weekly trend
  if (weeklyTrend === 'bajando') {
    recommendations.push({
      type: 'warning',
      text: 'Tendencia semanal a la baja. Considera promociones o descuentos para recuperar ventas.',
    })
  } else if (weeklyTrend === 'subiendo') {
    recommendations.push({
      type: 'success',
      text: 'Tendencia semanal al alza. Asegurate de tener suficiente stock para mantener el ritmo.',
    })
  }

  // Best day
  if (bestDay?.avgSales > 0) {
    recommendations.push({
      type: 'info',
      text: `${bestDay.label} es tu mejor día de la semana. Refuerza el equipo ese día para maximizar ventas.`,
    })
  }

  return NextResponse.json({
    peakHours,
    peakDays,
    dailyAverage: +dailyAverage.toFixed(0),
    weeklyTrend,
    weeksData,
    monthlyProjection: +monthlyProjection.toFixed(0),
    topGrowingProducts,
    decliningProducts,
    estimatedMonthlyProfit: estimatedMonthlyProfit !== null ? +estimatedMonthlyProfit.toFixed(0) : null,
    customerPatterns,
    bestHour,
    bestDay,
    recommendations,
  })
}
