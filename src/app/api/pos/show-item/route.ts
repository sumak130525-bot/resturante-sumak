import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/show-item — restores a hidden item, sets display_order to given position or next available
export async function POST(request: NextRequest) {
  try {
    const { itemId, position } = await request.json()
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const supabase = getAdminClient()

    let targetOrder: number

    if (typeof position === 'number' && position >= 0) {
      targetOrder = position
    } else {
      // Find next available position (max display_order + 1 among visible items)
      const { data: items } = await supabase
        .from('menu_items')
        .select('display_order')
        .eq('active', true)
        .gt('display_order', 0)
        .order('display_order', { ascending: false })
        .limit(1)

      const maxOrder = items?.[0]?.display_order ?? 0
      targetOrder = (maxOrder as number) + 1
    }

    const { error } = await supabase
      .from('menu_items')
      .update({ display_order: targetOrder })
      .eq('id', itemId)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, display_order: targetOrder })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
