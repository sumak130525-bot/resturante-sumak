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

  // Traer todos los ingredientes
  const { data: ingredients, error: ingError } = await db
    .from('ingredients')
    .select('id, name, unit')
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

  const result = (ingredients ?? []).map((ing: { id: string; name: string; unit: string }) => {
    const inv = inventoryMap.get(ing.id)
    const stock = inv ? Number(inv.stock) : 0
    const min_stock = inv ? Number(inv.min_stock) : 5
    const lastMov = lastMovementMap.get(ing.id) ?? null

    let status: 'ok' | 'low' | 'critical' = 'ok'
    if (stock === 0) status = 'critical'
    else if (stock < min_stock) status = 'low'

    return {
      ingredient_id: ing.id,
      name: ing.name,
      unit: ing.unit,
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
  const supabase = await getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
  await admin
    .from('inventory_movements')
    .insert({
      ingredient_id,
      type,
      quantity: Number(quantity),
      notes: notes ?? null,
    })

  return NextResponse.json({ success: true, stock: newStock }, { status: 201 })
}

// PATCH: actualizar min_stock
export async function PATCH(request: NextRequest) {
  const supabase = await getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
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
