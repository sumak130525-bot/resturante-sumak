import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/pos/orders/open-tables
// Retorna todas las mesas actualmente abiertas (is_open = true, channel = 'pos')
export async function GET() {
  try {
    const supabase = getAdminClient()

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_number,
        created_at,
        total,
        notes,
        opened_by_employee_id,
        order_items(id, quantity, unit_price, sent_to_kitchen_at)
      `)
      .eq('is_open', true)
      .eq('channel', 'pos')
      .not('table_number', 'is', null)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    const tables = (orders ?? []).map((o) => {
      const allItems = (o.order_items as { id: string; quantity: number; unit_price: number; sent_to_kitchen_at: string | null }[]) ?? []
      const itemCount = allItems.reduce((sum, i) => sum + i.quantity, 0)
      const pendingKitchen = allItems.filter((i) => !i.sent_to_kitchen_at).reduce((sum, i) => sum + i.quantity, 0)

      return {
        order_id: o.id,
        table_number: o.table_number,
        opened_at: o.created_at,
        total: o.total,
        notes: o.notes,
        item_count: itemCount,
        items_pending_kitchen: pendingKitchen,
      }
    })

    return NextResponse.json({ tables })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[open-tables]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
