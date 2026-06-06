import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type NewItem = {
  menu_item_id: string
  quantity: number
  unit_price: number
  line_note?: string | null
  person_number?: number | null
  is_bonus?: boolean
  bonus_reason?: string | null
  original_price?: number | null
}

// POST /api/pos/orders/[id]/items
// Agrega items incrementales a una mesa abierta
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { items, employee_id } = body as { items: NewItem[]; employee_id?: string }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos un item.' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Verificar que la orden existe y está abierta
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, is_open, channel, table_number, total')
      .eq('id', id)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 })
    }
    if (!order.is_open) {
      return NextResponse.json({ error: 'La mesa no está abierta.' }, { status: 400 })
    }
    if (order.channel !== 'pos') {
      return NextResponse.json({ error: 'Solo se pueden agregar items a órdenes POS.' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Insertar nuevos items con sent_to_kitchen_at = NULL (pendientes de enviar)
    const newItems = items.map((item) => ({
      order_id: id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.is_bonus ? 0 : Math.round(item.unit_price),
      line_note: item.line_note ?? null,
      person_number: item.person_number ?? null,
      is_bonus: item.is_bonus ?? false,
      bonus_reason: item.bonus_reason ?? null,
      original_price: item.original_price ?? null,
      sent_to_kitchen_at: null,
      added_at: now,
    }))

    const { data: insertedItems, error: insertErr } = await supabase
      .from('order_items')
      .insert(newItems)
      .select('id')

    if (insertErr) throw new Error(`Items insert: ${insertErr.message}`)

    // Recalcular total de la orden (suma de todos los subtotales actuales)
    const { data: allItems, error: totalErr } = await supabase
      .from('order_items')
      .select('quantity, unit_price')
      .eq('order_id', id)

    if (!totalErr && allItems) {
      const newTotal = allItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
      await supabase
        .from('orders')
        .update({ total: newTotal })
        .eq('id', id)
    }

    // Actualizar empleado que modificó (opcional)
    if (employee_id) {
      await supabase
        .from('orders')
        .update({ opened_by_employee_id: employee_id })
        .eq('id', id)
        .is('opened_by_employee_id', null)
    }

    return NextResponse.json({
      success: true,
      new_item_ids: (insertedItems ?? []).map((i: { id: string }) => i.id),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[pos/orders/items]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
