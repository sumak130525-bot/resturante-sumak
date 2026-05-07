import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/migrate
 * Runs the available_qty migration: adds column + creates helper RPC.
 * Only callable with service role from server-side.
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // Check if column already exists by querying it
    const { error: checkErr } = await supabase
      .from('menu_items')
      .select('available_qty')
      .limit(1)

    if (!checkErr) {
      return NextResponse.json({ ok: true, note: 'Column available_qty already exists' })
    }

    // Column doesn't exist — let the user know they need to run the SQL manually
    return NextResponse.json({
      ok: false,
      action_required: true,
      message: 'Run the following SQL in your Supabase SQL Editor:',
      sql: [
        'ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS available_qty integer DEFAULT NULL;',
        '',
        'CREATE OR REPLACE FUNCTION decrement_available_qty(p_item_id uuid, p_quantity integer)',
        'RETURNS void LANGUAGE plpgsql AS $$',
        'BEGIN',
        '  UPDATE menu_items',
        '  SET available_qty = GREATEST(0, available_qty - p_quantity)',
        '  WHERE id = p_item_id',
        '    AND available_qty IS NOT NULL',
        '    AND available_qty > 0;',
        'END;',
        '$$;',
      ].join('\n'),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
