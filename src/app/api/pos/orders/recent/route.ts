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
      .select('id, customer_name, total, payment_method, cash_amount, transfer_amount, created_at, status, order_items(id, menu_item_id, name, price, quantity, status)')
      .eq('channel', 'pos')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)

    return NextResponse.json({ orders: data ?? [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[GET /api/pos/orders/recent]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
