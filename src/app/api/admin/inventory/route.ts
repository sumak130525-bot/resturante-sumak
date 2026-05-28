import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/*
  SQL para ejecutar en Supabase (una sola vez):

  CREATE TABLE IF NOT EXISTS inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
    stock numeric NOT NULL DEFAULT 0,
    min_stock numeric DEFAULT 5,
    last_purchase_date timestamptz,
    last_purchase_qty numeric,
    last_purchase_price numeric,
    updated_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('purchase','consumption','adjustment')),
    quantity numeric NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now()
  );

  -- Agregar columna total_cost (ejecutar una sola vez si la tabla ya existe):
  ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0;
*/

async function getClient(useServiceRole = false) {
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

// GET: lista de ingredientes con stock, min_stock, alerta y último movimiento
export async function GET() {
  const supabase = await getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Traer todos los ingredientes (con categoría y primer menu_item vinculado)
  const { data: ingredients, error: ingError } = await db
    .from('ingredients')
    .select('id, name, unit, category_id, ingredient_categories(id, name), recipe_items(menu_item_id)')
    .order('name')

  if (ingError) return NextResponse.json({ error: ingError.message }, { status: 500 })

  // Traer inventory rows
  const { data: inventoryRows } = await db
    .from('inventory')
    .select('*')

  // Traer último movimiento por ingrediente
  const { data: lastMovements } = await db
    .from('inventory_movements')
    .select('ingredient_id, type, quantity, created_at')
    .order('created_at', { ascending: false })

  // Traer min_stock por categoría desde settings
  const { data: categoryMinStockSettings } = await db
    .from('settings')
    .select('key, value')
    .like('key', 'min_stock_category_%')

  const categoryMinStockMap = new Map<string, number>()
  for (const row of (categoryMinStockSettings ?? [])) {
    const categoryId = (row.key as string).replace('min_stock_category_', '')
    const val = parseFloat(row.value)
    if (!isNaN(val)) categoryMinStockMap.set(categoryId, val)
  }

  const inventoryMap = new Map<string, Record<string, unknown>>()
  for (const row of (inventoryRows ?? [])) {
    inventoryMap.set(row.ingredient_id, row)
  }

  const lastMovementMap = new Map<string, Record<string, unknown>>()
  for (const mov of (lastMovements ?? [])) {
    if (!lastMovementMap.has(mov.ingredient_id)) {
      lastMovementMap.set(mov.ingredient_id, mov)
    }
  }

  const result = (ingredients ?? []).map((ing: { id: string; name: string; unit: string; category_id?: string; ingredient_categories?: { id: string; name: string }; recipe_items?: { menu_item_id: string }[] }) => {
    const inv = inventoryMap.get(ing.id)
    const stock = inv ? Number(inv.stock) : 0
    const ingredientMinStock = inv ? Number(inv.min_stock) : 5
    // Si la categoría tiene un min_stock configurado, usar ese; si no, el del ingrediente
    const categoryMin = ing.category_id ? categoryMinStockMap.get(ing.category_id) : undefined
    const min_stock = categoryMin !== undefined ? categoryMin : ingredientMinStock
    const lastMov = lastMovementMap.get(ing.id) ?? null
    const linked_menu_item_id = ing.recipe_items && ing.recipe_items.length > 0
      ? ing.recipe_items[0].menu_item_id
      : null

    let status: 'ok' | 'low' | 'critical' = 'ok'
    if (stock === 0) status = 'critical'
    else if (stock < min_stock) status = 'low'

    return {
      ingredient_id: ing.id,
      name: ing.name,
      unit: ing.unit,
      category_id: ing.category_id ?? null,
      category: ing.ingredient_categories?.name ?? null,
      ingredient_categories: ing.ingredient_categories ?? null,
      linked_menu_item_id,
      stock,
      min_stock,
      status,
      alert: stock < min_stock,
      last_purchase_date: inv?.last_purchase_date ?? null,
      last_purchase_qty: inv?.last_purchase_qty ?? null,
      last_purchase_price: inv?.last_purchase_price ?? null,
      updated_at: inv?.updated_at ?? null,
      last_movement: lastMov,
      inventory_id: inv?.id ?? null,
    }
  })

  return NextResponse.json(result)
}

// POST: registrar compra o ajuste
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { ingredient_id, type, quantity, notes, price, date } = body

  if (!ingredient_id || !type || quantity === undefined) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  if (!['purchase', 'adjustment'].includes(type)) {
    return NextResponse.json({ error: 'Tipo debe ser purchase o adjustment' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  // Obtener inventory actual o crear si no existe
  const { data: existing } = await admin
    .from('inventory')
    .select('*')
    .eq('ingredient_id', ingredient_id)
    .single()

  const currentStock = existing ? Number(existing.stock) : 0
  let newStock: number

  if (type === 'purchase') {
    newStock = currentStock + Number(quantity)
  } else {
    // adjustment: quantity puede ser negativo (reducir) o positivo (agregar)
    newStock = Number(quantity)
  }

  const updatePayload: Record<string, unknown> = {
    stock: newStock,
    updated_at: new Date().toISOString(),
  }

  if (type === 'purchase') {
    updatePayload.last_purchase_date = date ?? new Date().toISOString()
    updatePayload.last_purchase_qty = Number(quantity)
    if (price !== undefined) updatePayload.last_purchase_price = Number(price)
  }

  if (existing) {
    await admin
      .from('inventory')
      .update(updatePayload)
      .eq('ingredient_id', ingredient_id)
  } else {
    await admin
      .from('inventory')
      .insert({ ingredient_id, ...updatePayload, min_stock: 5 })
  }

  // Registrar movimiento
  // total_cost = precio total de la factura/compra (no quantity * precio unitario)
  await admin
    .from('inventory_movements')
    .insert({
      ingredient_id,
      type,
      quantity: Number(quantity),
      notes: notes ?? null,
      total_cost: type === 'purchase' ? (Number(price) || 0) : 0,
    })

  return NextResponse.json({ success: true, stock: newStock }, { status: 201 })
}

// PATCH: actualizar min_stock O editar un movimiento de stock
export async function PATCH(request: NextRequest) {
  const supabase = await getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()

  // --- Editar movimiento ---
  if (body.movement_id !== undefined) {
    const { movement_id, quantity, total_cost } = body

    if (!movement_id || quantity === undefined) {
      return NextResponse.json({ error: 'Faltan campos: movement_id y quantity son requeridos' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = await getClient(true) as any

    // Obtener el movimiento para saber el ingredient_id
    const { data: mov, error: movError } = await admin
      .from('inventory_movements')
      .select('ingredient_id')
      .eq('id', movement_id)
      .single()

    if (movError || !mov) {
      return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
    }

    // Actualizar el movimiento
    const { error: updateError } = await admin
      .from('inventory_movements')
      .update({
        quantity: Number(quantity),
        total_cost: total_cost !== undefined ? Number(total_cost) : 0,
      })
      .eq('id', movement_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Recalcular current_stock sumando todos los movimientos del ingrediente
    const { data: allMovements, error: allError } = await admin
      .from('inventory_movements')
      .select('type, quantity')
      .eq('ingredient_id', mov.ingredient_id)

    if (allError) {
      return NextResponse.json({ error: allError.message }, { status: 500 })
    }

    let newStock = 0
    for (const m of (allMovements ?? [])) {
      if (m.type === 'purchase') newStock += Number(m.quantity)
      else if (m.type === 'consumption') newStock -= Number(m.quantity)
      else if (m.type === 'adjustment') newStock = Number(m.quantity) // el último ajuste pisa el stock
    }

    // Para adjustments, recalcular correctamente respetando el orden cronológico
    // (la lógica simple anterior no garantiza orden; hacemos una segunda pasada ordenada)
    const { data: orderedMovements } = await admin
      .from('inventory_movements')
      .select('type, quantity')
      .eq('ingredient_id', mov.ingredient_id)
      .order('created_at', { ascending: true })

    let recalcStock = 0
    for (const m of (orderedMovements ?? [])) {
      if (m.type === 'purchase') recalcStock += Number(m.quantity)
      else if (m.type === 'consumption') recalcStock -= Number(m.quantity)
      else if (m.type === 'adjustment') recalcStock = Number(m.quantity)
    }

    // Actualizar price_per_unit en ingredients si hay total_cost y quantity
    if (total_cost && Number(quantity) > 0) {
      const newPricePerUnit = Number(total_cost) / Number(quantity)
      await admin
        .from('ingredients')
        .update({ price_per_unit: newPricePerUnit })
        .eq('id', mov.ingredient_id)
    }

    // Actualizar inventory con el stock recalculado
    const { data: invRow } = await admin
      .from('inventory')
      .select('id')
      .eq('ingredient_id', mov.ingredient_id)
      .single()

    if (invRow) {
      await admin
        .from('inventory')
        .update({ stock: recalcStock, updated_at: new Date().toISOString() })
        .eq('ingredient_id', mov.ingredient_id)
    } else {
      await admin
        .from('inventory')
        .insert({ ingredient_id: mov.ingredient_id, stock: recalcStock, min_stock: 5 })
    }

    return NextResponse.json({ success: true, new_stock: recalcStock })
  }

  // --- Actualizar min_stock ---
  const { ingredient_id, min_stock } = body

  if (!ingredient_id || min_stock === undefined) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  const { data: existing } = await admin
    .from('inventory')
    .select('id')
    .eq('ingredient_id', ingredient_id)
    .single()

  if (existing) {
    await admin
      .from('inventory')
      .update({ min_stock: Number(min_stock), updated_at: new Date().toISOString() })
      .eq('ingredient_id', ingredient_id)
  } else {
    await admin
      .from('inventory')
      .insert({ ingredient_id, stock: 0, min_stock: Number(min_stock) })
  }

  return NextResponse.json({ success: true })
}
