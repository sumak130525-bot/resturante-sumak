/*
 * ============================================================
 * PASO MANUAL REQUERIDO — Ejecutar este SQL en Supabase:
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.settings (
 *   key        text PRIMARY KEY,
 *   value      text,
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "admin_all" ON public.settings
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

// GET: obtener settings (opcionalmente filtrar por key)
export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  let query = admin.from('settings').select('*')
  if (key) query = query.eq('key', key)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST/PUT: guardar o actualizar un setting (upsert)
export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { key, value } = await request.json()
  if (!key) return NextResponse.json({ error: 'key es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { data, error } = await admin
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: eliminar un setting
export async function DELETE(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { key } = await request.json()
  if (!key) return NextResponse.json({ error: 'key es requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { error } = await admin.from('settings').delete().eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
