import { NextResponse } from 'next/server'
import { getLoyverseItems } from '@/lib/loyverse'

export async function GET() {
  try {
    const items = await getLoyverseItems()
    return NextResponse.json({ items })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
