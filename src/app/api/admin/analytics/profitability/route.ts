import { NextRequest, NextResponse } from 'next/server'
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

function getPeriodRange(period: string): { from: string; to: string } {
  const now = new Date()
  let from: Date
  const to = new Date(now)

  switch (period) {
    case 'week':
      from = new Date(now)
      from.setDate(now.getDate() - 6)
      from.setHours(0, 0, 0, 0)
      break
    case 'year':
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0)
      break
    case 'month':
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
      break
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

function getPreviousPeriodRange(period: string): { from: string; to: string } {
  const now = new Date()
  let from: Date
  let to: Date

  switch (period) {
    case 'week': {
      to = new Date(now)
      to.setDate(now.getDate() - 7)
      to.setHours(23, 59, 59, 999)
      from = new Date(to)
      from.setDate(to.getDate() - 6)
      from.setHours(0, 0, 0, 0)
      break
    }
    case 'year': {
      from = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0)
      to = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
      break
    }
    case 'month':
    default: {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0)
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      break
    }
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

async function fetchSalesForPeriod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  from: string,
  to: string
): Promise<Record<string, { salesCount: number; revenue: number }>> {
  const { data: orders } = await db
    .from('orders')
    .select('id')
    .neq('status', 'cancelled')
    .gte('created_at', from)
    .lte('created_at', to)

  const orderIds: string[] = (orders ?? []).map((o: { id: string }) => o.id)
  if (orderIds.length === 0) return {}

  const { data: items } = await db
    .from('order_items')
    .select('menu_item_id, quantity, unit_price')
    .in('order_id', orderIds)

  const salesMap: Record<string, { salesCount: number; revenue: number }> = {}
  for (const row of (items ?? [])) {
    const mid = row.menu_item_id
    if (!salesMap[mid]) salesMap[mid] = { salesCount: 0, revenue: 0 }
    salesMap[mid].salesCount += Number(row.quantity)
    salesMap[mid].revenue += Number(row.quantity) * Number(row.unit_price)
  }
  return salesMap
}

/**
 * GET /api/admin/analytics/profitability?period=week|month|year
 * Returns per-plate profitability combining sales data + costs.
 * Items without cost data have cost=null.
 */
export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const period = req.nextUrl.searchParams.get('period') || 'month'
  const { from, to } = getPeriodRange(period)
  const { from: prevFrom, to: prevTo } = getPreviousPeriodRange(period)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Parallel fetches: static data + current period sales + previous period sales
  const [menuRes, recipeRes, plateCostsRes, ingredientsRes, categoriesRes, currentSalesMap, prevSalesMap] =
    await Promise.all([
      db.from('menu_items').select('id, name, price, category_id').eq('active', true),
      db.from('recipe_items').select('menu_item_id, ingredient_id, quantity'),
      db.from('plate_costs').select('*'),
      db.from('ingredients').select('id, price_per_unit'),
      db.from('categories').select('id, name'),
      fetchSalesForPeriod(db, from, to),
      fetchSalesForPeriod(db, prevFrom, prevTo),
    ])

  if (menuRes.error) return NextResponse.json({ error: menuRes.error.message }, { status: 500 })

  // Build lookup maps
  const ingredientPriceMap: Record<string, number> = {}
  for (const ing of (ingredientsRes.data ?? [])) {
    ingredientPriceMap[ing.id] = Number(ing.price_per_unit)
  }

  const recipeByItem: Record<string, { ingredient_id: string; quantity: number }[]> = {}
  for (const ri of (recipeRes.data ?? [])) {
    if (!recipeByItem[ri.menu_item_id]) recipeByItem[ri.menu_item_id] = []
    recipeByItem[ri.menu_item_id].push({ ingredient_id: ri.ingredient_id, quantity: Number(ri.quantity) })
  }

  const plateCostMap: Record<string, { packaging: number; labor: number; indirect: number }> = {}
  for (const pc of (plateCostsRes.data ?? [])) {
    plateCostMap[pc.menu_item_id] = {
      packaging: Number(pc.packaging ?? 0),
      labor: Number(pc.labor ?? 0),
      indirect: Number(pc.indirect ?? 0),
    }
  }

  const categoryMap: Record<string, string> = {}
  for (const cat of (categoriesRes.data ?? [])) {
    categoryMap[cat.id] = cat.name
  }

  const results = (menuRes.data ?? []).map((item: { id: string; name: string; price: number; category_id: string | null }) => {
    const recipe = recipeByItem[item.id] ?? []
    const hasCostData = recipe.length > 0 || plateCostMap[item.id] !== undefined

    let cost: number | null = null
    let totalCost: number | null = null
    let profit: number | null = null
    let margin: number | null = null

    const sales = currentSalesMap[item.id] ?? { salesCount: 0, revenue: 0 }
    const prevSales = prevSalesMap[item.id] ?? { salesCount: 0, revenue: 0 }

    if (hasCostData) {
      const ingredientCost = recipe.reduce((sum: number, ri: { ingredient_id: string; quantity: number }) => {
        return sum + (ingredientPriceMap[ri.ingredient_id] ?? 0) * ri.quantity
      }, 0)
      const pc = plateCostMap[item.id] ?? { packaging: 0, labor: 0, indirect: 0 }
      cost = ingredientCost + pc.packaging + pc.labor + pc.indirect
      totalCost = cost * sales.salesCount
      profit = sales.revenue - totalCost
      margin = sales.revenue > 0 ? (profit / sales.revenue) * 100 : ((Number(item.price) > 0) ? ((Number(item.price) - cost) / Number(item.price)) * 100 : 0)
    }

    // Trend: compare revenue with previous period (>5% up = 'up', <-5% = 'down')
    let trend: 'up' | 'down' | 'neutral' = 'neutral'
    if (prevSales.revenue > 0) {
      const change = (sales.revenue - prevSales.revenue) / prevSales.revenue
      if (change > 0.05) trend = 'up'
      else if (change < -0.05) trend = 'down'
    } else if (sales.revenue > 0) {
      trend = 'up'
    }

    return {
      id: item.id,
      name: item.name,
      category: item.category_id ? (categoryMap[item.category_id] ?? 'Sin categoría') : 'Sin categoría',
      price: Number(item.price),
      salesCount: sales.salesCount,
      revenue: sales.revenue,
      cost,
      totalCost,
      profit,
      margin,
      trend,
    }
  })

  // Sort by revenue descending
  results.sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue)

  // KPIs (only items with cost data + sales)
  const withCostAndSales = results.filter(
    (r: { cost: number | null; salesCount: number }) => r.cost !== null && r.salesCount > 0
  )
  const netProfit = withCostAndSales.reduce((s: number, r: { profit: number | null }) => s + (r.profit ?? 0), 0)
  const avgMargin = withCostAndSales.length > 0
    ? withCostAndSales.reduce((s: number, r: { margin: number | null }) => s + (r.margin ?? 0), 0) / withCostAndSales.length
    : 0
  const sortedByMargin = [...withCostAndSales].sort(
    (a: { margin: number | null }, b: { margin: number | null }) => (b.margin ?? 0) - (a.margin ?? 0)
  )
  const mostProfitable = sortedByMargin[0] ?? null
  const leastProfitable = sortedByMargin[sortedByMargin.length - 1] ?? null

  return NextResponse.json({
    period,
    netProfit,
    avgMargin,
    mostProfitable: mostProfitable
      ? { name: mostProfitable.name, margin: mostProfitable.margin }
      : null,
    leastProfitable: leastProfitable
      ? { name: leastProfitable.name, margin: leastProfitable.margin }
      : null,
    items: results,
  })
}
