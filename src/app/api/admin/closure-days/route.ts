/*
 * ============================================================
 * TABLAS REQUERIDAS EN SUPABASE (ejecutar manualmente):
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.closure_days (
 *   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   start_date  date NOT NULL,
 *   end_date    date,
 *   reason      text NOT NULL,
 *   created_at  timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE public.closure_days ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "public_read" ON public.closure_days
 *   FOR SELECT USING (true);
 *
 * CREATE POLICY "admin_write" ON public.closure_days
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

// GET — devuelve todas las fechas de cierre (lectura pública)
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await getClient(false) as any
  const { data, error } = await supabase
    .from('closure_days')
    .select('*')
    .order('start_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — crea un nuevo día de cierre (requiere auth)
export async function POST(request: NextRequest) {
  const { start_date, end_date, reason } = await request.json()

  if (!start_date || !reason) {
    return NextResponse.json({ error: 'start_date y reason son requeridos' }, { status: 400 })
  }

  // Verificar auth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authClient = await getClient(false) as any
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { data, error } = await admin
    .from('closure_days')
    .insert({
      start_date,
      end_date: end_date || null,
      reason,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE — elimina por id (requiere auth)
export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  // Verificar auth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authClient = await getClient(false) as any
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any
  const { error } = await admin.from('closure_days').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
