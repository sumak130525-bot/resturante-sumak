import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

export async function POST(request: NextRequest) {
  const supabase = await getClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY no configurada' }, { status: 500 })

  let base64Image: string
  let mimeType: string = 'image/jpeg'

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await request.json()
    base64Image = body.image
    if (body.mimeType) mimeType = body.mimeType
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 })
    mimeType = file.type || 'image/jpeg'
    const arrayBuffer = await file.arrayBuffer()
    base64Image = Buffer.from(arrayBuffer).toString('base64')
  } else {
    return NextResponse.json({ error: 'Content-Type no soportado' }, { status: 400 })
  }

  if (!base64Image) return NextResponse.json({ error: 'Imagen vacía' }, { status: 400 })

  const prompt = `Analiza esta factura/ticket de compra. Extrae los datos en formato JSON exacto: {"supplier": string, "date": string, "items": [{"name": string, "quantity": number, "unit": string, "unit_price": number, "total": number}], "total": number}. Las unidades válidas son: kg, lt, unidad, g, ml, docena, caja, bolsa, paquete. Si no puedes leer algún campo pon null. Solo responde con el JSON, sin texto adicional, sin markdown, sin bloques de código.`

  const groqRes = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    }
  )

  if (!groqRes.ok) {
    const errText = await groqRes.text()
    console.error('Groq error:', groqRes.status, errText)
    return NextResponse.json({ error: `Error Groq (${groqRes.status}): ${errText.slice(0, 200)}` }, { status: 502 })
  }

  const groqData = await groqRes.json()

  // Check for empty model response before accessing content
  if (!groqData?.choices?.[0]?.message?.content) {
    return NextResponse.json({ error: 'Respuesta vacía del modelo' }, { status: 422 })
  }

  const rawText: string = groqData.choices[0].message.content

  // Always log rawText for debugging (first 500 chars)
  console.log('OCR rawText (first 500):', rawText.slice(0, 500))

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'El modelo no devolvió texto' }, { status: 422 })
  }

  // Strip markdown code fences if present
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  // Available Groq vision models (as of 2025):
  //   - meta-llama/llama-4-scout-17b-16e-instruct  (current, multimodal)
  //   - meta-llama/llama-4-maverick-17b-128e-instruct (larger, may be more reliable)
  // If this model is deprecated or unavailable, check https://console.groq.com/docs/models

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try extracting JSON substring between first { and last }
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
      } catch {
        console.error('JSON parse error (fallback). Raw text:', rawText)
        return NextResponse.json({ error: 'No se pudo parsear la respuesta del OCR', raw: rawText }, { status: 422 })
      }
    } else {
      console.error('JSON parse error. Raw text:', rawText)
      return NextResponse.json({ error: 'No se pudo parsear la respuesta del OCR', raw: rawText }, { status: 422 })
    }
  }

  return NextResponse.json(parsed)
}
