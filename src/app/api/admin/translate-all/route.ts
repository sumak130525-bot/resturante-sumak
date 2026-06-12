import { NextResponse } from 'next/server'
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function translateItem(
  groq: Groq,
  name: string,
  description: string | null
): Promise<{ name_en: string; name_qu: string; description_en: string; description_qu: string }> {
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
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON en respuesta: ${raw.slice(0, 100)}`)
  return JSON.parse(jsonMatch[0])
}

// POST: traducir todos los platos que no tienen traduccion (name_en IS NULL)
export async function POST() {
  const supabase = await getUntypedClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await getUntypedClient(true) as any

  // Obtener todos los platos sin traduccion
  const { data: items, error: fetchError } = await admin
    .from('menu_items')
    .select('id, name, description, description_es')
    .is('name_en', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ translated: 0, errors: 0, message: 'Todos los platos ya tienen traduccion' })
  }

  const groq = new Groq({ apiKey: process.env.AI_API_KEY })

  let translated = 0
  let errors = 0
  const details: { id: string; name: string; status: string; error?: string }[] = []

  // Limitar a 15 platos por llamada para no exceder timeout de Vercel (60s)
  const batch = items.slice(0, 15)

  for (const item of batch) {
    try {
      const description = item.description_es ?? item.description ?? null
      const translations = await translateItem(groq, item.name, description)

      const { error: updateError } = await admin
        .from('menu_items')
        .update({
          name_en: translations.name_en || null,
          name_qu: translations.name_qu || null,
          description_en: translations.description_en || null,
          description_qu: translations.description_qu || null,
        })
        .eq('id', item.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      translated++
      details.push({ id: item.id, name: item.name, status: 'ok' })
    } catch (err) {
      errors++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[translate-all] Error en plato "${item.name}":`, message)
      details.push({ id: item.id, name: item.name, status: 'error', error: message })
    }

    // Pausa entre requests para no superar 6000 TPM de Groq free
    await sleep(3000)
  }

  const remaining = items.length - batch.length
  return NextResponse.json({ translated, errors, total: items.length, remaining, details })
}
