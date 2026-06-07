import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

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
      return NextResponse.json({ shift: null, _err: queryErr.message })
    }

    // If multiple open shifts, close all except the most recent
    if (shifts && shifts.length > 1) {
      const staleIds = shifts.slice(1).map((s: { id: string }) => s.id)
      await supabase
        .from('shifts')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .in('id', staleIds)
    }

    const shift = shifts && shifts.length > 0 ? shifts[0] : null

    return NextResponse.json({ shift: shift ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ shift: null, error: message }, { status: 500 })
  }
}
