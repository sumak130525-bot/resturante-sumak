import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const LOGO_KEY = 'ticket_logo'
const MAX_FILE_SIZE = 500 * 1024 // 500 KB

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

// POST: convert file to base64 data URI and save directly in settings table
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  // Validate type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 })
  }

  // Validate size (500 KB limit before base64 encoding)
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'El archivo supera el límite de 500 KB' }, { status: 400 })
  }

  // Convert to base64 data URI
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const dataUri = `data:${file.type};base64,${base64}`

  // Use service role to bypass RLS on settings table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  const { error: settingsError } = await admin
    .from('settings')
    .upsert({ key: LOGO_KEY, value: dataUri, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 })
  }

  return NextResponse.json({ url: dataUri })
}

// DELETE: remove logo from settings table
export async function DELETE() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getClient(true) as any

  await admin.from('settings').delete().eq('key', LOGO_KEY)

  return NextResponse.json({ success: true })
}
