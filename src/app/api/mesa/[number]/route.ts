import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/mesa/[number] — último pedido activo o reciente de una mesa
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params
    const tableNumber = number

    const supabase = getAdmin()

    // Buscar pedido abierto — intentar con el número directo y con "Mesa X"
    const possibleTableValues = [tableNumber, `Mesa ${tableNumber}`, `mesa ${tableNumber}`]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let order: any = null

    // Primero buscar pedido abierto (mesa abierta activa)
    for (const tv of possibleTableValues) {
      if (order) break
      const { data } = await (supabase as any)
        .from('orders')
        .select('id, table_number, status, total, payment_method, employee_name, customer_name, dining_option, notes, persons, order_number, created_at, is_open, closed_at, order_items(id, quantity, unit_price, line_note, person_number, is_bonus, bonus_reason, sent_to_kitchen_at, delivered_at, menu_items(name))')
        .eq('table_number', tv)
        .eq('is_open', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data) order = data
    }

    // Si no hay pedido abierto, buscar el más reciente de hoy
    if (!order) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const since = today.toISOString()

      for (const tv of possibleTableValues) {
        if (order) break
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('orders')
          .select('id, table_number, status, total, payment_method, employee_name, customer_name, dining_option, notes, persons, order_number, created_at, is_open, closed_at, order_items(id, quantity, unit_price, line_note, person_number, is_bonus, bonus_reason, sent_to_kitchen_at, delivered_at, menu_items(name))')
          .eq('table_number', tv)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (data) order = data
      }
    }

    if (!order) {
      return NextResponse.json({ order: null, message: 'No hay pedidos para esta mesa' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (order.order_items ?? []).map((i: any) => ({
      id: i.id,
      name: i.menu_items?.name ?? 'Ítem',
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_note: i.line_note,
      person_number: i.person_number,
      is_bonus: i.is_bonus ?? false,
      bonus_reason: i.bonus_reason,
      sent_to_kitchen_at: i.sent_to_kitchen_at,
      delivered_at: i.delivered_at,
    }))

    return NextResponse.json({
      order: {
        id: order.id,
        table_number: order.table_number,
        status: order.status,
        total: order.total,
        payment_method: order.payment_method,
        employee_name: order.employee_name,
        customer_name: order.customer_name ?? null,
        dining_option: order.dining_option ?? null,
        notes: order.notes ?? null,
        persons: order.persons ?? null,
        order_number: order.order_number ?? null,
        created_at: order.created_at,
        is_open: order.is_open,
        closed_at: order.closed_at,
        items,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[api/mesa]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
