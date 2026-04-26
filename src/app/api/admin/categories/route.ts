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

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .trim()
}

// GET: listar categorías ordenadas por order_pos con cantidad de platos
export async function GET() {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('categories')
    .select('*, menu_items(count)')
    .order('order_pos')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: crear nueva categoría
export async function POST(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { name, order_pos } = body
  const slug = body.slug || toSlug(name)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { data, error } = await admin
    .from('categories')
    .insert({ name, slug, order_pos: order_pos ?? 99 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PUT: actualizar nombre (y opcionalmente slug) de una categoría
export async function PUT(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { id, name, slug } = body

  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    updates.name = name
    updates.slug = slug || toSlug(name)
  }
  if (slug !== undefined && name === undefined) {
    updates.slug = slug
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { data, error } = await admin
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: eliminar categoría (solo si no tiene platos)
export async function DELETE(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  // Verificar que no tenga platos asignados
  const { count } = await admin
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${count} plato(s) asignado(s)` },
      { status: 409 }
    )
  }

  const { error } = await admin.from('categories').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
