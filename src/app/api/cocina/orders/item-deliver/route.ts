import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// POST /api/cocina/orders/item-deliver
// Marca o desmarca un item individual como entregado
export async function POST(request: NextRequest) {
  try {
    const { item_id, delivered } = await request.json()

    if (!item_id || typeof item_id !== 'string') {
      return NextResponse.json({ error: 'item_id requerido' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('order_items')
      .update({ delivered_at: delivered ? now : null })
      .eq('id', item_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, delivered_at: delivered ? now : null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
