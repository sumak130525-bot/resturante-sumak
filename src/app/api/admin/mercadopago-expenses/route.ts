import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN!

interface MPPayment {
  id: number
  date_created: string
  description: string | null
  transaction_amount: number
  status: string
  payment_type_id: string
  operation_type: string
  payer?: { email?: string }
  additional_info?: { items?: Array<{ title?: string }> }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') // YYYY-MM-DD
  const to = searchParams.get('to') // YYYY-MM-DD
  const offset = parseInt(searchParams.get('offset') ?? '0')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  // Search for payments made BY the user (money_transfer, payment)
  const params = new URLSearchParams({
    sort: 'date_created',
    criteria: 'desc',
    offset: offset.toString(),
    limit: limit.toString(),
  })

  // Filter: only outgoing payments (transfers sent, purchases)
  // operation_type: regular_payment = compra, money_transfer = transferencia
  if (from) params.append('begin_date', `${from}T00:00:00.000-03:00`)
  if (to) params.append('end_date', `${to}T23:59:59.000-03:00`)

  try {
    // Use /payments/search to get all movements
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/search?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!res.ok) {
      const error = await res.text()
      return NextResponse.json({ error: `MP API error: ${res.status} - ${error}` }, { status: res.status })
    }

    const data = await res.json()
    
    // Filter only OUTGOING payments (exclude incoming collections from customers)
    // operation_type: 'regular_payment' = cobro a cliente, 'money_transfer' = transferencia enviada
    // payment_type_id: 'account_money' = pago con saldo MP
    const payments: MPPayment[] = (data.results ?? []).filter((p: MPPayment) => 
      p.status === 'approved' && 
      p.operation_type !== 'regular_payment' && // excluir cobros de clientes
      p.operation_type !== 'pos_payment' // excluir cobros POS
    )

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        date: p.date_created,
        description: p.description || p.additional_info?.items?.[0]?.title || 'Sin descripción',
        amount: p.transaction_amount,
        status: p.status,
        type: p.operation_type,
        payment_type: p.payment_type_id,
      })),
      total: data.paging?.total ?? payments.length,
      offset,
      limit,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
