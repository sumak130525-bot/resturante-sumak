import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

async function getAuthClient() {
  const cookieStore = await cookies()
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
  )
}

function getServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getServiceClient()
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })

  if (error) return NextResponse.json({ error: 'Error al contar suscriptores' }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}

export async function POST(req: NextRequest) {
  // Verificar autenticación admin
  const authClient = await getAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { title, body, url, image } = await req.json() as {
    title: string
    body: string
    url?: string
    image?: string
  }

  if (!title || !body) {
    return NextResponse.json({ error: 'Título y mensaje requeridos' }, { status: 400 })
  }

  const serviceClient = getServiceClient()
  const { data: subscriptions, error: fetchError } = await serviceClient
    .from('push_subscriptions')
    .select('id, endpoint, keys_p256dh, keys_auth')

  if (fetchError) {
    return NextResponse.json({ error: 'Error al leer suscripciones' }, { status: 500 })
  }

  const payload = JSON.stringify({
    title,
    body,
    url: url || 'https://restaurante-sumak.vercel.app',
    ...(image ? { image } : {}),
  })
  let sent = 0
  let failed = 0
  const toDelete: string[] = []

  await Promise.allSettled(
    (subscriptions ?? []).map(async (sub: { id: string; endpoint: string; keys_p256dh: string; keys_auth: string }) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          payload
        )
        sent++
      } catch (err: unknown) {
        failed++
        const e = err as { statusCode?: number }
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          toDelete.push(sub.id)
        }
      }
    })
  )

  // Limpiar suscripciones vencidas
  if (toDelete.length > 0) {
    await serviceClient.from('push_subscriptions').delete().in('id', toDelete)
  }

  return NextResponse.json({ ok: true, sent, failed, removed: toDelete.length })
}
