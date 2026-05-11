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

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 })

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

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Image } },
            ],
          },
        ],
      }),
    }
  )

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('Gemini error:', geminiRes.status, errText)
    return NextResponse.json({ error: `Error Gemini (${geminiRes.status}): ${errText.slice(0, 200)}` }, { status: 502 })
  }

  const geminiData = await geminiRes.json()
  const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Strip markdown code fences if present
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('JSON parse error. Raw text:', rawText)
    return NextResponse.json({ error: 'No se pudo parsear la respuesta de Gemini', raw: rawText }, { status: 422 })
  }

  return NextResponse.json(parsed)
}
