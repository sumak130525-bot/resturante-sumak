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

  const { mp_payment_id, category_id, description, amount, date, items } = body

  // 1. Create expense in finanzas
  const { data: expense, error: expError } = await admin
    .from('expenses')
    .insert({
      category_id: category_id || null,
      amount,
      date: date ? date.split('T')[0] : new Date().toISOString().split('T')[0],
      description: description || `MercadoPago #${mp_payment_id}`,
      is_recurring: false,
      receipt_number: `MP-${mp_payment_id}`,
    })
    .select()
    .single()

  if (expError) {
    return NextResponse.json({ error: expError.message }, { status: 500 })
  }

  // 2. If items provided, update inventory
  if (items && items.length > 0) {
    for (const item of items) {
      // item: { ingredient_id, quantity, unit_price }
      if (!item.ingredient_id) continue

      const { error: invError } = await admin
        .from('inventory_movements')
        .insert({
          ingredient_id: item.ingredient_id,
          type: 'purchase',
          quantity: item.quantity,
          unit_price: item.unit_price || (amount / items.length),
          notes: `MercadoPago #${mp_payment_id}`,
        })

      if (invError) {
        console.error('Inventory insert error:', invError)
        continue
      }

      // Update ingredient current stock
      const { data: ing } = await admin
        .from('ingredients')
        .select('current_stock')
        .eq('id', item.ingredient_id)
        .single()

      if (ing) {
        await admin
          .from('ingredients')
          .update({ current_stock: (ing.current_stock || 0) + item.quantity })
          .eq('id', item.ingredient_id)
      }
    }
  }

  return NextResponse.json({ ok: true, expense })
}
