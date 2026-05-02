import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModifierOption = {
  id: string
  name: string
  price: number
}

type Modifier = {
  id: string
  name: string
  options: ModifierOption[]
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = getAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('settings')
      .select('value')
      .eq('key', 'pos_modifiers')
      .maybeSingle()

    if (error) throw new Error(error.message)

    const modifiers: Modifier[] = data?.value ? JSON.parse(data.value) : []

    return NextResponse.json({ modifiers })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
