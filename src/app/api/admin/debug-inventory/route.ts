import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/admin/debug-inventory
 * Diagnostic endpoint (TEMPORARY) — no auth guard.
 * Returns:
 *  1. All recipe_items with menu_item name and ingredient name
 *  2. All inventory rows with ingredient name and stock
 *  3. Last 10 inventory_movements
 */
export async function GET() {
  const supabase = getAdminClient()

  // 1. All recipe_items + join names
  const { data: recipeItems, error: riErr } = await supabase
    .from('recipe_items')
    .select(`
      id,
      menu_item_id,
      ingredient_id,
      quantity,
      menu_items ( id, name ),
      ingredients ( id, name, unit )
    `)
    .order('menu_item_id')

  // 2. All inventory rows + ingredient name
  const { data: inventoryRows, error: invErr } = await supabase
    .from('inventory')
    .select(`
      id,
      ingredient_id,
      stock,
      min_stock,
      updated_at,
      ingredients ( id, name, unit )
    `)
    .order('updated_at', { ascending: false })

  // 3. Last 10 inventory_movements + ingredient name
  const { data: movements, error: movErr } = await supabase
    .from('inventory_movements')
    .select(`
      id,
      ingredient_id,
      type,
      quantity,
      notes,
      created_at,
      ingredients ( id, name )
    `)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    recipe_items: {
      count: recipeItems?.length ?? 0,
      error: riErr?.message ?? null,
      data: recipeItems ?? [],
    },
    inventory: {
      count: inventoryRows?.length ?? 0,
      error: invErr?.message ?? null,
      data: inventoryRows ?? [],
    },
    inventory_movements_last10: {
      count: movements?.length ?? 0,
      error: movErr?.message ?? null,
      data: movements ?? [],
    },
    diagnosis: {
      recipe_items_with_missing_inventory: (recipeItems ?? [])
        .filter(ri => {
          const ingredientId = ri.ingredient_id
          return !(inventoryRows ?? []).some(inv => inv.ingredient_id === ingredientId)
        })
        .map(ri => ({
          recipe_item_id: ri.id,
          menu_item_id: ri.menu_item_id,
          menu_item_name: (ri.menu_items as { name?: string } | null)?.name ?? '(not found)',
          ingredient_id: ri.ingredient_id,
          ingredient_name: (ri.ingredients as { name?: string } | null)?.name ?? '(not found)',
          problem: 'ingredient_id has NO inventory row — stock cannot be decremented',
        })),
      recipe_items_with_zero_stock: (recipeItems ?? [])
        .filter(ri => {
          const ingredientId = ri.ingredient_id
          const inv = (inventoryRows ?? []).find(inv => inv.ingredient_id === ingredientId)
          return inv && Number(inv.stock) === 0
        })
        .map(ri => {
          const inv = (inventoryRows ?? []).find(inv => inv.ingredient_id === ri.ingredient_id)
          return {
            recipe_item_id: ri.id,
            menu_item_id: ri.menu_item_id,
            menu_item_name: (ri.menu_items as { name?: string } | null)?.name ?? '(not found)',
            ingredient_id: ri.ingredient_id,
            ingredient_name: (ri.ingredients as { name?: string } | null)?.name ?? '(not found)',
            current_stock: inv?.stock ?? 0,
            problem: 'stock is 0 — Math.max(0, 0 - consumed) = 0, no visible change',
          }
        }),
    },
  })
}
