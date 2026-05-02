import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoyverseModifierOption = {
  id: string
  name: string
  price: number
}

export type LoyverseModifier = {
  id: string
  name: string
  options: LoyverseModifierOption[]
}

// ─── Module-level cache (TTL 10 min) ─────────────────────────────────────────

let modifiersCache: { data: LoyverseModifier[]; expiry: number } | null = null

async function fetchModifiersFromLoyverse(): Promise<LoyverseModifier[]> {
  const token = process.env.LOYVERSE_ACCESS_TOKEN
  if (!token) return []

  const res = await fetch('https://api.loyverse.com/v1.0/modifiers?limit=250', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!res.ok) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = data.modifiers ?? []

  return raw.map((m) => ({
    id: m.id as string,
    name: m.name as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: (m.options ?? []).map((o: any) => ({
      id: o.id as string,
      name: o.name as string,
      price: Number(o.price ?? 0),
    })),
  }))
}

export async function getCachedModifiers(): Promise<LoyverseModifier[]> {
  if (modifiersCache && Date.now() < modifiersCache.expiry) {
    return modifiersCache.data
  }
  const data = await fetchModifiersFromLoyverse()
  modifiersCache = { data, expiry: Date.now() + 10 * 60 * 1000 }
  return data
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const modifiers = await getCachedModifiers()
    return NextResponse.json({ modifiers })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
