import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/orders/[id]/close
// Cobra y cierra una mesa abierta. Solo cajero/gerente/dueño.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { payment_method, cash_amount, transfer_amount, employee_id } = body as {
      payment_method: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto'
      cash_amount?: number
      transfer_amount?: number
      employee_id?: string
    }

    if (!payment_method) {
      return NextResponse.json({ error: 'Se requiere método de pago.' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Verificar que la orden existe y está abierta
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, is_open, channel, table_number, total, status')
      .eq('id', id)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 })
    }
    if (!order.is_open) {
      return NextResponse.json({ error: 'La mesa no está abierta o ya fue cerrada.' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Cerrar la orden: actualizar payment_method, cerrar mesa, marcar como delivered
    const updateData: Record<string, unknown> = {
      is_open: false,
      closed_at: now,
      payment_method,
      cash_amount: cash_amount ?? null,
      transfer_amount: transfer_amount ?? null,
      status: 'delivered',
      delivered_at: now,
    }
    if (employee_id) updateData.closed_by_employee_id = employee_id

    const { data: closedOrder, error: closeErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (closeErr) throw new Error(`Close order: ${closeErr.message}`)

    // ── Registrar movimiento de caja ──────────────────────────────────────────
    try {
      const total = order.total ?? 0
      const movementType =
        payment_method === 'efectivo' ? 'venta_efectivo'
        : payment_method === 'mixto' ? 'venta_efectivo'
        : 'venta_transferencia'

      let shiftId: string | null = null
      const { data: openShift } = await supabase
        .from('shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single()

      if (openShift) {
        shiftId = openShift.id
        await supabase.from('cash_shifts').upsert({ id: openShift.id, opening_amount: 0, status: 'open' }, { onConflict: 'id' })
      } else {
        const { data: newShift } = await supabase
          .from('shifts')
          .insert({ opening_amount: 0, status: 'open' })
          .select('id, opened_at')
          .single()
        shiftId = newShift?.id ?? null
        if (newShift) {
          await supabase.from('cash_shifts').insert({ id: newShift.id, opening_amount: 0, status: 'open', opened_at: newShift.opened_at })
        }
      }

      await supabase.from('cash_movements').insert({
        type: movementType,
        amount: total,
        description: `Cobro mesa ${order.table_number} #${id.slice(-6)}`,
        shift_id: shiftId,
      })

      // Si es pago mixto, también registrar la parte de transferencia
      if (payment_method === 'mixto' && transfer_amount && transfer_amount > 0) {
        await supabase.from('cash_movements').insert({
          type: 'venta_transferencia',
          amount: transfer_amount,
          description: `Cobro mesa ${order.table_number} #${id.slice(-6)} (transferencia)`,
          shift_id: shiftId,
        })
      }
    } catch (cashErr) {
      console.error('[pos/orders/close] cash movement error:', cashErr)
      // Non-fatal
    }

    // ── Consumir inventario por recetas ───────────────────────────────────────
    try {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('menu_item_id, quantity')
        .eq('order_id', id)

      for (const item of orderItems ?? []) {
        const { data: recipeItems } = await supabase
          .from('recipe_items')
          .select('ingredient_id, quantity')
          .eq('menu_item_id', item.menu_item_id)

        for (const ri of recipeItems ?? []) {
          const consumed = ri.quantity * item.quantity

          const { data: invRow } = await supabase
            .from('inventory')
            .select('id, stock')
            .eq('ingredient_id', ri.ingredient_id)
            .single()

          if (invRow) {
            const newStock = Math.max(0, Number(invRow.stock) - consumed)
            await supabase
              .from('inventory')
              .update({ stock: newStock, updated_at: now })
              .eq('ingredient_id', ri.ingredient_id)
          }

          await supabase.from('inventory_movements').insert({
            ingredient_id: ri.ingredient_id,
            type: 'consumption',
            quantity: consumed,
            notes: `Cierre mesa ${order.table_number} #${id.slice(-6)}`,
          })
        }
      }
    } catch (invErr) {
      console.error('[pos/orders/close] inventory error:', invErr)
      // Non-fatal
    }

    return NextResponse.json({ success: true, order: closedOrder })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[pos/orders/close]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
