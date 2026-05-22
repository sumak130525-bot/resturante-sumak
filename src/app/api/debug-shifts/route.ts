import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// TEMPORARY DEBUG endpoint - remove after fixing
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'MISSING'

  const result: Record<string, unknown> = {
    url_set: url !== 'MISSING',
    url_prefix: url.substring(0, 30),
    key_set: key !== 'MISSING',
    key_prefix: key.substring(0, 15),
  }

  try {
    const sb = createClient(url, key)
    const { data, error } = await sb.from('shifts').select('id, status').eq('status', 'open')
    result.shifts_open = data?.length ?? 0
    result.shifts_data = data
    result.error = error?.message ?? null
  } catch (err) {
    result.catch_error = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(result)
}
