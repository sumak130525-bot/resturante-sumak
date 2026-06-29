import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/shifts/close — closes the current open shift
// Body: { closing_amount: number, notes?: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { closing_amount, notes } = body

    if (typeof closing_amount !== 'number' || closing_amount < 0) {
      return NextResponse.json({ error: 'Monto en caja inválido' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Get current open shift
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

    // Get all non-cancelled orders in this shift period (from opened_at to now)
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

    for (const order of (orders ?? [])) {
      const pm = (order.payment_method ?? '').toLowerCase()
      const total = Number(order.total ?? 0)
      if (pm === 'cash' || pm === 'efectivo') {
        totalCashSales += total
      } else if (pm === 'transfer' || pm === 'transferencia') {
        totalTransferSales += total
      } else if (pm === 'mixed' || pm === 'mixto') {
        totalMixedSales += total
      }
    }

    // Get cash movements for this shift
    const { data: movements } = await supabase
      .from('cash_movements')
      .select('type, amount')
      .eq('shift_id', shiftId)

    let totalIncome = 0
    let totalExpense = 0

    for (const mov of (movements ?? [])) {
      const amount = Number(mov.amount ?? 0)
      if (mov.type === 'ingreso') {
        totalIncome += amount
      } else if (mov.type === 'egreso') {
        totalExpense += amount
      }
    }

    // Get refunds from cancelled orders (cash portion only affects physical drawer)
    const cancelledRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?created_at=gte.${encodeURIComponent(openedAt)}&status=eq.cancelled&select=total,payment_method,cash_amount`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        cache: 'no-store',
      }
    )
    const cancelledOrders = await cancelledRes.json()

    let totalRefunds = 0
    for (const order of (cancelledOrders ?? [])) {
      const pm = (order.payment_method ?? '').toLowerCase()
      if (pm === 'cash' || pm === 'efectivo') {
        totalRefunds += Number(order.total ?? 0)
      } else if (pm === 'mixed' || pm === 'mixto') {
        totalRefunds += Number(order.cash_amount ?? 0)
      }
    }

    // For mixed orders, the cash portion is what physically enters the drawer
    let mixedCashTotal = 0
    for (const order of (orders ?? [])) {
      if ((order.payment_method ?? '').toLowerCase() === 'mixed' || (order.payment_method ?? '').toLowerCase() === 'mixto') {
        mixedCashTotal += Number(order.cash_amount ?? 0)
      }
    }

    // expected = opening_amount + cash_sales + mixed_cash_portion + income - expense - refunds
    const expectedAmount = Number(shift.opening_amount)
      + totalCashSales
      + mixedCashTotal
      + totalIncome
      - totalExpense
      - totalRefunds

    const difference = closing_amount - expectedAmount

    const closedAt = new Date().toISOString()

    const { data: closedShift, error: closeErr } = await supabase
      .from('shifts')
      .update({
        status: 'closed',
        closed_at: closedAt,
        closing_amount,
        expected_amount: expectedAmount,
        difference,
        total_cash_sales: totalCashSales,
        total_transfer_sales: totalTransferSales,
        total_mixed_sales: totalMixedSales,
        total_income: totalIncome,
        total_expense: totalExpense,
        notes: notes ?? null,
      })
      .eq('id', shiftId)
      .select()
      .single()

    if (closeErr) throw new Error(closeErr.message)

    // Sync: close the legacy cash_shifts table
    await supabase
      .from('cash_shifts')
      .update({
        status: 'closed',
        closed_at: closedAt,
        closing_amount,
        expected_amount: expectedAmount,
        notes: notes ?? null,
      })
      .eq('status', 'open')

    return NextResponse.json({
      shift: closedShift,
      summary: {
        opening_amount: Number(shift.opening_amount),
        closing_amount,
        expected_amount: expectedAmount,
        difference,
        total_cash_sales: totalCashSales,
        total_transfer_sales: totalTransferSales,
        total_mixed_sales: totalMixedSales,
        total_income: totalIncome,
        total_expense: totalExpense,
        total_refunds: totalRefunds,
        opened_at: openedAt,
        closed_at: closedAt,
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
