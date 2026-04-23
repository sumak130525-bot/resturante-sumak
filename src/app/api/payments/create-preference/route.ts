import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://resturante-sumak.vercel.app'

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

export async function POST(request: NextRequest) {
  try {
    const { order_id } = await request.json()

    if (!order_id) {
      return NextResponse.json({ error: 'order_id requerido' }, { status: 400 })
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 500 })
    }

    const supabase = (await getServiceClient()) ?? (await getAnonClient())

    // Fetch order + items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, customer_name, total')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('quantity, unit_price, menu_items(name)')
      .eq('order_id', order_id)

    if (itemsError || !orderItems || orderItems.length === 0) {
      return NextResponse.json({ error: 'Items del pedido no encontrados' }, { status: 404 })
    }

    // Build MercadoPago preference items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mpItems = orderItems.map((oi: any) => ({
      id: order_id,
      title: oi.menu_items?.name ?? 'Producto',
      quantity: oi.quantity,
      unit_price: Math.round(oi.unit_price),
      currency_id: 'ARS',
    }))

    const mp = new MercadoPagoConfig({ accessToken })
    const preference = new Preference(mp)

    const result = await preference.create({
      body: {
        items: mpItems,
        back_urls: {
          success: `${BASE_URL}/pedido/estado?order_id=${order_id}&status=approved`,
          failure: `${BASE_URL}/pedido/estado?order_id=${order_id}&status=failure`,
          pending: `${BASE_URL}/pedido/estado?order_id=${order_id}&status=pending`,
        },
        auto_return: 'approved',
        external_reference: order_id,
        notification_url: `${BASE_URL}/api/payments/webhook`,
        payer: {
          name: order.customer_name,
        },
      },
    })

    return NextResponse.json({
      init_point: result.init_point,
      preference_id: result.id,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[create-preference] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
