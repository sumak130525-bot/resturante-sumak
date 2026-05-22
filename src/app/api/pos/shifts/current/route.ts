import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/pos/shifts/current — returns the current open shift or null
export async function GET() {
  try {
    const supabase = getAdminClient()

    // Ensure shifts table exists
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

    const { data: shifts } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })

    // If multiple open shifts, close all except the most recent
    if (shifts && shifts.length > 1) {
      const staleIds = shifts.slice(1).map((s) => s.id)
      await supabase
        .from('shifts')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .in('id', staleIds)
    }

    const shift = shifts && shifts.length > 0 ? shifts[0] : null

    if (shift) {
      // Sync: if there is an open shift in 'shifts' but no open cash_shift, create one
      const { data: openCashShift } = await supabase
        .from('cash_shifts')
        .select('id')
        .eq('status', 'open')
        .limit(1)
        .single()

      if (!openCashShift) {
        // Close any stale cash_shifts first, then create a new one synced to this shift
        await supabase
          .from('cash_shifts')
          .update({ status: 'closed', closed_at: new Date().toISOString() })
          .eq('status', 'open')

        await supabase
          .from('cash_shifts')
          .insert({
            opening_amount: Number(shift.opening_amount),
            status: 'open',
            opened_at: shift.opened_at,
          })
      }
    }

    return NextResponse.json({ shift: shift ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
