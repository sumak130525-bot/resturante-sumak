import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

type PosOrderItem = {
  name: string
  quantity: number
  price: number
  menu_item_id: string
}

async function getServiceClient() {
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any
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
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un item en el pedido.' },
        { status: 400 }
      )
    }

    const supabase = await getServiceClient()

    // Nota de respaldo con datos operativos del POS
    const noteParts: string[] = []
    if (dining_option) noteParts.push(dining_option)
    if (table_number) noteParts.push(`Mesa ${table_number}`)
    if (payment_method) noteParts.push(payment_method)
    const notes = noteParts.length > 0 ? noteParts.join(' · ') : null

    // Crear el pedido en la tabla orders
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customer_name || 'POS',
        customer_phone: null,
        notes,
        total: total ?? 0,
        status: 'pending',
        channel: 'pos',
        // Campos extra que pueden existir en la tabla
        ...(table_number != null ? { table_number: String(table_number) } : {}),
        ...(dining_option ? { dining_option } : {}),
        ...(payment_method ? { payment_method } : {}),
      })
      .select()
      .single()

    if (orderError) throw new Error(orderError.message)
    if (!order) throw new Error('No se pudo crear el pedido')

    // Crear order_items para cada producto
    const orderItems = (items as PosOrderItem[]).map((item) => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      unit_price: item.price,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) throw new Error(itemsError.message)

    return NextResponse.json({ success: true, order_id: order.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
