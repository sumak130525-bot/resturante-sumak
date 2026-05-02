import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Settings table key for item→modifier mappings
// Stored as JSON: { [item_id: string]: string[] }
const SETTINGS_KEY = 'item_modifiers'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET: return all mappings as { mappings: Record<string, string[]> }
export async function GET() {
  try {
    const supabase = getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()

    if (error) throw new Error(error.message)

    const mappings: Record<string, string[]> = data?.value
      ? JSON.parse(data.value)
      : {}

    return NextResponse.json({ mappings })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: save/update mapping for a single item
// Body: { item_id: string, modifier_ids: string[] }
export async function POST(request: NextRequest) {
  try {
    const { item_id, modifier_ids } = await request.json()

    if (!item_id || typeof item_id !== 'string') {
      return NextResponse.json({ error: 'item_id es requerido' }, { status: 400 })
    }
    if (!Array.isArray(modifier_ids)) {
      return NextResponse.json({ error: 'modifier_ids debe ser un array' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Load existing mappings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()

    const mappings: Record<string, string[]> = existing?.value
      ? JSON.parse(existing.value)
      : {}

    // Update for this item
    if (modifier_ids.length === 0) {
      delete mappings[item_id]
    } else {
      mappings[item_id] = modifier_ids
    }

    // Upsert back into settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('settings')
      .upsert(
        { key: SETTINGS_KEY, value: JSON.stringify(mappings), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, mappings })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
