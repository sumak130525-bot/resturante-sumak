import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    console.log('[webhook] Payload recibido:', JSON.stringify(body))

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.error('[webhook] MERCADOPAGO_ACCESS_TOKEN no configurado')
      return NextResponse.json({ error: 'No configurado' }, { status: 500 })
    }

    // MercadoPago puede enviar distintos tipos de notificaciones
    const topic = body.topic ?? body.type
    const resourceId = body.data?.id ?? body.id

    // Solo procesar notificaciones de pago
    if (topic !== 'payment') {
      console.log(`[webhook] Ignorando notificación de tipo: ${topic}`)
      return NextResponse.json({ ok: true })
    }

    if (!resourceId) {
      console.warn('[webhook] Sin payment ID en el payload')
      return NextResponse.json({ ok: true })
    }

    const mp = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(mp)

    const payment = await paymentClient.get({ id: String(resourceId) })
    console.log(`[webhook] Payment ${resourceId} status: ${payment.status}`)

    if (!payment.external_reference) {
      console.warn('[webhook] Sin external_reference en el payment')
      return NextResponse.json({ ok: true })
    }

    const orderId = payment.external_reference
    const supabase = await getServiceClient()

    if (!supabase) {
      console.error('[webhook] Sin service client (SUPABASE_SERVICE_ROLE_KEY no configurado)')
      return NextResponse.json({ error: 'Sin acceso a DB' }, { status: 500 })
    }

    const updateData: Record<string, string> = {
      payment_id: String(resourceId),
      payment_status: payment.status ?? 'unknown',
      payment_method: payment.payment_type_id ?? 'mercadopago',
    }

    if (payment.status === 'approved') {
      updateData.status = 'confirmed'
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)

    if (updateError) {
      console.error('[webhook] Error actualizando pedido:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[webhook] Pedido ${orderId} actualizado. payment_status=${payment.status}`)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[webhook] Error:', message)
    // Siempre retornar 200 para que MP no reintente indefinidamente
    return NextResponse.json({ ok: true })
  }
}
