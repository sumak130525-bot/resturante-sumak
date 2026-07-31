import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/pos/shifts/preview — preview of close summary (same logic as close)
export async function GET() {
  try {
    const supabase = getAdminClient()

    const { data: shift, error: shiftErr } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()

    if (shiftErr || !shift) {
      return NextResponse.json({ error: 'No hay turno abierto' }, { status: 404 })
    }

    const shiftId = shift.id
    const openedAt = shift.opened_at

    // Get all non-cancelled orders in this shift period
    // Use direct PostgREST fetch to bypass Supabase JS schema cache
    const ordersRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?created_at=gte.${encodeURIComponent(openedAt)}&status=neq.cancelled&select=total,payment_method,cash_amount,transfer_amount,status`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        cache: 'no-store',
      }
    )
    const orders = await ordersRes.json()

    let totalCashSales = 0
    let totalTransferSales = 0
    let totalMixedSales = 0
    let mixedCashTotal = 0

    for (const order of (orders ?? [])) {
      const pm = (order.payment_method ?? '').toLowerCase()
      const total = Number(order.total ?? 0)
      if (pm === 'cash' || pm === 'efectivo') {
        totalCashSales += total
      } else if (pm === 'transfer' || pm === 'transferencia') {
        totalTransferSales += total
      } else if (pm === 'mixed' || pm === 'mixto') {
        totalMixedSales += total
        mixedCashTotal += Number(order.cash_amount ?? 0)
      }
    }

    // Get cash movements for this shift
    const { data: movements } = await supabase
      .from('cash_movements')
      .select('type, amount')
      .eq('shift_id', shiftId)

    let totalIncome = 0
    let totalExpense = 0
    let totalRetiros = 0

    for (const mov of (movements ?? [])) {
      const amount = Number(mov.amount ?? 0)
      if (mov.type === 'ingreso') {
        totalIncome += amount
      } else if (mov.type === 'egreso') {
        totalExpense += amount
      } else if (mov.type === 'retiro') {
        totalRetiros += amount
      }
    }

    // Refunds from cancelled orders
    const { data: cancelledOrders } = await supabase
      .from('orders')
      .select('total, payment_method, cash_amount')
      .gte('created_at', openedAt)
      .eq('status', 'cancelled')

    let totalRefunds = 0
    for (const order of (cancelledOrders ?? [])) {
      const pm = order.payment_method
      if (pm === 'cash') {
        totalRefunds += Number(order.total ?? 0)
      } else if (pm === 'mixed') {
        totalRefunds += Number(order.cash_amount ?? 0)
      }
    }

    const opening = Number(shift.opening_amount ?? 0)
    const expectedAmount = opening + totalCashSales + mixedCashTotal + totalIncome - totalExpense - totalRefunds - totalRetiros

    return NextResponse.json({
      opening_amount: opening,
      expected_amount: expectedAmount,
      total_cash_sales: totalCashSales,
      total_transfer_sales: totalTransferSales,
      total_mixed_sales: totalMixedSales,
      total_income: totalIncome,
      total_expense: totalExpense,
      total_retiros: totalRetiros,
      total_refunds: totalRefunds,
      opened_at: openedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
