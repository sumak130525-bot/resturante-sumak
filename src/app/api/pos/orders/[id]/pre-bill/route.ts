import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/pos/orders/[id]/pre-bill
// Retorna datos para imprimir ticket pre-cuenta con propinas sugeridas
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getAdminClient()

    // Obtener orden con items
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id,
        table_number,
        total,
        notes,
        created_at,
        dining_option,
        persons,
        is_open,
        order_items(
          id,
          quantity,
          unit_price,
          line_note,
          person_number,
          is_bonus,
          menu_items(name, subcategory)
        )
      `)
      .eq('id', id)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 })
    }

    // Obtener configuración de propina desde settings
    const { data: tipSettings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['tip_suggestion_enabled', 'tip_suggestion_percentages'])

    const tipMap: Record<string, string> = {}
    for (const s of tipSettings ?? []) {
      tipMap[s.key] = s.value
    }

    const tipEnabled = tipMap['tip_suggestion_enabled'] === 'true'
    const tipPercentages = tipEnabled
      ? (tipMap['tip_suggestion_percentages'] ?? '10,15,20')
          .split(',')
          .map((p: string) => parseInt(p.trim(), 10))
          .filter((p: number) => !isNaN(p) && p > 0)
      : []

    // Actualizar pre_bill_printed_at
    await supabase
      .from('orders')
      .update({ pre_bill_printed_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({
      order,
      items: order.order_items,
      tip_enabled: tipEnabled,
      tip_percentages: tipPercentages,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[pos/orders/pre-bill]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
