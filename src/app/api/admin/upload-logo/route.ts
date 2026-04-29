/*
 * ============================================================
 * PASO MANUAL REQUERIDO — Crear bucket en Supabase Storage:
 * ============================================================
 *
 * 1. Ir a Supabase Dashboard → Storage → New bucket
 * 2. Nombre: ticket-logos
 * 3. Marcar como "Public bucket" (para que la URL sea pública)
 * 4. Guardar
 *
 * O ejecutar este SQL:
 * INSERT INTO storage.buckets (id, name, public)
 * VALUES ('ticket-logos', 'ticket-logos', true)
 * ON CONFLICT (id) DO NOTHING;
 *
 * -- Política para que admins puedan subir/eliminar:
 * CREATE POLICY "admin upload" ON storage.objects
 *   FOR INSERT WITH CHECK (bucket_id = 'ticket-logos' AND auth.role() = 'authenticated');
 *
 * CREATE POLICY "admin delete" ON storage.objects
 *   FOR DELETE USING (bucket_id = 'ticket-logos' AND auth.role() = 'authenticated');
 *
 * CREATE POLICY "public read" ON storage.objects
 *   FOR SELECT USING (bucket_id = 'ticket-logos');
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'ticket-logos'
const LOGO_KEY = 'ticket_logo'

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

async function requireAuth() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await getClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// POST: subir logo a Storage y guardar URL en settings
export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  // Validar tipo
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'png'
  const fileName = `logo-${Date.now()}.${ext}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  // Eliminar logo anterior si existe
  const { data: existingSetting } = await admin
    .from('settings')
    .select('value')
    .eq('key', LOGO_KEY)
    .maybeSingle()

  if (existingSetting?.value) {
    // Extraer path del storage desde la URL pública
    const url = existingSetting.value as string
    const marker = `/object/public/${BUCKET}/`
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const oldPath = url.slice(idx + marker.length)
      await admin.storage.from(BUCKET).remove([oldPath])
    }
  }

  // Subir nuevo archivo
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(fileName, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Obtener URL pública
  const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(fileName)
  const publicUrl = publicUrlData.publicUrl as string

  // Guardar en settings
  const { error: settingsError } = await admin
    .from('settings')
    .upsert({ key: LOGO_KEY, value: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl })
}

// DELETE: eliminar logo
export async function DELETE() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  const { data: existingSetting } = await admin
    .from('settings')
    .select('value')
    .eq('key', LOGO_KEY)
    .maybeSingle()

  if (existingSetting?.value) {
    const url = existingSetting.value as string
    const marker = `/object/public/${BUCKET}/`
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const oldPath = url.slice(idx + marker.length)
      await admin.storage.from(BUCKET).remove([oldPath])
    }
  }

  await admin.from('settings').delete().eq('key', LOGO_KEY)

  return NextResponse.json({ success: true })
}
