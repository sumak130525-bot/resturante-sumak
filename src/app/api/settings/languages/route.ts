import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/settings/languages — returns { enabled: boolean }
export async function GET() {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'languages_enabled')
    .single()

  if (error || !data) {
    return NextResponse.json({ enabled: false })
  }

  return NextResponse.json({ enabled: data.value === 'true' })
}

// POST /api/settings/languages — body: { enabled: boolean }
export async function POST(request: NextRequest) {
  const { enabled } = await request.json()
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) es requerido' }, { status: 400 })
  }

  const admin = getAdmin()
  const { error } = await admin
    .from('settings')
    .upsert(
      { key: 'languages_enabled', value: String(enabled), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enabled })
}
