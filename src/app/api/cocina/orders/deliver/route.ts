import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { id } = await request.json()

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const now = new Date().toISOString()

  // Marcar orden como delivered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('orders')
    .update({ status: 'delivered', delivered_at: now })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marcar todos los items como delivered_at (los que no lo tengan aún)
  await supabase
    .from('order_items')
    .update({ delivered_at: now })
    .eq('order_id', id)
    .is('delivered_at', null)
    .then(() => {}, () => {}) // non-fatal

  return NextResponse.json(data)
}
