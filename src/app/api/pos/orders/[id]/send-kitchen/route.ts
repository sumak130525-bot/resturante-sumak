import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/orders/[id]/send-kitchen
// Marca los items no enviados como enviados y retorna datos para imprimir comanda
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { employee_id, employee_name } = body as { employee_id?: string; employee_name?: string }

    const supabase = getAdminClient()

    // Verificar que la orden existe y está abierta
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, is_open, channel, table_number')
      .eq('id', id)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 })
    }
    if (!order.is_open) {
      return NextResponse.json({ error: 'La mesa no está abierta.' }, { status: 400 })
    }

    // Obtener items pendientes de enviar (sent_to_kitchen_at IS NULL)
    const { data: pendingItems, error: itemsErr } = await supabase
      .from('order_items')
      .select(`
        id,
        quantity,
        unit_price,
        line_note,
        person_number,
        menu_items(name)
      `)
      .eq('order_id', id)
      .is('sent_to_kitchen_at', null)

    if (itemsErr) throw new Error(itemsErr.message)

    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ error: 'No hay items nuevos para enviar a cocina.' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Marcar items como enviados
    const pendingIds = pendingItems.map((i: { id: string }) => i.id)
    const { error: updateErr } = await supabase
      .from('order_items')
      .update({ sent_to_kitchen_at: now })
      .in('id', pendingIds)

    if (updateErr) throw new Error(updateErr.message)

    // Contar cuántas rondas se han enviado (distinct sent_to_kitchen_at values)
    const { data: sentItems } = await supabase
      .from('order_items')
      .select('sent_to_kitchen_at')
      .eq('order_id', id)
      .not('sent_to_kitchen_at', 'is', null)

    const distinctRounds = new Set(
      (sentItems ?? []).map((i: { sent_to_kitchen_at: string }) => i.sent_to_kitchen_at)
    ).size

    // Formatear items para la respuesta
    type RawItem = {
      id: string
      quantity: number
      unit_price: number
      line_note: string | null
      person_number: number | null
      menu_items: { name: string } | { name: string }[] | null
    }

    const itemsSent = (pendingItems as RawItem[]).map((i) => {
      const menuItem = Array.isArray(i.menu_items) ? i.menu_items[0] : i.menu_items
      return {
        name: menuItem?.name ?? 'Item',
        quantity: i.quantity,
        line_note: i.line_note ?? null,
        person_number: i.person_number ?? null,
      }
    })

    void employee_id

    // Resetear status a pending (por si la cocina ya lo marcó como delivered en una ronda anterior)
    // y guardar employee_name
    const orderUpdate: Record<string, unknown> = { status: 'pending' }
    if (employee_name) orderUpdate.employee_name = employee_name
    await supabase
      .from('orders')
      .update(orderUpdate)
      .eq('id', id)
      .then(() => {}, () => {}) // non-fatal

    return NextResponse.json({
      success: true,
      items_sent: itemsSent,
      table_number: order.table_number,
      round: distinctRounds,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[pos/orders/send-kitchen]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
