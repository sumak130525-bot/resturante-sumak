import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type PosOrderItem = {
  name: string
  quantity: number
  price: number
  menu_item_id: string
  line_note?: string | null
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

    // Usar nota personalizada del usuario (o null si no hay)
    const notes = customNotes && String(customNotes).trim() ? String(customNotes).trim() : null

    // Build notes: Mesa + user note (NO modifiers - those go in line_note per item)
    const orderNotes = [
      table_number ? `Mesa ${table_number}` : '',
      notes || '',
    ].filter(Boolean).join(' | ') || null

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
      })
      .select()
      .single()

    if (orderError) throw new Error(`Order insert: ${orderError.message}`)
    if (!order) throw new Error('No se pudo crear el pedido')

    // Crear order_items con line_note para modificadores
    const orderItems = (items as PosOrderItem[]).map((item) => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: Math.round(item.price),
      line_note: item.line_note || null,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      // If line_note column doesn't exist, retry without it
      if (itemsError.message.includes('line_note') || itemsError.message.includes('column')) {
        const fallbackItems = orderItems.map(({ line_note, ...rest }) => rest)
        const { error: fallbackError } = await supabase
          .from('order_items')
          .insert(fallbackItems)
        if (fallbackError) throw new Error(`Items insert: ${fallbackError.message}`)
      } else {
        throw new Error(`Items insert: ${itemsError.message}`)
      }
    }

    return NextResponse.json({ success: true, order_id: order.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[POS orders]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
