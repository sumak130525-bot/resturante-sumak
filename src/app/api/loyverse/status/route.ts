import { NextResponse } from 'next/server'
import { getLoyverseItems, getLoyverseStores, getStoreId } from '@/lib/loyverse'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurado')
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any
}

export async function GET() {
  try {
    const [loyverseItems, loyverseStores] = await Promise.all([
      getLoyverseItems(),
      getLoyverseStores(),
    ])

    const storeId = getStoreId()
    const activeStore = loyverseStores.find((s: { id: string }) => s.id === storeId) ?? loyverseStores[0]

    // Obtener items del menú de Supabase
    const supabase = await getServiceClient()
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .eq('active', true)

    // Calcular mapeo
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const mapped: string[] = []
    const unmapped: string[] = []

    for (const mi of menuItems ?? []) {
      const target = normalize(mi.name)
      const found = loyverseItems.some((li: { item_name: string }) =>
        normalize(li.item_name).includes(target) || target.includes(normalize(li.item_name))
      )
      if (found) mapped.push(mi.name)
      else unmapped.push(mi.name)
    }

    return NextResponse.json({
      store: activeStore,
      loyverse_items_count: loyverseItems.length,
      menu_items_count: (menuItems ?? []).length,
      mapped_count: mapped.length,
      unmapped_count: unmapped.length,
      mapped,
      unmapped,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
