import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: list scanned invoices (optionally filter by status)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // 'unlinked' | 'linked' | null (all)

  let query = supabase
    .from('scanned_invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: save a scanned invoice
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { supplier, invoice_date, total, items, image_url, notes } = body

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: 'items requerido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scanned_invoices')
    .insert({
      supplier: supplier || null,
      invoice_date: invoice_date || null,
      total: total || null,
      items,
      image_url: image_url || null,
      notes: notes || null,
      status: 'unlinked',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
