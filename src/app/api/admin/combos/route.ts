import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET: return all combos (active only for public use)
export async function GET() {
  try {
    const supabase = getAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('combos')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: create a new combo
// Body: { name: string, price: number, slots: ComboSlot[], positions: number[], image_urls?: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, price, slots, positions, image_urls } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (typeof price !== 'number' || price < 0) {
      return NextResponse.json({ error: 'El precio debe ser un número positivo' }, { status: 400 })
    }
    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos un slot' }, { status: 400 })
    }
    if (!Array.isArray(positions)) {
      return NextResponse.json({ error: 'Las posiciones son obligatorias' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('combos')
      .insert({
        name: name.trim(),
        price,
        slots,
        positions,
        image_urls: image_urls ?? [],
        active: true,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT: update a combo
// Body: { id: string, name?: string, price?: number, slots?: ComboSlot[], positions?: number[], image_urls?: string[], active?: boolean }
export async function PUT(request: NextRequest) {
  try {
    const { id, name, price, slots, positions, image_urls, active } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Se requiere id' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = String(name).trim()
    if (price !== undefined) updates.price = Number(price)
    if (slots !== undefined) updates.slots = slots
    if (positions !== undefined) updates.positions = positions
    if (image_urls !== undefined) updates.image_urls = image_urls
    if (active !== undefined) updates.active = Boolean(active)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('combos')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE: delete a combo
// Body: { id: string }
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Se requiere id' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('combos')
      .delete()
      .eq('id', id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
