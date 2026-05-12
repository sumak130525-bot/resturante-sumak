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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID de pedido requerido' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // ── 1. Fetch the order ────────────────────────────────────────────────────
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, total, payment_method, cash_amount, transfer_amount, order_number')
      .eq('id', id)
      .single()

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    if (order.status === 'delivered') {
      return NextResponse.json(
        { error: 'No se puede anular un pedido ya entregado' },
        { status: 409 }
      )
    }

    if (order.status === 'cancelled') {
      return NextResponse.json(
        { error: 'El pedido ya fue anulado' },
        { status: 409 }
      )
    }

    // ── 2. Mark order as cancelled ────────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (updateErr) {
      throw new Error(`Error al cancelar pedido: ${updateErr.message}`)
    }

    // ── 3. Register refund in cash_movements ──────────────────────────────────
    try {
      // Get current open shift (or create one)
      let shiftId: string | null = null
      const { data: openShift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single()

      if (openShift) {
        shiftId = openShift.id
      } else {
        const { data: newShift } = await supabase
          .from('cash_shifts')
          .insert({ opening_amount: 0, status: 'open' })
          .select('id')
          .single()
        shiftId = newShift?.id ?? null
      }

      const orderLabel = order.order_number
        ? `#${order.order_number}`
        : `#${String(id).slice(-6)}`

      const pm = order.payment_method

      if (pm === 'cash') {
        // Full cash refund
        await supabase.from('cash_movements').insert({
          type: 'egreso',
          amount: Number(order.total),
          description: `Devolución pedido ${orderLabel}`,
          shift_id: shiftId,
        })
      } else if (pm === 'transfer') {
        // Transfer refund (recorded as egreso with description indicating transfer)
        await supabase.from('cash_movements').insert({
          type: 'egreso',
          amount: Number(order.total),
          description: `Devolución transferencia pedido ${orderLabel}`,
          shift_id: shiftId,
        })
      } else if (pm === 'mixed') {
        // Mixed: refund cash portion and transfer portion separately
        const cashAmt = Number(order.cash_amount ?? 0)
        const transferAmt = Number(order.transfer_amount ?? 0)
        if (cashAmt > 0) {
          await supabase.from('cash_movements').insert({
            type: 'egreso',
            amount: cashAmt,
            description: `Devolución efectivo pedido ${orderLabel}`,
            shift_id: shiftId,
          })
        }
        if (transferAmt > 0) {
          await supabase.from('cash_movements').insert({
            type: 'egreso',
            amount: transferAmt,
            description: `Devolución transferencia pedido ${orderLabel}`,
            shift_id: shiftId,
          })
        }
      }
    } catch (cashErr) {
      console.error('[cancel order] cash_movements error:', cashErr)
      // Non-fatal
    }

    // ── 4. Revert inventory (recipe_items) ────────────────────────────────────
    try {
      // Get all order_items for this order
      const { data: orderItems, error: itemsErr } = await supabase
        .from('order_items')
        .select('menu_item_id, quantity')
        .eq('order_id', id)

      if (itemsErr) {
        console.error('[cancel order] order_items fetch error:', itemsErr.message)
      } else if (orderItems && orderItems.length > 0) {
        for (const oi of orderItems) {
          // Get recipe items for this menu item
          const { data: recipeItems, error: recipeErr } = await supabase
            .from('recipe_items')
            .select('ingredient_id, quantity')
            .eq('menu_item_id', oi.menu_item_id)

          if (recipeErr) {
            console.error('[cancel order] recipe_items fetch error:', recipeErr.message)
            continue
          }
          if (!recipeItems || recipeItems.length === 0) continue

          for (const ri of recipeItems) {
            const restored = ri.quantity * oi.quantity

            // Get current inventory row
            const { data: invRow, error: invFetchErr } = await supabase
              .from('inventory')
              .select('id, stock')
              .eq('ingredient_id', ri.ingredient_id)
              .single()

            if (invFetchErr) {
              console.error('[cancel order] inventory fetch error:', invFetchErr.message)
            }

            if (invRow) {
              const newStock = Number(invRow.stock) + restored
              const { error: invUpdateErr } = await supabase
                .from('inventory')
                .update({ stock: newStock, updated_at: new Date().toISOString() })
                .eq('ingredient_id', ri.ingredient_id)
              if (invUpdateErr) {
                console.error('[cancel order] inventory update error:', invUpdateErr.message)
              }
            }

            // Register inventory restoration movement
            await supabase.from('inventory_movements').insert({
              ingredient_id: ri.ingredient_id,
              type: 'adjustment',
              quantity: restored,
              notes: `Devolución anulación pedido #${String(id).slice(-6)}`,
            })
          }
        }
      }
    } catch (invErr) {
      console.error('[cancel order] inventory revert error:', invErr)
      // Non-fatal
    }

    return NextResponse.json({ success: true, id }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[PATCH /api/pos/orders/[id]/cancel]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
