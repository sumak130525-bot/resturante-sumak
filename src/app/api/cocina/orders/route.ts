import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Tipos unificados para el KDS ────────────────────────────────────────────

export type KdsItem = {
  name: string
  quantity: number
  price: number
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

type LoyverseLineItem = {
  item_name?: string
  variant_name?: string
  quantity: number
  price: number
}

type LoyverseReceipt = {
  receipt_number: string
  receipt_date: string
  source?: string
  total_money: number
  note?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line_items?: LoyverseLineItem[]
  [key: string]: unknown
}

async function getLocalOrders(): Promise<KdsOrder[]> {
  const token = process.env.LOYVERSE_ACCESS_TOKEN
  const storeId = process.env.LOYVERSE_STORE_ID ?? 'ca14eb24-6ad6-40d2-80b1-87df568c4ecc'

  if (!token) return []

  // Últimas 6 horas
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  try {
    const url = `https://api.loyverse.com/v1.0/receipts?store_id=${storeId}&created_at_min=${encodeURIComponent(since)}&limit=50`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) return []

    const data = await res.json()
    const receipts: LoyverseReceipt[] = data.receipts ?? []

    return receipts.map((r, idx) => ({
      id: `loyverse-${r.receipt_number}`,
      source: 'LOCAL' as const,
      number: `L-${r.receipt_number ?? String(idx + 1).padStart(3, '0')}`,
      customer: 'Mesa / POS',
      status: 'confirmed',
      items: (r.line_items ?? []).map((li) => ({
        name: li.item_name ?? li.variant_name ?? 'Ítem',
        quantity: li.quantity,
        price: li.price,
      })),
      total: r.total_money,
      notes: r.note ?? null,
      created_at: r.receipt_date,
    }))
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
