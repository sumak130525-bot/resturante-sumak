/**
 * Loyverse POS integration helper
 * Solo se usa en API routes (server-side). El token NUNCA se expone al cliente.
 */

const LOYVERSE_API = 'https://api.loyverse.com/v1.0'

// IDs de medios de pago de Loyverse (obtenidos via GET /payment_types)
// Mercadopago: 9d78eb67-7116-455f-ae9d-f6d51876cbcc
// Efectivo:    c5424f95-0f13-4d00-b964-2fa6ddfbb49c
export const LOYVERSE_PAYMENT_MERCADOPAGO = '9d78eb67-7116-455f-ae9d-f6d51876cbcc'
export const LOYVERSE_PAYMENT_EFECTIVO    = 'c5424f95-0f13-4d00-b964-2fa6ddfbb49c'

function getToken(): string {
  const token = process.env.LOYVERSE_ACCESS_TOKEN
  if (!token) throw new Error('LOYVERSE_ACCESS_TOKEN no configurado')
  return token
}

export function getStoreId(): string {
  const id = process.env.LOYVERSE_STORE_ID
  if (!id) {
    console.warn('[Loyverse] LOYVERSE_STORE_ID no configurado, usando valor hardcoded')
  }
  return id ?? 'ca14eb24-6ad6-40d2-80b1-87df568c4ecc'
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
  /** Requerido por la API de Loyverse - sin payments el POST devuelve 400 */
  payments: LoyverseReceiptPayment[]
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

export async function getLoyversePaymentTypes() {
  const data = await loyverseFetch('/payment_types')
  return data.payment_types ?? []
}

export async function createLoyverseReceipt(receipt: LoyverseReceiptInput) {
  return loyverseFetch('/receipts', {
    method: 'POST',
    body: JSON.stringify(receipt),
  })
}

/**
 * Busca el variant_id de un item de Loyverse por nombre (case-insensitive, normalizado).
 * Los items de Loyverse suelen incluir precio en el nombre, ej: "Silpancho $9.000"
 * Esta función hace matching parcial tolerando tildes, espacios extras y precio en el nombre.
 */
export function findVariantByName(
  items: LoyverseItem[],
  name: string
): { item: LoyverseItem; variant: LoyverseVariant } | null {
  // Normaliza: minúsculas, sin tildes (NFD → quitar diacríticos), sin precio ($...), espacios colapsados
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos
      .toLowerCase()
      .replace(/\$[\d.,\s]*/g, '') // quitar precios tipo "$9.000"
      .replace(/[^a-z0-9\s]/g, ' ') // quitar símbolos restantes
      .replace(/\s+/g, ' ')
      .trim()

  const target = normalize(name)

  for (const item of items) {
    const itemNorm = normalize(item.item_name)
    if (itemNorm.includes(target) || target.includes(itemNorm)) {
      const variant = item.variants[0]
      if (variant) return { item, variant }
    }
  }
  return null
}
