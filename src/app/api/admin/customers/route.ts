/*
 * ============================================================
 * PASO MANUAL REQUERIDO — Ejecutar este SQL en Supabase:
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.frequent_customers (
 *   id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   name       text        NOT NULL,
 *   phone      text,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE public.frequent_customers ENABLE ROW LEVEL SECURITY;
 *
 * -- Política: solo usuarios autenticados pueden leer/escribir
 * CREATE POLICY "admin_all" ON public.frequent_customers
 *   FOR ALL USING (auth.role() = 'authenticated');
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getClient(useServiceRole = false) {
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

async function requireAuth() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await getClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET: listar clientes frecuentes
export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { data, error } = await admin
    .from('frequent_customers')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: crear cliente
export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { name, phone } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { data, error } = await admin
    .from('frequent_customers')
    .insert({ name: name.trim(), phone: phone?.trim() || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PUT: editar cliente
export async function PUT(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, name, phone } = await request.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'name es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { data, error } = await admin
    .from('frequent_customers')
    .update({ name: name.trim(), phone: phone?.trim() || null })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: eliminar cliente
export async function DELETE(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { error } = await admin.from('frequent_customers').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
