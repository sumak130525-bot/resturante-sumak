import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Groq from 'groq-sdk'

async function getUntypedClient(useServiceRole = false) {
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

// POST: traducir un plato al ingles y quechua boliviano via Groq
export async function POST(request: NextRequest) {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id, name, description } = await request.json()

  if (!name) {
    return NextResponse.json({ error: 'name es requerido' }, { status: 400 })
  }

  const groq = new Groq({ apiKey: process.env.AI_API_KEY })

  const prompt = `Eres un experto en gastronomía latinoamericana y lenguas indígenas andinas.
Traduce el siguiente plato de restaurante al inglés americano y al quechua boliviano (variante sureña, como se habla en Cochabamba y Potosí — NO quechua peruano).
Devuelve SOLO un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.

Nombre del plato: ${name}
Descripción: ${description || ''}

Formato de respuesta requerido:
{
  "name_en": "traducción al inglés",
  "name_qu": "traducción al quechua boliviano",
  "description_en": "descripción en inglés (vacío si no hay descripción)",
  "description_qu": "descripción en quechua boliviano (vacío si no hay descripción)"
}`

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 512,
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ''

  let translations: { name_en: string; name_qu: string; description_en: string; description_qu: string }
  try {
    // Extraer JSON aunque haya texto alrededor
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON encontrado en la respuesta')
    translations = JSON.parse(jsonMatch[0])
  } catch (parseError) {
    console.error('[translate] Error parseando respuesta de Groq:', raw, parseError)
    return NextResponse.json({ error: 'Error al parsear respuesta de IA', raw }, { status: 500 })
  }

  // Persistir traducciones en Supabase si se provee id
  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = await getUntypedClient(true) as any
    const { error: updateError } = await admin
      .from('menu_items')
      .update({
        name_en: translations.name_en || null,
        name_qu: translations.name_qu || null,
        description_en: translations.description_en || null,
        description_qu: translations.description_qu || null,
      })
      .eq('id', id)

    if (updateError) {
      console.error('[translate] Error al guardar traducciones en Supabase:', updateError.message)
      // No fallar: devolver traducciones aunque no se hayan guardado
    }
  }

  return NextResponse.json(translations)
}
