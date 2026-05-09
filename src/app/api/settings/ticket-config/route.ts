import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { type TicketConfig, DEFAULT_TICKET_CONFIG } from '@/types/ticket-config'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/settings/ticket-config
export async function GET() {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'ticket_config')
    .single()

  if (error || !data) {
    return NextResponse.json(DEFAULT_TICKET_CONFIG)
  }

  try {
    const parsed = JSON.parse(data.value)
    return NextResponse.json({ ...DEFAULT_TICKET_CONFIG, ...parsed })
  } catch {
    return NextResponse.json(DEFAULT_TICKET_CONFIG)
  }
}

// POST /api/settings/ticket-config
export async function POST(request: NextRequest) {
  const body = await request.json()

  // Merge with defaults to ensure all fields are present
  const config: TicketConfig = { ...DEFAULT_TICKET_CONFIG, ...body }

  const admin = getAdmin()
  const { error } = await admin
    .from('settings')
    .upsert(
      {
        key: 'ticket_config',
        value: JSON.stringify(config),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(config)
}
