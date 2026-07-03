import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isRestaurantOpen, type ClosureDayRecord } from '@/lib/businessHours'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://restaurante-sumak.vercel.app'

type OrderItemInput = {
  menu_item_id: string
  quantity: number
  unit_price: number
  title?: string
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

    // ── Validación de horario de atención ──────────────────────────────────
    // Solo bloqueamos pedidos web (channel !== 'whatsapp')
    if (channel !== 'whatsapp') {
      const closureDays: ClosureDayRecord[] = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://restaurante-sumak.vercel.app'}/api/admin/closure-days`,
        { next: { revalidate: 0 } }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])

      const kitchenStatus = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://restaurante-sumak.vercel.app'}/api/admin/kitchen-status`,
        { next: { revalidate: 0 } }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)

      const open = isRestaurantOpen({
        closureDays,
        kitchenEffectiveClosed: kitchenStatus?.effective_closed ?? false,
      })

      if (!open) {
        return NextResponse.json(
          { error: 'closed', message: 'Estamos cerrados' },
          { status: 403 }
        )
      }
    }
    // ── Fin validación de horario ──────────────────────────────────────────

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 500 })
    }

    // --- 1. Guardar datos del pedido en pending_orders ANTES de crear la preferencia ---
    const pendingId = `pre_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const supabase = await getServiceClient()
    if (!supabase) {
      console.error('[create-preference] SUPABASE_SERVICE_ROLE_KEY no configurado')
      return NextResponse.json({ error: 'Sin acceso a DB' }, { status: 500 })
    }

    const { error: insertError } = await supabase
      .from('pending_orders')
      .insert({
        id: pendingId,
        customer_name,
        customer_phone: customer_phone ?? null,
        notes: notes ?? null,
        mesa: mesa ?? null,
        channel: channel ?? 'web',
        items: items.map((i: OrderItemInput) => ({
          menu_item_id: i.menu_item_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      })

    if (insertError) {
      console.error('[create-preference] Error insertando pending_order:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    console.log(`[create-preference] pending_order guardado: ${pendingId}`)

    // --- 2. Crear preferencia MP usando pendingId como external_reference (sin metadata de items) ---
    const mpItems = items.map((item: OrderItemInput) => ({
      id: item.menu_item_id,
      title: item.title ?? 'Producto',
      quantity: item.quantity,
      unit_price: Math.round(item.unit_price),
      currency_id: 'ARS',
    }))

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
        external_reference: pendingId,
        notification_url: `${BASE_URL}/api/payments/webhook`,
        payer: {
          name: customer_name,
        },
        // Sin metadata de items: los datos están en pending_orders
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
