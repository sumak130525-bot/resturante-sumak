import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type PosOrderItem = {
  name: string
  quantity: number
  price: number
  menu_item_id: string
  line_note?: string | null
  person_number?: number | null
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      items,
      total,
      dining_option,
      table_number,
      payment_method,
      customer_name,
      notes: customNotes,
      persons,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un item en el pedido.' },
        { status: 400 }
      )
    }

    const supabase = getAdminClient()

    // Ensure line_note column exists (runs once, idempotent)
    await supabase.rpc('exec_sql', {
      query: "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_note text;"
    }).then(() => {}, () => {}) // ignore errors if rpc doesn't exist

    // Ensure persons column exists on orders (SQL: ALTER TABLE orders ADD COLUMN IF NOT EXISTS persons integer DEFAULT 1;)
    await supabase.rpc('exec_sql', {
      query: "ALTER TABLE orders ADD COLUMN IF NOT EXISTS persons integer DEFAULT 1;"
    }).then(() => {}, () => {})

    // Ensure person_number column exists on order_items
    await supabase.rpc('exec_sql', {
      query: "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS person_number integer;"
    }).then(() => {}, () => {})

    // Usar nota personalizada del usuario tal cual viene del POS
    const orderNotes = customNotes && String(customNotes).trim() ? String(customNotes).trim() : null

    // Crear el pedido en la tabla orders
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customer_name || 'POS',
        customer_phone: null,
        notes: orderNotes,
        total: total ?? 0,
        status: 'pending',
        channel: 'pos',
        dining_option: dining_option || null,
        payment_method: payment_method || null,
        persons: persons && Number(persons) > 1 ? Number(persons) : 1,
      })
      .select()
      .single()

    if (orderError) throw new Error(`Order insert: ${orderError.message}`)
    if (!order) throw new Error('No se pudo crear el pedido')

    // Crear order_items con line_note para modificadores y person_number para pedidos multi-persona
    const orderItems = (items as PosOrderItem[]).map((item) => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: Math.round(item.price),
      line_note: item.line_note || null,
      person_number: item.person_number ?? null,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      // If line_note or person_number column doesn't exist, retry without them
      if (itemsError.message.includes('line_note') || itemsError.message.includes('person_number') || itemsError.message.includes('column')) {
        const fallbackItems = orderItems.map(({ line_note, person_number, ...rest }) => rest)
        const { error: fallbackError } = await supabase
          .from('order_items')
          .insert(fallbackItems)
        if (fallbackError) throw new Error(`Items insert: ${fallbackError.message}`)
      } else {
        throw new Error(`Items insert: ${itemsError.message}`)
      }
    }

    // ── Decrement available_qty for limited-stock items ───────────────────────
    try {
      for (const item of (items as PosOrderItem[])) {
        // Read current qty, then update atomically
        const { data: stockData } = await supabase
          .from('menu_items')
          .select('available_qty')
          .eq('id', item.menu_item_id)
          .single()

        if (stockData?.available_qty !== null && stockData?.available_qty !== undefined && stockData.available_qty > 0) {
          await supabase
            .from('menu_items')
            .update({ available_qty: Math.max(0, stockData.available_qty - item.quantity) })
            .eq('id', item.menu_item_id)
        }
      }
    } catch (stockErr) {
      // Non-fatal: don't fail the order if stock decrement fails
      void stockErr
    }

    // ── Auto-record cash movement for the sale ────────────────────────────────
    try {
      const movementType =
        (payment_method === 'Efectivo') ? 'venta_efectivo' : 'venta_transferencia'

      // Get current open shift (if any)
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
        // Auto-create shift so sales are always tracked
        const { data: newShift } = await supabase
          .from('cash_shifts')
          .insert({ opening_amount: 0, status: 'open' })
          .select('id')
          .single()
        shiftId = newShift?.id ?? null
      }

      await supabase.from('cash_movements').insert({
        type: movementType,
        amount: total ?? 0,
        description: `Pedido POS #${order.id.slice(-6)}`,
        shift_id: shiftId,
      })
    } catch (cashErr) {
      // Non-fatal: don't fail the order if cash movement fails
      void cashErr
    }

    return NextResponse.json({ success: true, order_id: order.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[POS orders]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
