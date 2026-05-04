import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/swap-items — swaps display_order between two items
export async function POST(request: NextRequest) {
  try {
    const { itemId1, itemId2 } = await request.json()
    if (!itemId1 || !itemId2) {
      return NextResponse.json({ error: 'Missing itemId1 or itemId2' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Fetch current display_orders
    const { data: items, error: fetchError } = await supabase
      .from('menu_items')
      .select('id, display_order')
      .in('id', [itemId1, itemId2])

    if (fetchError) throw new Error(fetchError.message)
    if (!items || items.length < 2) {
      return NextResponse.json({ error: 'Could not find both items' }, { status: 404 })
    }

    const item1 = items.find((i) => i.id === itemId1)
    const item2 = items.find((i) => i.id === itemId2)
    if (!item1 || !item2) {
      return NextResponse.json({ error: 'Could not find both items' }, { status: 404 })
    }

    // Swap their display_orders
    const errors: string[] = []
    await Promise.all([
      supabase
        .from('menu_items')
        .update({ display_order: item2.display_order })
        .eq('id', itemId1)
        .then(({ error }) => { if (error) errors.push(error.message) }),
      supabase
        .from('menu_items')
        .update({ display_order: item1.display_order })
        .eq('id', itemId2)
        .then(({ error }) => { if (error) errors.push(error.message) }),
    ])

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
