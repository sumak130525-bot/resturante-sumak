import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  getLoyverseItems,
  createLoyverseReceipt,
  findVariantByName,
  getStoreId,
} from '@/lib/loyverse'

type OrderItemRow = {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  menu_items: { name: string; price: number } | null
}

type OrderRow = {
  id: string
  customer_name: string
  total: number
  notes: string | null
  created_at: string
  order_items: OrderItemRow[]
}

async function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurado')
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id } = body

    if (!order_id) {
      return NextResponse.json({ error: 'order_id es requerido' }, { status: 400 })
    }

    // Obtener el pedido desde Supabase con sus items
    const supabase = await getServiceClient()
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, customer_name, total, notes, created_at,
        order_items (
          id, order_id, menu_item_id, quantity, unit_price,
          menu_items ( name, price )
        )
      `)
      .eq('id', order_id)
      .single() as { data: OrderRow | null; error: { message: string } | null }

    if (orderError) throw new Error(orderError.message)
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // Obtener todos los items de Loyverse para hacer el mapeo por nombre
    const loyverseItems = await getLoyverseItems()

    const storeId = getStoreId()
    const lineItems = []
    const unmapped: string[] = []

    for (const oi of order.order_items) {
      const itemName = oi.menu_items?.name ?? ''
      const match = findVariantByName(loyverseItems, itemName)

      if (!match) {
        unmapped.push(itemName)
        continue
      }

      const price = oi.unit_price
      lineItems.push({
        variant_id: match.variant.variant_id,
        quantity: oi.quantity,
        price,
        total_money: price * oi.quantity,
        gross_total_money: price * oi.quantity,
      })
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        {
          error: 'No se pudo mapear ningún item a Loyverse',
          unmapped,
        },
        { status: 422 }
      )
    }

    const receiptDate = order.created_at
      ? new Date(order.created_at).toISOString()
      : new Date().toISOString()

    const receipt = await createLoyverseReceipt({
      store_id: storeId,
      receipt_date: receiptDate,
      source: 'ONLINE',
      note: `Pedido web #${order.id.slice(0, 8)} — ${order.customer_name}${order.notes ? ` | Nota: ${order.notes}` : ''}`,
      total_money: lineItems.reduce((s, l) => s + l.total_money, 0),
      line_items: lineItems,
    })

    return NextResponse.json({
      success: true,
      loyverse_receipt_id: receipt.id ?? receipt.receipt_number,
      unmapped: unmapped.length > 0 ? unmapped : undefined,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
