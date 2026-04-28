import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET: return active menu items with display_order = 0 or null (no auth — called from TV screen)
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getServiceClient() as any

    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, name_en, name_qu, price, image_url, categories(name, slug)')
      .eq('active', true)
      .lte('display_order', 0)
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also get items with null display_order
    const { data: nullData } = await supabase
      .from('menu_items')
      .select('id, name, name_en, name_qu, price, image_url, categories(name, slug)')
      .eq('active', true)
      .is('display_order', null)
      .order('name', { ascending: true })

    const all = [...(data ?? []), ...(nullData ?? [])]
    all.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

    return NextResponse.json({ items: all })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
