import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getUntypedClient(useServiceRole = false) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useServiceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

/**
 * GET /api/admin/costs
 * Returns all active menu items with their calculated costs:
 * - ingredient cost (sum of recipe_items * ingredient price)
 * - indirect costs (packaging, labor, indirect)
 * - total cost, profit, margin%, suggested price
 */
export async function GET() {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Use service-role client so RLS never blocks recipe_items / ingredients reads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = await getUntypedClient(true) as any

  const [menuRes, recipeRes, plateCostsRes, ingredientsRes] = await Promise.all([
    db.from('menu_items').select('id, name, price').eq('active', true).order('name'),
    db.from('recipe_items').select('menu_item_id, ingredient_id, quantity'),
    db.from('plate_costs').select('*'),
    db.from('ingredients').select('id, price_per_unit'),
  ])

  if (menuRes.error) return NextResponse.json({ error: menuRes.error.message }, { status: 500 })
  if (recipeRes.error) console.error('[costs] recipe_items query error:', recipeRes.error.message)
  if (ingredientsRes.error) console.error('[costs] ingredients query error:', ingredientsRes.error.message)
  if (plateCostsRes.error) console.error('[costs] plate_costs query error:', plateCostsRes.error.message)

  // Build lookup maps
  const ingredientPriceMap: Record<string, number> = {}
  for (const ing of (ingredientsRes.data ?? [])) {
    ingredientPriceMap[ing.id] = Number(ing.price_per_unit)
  }

  // Group recipe items by menu_item_id
  const recipeByItem: Record<string, { ingredient_id: string; quantity: number }[]> = {}
  for (const ri of (recipeRes.data ?? [])) {
    if (!recipeByItem[ri.menu_item_id]) recipeByItem[ri.menu_item_id] = []
    recipeByItem[ri.menu_item_id].push({ ingredient_id: ri.ingredient_id, quantity: Number(ri.quantity) })
  }

  // plate_costs by menu_item_id
  const plateCostMap: Record<string, { packaging: number; labor: number; indirect: number; notes: string }> = {}
  for (const pc of (plateCostsRes.data ?? [])) {
    plateCostMap[pc.menu_item_id] = {
      packaging: Number(pc.packaging ?? 0),
      labor: Number(pc.labor ?? 0),
      indirect: Number(pc.indirect ?? 0),
      notes: pc.notes ?? '',
    }
  }

  const results = (menuRes.data ?? []).map((item: { id: string; name: string; price: number }) => {
    const recipe = recipeByItem[item.id] ?? []
    const ingredientCost = recipe.reduce((sum: number, ri: { ingredient_id: string; quantity: number }) => {
      return sum + (ingredientPriceMap[ri.ingredient_id] ?? 0) * ri.quantity
    }, 0)

    const pc = plateCostMap[item.id] ?? { packaging: 0, labor: 0, indirect: 0, notes: '' }
    const totalCost = ingredientCost + pc.packaging + pc.labor + pc.indirect
    const price = Number(item.price)
    const profit = price - totalCost
    const margin = price > 0 ? (profit / price) * 100 : 0
    const suggestedPrice = totalCost * 3

    return {
      id: item.id,
      name: item.name,
      price,
      ingredientCost,
      packaging: pc.packaging,
      labor: pc.labor,
      indirect: pc.indirect,
      totalCost,
      profit,
      margin,
      suggestedPrice,
      notes: pc.notes,
    }
  })

  return NextResponse.json(results)
}

/**
 * POST /api/admin/costs
 * Body: {
 *   menu_item_id: string,
 *   packaging: number,
 *   labor: number,
 *   indirect: number,
 *   notes: string,
 *   recipe: { ingredient_id: string, quantity: number }[]
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any
  const body = await request.json()
  const { menu_item_id, packaging, labor, indirect, notes, recipe } = body

  if (!menu_item_id) return NextResponse.json({ error: 'menu_item_id required' }, { status: 400 })

  // Upsert plate_costs
  const { error: pcErr } = await admin
    .from('plate_costs')
    .upsert(
      { menu_item_id, packaging: packaging ?? 0, labor: labor ?? 0, indirect: indirect ?? 0, notes: notes ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'menu_item_id' }
    )

  if (pcErr) return NextResponse.json({ error: pcErr.message }, { status: 500 })

  // Replace recipe items: delete existing, insert new
  await admin.from('recipe_items').delete().eq('menu_item_id', menu_item_id)

  if (Array.isArray(recipe) && recipe.length > 0) {
    const rows = recipe
      .filter((r: { ingredient_id: string; quantity: number }) => r.ingredient_id && Number(r.quantity) > 0)
      .map((r: { ingredient_id: string; quantity: number }) => ({
        menu_item_id,
        ingredient_id: r.ingredient_id,
        quantity: Number(r.quantity),
      }))

    if (rows.length > 0) {
      const { error: riErr } = await admin.from('recipe_items').insert(rows)
      if (riErr) return NextResponse.json({ error: riErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
