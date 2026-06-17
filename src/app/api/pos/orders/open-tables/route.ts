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
// Auto-cierra mesas con más de 24h sin actividad
export async function GET() {
  try {
    const supabase = getAdminClient()

    // Auto-close tables open for more than 24 hours
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('orders')
      .update({ is_open: false, closed_at: new Date().toISOString(), status: 'cancelled' })
      .eq('is_open', true)
      .eq('channel', 'pos')
      .lt('created_at', staleThreshold)
      .then(() => {}, () => {}) // non-fatal

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_number,
        created_at,
        total,
        notes,
        employee_name,
        order_items(id, quantity, unit_price)
      `)
      .eq('is_open', true)
      .eq('channel', 'pos')
      .not('table_number', 'is', null)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    const tables = (orders ?? []).map((o) => {
      const allItems = (o.order_items as { id: string; quantity: number; unit_price: number }[]) ?? []
      const itemCount = allItems.reduce((sum, i) => sum + i.quantity, 0)

      return {
        order_id: o.id,
        table_number: o.table_number,
        opened_at: o.created_at,
        total: o.total,
        notes: o.notes,
        employee_name: (o as Record<string, unknown>).employee_name ?? null,
        item_count: itemCount,
        items_pending_kitchen: 0,
      }
    })

    return NextResponse.json({ tables })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[open-tables]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
