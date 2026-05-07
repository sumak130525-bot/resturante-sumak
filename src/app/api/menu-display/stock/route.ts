import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST: update available_qty for a single menu item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, available_qty } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // available_qty must be null or a non-negative integer
    if (available_qty !== null && (typeof available_qty !== 'number' || !Number.isInteger(available_qty) || available_qty < 0)) {
      return NextResponse.json({ error: 'Invalid available_qty' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getServiceClient() as any
    const { error } = await supabase
      .from('menu_items')
      .update({ available_qty })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
