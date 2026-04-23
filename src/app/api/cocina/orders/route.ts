import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Tipos unificados para el KDS ────────────────────────────────────────────

export type KdsItem = {
  name: string
  quantity: number
  price: number
  modifiers?: string[]
}

export type KdsOrder = {
  id: string
  source: 'WEB' | 'LOCAL'
  number: string
  customer: string
  status: string
  items: KdsItem[]
  total: number
  notes: string | null
  created_at: string
  // Campos extra Loyverse (LOCAL)
  orderNumber?: string      // campo 'order' del receipt (ej: 'MESA 8')
  diningOption?: string     // campo 'dining_option' (ej: 'Comer dentro')
  paymentMethod?: string    // payments[0].name (ej: 'Efectivo')
  // Campos extra WEB
  tableNumber?: string      // mesa del pedido web (del parámetro ?mesa=)
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function getWebOrders(): Promise<KdsOrder[]> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  // Últimas 6 horas
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orders')
    .select('*, order_items(quantity, unit_price, menu_items(name))')
    .gte('created_at', since)
    .not('status', 'in', '("delivered","cancelled")')
    .order('created_at', { ascending: true })

  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((o, idx) => ({
    id: o.id,
    source: 'WEB' as const,
    number: `W-${String(idx + 1).padStart(3, '0')}`,
    customer: o.customer_name,
    status: o.status,
    tableNumber: o.table_number ?? o.mesa ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (o.order_items ?? []).map((i: any) => ({
      name: i.menu_items?.name ?? 'Ítem',
      quantity: i.quantity,
      price: i.unit_price,
    })),
    total: o.total,
    notes: o.notes,
    created_at: o.created_at,
  }))
}

// ─── Loyverse ─────────────────────────────────────────────────────────────────

type LoyverseLineModifier = {
  name?: string
  option?: string
}

type LoyverseLineItem = {
  item_name?: string
  variant_name?: string
  quantity: number
  price: number
  category_id?: string
  line_modifiers?: LoyverseLineModifier[]
}

type LoyversePayment = {
  name?: string
  [key: string]: unknown
}

type LoyverseReceipt = {
  receipt_number: string
  receipt_date: string
  source?: string
  total_money: number
  note?: string
  order?: string
  dining_option?: string
  payments?: LoyversePayment[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line_items?: LoyverseLineItem[]
  [key: string]: unknown
}

type LoyverseCategory = {
  id: string
  name: string
  [key: string]: unknown
}

// Palabras clave para identificar la categoría de bebidas
const BEBIDAS_KEYWORDS = ['bebida', 'bebidas', 'drink', 'drinks', 'jugo', 'jugos', 'refresco', 'refrescos', 'café', 'cafe', 'agua', 'soda', 'gaseosa']

function isBeverageCategoryName(name: string): boolean {
  const lower = name.toLowerCase()
  return BEBIDAS_KEYWORDS.some((kw) => lower.includes(kw))
}

async function getBeverageCategoryIds(token: string): Promise<Set<string>> {
  try {
    const res = await fetch('https://api.loyverse.com/v1.0/categories?limit=250', {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 }, // cachear 5 minutos
    })
    if (!res.ok) return new Set()
    const data = await res.json()
    const categories: LoyverseCategory[] = data.categories ?? []
    const ids = categories
      .filter((c) => isBeverageCategoryName(c.name))
      .map((c) => c.id)
    return new Set(ids)
  } catch {
    return new Set()
  }
}

async function getLocalOrders(): Promise<KdsOrder[]> {
  const token = process.env.LOYVERSE_ACCESS_TOKEN
  const storeId = process.env.LOYVERSE_STORE_ID ?? 'ca14eb24-6ad6-40d2-80b1-87df568c4ecc'

  if (!token) return []

  // Últimas 6 horas
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  try {
    // Obtener IDs de categorías de bebidas en paralelo con los receipts
    const [receiptsRes, beverageIds] = await Promise.all([
      fetch(
        `https://api.loyverse.com/v1.0/receipts?store_id=${storeId}&created_at_min=${encodeURIComponent(since)}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          next: { revalidate: 0 },
        }
      ),
      getBeverageCategoryIds(token),
    ])

    if (!receiptsRes.ok) return []

    const data = await receiptsRes.json()
    const receipts: LoyverseReceipt[] = data.receipts ?? []

    const orders: KdsOrder[] = []

    for (let idx = 0; idx < receipts.length; idx++) {
      const r = receipts[idx]

      // Filtrar line_items que sean bebidas (por category_id)
      const allItems = r.line_items ?? []
      const kitchenItems = beverageIds.size > 0
        ? allItems.filter((li) => !li.category_id || !beverageIds.has(li.category_id))
        : allItems

      // Si todos los items son bebidas, omitir el pedido
      if (kitchenItems.length === 0) continue

      orders.push({
        id: `loyverse-${r.receipt_number}`,
        source: 'LOCAL' as const,
        number: `L-${r.receipt_number ?? String(idx + 1).padStart(3, '0')}`,
        customer: r.order ?? 'Mesa / POS',
        status: 'confirmed',
        // Campos detallados Loyverse
        orderNumber: r.order ?? undefined,
        diningOption: r.dining_option ?? undefined,
        paymentMethod: r.payments?.[0]?.name ?? undefined,
        items: kitchenItems.map((li) => {
          // Construir lista de modificadores como strings legibles
          const modifiers = (li.line_modifiers ?? [])
            .map((m) => [m.name, m.option].filter(Boolean).join(': '))
            .filter(Boolean)
          return {
            name: li.item_name ?? li.variant_name ?? 'Ítem',
            quantity: li.quantity,
            price: li.price,
            modifiers: modifiers.length > 0 ? modifiers : undefined,
          }
        }),
        total: r.total_money,
        notes: r.note ?? null,
        created_at: r.receipt_date,
      })
    }

    return orders
  } catch {
    return []
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  const [webOrders, localOrders] = await Promise.all([
    getWebOrders(),
    getLocalOrders(),
  ])

  // Combinar y ordenar cronológicamente (más recientes primero)
  const all: KdsOrder[] = [...webOrders, ...localOrders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return NextResponse.json(all, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
