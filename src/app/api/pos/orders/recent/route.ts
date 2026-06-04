import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const supabase = getAdminClient()

    // Fetch orders from the last 12 hours, channel='pos', most recent first
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('orders')
      .select('id, customer_name, total, payment_method, cash_amount, transfer_amount, created_at, status, table_number, updated_at, order_items(id, menu_item_id, quantity, unit_price, subtotal, menu_items(name))')
      .eq('channel', 'pos')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)

    // Flatten menu_items name into order_items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = (data ?? []).map((order: any) => ({
      ...order,
      order_items: (order.order_items ?? []).map((item: any) => ({
        id: item.id,
        menu_item_id: item.menu_item_id,
        name: item.menu_items?.name ?? 'Sin nombre',
        price: item.unit_price,
        quantity: item.quantity,
      })),
    }))

    return NextResponse.json({ orders })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[GET /api/pos/orders/recent]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
