import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/admin/whatsapp-notify — bot calls this when a message arrives
export async function POST(request: NextRequest) {
  try {
    const { phone, message, sender_name } = await request.json()
    if (!phone || !message) {
      return NextResponse.json({ error: 'phone y message requeridos' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Save notification
    await supabase.from('whatsapp_notifications').insert({
      phone,
      message: message.substring(0, 500),
      sender_name: sender_name || null,
    })

    // Send push notifications to all subscribed devices
    try {
      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      const vapidPrivate = process.env.VAPID_PRIVATE_KEY

      if (vapidPublic && vapidPrivate) {
        webpush.setVapidDetails(
          'mailto:admin@restaurante-sumak.vercel.app',
          vapidPublic,
          vapidPrivate
        )

        const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
        for (const sub of (subs ?? [])) {
          try {
            await webpush.sendNotification(
              sub.subscription,
              JSON.stringify({
                title: '💬 Nuevo mensaje WhatsApp',
                body: `${sender_name || phone}: ${message.substring(0, 100)}`,
                icon: '/icon-192x192.png',
                data: { url: '/admin/orders' },
              })
            )
          } catch {
            // subscription expired, ignore
          }
        }
      }
    } catch {
      // push failed, continue
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/admin/whatsapp-notify — get unread notifications
export async function GET() {
  try {
    const supabase = getAdminClient()
    const { data } = await supabase
      .from('whatsapp_notifications')
      .select('*')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json([])
  }
}

// PATCH /api/admin/whatsapp-notify — mark as read
export async function PATCH(request: NextRequest) {
  try {
    const { id } = await request.json()
    const supabase = getAdminClient()

    if (id === 'all') {
      await supabase.from('whatsapp_notifications').update({ read: true }).eq('read', false)
    } else {
      await supabase.from('whatsapp_notifications').update({ read: true }).eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
