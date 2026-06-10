import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { order_item_id } = await req.json()

    if (!id || !order_item_id) {
      return NextResponse.json({ error: 'ID de pedido e item requeridos' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // 1. Get the order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, total, payment_method, cash_amount, transfer_amount')
      .eq('id', id)
      .single()

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'El pedido ya fue anulado' }, { status: 409 })
    }

    // 2. Get the order item
    const { data: orderItem, error: itemErr } = await supabase
      .from('order_items')
      .select('id, menu_item_id, quantity, unit_price')
      .eq('id', order_item_id)
      .eq('order_id', id)
      .single()

    if (itemErr || !orderItem) {
      return NextResponse.json({ error: 'Item no encontrado en el pedido' }, { status: 404 })
    }

    const refundAmount = Number(orderItem.unit_price) * Number(orderItem.quantity)

    // 3. Delete the order item
    const { error: deleteErr } = await supabase
      .from('order_items')
      .delete()
      .eq('id', order_item_id)

    if (deleteErr) {
      throw new Error(`Error al eliminar item: ${deleteErr.message}`)
    }

    // 4. Update order total
    const newTotal = Number(order.total) - refundAmount
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ total: newTotal })
      .eq('id', id)

    if (updateErr) {
      throw new Error(`Error al actualizar total: ${updateErr.message}`)
    }

    // 5. Revert inventory for this item
    const { data: recipeItems } = await supabase
      .from('recipe_items')
      .select('ingredient_id, quantity')
      .eq('menu_item_id', orderItem.menu_item_id)

    if (recipeItems && recipeItems.length > 0) {
      for (const ri of recipeItems) {
        const restoreQty = Number(ri.quantity) * Number(orderItem.quantity)
        const { data: ing } = await supabase
          .from('ingredients')
          .select('current_stock')
          .eq('id', ri.ingredient_id)
          .single()

        if (ing) {
          await supabase
            .from('ingredients')
            .update({ current_stock: (ing.current_stock || 0) + restoreQty })
            .eq('id', ri.ingredient_id)
        }
      }
    }

    // 6. Get item name for response
    const { data: menuItem } = await supabase
      .from('menu_items')
      .select('name')
      .eq('id', orderItem.menu_item_id)
      .single()

    return NextResponse.json({
      ok: true,
      refund_amount: refundAmount,
      item_name: menuItem?.name ?? 'Item',
      new_total: newTotal,
      payment_method: order.payment_method,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
