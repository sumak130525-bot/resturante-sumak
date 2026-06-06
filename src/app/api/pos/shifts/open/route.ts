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

    // Close any existing open shifts
    await supabase
      .from('cash_shifts')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('status', 'open')

    // Also close in legacy 'shifts' table if exists
    await supabase
      .from('shifts')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('status', 'open')

    // Create new shift in cash_shifts (primary)
    const { data: shift, error } = await supabase
      .from('cash_shifts')
      .insert({ opening_amount, status: 'open' })
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Sync: also create in legacy 'shifts' table
    await supabase
      .from('shifts')
      .insert({ opening_amount, status: 'open', opened_at: shift.opened_at })

    return NextResponse.json({ shift }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
