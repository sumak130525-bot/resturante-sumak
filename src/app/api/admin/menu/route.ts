import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cliente de Supabase sin tipos genéricos para las routes de API (evita conflictos con PostgrestVersion 12)
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

// GET: listar todos los items del menú (admin)
export async function GET() {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('menu_items')
    .select('*, categories(*)')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: crear nuevo plato
export async function POST(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { data, error } = await admin
    .from('menu_items')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-vincula el nuevo producto al inventario: crea un ingrediente, su registro de stock
  // y un recipe_item que conecta el menu_item con el ingrediente (quantity=1 unidad).
  try {
    const { data: ingredient, error: ingError } = await admin
      .from('ingredients')
      .insert({ name: data.name, unit: 'unidad' })
      .select()
      .single()

    if (ingError) {
      console.error('[menu POST] Error al crear ingrediente automático:', ingError.message)
    } else {
      const { error: invError } = await admin
        .from('inventory')
        .insert({ ingredient_id: ingredient.id, current_stock: 0, min_stock: 0, last_purchase_price: 0 })

      if (invError) {
        console.error('[menu POST] Error al crear registro de inventario automático:', invError.message)
      }

      const { error: recipeError } = await admin
        .from('recipe_items')
        .insert({ menu_item_id: data.id, ingredient_id: ingredient.id, quantity_needed: 1 })

      if (recipeError) {
        console.error('[menu POST] Error al crear recipe_item automático:', recipeError.message)
      }
    }
  } catch (autoLinkError) {
    console.error('[menu POST] Error inesperado en auto-vinculación de inventario:', autoLinkError)
  }

  return NextResponse.json(data, { status: 201 })
}

// PUT: actualizar plato
export async function PUT(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { id, ...updates } = body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { data, error } = await admin
    .from('menu_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si el nombre cambió, sincronizar el ingrediente vinculado en inventario
  if (updates.name) {
    try {
      const { data: recipeItem, error: riError } = await admin
        .from('recipe_items')
        .select('ingredient_id')
        .eq('menu_item_id', id)
        .single()

      if (riError) {
        console.error('[menu PUT] Error al buscar recipe_item para sincronizar nombre:', riError.message)
      } else if (recipeItem?.ingredient_id) {
        const { error: ingUpdateError } = await admin
          .from('ingredients')
          .update({ name: updates.name })
          .eq('id', recipeItem.ingredient_id)

        if (ingUpdateError) {
          console.error('[menu PUT] Error al sincronizar nombre del ingrediente:', ingUpdateError.message)
        }
      }
    } catch (syncError) {
      console.error('[menu PUT] Error inesperado al sincronizar nombre del ingrediente:', syncError)
    }
  }

  return NextResponse.json(data)
}

// DELETE: eliminar o desactivar plato
export async function DELETE(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await request.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  const { error } = await admin
    .from('menu_items')
    .update({ active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
