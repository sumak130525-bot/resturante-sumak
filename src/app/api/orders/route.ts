import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getLoyverseItems, createLoyverseReceipt, findVariantByName, getStoreId } from '@/lib/loyverse'

type OrderItemInput = {
  menu_item_id: string
  quantity: number
  unit_price: number
}

type MenuItemPartial = {
  id: string
  name: string
  available: number
  price: number
}

async function getAnonClient() {
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

async function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
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
    const { customer_name, customer_phone, notes, items } = body

    if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Datos incompletos. Se requiere nombre y al menos un plato.' },
        { status: 400 }
      )
    }

    // Usar service client para bypass de RLS; fallback a anon para lectura de menú
    const serviceClient = await getServiceClient()
    const supabase = serviceClient ?? await getAnonClient()

    // Verificar disponibilidad de cada ítem
    const itemIds = items.map((i: OrderItemInput) => i.menu_item_id)
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name, available, price')
      .in('id', itemIds) as { data: MenuItemPartial[] | null; error: { message: string } | null }

    if (menuError) throw new Error(menuError.message)

    for (const orderItem of items as OrderItemInput[]) {
      const menuItem = menuItems?.find((m: MenuItemPartial) => m.id === orderItem.menu_item_id)
      if (!menuItem) {
        return NextResponse.json(
          { error: `Plato no encontrado: ${orderItem.menu_item_id}` },
          { status: 400 }
        )
      }
      if (menuItem.available < orderItem.quantity) {
        return NextResponse.json(
          { error: `No hay suficiente cantidad de "${menuItem.name}". Disponibles: ${menuItem.available}` },
          { status: 409 }
        )
      }
    }

    // Calcular total
    const total = (items as OrderItemInput[]).reduce(
      (sum, i) => sum + i.unit_price * i.quantity,
      0
    )

    // Crear pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name,
        customer_phone: customer_phone || null,
        notes: notes || null,
        total,
        status: 'pending',
      })
      .select()
      .single() as { data: { id: string } | null; error: { message: string } | null }

    if (orderError) throw new Error(orderError.message)
    if (!order) throw new Error('No se pudo crear el pedido')

    // Crear items del pedido
    const orderItems = (items as OrderItemInput[]).map((i) => ({
      order_id: order.id,
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems) as { error: { message: string } | null }

    if (itemsError) throw new Error(itemsError.message)

    // Descontar stock
    for (const orderItem of items as OrderItemInput[]) {
      const menuItem = menuItems?.find((m: MenuItemPartial) => m.id === orderItem.menu_item_id)
      if (menuItem) {
        await supabase
          .from('menu_items')
          .update({ available: menuItem.available - orderItem.quantity })
          .eq('id', orderItem.menu_item_id)
      }
    }

    // Sincronizar con Loyverse POS (fire-and-forget: si falla no bloquea el pedido)
    try {
      if (process.env.LOYVERSE_ACCESS_TOKEN) {
        const loyverseItems = await getLoyverseItems()
        const storeId = getStoreId()
        const lineItems = []

        for (const oi of items as OrderItemInput[]) {
          const menuItem = menuItems?.find((m: MenuItemPartial) => m.id === oi.menu_item_id)
          if (!menuItem) continue
          const match = findVariantByName(loyverseItems, menuItem.name)
          if (!match) continue
          lineItems.push({
            variant_id: match.variant.variant_id,
            quantity: oi.quantity,
            price: oi.unit_price,
            total_money: oi.unit_price * oi.quantity,
            gross_total_money: oi.unit_price * oi.quantity,
          })
        }

        if (lineItems.length > 0) {
          await createLoyverseReceipt({
            store_id: storeId,
            receipt_date: new Date().toISOString(),
            source: 'ONLINE',
            note: `Pedido web #${order.id.slice(0, 8)} — ${customer_name}${notes ? ` | Nota: ${notes}` : ''}`,
            total_money: lineItems.reduce((s, l) => s + l.total_money, 0),
            line_items: lineItems,
          })
        }
      }
    } catch (loyverseErr) {
      // Solo loguear, no bloquear la respuesta
      console.error('[Loyverse] Error al sincronizar pedido:', loyverseErr)
    }

    return NextResponse.json({ success: true, order_id: order.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
