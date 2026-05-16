import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  const admin = await getAdminClient()
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = admin
    .from('expenses')
    .select(`
      id,
      category_id,
      subcategory,
      amount,
      date,
      description,
      is_recurring,
      receipt_number,
      created_at,
      expense_categories:category_id (id, name)
    `)
    .order('date', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { category_id, subcategory, amount, date, description, is_recurring, receipt_number } = body

  if (!amount || !date) {
    return NextResponse.json({ error: 'amount y date son requeridos' }, { status: 400 })
  }

  const admin = await getAdminClient()
  const { data, error } = await admin
    .from('expenses')
    .insert({
      category_id: category_id ?? null,
      subcategory: subcategory?.trim() || null,
      amount: Number(amount),
      date,
      description: description?.trim() || null,
      is_recurring: Boolean(is_recurring),
      receipt_number: receipt_number?.trim() || null,
    })
    .select(`
      id, category_id, subcategory, amount, date, description,
      is_recurring, receipt_number, created_at,
      expense_categories:category_id (id, name)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, category_id, subcategory, amount, date, description, is_recurring, receipt_number } = body

  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  if (!amount || !date) return NextResponse.json({ error: 'amount y date son requeridos' }, { status: 400 })

  const admin = await getAdminClient()
  const { data, error } = await admin
    .from('expenses')
    .update({
      category_id: category_id ?? null,
      subcategory: subcategory?.trim() || null,
      amount: Number(amount),
      date,
      description: description?.trim() || null,
      is_recurring: Boolean(is_recurring),
      receipt_number: receipt_number?.trim() || null,
    })
    .eq('id', id)
    .select(`
      id, category_id, subcategory, amount, date, description,
      is_recurring, receipt_number, created_at,
      expense_categories:category_id (id, name)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  const admin = await getAdminClient()
  const { error } = await admin.from('expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
