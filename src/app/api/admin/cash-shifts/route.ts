import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/*
  SQL to run in Supabase SQL editor (same as in cash-movements route):

  CREATE TABLE IF NOT EXISTS cash_shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    opened_at timestamptz DEFAULT now(),
    closed_at timestamptz,
    opening_amount numeric NOT NULL DEFAULT 0,
    closing_amount numeric,
    expected_amount numeric,
    notes text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
  );

  CREATE TABLE IF NOT EXISTS cash_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL CHECK (type IN ('ingreso', 'egreso', 'venta_efectivo', 'venta_transferencia')),
    amount numeric NOT NULL,
    description text,
    shift_id uuid REFERENCES cash_shifts(id),
    created_at timestamptz DEFAULT now()
  );
*/

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/admin/cash-shifts — return all shifts with aggregated summaries
export async function GET() {
  try {
    const supabase = getAdminClient()

    const { data: shifts, error } = await supabase
      .from('cash_shifts')
      .select('*')
      .order('opened_at', { ascending: false })

    if (error) throw new Error(error.message)

    // For each shift, load movements summary
    const shiftsWithSummary = await Promise.all(
      (shifts ?? []).map(async (shift) => {
        const { data: movements } = await supabase
          .from('cash_movements')
          .select('type, amount')
          .eq('shift_id', shift.id)

        const summary = {
          total_efectivo: 0,
          total_transferencia: 0,
          total_ingresos: 0,
          total_egresos: 0,
        }

        for (const m of movements ?? []) {
          if (m.type === 'venta_efectivo') summary.total_efectivo += Number(m.amount)
          if (m.type === 'venta_transferencia') summary.total_transferencia += Number(m.amount)
          if (m.type === 'ingreso') summary.total_ingresos += Number(m.amount)
          if (m.type === 'egreso') summary.total_egresos += Number(m.amount)
        }

        const expected =
          Number(shift.opening_amount) +
          summary.total_efectivo +
          summary.total_ingresos -
          summary.total_egresos

        return { ...shift, summary, expected_calculated: expected }
      })
    )

    return NextResponse.json({ shifts: shiftsWithSummary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/admin/cash-shifts — open a new shift
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { opening_amount = 0 } = body

    const supabase = getAdminClient()

    // Check there's no shift already open
    const { data: existing } = await supabase
      .from('cash_shifts')
      .select('id')
      .eq('status', 'open')
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Ya hay una caja abierta' }, { status: 400 })
    }

    const { data: shift, error } = await supabase
      .from('cash_shifts')
      .insert({ opening_amount: Number(opening_amount), status: 'open' })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ shift }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH /api/admin/cash-shifts — close current open shift
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { closing_amount, notes } = body

    const supabase = getAdminClient()

    // Get current open shift
    const { data: shift, error: shiftErr } = await supabase
      .from('cash_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()

    if (shiftErr || !shift) {
      return NextResponse.json({ error: 'No hay caja abierta' }, { status: 404 })
    }

    // Calculate expected amount from movements
    const { data: movements } = await supabase
      .from('cash_movements')
      .select('type, amount')
      .eq('shift_id', shift.id)

    let totalEfectivo = 0
    let totalIngresos = 0
    let totalEgresos = 0

    for (const m of movements ?? []) {
      if (m.type === 'venta_efectivo') totalEfectivo += Number(m.amount)
      if (m.type === 'ingreso') totalIngresos += Number(m.amount)
      if (m.type === 'egreso') totalEgresos += Number(m.amount)
    }

    const expected =
      Number(shift.opening_amount) + totalEfectivo + totalIngresos - totalEgresos

    const { data: updated, error } = await supabase
      .from('cash_shifts')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closing_amount: closing_amount !== undefined ? Number(closing_amount) : null,
        expected_amount: expected,
        notes: notes ?? null,
      })
      .eq('id', shift.id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ shift: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
