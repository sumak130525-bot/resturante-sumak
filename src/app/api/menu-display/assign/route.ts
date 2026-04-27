import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST: assign a menu_item to a category and set its display_order
// No auth required — called from menu-display TV screen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { item_id, category_id, display_order } = body

    if (!item_id || !category_id) {
      return NextResponse.json({ error: 'Missing item_id or category_id' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getServiceClient() as any

    const updatePayload: { category_id: string; display_order?: number } = { category_id }
    if (typeof display_order === 'number') {
      updatePayload.display_order = display_order
    }

    const { error } = await supabase
      .from('menu_items')
      .update(updatePayload)
      .eq('id', item_id)

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
