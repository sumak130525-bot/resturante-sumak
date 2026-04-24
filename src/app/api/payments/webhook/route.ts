import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { waitUntil } from '@vercel/functions'
import {
  getLoyverseItems,
  createLoyverseReceipt,
  findVariantByName,
  getStoreId,
  LOYVERSE_PAYMENT_MERCADOPAGO,
} from '@/lib/loyverse'

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

type PendingOrder = {
  id: string
  customer_name: string
  customer_phone: string | null
  notes: string | null
  mesa: string | null
  channel: string
  items: OrderItemInput[]
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

async function syncLoyverse(
  orderId: string,
  customerName: string,
  notes: string | null,
  orderItems: OrderItemInput[],
  menuItems: MenuItemPartial[]
) {
  const loyverseToken = process.env.LOYVERSE_ACCESS_TOKEN
  const loyverseStoreId = process.env.LOYVERSE_STORE_ID

  console.log(`[Loyverse] Iniciando sync para pedido ${orderId}`)
  console.log(`[Loyverse] Token configurado: ${loyverseToken ? 'SI' : 'NO'}`)
  console.log(`[Loyverse] Store ID configurado: ${loyverseStoreId ? loyverseStoreId : 'NO (usando fallback)'}`)

  if (!loyverseToken) {
    console.warn('[Loyverse] SKIP: LOYVERSE_ACCESS_TOKEN no configurado.')
    return
  }

  const loyverseItems = await getLoyverseItems()
  const storeId = getStoreId()
  const lineItems = []
  const unmatchedItems: string[] = []

  for (const oi of orderItems) {
    const menuItem = menuItems.find((m) => m.id === oi.menu_item_id)
    if (!menuItem) {
      console.warn(`[Loyverse] menuItem no encontrado para menu_item_id: ${oi.menu_item_id}`)
      continue
    }
    const match = findVariantByName(loyverseItems, menuItem.name)
    if (!match) {
      unmatchedItems.push(menuItem.name)
      console.warn(`[Loyverse] Sin match para: "${menuItem.name}"`)
      continue
    }
    lineItems.push({
      variant_id: match.variant.variant_id,
      quantity: oi.quantity,
      price: oi.unit_price,
      total_money: oi.unit_price * oi.quantity,
      gross_total_money: oi.unit_price * oi.quantity,
    })
  }

  if (unmatchedItems.length > 0) {
    console.warn(`[Loyverse] Items sin match: ${unmatchedItems.join(', ')}`)
  }

  if (lineItems.length === 0) {
    console.warn('[Loyverse] No hay line_items: ningún plato tiene match en Loyverse.')
    return
  }

  const receiptTotal = lineItems.reduce((s, l) => s + l.total_money, 0)
  const receiptPayload = {
    store_id: storeId,
    receipt_date: new Date().toISOString(),
    source: 'ONLINE',
    note: `Pedido web #${orderId.slice(0, 8)} — ${customerName}${notes ? ` | Nota: ${notes}` : ''}`,
    total_money: receiptTotal,
    payments: [
      {
        payment_type_id: LOYVERSE_PAYMENT_MERCADOPAGO,
        money_amount: receiptTotal,
      },
    ],
    line_items: lineItems,
  }
  const result = await createLoyverseReceipt(receiptPayload)
  console.log(`[Loyverse] Receipt creado: receipt_number=${result?.receipt_number ?? 'N/A'}`)
}

/**
 * Extrae un payment ID del payload del webhook de MercadoPago.
 * Soporta topic=payment (body.data.id | body.id) y topic=merchant_order
 * (busca el primer payment aprobado dentro de payments[]).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPaymentId(topic: string, body: Record<string, any>): string | null {
  if (topic === 'payment') {
    const id = body.data?.id ?? body.id
    return id ? String(id) : null
  }
  if (topic === 'merchant_order') {
    // merchant_order incluye un array payments[] con los pagos vinculados
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments: any[] = body.payments ?? body.data?.payments ?? []
    const approved = payments.find((p) => p.status === 'approved')
    return approved ? String(approved.id) : null
  }
  return null
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

    const topic = body.topic ?? body.type
    console.log(`[webhook] topic/type: ${topic}`)

    // Aceptamos payment y merchant_order; ignoramos el resto
    if (topic !== 'payment' && topic !== 'merchant_order') {
      console.log(`[webhook] Ignorando notificación de tipo: ${topic}`)
      return NextResponse.json({ ok: true })
    }

    const paymentId = extractPaymentId(topic, body)
    if (!paymentId) {
      console.warn(`[webhook] No se pudo extraer payment ID del payload (topic=${topic})`)
      return NextResponse.json({ ok: true })
    }

    console.log(`[webhook] Consultando payment ID: ${paymentId}`)
    const mp = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(mp)
    const payment = await paymentClient.get({ id: paymentId })
    console.log(`[webhook] Payment ${paymentId} status: ${payment.status}`)

    // Sólo crear pedido si el pago está aprobado
    if (payment.status !== 'approved') {
      console.log(`[webhook] Pago no aprobado (${payment.status}), no se crea pedido.`)
      return NextResponse.json({ ok: true })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const externalRef = (payment as any).external_reference as string | undefined
    console.log(`[webhook] external_reference: ${externalRef}`)

    if (!externalRef) {
      console.warn('[webhook] Sin external_reference en el payment')
      return NextResponse.json({ ok: true })
    }

    const supabase = await getServiceClient()
    if (!supabase) {
      console.error('[webhook] Sin service client (SUPABASE_SERVICE_ROLE_KEY no configurado)')
      return NextResponse.json({ error: 'Sin acceso a DB' }, { status: 500 })
    }

    // --- Buscar datos del pedido en pending_orders ---
    const { data: pendingOrder, error: pendingError } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('id', externalRef)
      .single() as { data: PendingOrder | null; error: { message: string } | null }

    if (pendingError || !pendingOrder) {
      console.error(`[webhook] pending_order no encontrado para external_reference=${externalRef}:`, pendingError?.message ?? 'sin data')
      // Si ya fue procesado (pedido ya creado) retornar ok
      return NextResponse.json({ ok: true })
    }

    console.log(`[webhook] pending_order encontrado: ${pendingOrder.id}, items=${pendingOrder.items.length}`)

    const orderItems: OrderItemInput[] = pendingOrder.items
    const customerName: string = pendingOrder.customer_name
    const customerPhone: string | null = pendingOrder.customer_phone ?? null
    const notes: string | null = pendingOrder.notes ?? null
    const channel: 'web' | 'whatsapp' = pendingOrder.channel === 'whatsapp' ? 'whatsapp' : 'web'

    // Verificar disponibilidad de menu items
    const itemIds = orderItems.map((i) => i.menu_item_id)
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name, available, price')
      .in('id', itemIds) as { data: MenuItemPartial[] | null; error: { message: string } | null }

    if (menuError) {
      console.error('[webhook] Error obteniendo menu_items:', menuError.message)
      return NextResponse.json({ error: menuError.message }, { status: 500 })
    }

    // Calcular total
    const total = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

    // Crear pedido con status=confirmed
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        customer_phone: customerPhone,
        notes: notes,
        total,
        status: 'confirmed',
        channel,
        payment_id: paymentId,
        payment_status: 'approved',
        payment_method: payment.payment_type_id ?? 'mercadopago',
      })
      .select()
      .single() as { data: { id: string } | null; error: { message: string } | null }

    if (orderError) {
      console.error('[webhook] Error creando pedido:', orderError.message)
      return NextResponse.json({ error: orderError.message }, { status: 500 })
    }
    if (!order) {
      console.error('[webhook] Pedido no creado (sin error ni data)')
      return NextResponse.json({ error: 'No se pudo crear el pedido' }, { status: 500 })
    }

    console.log(`[webhook] Pedido creado: ${order.id}`)

    // Insertar order_items
    const orderItemsRows = orderItems.map((i) => ({
      order_id: order.id,
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsRows) as { error: { message: string } | null }

    if (itemsError) {
      console.error('[webhook] Error insertando order_items:', itemsError.message)
      // No fallar: el pedido ya fue creado
    }

    // Descontar stock
    for (const oi of orderItems) {
      const menuItem = menuItems?.find((m) => m.id === oi.menu_item_id)
      if (menuItem) {
        await supabase
          .from('menu_items')
          .update({ available: menuItem.available - oi.quantity })
          .eq('id', oi.menu_item_id)
      }
    }

    // Eliminar pending_order (ya procesado)
    const { error: deleteError } = await supabase
      .from('pending_orders')
      .delete()
      .eq('id', externalRef)

    if (deleteError) {
      console.warn(`[webhook] No se pudo borrar pending_order ${externalRef}:`, deleteError.message)
    } else {
      console.log(`[webhook] pending_order ${externalRef} eliminado.`)
    }

    // Sync Loyverse fire-and-forget
    waitUntil(
      syncLoyverse(
        order.id,
        customerName,
        notes,
        orderItems,
        menuItems ?? []
      ).catch((err) => {
        console.error('[Loyverse] Error al sincronizar pedido (waitUntil):', err)
      })
    )

    console.log(`[webhook] Pedido ${order.id} creado y confirmado. pending_order eliminado.`)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[webhook] Error:', message)
    // Siempre 200 para que MP no reintente indefinidamente
    return NextResponse.json({ ok: true })
  }
}
