import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/*
 * ──────────────────────────────────────────────────────────────────────────────
 * SQL MIGRATIONS (documentado — NO ejecutar desde acá)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 1. Crear tabla de categorías de gastos:
 *
 *    CREATE TABLE expense_categories (
 *      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      name       text NOT NULL,
 *      created_at timestamptz NOT NULL DEFAULT now()
 *    );
 *
 * 2. Insertar categorías predefinidas:
 *
 *    INSERT INTO expense_categories (name) VALUES
 *      ('Impuestos'),
 *      ('Servicios'),
 *      ('Alquiler'),
 *      ('Sueldos'),
 *      ('Mercadería'),
 *      ('Mantenimiento'),
 *      ('Otros');
 *
 * 3. Crear tabla de gastos:
 *
 *    CREATE TABLE expenses (
 *      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      category_id    uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
 *      subcategory    text,
 *      amount         numeric NOT NULL,
 *      date           date NOT NULL,
 *      description    text,
 *      is_recurring   boolean NOT NULL DEFAULT false,
 *      receipt_number text,
 *      created_at     timestamptz NOT NULL DEFAULT now()
 *    );
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdminClient(): Promise<any> {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

export async function GET() {
  const admin = await getAdminClient()
  const { data, error } = await admin
    .from('expense_categories')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name } = body
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name es requerido' }, { status: 400 })
  }
  const admin = await getAdminClient()
  const { data, error } = await admin
    .from('expense_categories')
    .insert({ name: name.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, name } = body
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  if (!name || !name.trim()) return NextResponse.json({ error: 'name es requerido' }, { status: 400 })
  const admin = await getAdminClient()
  const { data, error } = await admin
    .from('expense_categories')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  const admin = await getAdminClient()
  const { error } = await admin
    .from('expense_categories')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
