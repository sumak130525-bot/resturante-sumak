import { NextResponse } from 'next/server'
import { getLoyverseItems, findVariantByName } from '@/lib/loyverse'

// GET /api/loyverse/debug?name=Silpancho
// Prueba el matching de nombre contra todos los items de Loyverse
// y verifica que las env vars estén configuradas
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const testName = searchParams.get('name') ?? 'Silpancho'

  const token = process.env.LOYVERSE_ACCESS_TOKEN
  const storeId = process.env.LOYVERSE_STORE_ID

  const envStatus = {
    LOYVERSE_ACCESS_TOKEN: token ? `SET (${token.slice(0, 6)}...)` : 'MISSING',
    LOYVERSE_STORE_ID: storeId ?? 'MISSING (usando fallback)',
  }

  if (!token) {
    return NextResponse.json({ envStatus, error: 'LOYVERSE_ACCESS_TOKEN no configurado' }, { status: 500 })
  }

  try {
    const items = await getLoyverseItems()
    const match = findVariantByName(items, testName)

    // Mostrar los primeros 20 nombres para diagnóstico
    const sampleNames = items.slice(0, 20).map(i => i.item_name)

    return NextResponse.json({
      envStatus,
      loyverse_items_count: items.length,
      test_name: testName,
      match: match
        ? { item_name: match.item.item_name, variant_id: match.variant.variant_id }
        : null,
      sample_item_names: sampleNames,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ envStatus, error: message }, { status: 500 })
  }
}
