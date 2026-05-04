import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/pos/hidden-items — returns active items with display_order = -1
export async function GET() {
  try {
    const supabase = getAdminClient()

    const { data: items, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('active', true)
      .eq('display_order', -1)
      .order('name', { ascending: true })

    if (error) throw new Error(error.message)

    return NextResponse.json({ items: items ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
