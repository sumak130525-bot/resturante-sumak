import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getUntypedClient(useServiceRole = false) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useServiceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

// POST: actualizar order_pos de múltiples categorías
export async function POST(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { updates } = body as { updates: { id: string; sort_order: number }[] }

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates requerido' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      admin
        .from('categories')
        .update({ order_pos: sort_order })
        .eq('id', id)
    )
  )

  const failed = results.filter((r: { error: unknown }) => r.error)
  if (failed.length > 0) {
    return NextResponse.json({ error: 'Error actualizando algunas categorías' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
