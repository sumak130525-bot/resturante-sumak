import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://resturante-sumak.vercel.app'

type OrderItemInput = {
  menu_item_id: string
  quantity: number
  unit_price: number
  title?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      items,
      customer_name,
      customer_phone,
      notes,
      mesa,
      channel,
    }: {
      items: OrderItemInput[]
      customer_name: string
      customer_phone?: string | null
      notes?: string | null
      mesa?: string | null
      channel?: 'web' | 'whatsapp'
    } = body

    if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Datos incompletos: se requiere customer_name e items' },
        { status: 400 }
      )
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 500 })
    }

    // Build MercadoPago preference items
    const mpItems = items.map((item) => ({
      id: item.menu_item_id,
      title: item.title ?? 'Producto',
      quantity: item.quantity,
      unit_price: Math.round(item.unit_price),
      currency_id: 'ARS',
    }))

    // Use a temporary external_reference UUID; the real order will be created by the webhook
    const tempRef = `pre_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const mp = new MercadoPagoConfig({ accessToken })
    const preference = new Preference(mp)

    const result = await preference.create({
      body: {
        items: mpItems,
        back_urls: {
          success: `${BASE_URL}/pedido/estado?status=approved`,
          failure: `${BASE_URL}/pedido/estado?status=failure`,
          pending: `${BASE_URL}/pedido/estado?status=pending`,
        },
        auto_return: 'approved',
        external_reference: tempRef,
        notification_url: `${BASE_URL}/api/payments/webhook`,
        payer: {
          name: customer_name,
        },
        // Store order data in metadata so the webhook can create the real order
        metadata: {
          customer_name,
          customer_phone: customer_phone ?? null,
          notes: notes ?? null,
          mesa: mesa ?? null,
          channel: channel ?? 'web',
          items: items.map((i) => ({
            menu_item_id: i.menu_item_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
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
