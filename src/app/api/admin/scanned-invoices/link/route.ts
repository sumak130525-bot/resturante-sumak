import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH: link a scanned invoice with an MP payment
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { invoice_id, mp_payment_id } = body

  if (!invoice_id || !mp_payment_id) {
    return NextResponse.json({ error: 'invoice_id y mp_payment_id requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scanned_invoices')
    .update({
      mp_payment_id: String(mp_payment_id),
      status: 'linked',
    })
    .eq('id', invoice_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
