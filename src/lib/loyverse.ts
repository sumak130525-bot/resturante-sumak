/**
 * Loyverse POS integration helper
 * Solo se usa en API routes (server-side). El token NUNCA se expone al cliente.
 */

const LOYVERSE_API = 'https://api.loyverse.com/v1.0'

function getToken(): string {
  const token = process.env.LOYVERSE_ACCESS_TOKEN
  if (!token) throw new Error('LOYVERSE_ACCESS_TOKEN no configurado')
  return token
}

export function getStoreId(): string {
  return process.env.LOYVERSE_STORE_ID ?? 'ca14eb24-6ad6-40d2-80b1-87df568c4ecc'
}

async function loyverseFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${LOYVERSE_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Loyverse API error ${res.status}: ${body}`)
  }
  return res.json()
}

// ── Tipos mínimos de Loyverse ────────────────────────────────────────────────

export type LoyverseVariant = {
  variant_id: string
  sku: string
  default_price: number
}

export type LoyverseItem = {
  id: string
  item_name: string
  variants: LoyverseVariant[]
}

export type LoyverseReceiptLineItem = {
  variant_id: string
  quantity: number
  price: number
  total_money: number
  gross_total_money: number
}

export type LoyverseReceiptPayment = {
  payment_type_id: string
  money_amount: number
}

export type LoyverseReceiptInput = {
  store_id: string
  receipt_number?: string
  receipt_date?: string
  source?: string
  note?: string
  total_money: number
  payments?: LoyverseReceiptPayment[]
  line_items: LoyverseReceiptLineItem[]
}

// ── Funciones de API ─────────────────────────────────────────────────────────

export async function getLoyverseItems(): Promise<LoyverseItem[]> {
  const all: LoyverseItem[] = []
  let cursor: string | undefined

  do {
    const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const data = await loyverseFetch(`/items${params}`)
    all.push(...(data.items ?? []))
    cursor = data.cursor
  } while (cursor)

  return all
}

export async function getLoyverseStores() {
  const data = await loyverseFetch('/stores')
  return data.stores ?? []
}

export async function createLoyverseReceipt(receipt: LoyverseReceiptInput) {
  return loyverseFetch('/receipts', {
    method: 'POST',
    body: JSON.stringify(receipt),
  })
}

/**
 * Busca el variant_id de un item de Loyverse por nombre (case-insensitive, normalizado).
 */
export function findVariantByName(
  items: LoyverseItem[],
  name: string
): { item: LoyverseItem; variant: LoyverseVariant } | null {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
  const target = normalize(name)

  for (const item of items) {
    if (normalize(item.item_name).includes(target) || target.includes(normalize(item.item_name))) {
      const variant = item.variants[0]
      if (variant) return { item, variant }
    }
  }
  return null
}
