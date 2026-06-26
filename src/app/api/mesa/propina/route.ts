import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/mesa/propina — crea preferencia MercadoPago para propina
export async function POST(request: NextRequest) {
  try {
    const { amount, order_id, table_number } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    }

    const accessToken = process.env.MP_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 500 })
    }

    const preference = {
      items: [
        {
          title: `Propina Mesa ${table_number || '?'}`,
          quantity: 1,
          unit_price: Number(amount),
          currency_id: 'ARS',
        },
      ],
      external_reference: `propina-${order_id ?? 'unknown'}`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://restaurante-sumak.vercel.app'}/mesa/${table_number}?propina=ok`,
        failure: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://restaurante-sumak.vercel.app'}/mesa/${table_number}?propina=error`,
      },
      auto_return: 'approved' as const,
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    })

    if (!mpRes.ok) {
      const err = await mpRes.text()
      return NextResponse.json({ error: `MercadoPago error: ${err}` }, { status: 500 })
    }

    const mpData = await mpRes.json()
    return NextResponse.json({ init_point: mpData.init_point })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
