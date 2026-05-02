import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Try adding line_note column via rpc
    const { error } = await supabase.rpc('exec_sql', {
      query: 'ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_note text;'
    })

    if (error) {
      return NextResponse.json({ error: error.message, hint: 'Run this SQL in Supabase Dashboard: ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_note text;' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
