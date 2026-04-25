import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST: update dish image (no auth required — called from menu-display TV screen)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const id = formData.get('id') as string | null
    const image = formData.get('image') as File | null

    if (!id || !image) {
      return NextResponse.json({ error: 'Missing id or image' }, { status: 400 })
    }

    const ext = image.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const timestamp = Date.now()
    const path = `menu-display/${id}_${timestamp}.${ext}`

    const supabase = getServiceClient()

    const arrayBuffer = await image.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('menu-images')
      .upload(path, buffer, {
        contentType: image.type || 'image/jpeg',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const image_url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('menu_items')
      .update({ image_url })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, image_url })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
