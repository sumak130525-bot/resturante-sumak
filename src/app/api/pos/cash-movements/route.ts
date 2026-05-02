import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/*
  SQL to run in Supabase SQL editor:

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

// GET /api/pos/cash-movements — returns movements for current open shift (or shift_id if provided)
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const shiftIdParam = searchParams.get('shift_id')

    let shiftId: string | null = shiftIdParam

    if (!shiftId) {
      // Get current open shift
      const { data: shift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single()

      if (!shift) {
        return NextResponse.json({ movements: [], shift: null })
      }
      shiftId = shift.id
    }

    const { data: movements, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('shift_id', shiftId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    return NextResponse.json({ movements: movements ?? [], shift_id: shiftId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/pos/cash-movements — create a manual movement (ingreso/egreso)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, amount, description } = body

    if (!type || !['ingreso', 'egreso', 'venta_efectivo', 'venta_transferencia'].includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Get current open shift (or create one if none exists)
    let shiftId: string | null = null
    const { data: shift } = await supabase
      .from('cash_shifts')
      .select('id')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()

    if (shift) {
      shiftId = shift.id
    } else {
      // Auto-create shift if none open
      const { data: newShift, error: shiftErr } = await supabase
        .from('cash_shifts')
        .insert({ opening_amount: 0, status: 'open' })
        .select('id')
        .single()
      if (shiftErr) throw new Error(shiftErr.message)
      shiftId = newShift?.id ?? null
    }

    const { data: movement, error } = await supabase
      .from('cash_movements')
      .insert({ type, amount, description: description ?? null, shift_id: shiftId })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ movement }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
