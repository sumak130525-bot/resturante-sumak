import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/hide-item — sets display_order = -1 for the given item
export async function POST(request: NextRequest) {
  try {
    const { itemId } = await request.json()
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { error } = await supabase
      .from('menu_items')
      .update({ display_order: -1 })
      .eq('id', itemId)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
