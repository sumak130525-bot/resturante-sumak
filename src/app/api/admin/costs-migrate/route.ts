import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/costs-migrate
 * Creates the ingredients, recipe_items, and plate_costs tables.
 * Safe to call multiple times (IF NOT EXISTS).
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // Check if tables already exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: checkErr } = await (supabase as any)
      .from('ingredients')
      .select('id')
      .limit(1)

    if (!checkErr) {
      return NextResponse.json({ ok: true, note: 'Tables already exist' })
    }

    // Tables don't exist yet — return the SQL to run manually
    const sql = `
-- Ingredients catalog
CREATE TABLE IF NOT EXISTS ingredients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  price_per_unit numeric NOT NULL DEFAULT 0,
  supplier text,
  created_at timestamptz DEFAULT now()
);

-- Recipe items: which ingredients go into each menu item
CREATE TABLE IF NOT EXISTS recipe_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indirect costs per plate
CREATE TABLE IF NOT EXISTS plate_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE UNIQUE,
  packaging numeric DEFAULT 0,
  labor numeric DEFAULT 0,
  indirect numeric DEFAULT 0,
  notes text,
  updated_at timestamptz DEFAULT now()
);
`.trim()

    return NextResponse.json({
      ok: false,
      action_required: true,
      message: 'Run the following SQL in your Supabase SQL Editor, then call this endpoint again:',
      sql,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
