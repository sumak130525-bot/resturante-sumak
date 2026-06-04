import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getAdminClient() {
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

export async function POST(request: NextRequest) {
  const admin = await getAdminClient()
  const body = await request.json()

  const { category_id, description, amount, date } = body

  if (!amount || !description) {
    return NextResponse.json({ error: 'amount y description son requeridos' }, { status: 400 })
  }

  const timestamp = Date.now()
  const receipt_number = `MP-MANUAL-${timestamp}`

  const { data: expense, error: expError } = await admin
    .from('expenses')
    .insert({
      category_id: category_id || null,
      amount: Number(amount),
      date: date ? date : new Date().toISOString().split('T')[0],
      description: description,
      is_recurring: false,
      receipt_number,
    })
    .select()
    .single()

  if (expError) {
    return NextResponse.json({ error: expError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, expense })
}
