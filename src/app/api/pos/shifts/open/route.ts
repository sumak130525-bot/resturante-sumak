import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/shifts/open — opens a new shift
// Body: { opening_amount: number }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { opening_amount } = body

    if (typeof opening_amount !== 'number' || opening_amount < 0) {
      return NextResponse.json({ error: 'Monto inicial inválido' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Ensure table exists
    await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS shifts (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          opened_at timestamptz DEFAULT now() NOT NULL,
          closed_at timestamptz,
          opening_amount numeric NOT NULL DEFAULT 0,
          closing_amount numeric,
          expected_amount numeric,
          difference numeric,
          total_cash_sales numeric DEFAULT 0,
          total_transfer_sales numeric DEFAULT 0,
          total_mixed_sales numeric DEFAULT 0,
          total_income numeric DEFAULT 0,
          total_expense numeric DEFAULT 0,
          notes text,
          status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
        );
      `
    }).then(() => {}, () => {})

    // Close any existing open shift first (shouldn't happen in normal flow)
    await supabase
      .from('shifts')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('status', 'open')

    // Create new shift
    const { data: shift, error } = await supabase
      .from('shifts')
      .insert({ opening_amount, status: 'open' })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ shift }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
