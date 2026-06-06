import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/pos/shifts — returns current open shift (or null)
// Note: primary shift logic is in /api/pos/shifts/current, /open, /close
export async function GET() {
  try {
    const supabase = getAdminClient()

    const { data: shift, error } = await supabase
      .from('cash_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ shift: null })
    }

    return NextResponse.json({ shift: shift ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/pos/shifts — open a new shift
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { opening_amount = 0 } = body

    const supabase = getAdminClient()

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
