import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('bonus_configs')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const { name, daily_amount } = await request.json()
  if (!name || !daily_amount) return NextResponse.json({ error: 'name y daily_amount requeridos' }, { status: 400 })

  const { data, error } = await supabase
    .from('bonus_configs')
    .insert({ name, daily_amount: Number(daily_amount), active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const { id, name, daily_amount, active } = await request.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {}
  if (name !== undefined) updates.name = name
  if (daily_amount !== undefined) updates.daily_amount = Number(daily_amount)
  if (active !== undefined) updates.active = active

  const { data, error } = await supabase
    .from('bonus_configs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase.from('bonus_configs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
