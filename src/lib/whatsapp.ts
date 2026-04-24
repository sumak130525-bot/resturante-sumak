import type { CartItem } from './types'
import { formatPrice } from './utils'

/** Numero de WhatsApp del restaurante (sin + ni espacios). Configurable via env var. */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5491100000000'

/**
 * Construye la URL de wa.me con el mensaje pre-armado del pedido.
 * @param cart        Items del carrito
 * @param total       Total calculado
 * @param mesa        Numero de mesa opcional
 * @param paymentLink Link de pago MercadoPago opcional
 * @param note        Nota adicional del cliente opcional
 */
export function buildWhatsAppURL(cart: CartItem[], total: number, mesa?: string | null, paymentLink?: string | null, note?: string | null): string {
  const lines: string[] = []

  lines.push('Hola! Quiero hacer un pedido de Sumak 🍽️')
  lines.push('')

  if (mesa) {
    lines.push(`🪑 Mesa: ${mesa}`)
    lines.push('')
  }

  lines.push('*Pedido:*')
  cart.forEach(({ menu_item, quantity }) => {
    const subtotal = formatPrice(menu_item.price * quantity)
    lines.push(`• ${menu_item.name} × ${quantity} = ${subtotal}`)
  })

  lines.push('')
  lines.push(`*Total: ${formatPrice(total)}*`)

  if (paymentLink) {
    lines.push('')
    lines.push(`💳 *Pagá online:* ${paymentLink}`)
  }

  if (note) {
    lines.push('')
    lines.push(`📝 *Nota:* ${note}`)
  }

  const text = lines.join('\n')
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}
