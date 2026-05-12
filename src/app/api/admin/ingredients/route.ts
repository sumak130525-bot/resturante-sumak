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
 * Fuzzy name match: returns true if names share a meaningful substring.
 * 'Coca Cola 500ml' matches 'Coca Cola'; bidirectional includes, case-insensitive.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase().trim()
  const bl = b.toLowerCase().trim()
  return al === bl || al.includes(bl) || bl.includes(al)
}

/**
 * After saving an ingredient, look for a menu_item with a similar name and
 * upsert a recipe_item linking them with quantity=1.
 * This makes beverages (resold as-is) automatically appear in /admin/costs.
 */
async function linkIngredientToMenuItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ingredientId: string,
  ingredientName: string
): Promise<string | null> {
  try {
    const { data: menuItems, error } = await admin
      .from('menu_items')
      .select('id, name')
      .eq('active', true)

    if (error || !menuItems) {
      console.error('[invoice-scan] Error fetching menu_items for auto-link:', error?.message)
      return null
    }

    const matched = (menuItems as { id: string; name: string }[]).find((mi) =>
      fuzzyMatch(mi.name, ingredientName)
    )

    if (!matched) return null

    // Upsert: if a recipe_item already exists for this menu_item+ingredient pair, skip.
    // We use delete+insert pattern to avoid duplicate key issues without a unique constraint.
    const { data: existing } = await admin
      .from('recipe_items')
      .select('id')
      .eq('menu_item_id', matched.id)
      .eq('ingredient_id', ingredientId)
      .maybeSingle()

    if (!existing) {
      const { error: riErr } = await admin
        .from('recipe_items')
        .insert({ menu_item_id: matched.id, ingredient_id: ingredientId, quantity: 1 })

      if (riErr) {
        console.error('[invoice-scan] Error inserting recipe_item:', riErr.message)
        return null
      }
    }

    return matched.id
  } catch (e) {
    console.error('[invoice-scan] linkIngredientToMenuItem unexpected error:', e)
    return null
  }
}

// GET: list all ingredients
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = await getUntypedClient(true) as any

  const { data, error } = await db
    .from('ingredients')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: create ingredient (and auto-link to menu_item if name matches)
export async function POST(request: NextRequest) {
  const body = await request.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { data, error } = await admin
    .from('ingredients')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-link to menu_item
  const linkedMenuItemId = await linkIngredientToMenuItem(admin, data.id, data.name)

  return NextResponse.json({ ...data, linked_menu_item_id: linkedMenuItemId }, { status: 201 })
}

// PUT: update ingredient (and auto-link to menu_item if name matches)
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  let data: Record<string, unknown> | null = null

  if (Object.keys(updates).length > 0) {
    const { data: updated, error } = await admin
      .from('ingredients')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[ingredients] PUT update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    data = updated
  } else {
    // No fields to update — just fetch the current row to get the name for auto-linking
    const { data: fetched, error } = await admin
      .from('ingredients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[ingredients] PUT fetch error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    data = fetched
  }

  if (!data) return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })

  // Auto-link to menu_item (using current name from DB)
  const linkedMenuItemId = await linkIngredientToMenuItem(admin, data.id as string, data.name as string)

  return NextResponse.json({ ...data, linked_menu_item_id: linkedMenuItemId })
}

// DELETE: remove ingredient (cascades recipe_items and inventory_movements)
export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  // 1. Delete recipe_items referencing this ingredient
  const { error: riErr } = await admin
    .from('recipe_items')
    .delete()
    .eq('ingredient_id', id)
  if (riErr) return NextResponse.json({ error: `recipe_items: ${riErr.message}` }, { status: 500 })

  // 2. Delete inventory_movements referencing this ingredient
  const { error: imErr } = await admin
    .from('inventory_movements')
    .delete()
    .eq('ingredient_id', id)
  if (imErr) return NextResponse.json({ error: `inventory_movements: ${imErr.message}` }, { status: 500 })

  // 3. Delete the ingredient itself
  const { error } = await admin
    .from('ingredients')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
