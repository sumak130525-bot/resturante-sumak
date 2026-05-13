import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Ensure table + bucket exist (idempotent, runs once per cold start) ─────────
let initialized = false

async function ensureInfrastructure(supabase: ReturnType<typeof getAdminClient>) {
  if (initialized) return
  initialized = true

  console.log('[audio route] ensureInfrastructure: creando tabla si no existe...')

  // Create audio_messages table if it doesn't exist
  await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS audio_messages (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        from_device text NOT NULL CHECK (from_device IN ('pos', 'cocina')),
        audio_url   text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        played      boolean NOT NULL DEFAULT false
      );
    `,
  }).then(
    () => console.log('[audio route] Tabla audio_messages OK'),
    (err) => console.warn('[audio route] rpc exec_sql warning:', err)
  )

  // Create storage bucket (if it doesn't exist) — errors are silently ignored
  const { error: bucketError } = await supabase.storage.createBucket('audio-messages', {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'],
  })

  if (bucketError && !bucketError.message.includes('already exists')) {
    console.warn('[audio route] bucket create warning:', bucketError.message)
  } else {
    console.log('[audio route] Bucket audio-messages OK')
  }
}

// ── DELETE old audio files (>24h) in background ───────────────────────────────
async function cleanupOldAudio(supabase: ReturnType<typeof getAdminClient>) {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: oldRows } = await supabase
      .from('audio_messages')
      .select('id, audio_url')
      .lt('created_at', cutoff)
      .limit(20)

    if (oldRows && oldRows.length > 0) {
      const paths = oldRows
        .map((r) => {
          try {
            const url = new URL(r.audio_url)
            // path after /storage/v1/object/public/audio-messages/
            const parts = url.pathname.split('/audio-messages/')
            return parts[1] ?? null
          } catch {
            return null
          }
        })
        .filter(Boolean) as string[]

      if (paths.length > 0) {
        await supabase.storage.from('audio-messages').remove(paths)
      }

      await supabase
        .from('audio_messages')
        .delete()
        .in('id', oldRows.map((r) => r.id))

      console.log('[audio route] Limpiados', oldRows.length, 'registros viejos')
    }
  } catch {
    // Non-fatal
  }
}

// ── POST /api/pos/audio ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const requestId = Date.now()
  console.log(`[audio route][${requestId}] POST /api/pos/audio recibido`)

  try {
    const supabase = getAdminClient()
    await ensureInfrastructure(supabase)

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    const fromDevice = formData.get('from_device') as string | null

    console.log(`[audio route][${requestId}] from_device: ${fromDevice}, audioFile: ${audioFile?.name ?? 'null'}, size: ${audioFile?.size ?? 0} bytes`)

    if (!audioFile) {
      console.error(`[audio route][${requestId}] ERROR: falta archivo de audio`)
      return NextResponse.json({ error: 'Se requiere el archivo de audio' }, { status: 400 })
    }

    if (fromDevice !== 'pos' && fromDevice !== 'cocina') {
      console.error(`[audio route][${requestId}] ERROR: from_device inválido: ${fromDevice}`)
      return NextResponse.json({ error: 'from_device debe ser "pos" o "cocina"' }, { status: 400 })
    }

    if (audioFile.size < 100) {
      console.error(`[audio route][${requestId}] ERROR: archivo demasiado pequeño (${audioFile.size} bytes)`)
      return NextResponse.json({ error: 'Archivo de audio demasiado pequeño' }, { status: 400 })
    }

    // Convert File to ArrayBuffer → Buffer
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log(`[audio route][${requestId}] Buffer preparado: ${buffer.length} bytes, mimeType: ${audioFile.type}`)

    // Determine extension from MIME
    const ext = audioFile.type.includes('ogg') ? 'ogg' : 'webm'
    const fileName = `${fromDevice}/${Date.now()}.${ext}`
    console.log(`[audio route][${requestId}] Subiendo a Storage: ${fileName}`)

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, buffer, {
        contentType: audioFile.type || 'audio/webm',
        upsert: false,
      })

    if (uploadError) {
      console.error(`[audio route][${requestId}] Upload ERROR:`, uploadError.message)
      return NextResponse.json({ error: `Upload falló: ${uploadError.message}` }, { status: 500 })
    }

    console.log(`[audio route][${requestId}] Upload OK → ${fileName}`)

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('audio-messages')
      .getPublicUrl(fileName)

    const audioUrl = urlData.publicUrl
    console.log(`[audio route][${requestId}] URL pública: ${audioUrl}`)

    // Insert row into audio_messages (Realtime will notify the other device)
    console.log(`[audio route][${requestId}] Insertando en audio_messages...`)
    const { data: inserted, error: insertError } = await supabase
      .from('audio_messages')
      .insert({
        from_device: fromDevice,
        audio_url: audioUrl,
        played: false,
      })
      .select()
      .single()

    if (insertError) {
      console.error(`[audio route][${requestId}] Insert ERROR:`, insertError.message)
      return NextResponse.json({ error: `DB insert falló: ${insertError.message}` }, { status: 500 })
    }

    console.log(`[audio route][${requestId}] Insert OK → id: ${inserted.id}`)

    // Run cleanup in background (don't await)
    cleanupOldAudio(supabase).catch(() => {})

    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error(`[audio route][${requestId}] EXCEPCIÓN:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
