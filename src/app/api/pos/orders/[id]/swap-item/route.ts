import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// PATCH /api/pos/orders/[id]/swap-item
// Body: { order_item_id, new_menu_item_id, new_name, new_price }
// Swaps an item in the order, recalculates total, creates cash movement for difference
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    const { order_item_id, new_menu_item_id, new_name, new_price } = await request.json()

    if (!order_item_id || !new_menu_item_id || !new_name || new_price === undefined) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Get the current order item with menu_item name
    const { data: oldItem, error: itemErr } = await supabase
      .from('order_items')
      .select('id, menu_item_id, unit_price, quantity, menu_items(name)')
      .eq('id', order_item_id)
      .single()

    if (itemErr || !oldItem) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldName = (oldItem as any).menu_items?.name ?? 'Item'
    const oldTotal = Number(oldItem.unit_price) * Number(oldItem.quantity)
    const newTotal = Number(new_price) * Number(oldItem.quantity)
    const difference = newTotal - oldTotal // positive = more expensive, negative = cheaper

    // Update the order item
    const { error: updateErr } = await supabase
      .from('order_items')
      .update({
        menu_item_id: new_menu_item_id,
        unit_price: new_price,
      })
      .eq('id', order_item_id)

    if (updateErr) throw new Error(updateErr.message)

    // Recalculate order total
    const { data: allItems } = await supabase
      .from('order_items')
      .select('unit_price, quantity')
      .eq('order_id', orderId)

    const newOrderTotal = (allItems ?? []).reduce((sum, i) => sum + Number(i.unit_price) * Number(i.quantity), 0)

    // Update order total
    const { error: orderErr } = await supabase
      .from('orders')
      .update({ total: newOrderTotal })
      .eq('id', orderId)

    if (orderErr) throw new Error(orderErr.message)

    // If there's a price difference, create a cash movement
    if (Math.abs(difference) >= 1) {
      // Get current open shift
      const { data: shift } = await supabase
        .from('shifts')
        .select('id')
        .eq('status', 'open')
        .limit(1)
        .single()

      const shiftId = shift?.id ?? null
      if (shift) {
        await supabase.from('cash_shifts').upsert({ id: shift.id, opening_amount: 0, status: 'open' }, { onConflict: 'id' })
      }

      if (difference < 0) {
        // Cheaper: create egreso (devolution)
        await supabase.from('cash_movements').insert({
          type: 'egreso',
          amount: Math.abs(difference),
          description: `Devolución cambio plato: ${oldName} → ${new_name}`,
          shift_id: shiftId,
        })
      } else {
        // More expensive: create ingreso (charge difference)
        await supabase.from('cash_movements').insert({
          type: 'ingreso',
          amount: difference,
          description: `Cobro diferencia cambio plato: ${oldName} → ${new_name}`,
          shift_id: shiftId,
        })
      }
    }

    return NextResponse.json({
      success: true,
      difference,
      new_total: newOrderTotal,
      old_item: oldName,
      new_item: new_name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
