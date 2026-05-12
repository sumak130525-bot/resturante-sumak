import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Order ID requerido' }, { status: 400 })
    }

    const body = await request.json()
    const { payment_method, cash_amount, transfer_amount } = body

    if (!payment_method) {
      return NextResponse.json({ error: 'payment_method requerido' }, { status: 400 })
    }

    const validMethods = ['cash', 'transfer', 'mixed', 'mercadopago']
    if (!validMethods.includes(payment_method)) {
      return NextResponse.json(
        { error: `payment_method inválido. Valores permitidos: ${validMethods.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = getAdminClient()

    // Ensure columns exist
    await supabase.rpc('exec_sql', {
      query: "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_amount numeric; ALTER TABLE orders ADD COLUMN IF NOT EXISTS transfer_amount numeric;"
    }).then(() => {}, () => {})

    const updatePayload: Record<string, unknown> = {
      payment_method,
      cash_amount: cash_amount ?? null,
      transfer_amount: transfer_amount ?? null,
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select('id, payment_method, cash_amount, transfer_amount')
      .single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Pedido no encontrado')

    return NextResponse.json({ success: true, order: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[PATCH /api/pos/orders/[id]/payment]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
