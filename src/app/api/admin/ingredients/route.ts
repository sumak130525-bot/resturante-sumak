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
 * If menu_item_id is provided, upsert a recipe_item linking ingredient → menu_item.
 * Returns true if a link was created/already existed, false otherwise.
 */
async function linkIngredientToMenuItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ingredientId: string,
  menuItemId: string
): Promise<boolean> {
  try {
    const { data: existing } = await admin
      .from('recipe_items')
      .select('id')
      .eq('menu_item_id', menuItemId)
      .eq('ingredient_id', ingredientId)
      .maybeSingle()

    if (!existing) {
      const { error: riErr } = await admin
        .from('recipe_items')
        .insert({ menu_item_id: menuItemId, ingredient_id: ingredientId, quantity: 1 })

      if (riErr) {
        console.error('[ingredients] Error inserting recipe_item:', riErr.message)
        return false
      }
    }

    return true
  } catch (e) {
    console.error('[ingredients] linkIngredientToMenuItem unexpected error:', e)
    return false
  }
}

// GET: list all ingredients with their category and linked menu_item_id (via recipe_items)
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = await getUntypedClient(true) as any

  const { data, error } = await db
    .from('ingredients')
    .select('*, ingredient_categories(id, name), recipe_items(menu_item_id)')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten: expose the first linked menu_item_id directly on the ingredient object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map((ing: any) => {
    const firstLink = Array.isArray(ing.recipe_items) && ing.recipe_items.length > 0
      ? ing.recipe_items[0].menu_item_id
      : null
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { recipe_items, ...rest } = ing
    return { ...rest, linked_menu_item_id: firstLink }
  })

  return NextResponse.json(normalized)
}

// POST: create ingredient (optionally link to menu_item if menu_item_id provided)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { menu_item_id, ...ingredientFields } = body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { data, error } = await admin
    .from('ingredients')
    .insert(ingredientFields)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let linked = false
  if (menu_item_id) {
    linked = await linkIngredientToMenuItem(admin, data.id, menu_item_id)
  }

  return NextResponse.json({ ...data, linked_menu_item_id: linked ? menu_item_id : null }, { status: 201 })
}

// PUT: update ingredient (optionally link to menu_item if menu_item_id provided)
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, menu_item_id, ...updates } = body
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

  let linked = false
  if (menu_item_id) {
    linked = await linkIngredientToMenuItem(admin, data.id as string, menu_item_id)
  }

  return NextResponse.json({ ...data, linked_menu_item_id: linked ? menu_item_id : null })
}

// DELETE: remove ingredient (cascades recipe_items, inventory_movements, inventory)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
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

  // 3. Delete inventory rows referencing this ingredient
  const { error: invErr } = await admin
    .from('inventory')
    .delete()
    .eq('ingredient_id', id)
  if (invErr) return NextResponse.json({ error: `inventory: ${invErr.message}` }, { status: 500 })

  // 4. Delete the ingredient itself
  const { error } = await admin
    .from('ingredients')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
