import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

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

function getPeriodRange(period: string, dateFrom?: string | null, dateTo?: string | null): { from: string; to: string } {
  if (period === 'custom' && dateFrom && dateTo) {
    return {
      from: new Date(dateFrom + 'T00:00:00').toISOString(),
      to: new Date(dateTo + 'T23:59:59').toISOString(),
    }
  }
  const now = new Date()
  let from: Date
  const to = new Date(now)

  switch (period) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      break
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
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

// ─── Sales Report ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSalesReport(db: any, from: string, to: string) {
  const { data: orders, error } = await db
    .from('orders')
    .select('id, total, status, source, created_at, payment_method, dining_option')
    .neq('status', 'cancelled')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

  let itemMap: Record<string, string[]> = {}
  if (orderIds.length > 0) {
    const { data: items } = await db
      .from('order_items')
      .select('order_id, quantity, menu_items(name)')
      .in('order_id', orderIds)

    for (const item of (items ?? [])) {
      const mn = item.menu_items?.name ?? 'Ítem'
      const qty = Number(item.quantity)
      const label = qty > 1 ? `${qty}x ${mn}` : mn
      if (!itemMap[item.order_id]) itemMap[item.order_id] = []
      itemMap[item.order_id].push(label)
    }
  }

  const rows = (orders ?? []).map((o: {
    id: string
    total: number
    created_at: string
    payment_method: string | null
    dining_option: string | null
    source: string | null
  }, idx: number) => ({
    numero: idx + 1,
    fecha: new Date(o.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: new Date(o.created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
    pedido: o.id.slice(-8).toUpperCase(),
    items: (itemMap[o.id] ?? []).join(', ') || '—',
    total: Number(o.total),
    metodoPago: o.payment_method ?? 'Desconocido',
    modalidad: o.dining_option ?? 'Desconocido',
    canal: o.source ?? 'WhatsApp',
  }))

  const totalVentas = rows.reduce((s: number, r: { total: number }) => s + r.total, 0)
  const totalPedidos = rows.length

  return {
    rows,
    totals: {
      totalVentas,
      totalPedidos,
      ticketPromedio: totalPedidos > 0 ? totalVentas / totalPedidos : 0,
    },
  }
}

// ─── Profitability Report ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getProfitabilityReport(db: any, from: string, to: string) {
  const [menuRes, recipeRes, plateCostsRes, ingredientsRes] = await Promise.all([
    db.from('menu_items').select('id, name, price, category_id').eq('active', true),
    db.from('recipe_items').select('menu_item_id, ingredient_id, quantity'),
    db.from('plate_costs').select('*'),
    db.from('ingredients').select('id, price_per_unit'),
  ])

  // Get sales in period
  const { data: periodOrders } = await db
    .from('orders')
    .select('id')
    .neq('status', 'cancelled')
    .gte('created_at', from)
    .lte('created_at', to)

  const orderIds = (periodOrders ?? []).map((o: { id: string }) => o.id)
  let salesMap: Record<string, { salesCount: number; revenue: number }> = {}

  if (orderIds.length > 0) {
    const { data: items } = await db
      .from('order_items')
      .select('menu_item_id, quantity, unit_price')
      .in('order_id', orderIds)

    for (const row of (items ?? [])) {
      const mid = row.menu_item_id
      if (!salesMap[mid]) salesMap[mid] = { salesCount: 0, revenue: 0 }
      salesMap[mid].salesCount += Number(row.quantity)
      salesMap[mid].revenue += Number(row.quantity) * Number(row.unit_price)
    }
  }

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

  const rows = (menuRes.data ?? [])
    .map((item: { id: string; name: string; price: number; category_id: string | null }) => {
      const recipe = recipeByItem[item.id] ?? []
      const hasCostData = recipe.length > 0 || plateCostMap[item.id] !== undefined
      const sales = salesMap[item.id] ?? { salesCount: 0, revenue: 0 }

      let costo: number | null = null
      let ganancia: number | null = null
      let margen: number | null = null

      if (hasCostData) {
        const ingredientCost = recipe.reduce((sum: number, ri: { ingredient_id: string; quantity: number }) => {
          return sum + (ingredientPriceMap[ri.ingredient_id] ?? 0) * ri.quantity
        }, 0)
        const pc = plateCostMap[item.id] ?? { packaging: 0, labor: 0, indirect: 0 }
        costo = ingredientCost + pc.packaging + pc.labor + pc.indirect
        const costoTotal = costo * sales.salesCount
        ganancia = sales.revenue - costoTotal
        margen = sales.revenue > 0
          ? (ganancia / sales.revenue) * 100
          : (Number(item.price) > 0 ? ((Number(item.price) - costo) / Number(item.price)) * 100 : 0)
      }

      return {
        plato: item.name,
        vendidos: sales.salesCount,
        ingresos: sales.revenue,
        costo,
        ganancia,
        margen,
      }
    })
    .sort((a: { ganancia: number | null }, b: { ganancia: number | null }) => (b.ganancia ?? -Infinity) - (a.ganancia ?? -Infinity))

  const withData = rows.filter((r: { costo: number | null }) => r.costo !== null)
  const totalIngresos = rows.reduce((s: number, r: { ingresos: number }) => s + r.ingresos, 0)
  const totalGanancia = withData.reduce((s: number, r: { ganancia: number | null }) => s + (r.ganancia ?? 0), 0)
  const avgMargen = withData.length > 0
    ? withData.reduce((s: number, r: { margen: number | null }) => s + (r.margen ?? 0), 0) / withData.length
    : 0

  return {
    rows,
    totals: {
      totalIngresos,
      totalGanancia,
      avgMargen,
      totalPlatos: rows.length,
    },
  }
}

// ─── Inventory Report ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getInventoryReport(db: any) {
  const { data: ingredients, error } = await db
    .from('ingredients')
    .select('id, name, unit, price_per_unit, updated_at')
    .order('name')

  if (error) throw new Error(error.message)

  // Get stock from inventory table
  const { data: inventoryRows } = await db
    .from('inventory')
    .select('ingredient_id, stock, min_stock')

  const inventoryMap = new Map<string, { stock: number; min_stock: number }>()
  for (const row of (inventoryRows ?? [])) {
    inventoryMap.set(row.ingredient_id, { stock: Number(row.stock ?? 0), min_stock: Number(row.min_stock ?? 5) })
  }

  const rows = (ingredients ?? []).map((ing: {
    id: string
    name: string
    unit: string | null
    price_per_unit: number | null
    updated_at: string | null
  }) => {
    const inv = inventoryMap.get(ing.id)
    const stock = inv ? inv.stock : 0
    const minStock = inv ? inv.min_stock : 5
    const alertaBajoStock = stock <= minStock

    return {
      ingrediente: ing.name,
      stockActual: stock,
      unidad: ing.unit ?? '—',
      precio: ing.price_per_unit ?? null,
      ultimoUso: ing.updated_at
        ? new Date(ing.updated_at).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—',
      alertaBajoStock,
    }
  })

  const totalValor = rows.reduce((s: number, r: { stockActual: number | null; precio: number | null }) => {
    return s + ((r.stockActual ?? 0) * (r.precio ?? 0))
  }, 0)
  const alertas = rows.filter((r: { alertaBajoStock: boolean }) => r.alertaBajoStock).length

  return {
    rows,
    totals: {
      totalIngredientes: rows.length,
      totalValor,
      alertasBajoStock: alertas,
    },
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type') || 'sales'
  const period = req.nextUrl.searchParams.get('period') || 'month'
  const dateFrom = req.nextUrl.searchParams.get('dateFrom')
  const dateTo = req.nextUrl.searchParams.get('dateTo')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { from, to } = getPeriodRange(period, dateFrom, dateTo)

  try {
    if (type === 'sales') {
      const data = await getSalesReport(db, from, to)
      return NextResponse.json({ type, period, from, to, ...data })
    }

    if (type === 'profitability') {
      const data = await getProfitabilityReport(db, from, to)
      return NextResponse.json({ type, period, from, to, ...data })
    }

    if (type === 'inventory') {
      const data = await getInventoryReport(db)
      return NextResponse.json({ type, period: 'current', from: null, to: null, ...data })
    }

    return NextResponse.json({ error: 'Tipo de reporte inválido' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
