import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SETTINGS_KEY = 'pos_modifiers'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET: return all modifier groups
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

    const modifiers = data?.value ? JSON.parse(data.value) : []

    return NextResponse.json({ modifiers })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: save full modifier groups array (replacement)
// Body: { modifiers: ModifierGroup[] }
export async function POST(request: NextRequest) {
  try {
    const { modifiers } = await request.json()

    if (!Array.isArray(modifiers)) {
      return NextResponse.json({ error: 'modifiers debe ser un array' }, { status: 400 })
    }

    const supabase = getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('settings')
      .upsert(
        { key: SETTINGS_KEY, value: JSON.stringify(modifiers), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, modifiers })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
