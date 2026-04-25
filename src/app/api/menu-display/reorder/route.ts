import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// SQL to add the column if it doesn't exist:
// ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface ReorderUpdate {
  id: string
  display_order: number
}

// POST: update display_order for a batch of items (no auth — called from menu-display TV screen)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const updates: ReorderUpdate[] = body?.updates

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Missing or empty updates array' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getServiceClient() as any

    // Update each item individually (Supabase JS v2 does not support batch upsert by id without conflicts)
    const errors: string[] = []
    await Promise.all(
      updates.map(async ({ id, display_order }) => {
        const { error } = await supabase
          .from('menu_items')
          .update({ display_order })
          .eq('id', id)
        if (error) errors.push(`${id}: ${error.message}`)
      })
    )

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
