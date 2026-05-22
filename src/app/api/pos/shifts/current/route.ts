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

    const { data: shifts, error: queryErr } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })

    if (queryErr) {
      console.error('[shifts/current] query error:', queryErr.message)
      return NextResponse.json({ shift: null, _debug: queryErr.message })
    }

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

    return NextResponse.json({ shift: shift ?? null, _count: shifts?.length ?? 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
