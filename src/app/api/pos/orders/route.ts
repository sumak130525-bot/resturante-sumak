import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type PosOrderItem = {
  name: string
  quantity: number
  price: number
  menu_item_id: string
  line_note?: string | null
  person_number?: number | null
  is_bonus?: boolean
  bonus_reason?: string | null
  original_price?: number | null
  // ── Combos ──────────────────────────────────────────
  is_combo_header?: boolean
  combo_id?: string | null
  combo_slot_label?: string | null
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      items,
      total,
      dining_option,
      table_number,
      payment_method,
      cash_amount,
      transfer_amount,
      customer_name,
      notes: customNotes,
      persons,
      is_open,
      employee_id,
      employee_name,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un item en el pedido.' },
        { status: 400 }
      )
    }

    const supabase = getAdminClient()

    // Usar nota personalizada del usuario tal cual viene del POS
    const orderNotes = customNotes && String(customNotes).trim() ? String(customNotes).trim() : null

    // ── Get current open shift (for linking order + cash movement) ───────────
    let shiftId: string | null = null
    try {
      const { data: openShift } = await supabase
        .from('shifts')
        .select('id')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .single()

      if (openShift) {
        shiftId = openShift.id
      }
    } catch { /* non-fatal */ }

    // Crear el pedido en la tabla orders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderInsert: Record<string, any> = {
      customer_name: customer_name || 'POS',
      customer_phone: null,
      notes: orderNotes,
      total: total ?? 0,
      status: 'pending',
      channel: 'pos',
      dining_option: dining_option || null,
      payment_method: is_open ? null : (payment_method || null),
      cash_amount: is_open ? null : (cash_amount ?? null),
      transfer_amount: is_open ? null : (transfer_amount ?? null),
      persons: persons && Number(persons) > 1 ? Number(persons) : 1,
      table_number: table_number ?? null,
      shift_id: shiftId,
    }
    // Only include open table columns if migration has run
    if (is_open) {
      orderInsert.is_open = true
    }
    if (employee_name) {
      orderInsert.employee_name = employee_name
    }
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderInsert)
      .select()
      .single()

    if (orderError) throw new Error(`Order insert: ${orderError.message}`)
    if (!order) throw new Error('No se pudo crear el pedido')

    // Crear order_items con line_note para modificadores y person_number para pedidos multi-persona
    // Sub-items de combo (combo_slot_label != null) NO se insertan — solo el header con line_note
    const itemsForDb = (items as PosOrderItem[]).filter((item) => !item.combo_slot_label)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderItems = itemsForDb.map((item): Record<string, any> => {
      let lineNote = item.line_note || null

      // For combo headers: build line_note from sub-items
      if (item.is_combo_header && item.combo_id) {
        const subItems = (items as PosOrderItem[]).filter(
          (si) => si.combo_slot_label && si.combo_id === item.combo_id
        )
        if (subItems.length > 0) {
          const subNames = subItems.map((si) => si.name).join(' + ')
          lineNote = subNames
        }
      }

      const base: Record<string, any> = {
        order_id: order.id,
        menu_item_id: item.is_combo_header ? null : item.menu_item_id,
        name: item.name ?? null,
        quantity: item.quantity,
        unit_price: item.is_bonus ? 0 : Math.round(item.price),
        line_note: lineNote,
        person_number: item.person_number ?? null,
        is_bonus: item.is_bonus ?? false,
        bonus_reason: item.bonus_reason ?? null,
        original_price: item.original_price ?? null,
      }
      return base
    })

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      // If columns don't exist yet, retry without optional columns
      if (itemsError.message.includes('line_note') || itemsError.message.includes('person_number') || itemsError.message.includes('is_bonus') || itemsError.message.includes('bonus_reason') || itemsError.message.includes('original_price') || itemsError.message.includes('column')) {
        const fallbackItems = orderItems.map(({ line_note, person_number, is_bonus, bonus_reason, original_price, name: _name, ...rest }) => rest)
        const { error: fallbackError } = await supabase
          .from('order_items')
          .insert(fallbackItems)
        if (fallbackError) throw new Error(`Items insert: ${fallbackError.message}`)
      } else {
        throw new Error(`Items insert: ${itemsError.message}`)
      }
    }

    // ── Decrement available_qty for limited-stock items ───────────────────────
    try {
      for (const item of itemsForDb) {
        // Skip combo headers (menu_item_id is the combo id, not a real menu_items row)
        if (item.is_combo_header) continue
        // Read current qty, then update atomically
        const { data: stockData } = await supabase
          .from('menu_items')
          .select('available_qty')
          .eq('id', item.menu_item_id)
          .single()

        if (stockData?.available_qty !== null && stockData?.available_qty !== undefined && stockData.available_qty > 0) {
          await supabase
            .from('menu_items')
            .update({ available_qty: Math.max(0, stockData.available_qty - item.quantity) })
            .eq('id', item.menu_item_id)
        }
      }
    } catch (stockErr) {
      // Non-fatal: don't fail the order if stock decrement fails
      console.error('[POS orders] stock decrement error:', stockErr)
    }

    // ── Auto-record cash movement for the sale ────────────────────────────────
    try {
      const movementType =
        (payment_method === 'cash') ? 'venta_efectivo'
        : (payment_method === 'mixed') ? 'venta_efectivo'
        : 'venta_transferencia'

      if (shiftId) {
        await supabase.from('cash_movements').insert({
          type: movementType,
          amount: total ?? 0,
          description: `Pedido POS #${order.id.slice(-6)}`,
          shift_id: shiftId,
        })
      }
    } catch (cashErr) {
      // Non-fatal: don't fail the order if cash movement fails
      void cashErr
    }

    // ── Auto-consume ingredients from inventory ───────────────────────────────
    try {
      for (const item of itemsForDb) {
        // Skip combo headers (menu_item_id is the combo id, not a real menu_items row)
        if (item.is_combo_header) continue
        // Get recipe items for this menu item
        const { data: recipeItems, error: recipeErr } = await supabase
          .from('recipe_items')
          .select('ingredient_id, quantity')
          .eq('menu_item_id', item.menu_item_id)

        if (recipeErr) {
          console.error('[POS orders] recipe_items fetch error:', recipeErr.message)
          continue
        }
        if (!recipeItems || recipeItems.length === 0) continue

        for (const ri of recipeItems) {
          const consumed = ri.quantity * item.quantity

          // Get current inventory row
          const { data: invRow, error: invFetchErr } = await supabase
            .from('inventory')
            .select('id, stock')
            .eq('ingredient_id', ri.ingredient_id)
            .single()

          if (invFetchErr) {
            console.error('[POS orders] inventory fetch error:', invFetchErr.message, 'ingredient_id:', ri.ingredient_id)
          }

          if (invRow) {
            const newStock = Math.max(0, Number(invRow.stock) - consumed)
            const { error: invUpdateErr } = await supabase
              .from('inventory')
              .update({ stock: newStock, updated_at: new Date().toISOString() })
              .eq('ingredient_id', ri.ingredient_id)
            if (invUpdateErr) {
              console.error('[POS orders] inventory update error:', invUpdateErr.message, 'ingredient_id:', ri.ingredient_id)
            }
          }

          // Always register consumption movement
          const { error: movErr } = await supabase
            .from('inventory_movements')
            .insert({
              ingredient_id: ri.ingredient_id,
              type: 'consumption',
              quantity: consumed,
              notes: `Pedido POS #${order.id.slice(-6)} - ${item.name}`,
            })
          if (movErr) {
            console.error('[POS orders] inventory_movements insert error:', movErr.message, 'ingredient_id:', ri.ingredient_id)
          }
        }
      }
    } catch (invErr) {
      // Non-fatal: don't fail the order if inventory discount fails
      console.error('[POS orders] inventory auto-consume error:', invErr)
    }

    return NextResponse.json({ success: true, order_id: order.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[POS orders]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
