'use client'

import { cn } from '@/lib/utils'
import { buildWhatsAppURL, WHATSAPP_NUMBER } from '@/lib/whatsapp'
import type { CartItem } from '@/lib/types'

const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61576603961881'
const MAPS_URL =
  'https://www.google.com/maps/place/SUMAK/@-32.8949139,-68.8292403,19.5z/data=!4m6!3m5!1s0x967e09a1dd6eefdd:0x698ad41b5908215c!8m2!3d-32.8949528!4d-68.8286573!16s%2Fg%2F11xgssdlt9'

interface WhatsAppFABProps {
  cart: CartItem[]
  total: number
  mesa?: string | null
}

/** Grupo de tres botones flotantes en la esquina inferior derecha:
 *  (abajo) WhatsApp → (medio) Facebook → (arriba) Google Maps
 */
export function WhatsAppFAB({ cart, total, mesa }: WhatsAppFABProps) {
  const hasItems = cart.length > 0

  if (!WHATSAPP_NUMBER || WHATSAPP_NUMBER === '5491100000000') {
    // Mostrar igualmente (con placeholder)
  }

  const handleWhatsApp = () => {
    if (!hasItems) return
    const url = buildWhatsAppURL(cart, total, mesa)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-3">

      {/* ── WhatsApp (más cercano a la esquina, abajo) ── */}
      <button
        onClick={handleWhatsApp}
        title={hasItems ? 'Enviar pedido por WhatsApp' : 'Agrega platos para pedir por WhatsApp'}
        aria-label="WhatsApp"
        className={cn(
          'relative w-14 h-14 rounded-full shadow-lg',
          'flex items-center justify-center',
          'transition-all duration-300',
          hasItems
            ? 'bg-[#25D366] hover:bg-[#1ebe5d] hover:scale-110 active:scale-95 cursor-pointer'
            : 'bg-[#25D366]/50 cursor-default'
        )}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-7 h-7 fill-white">
          <path d="M16.002 3C9.374 3 4 8.373 4 15.001c0 2.124.556 4.121 1.528 5.856L4 29l8.368-1.51A11.96 11.96 0 0016.002 28C22.629 28 28 22.627 28 16S22.629 3 16.002 3zm0 21.81a9.76 9.76 0 01-5.02-1.387l-.36-.213-3.73.673.686-3.637-.234-.374a9.768 9.768 0 01-1.488-5.16C5.856 9.24 10.375 4.856 16.002 4.856c5.626 0 10.144 4.384 10.144 10.144 0 5.763-4.518 10.81-10.144 10.81zm5.558-7.603c-.304-.152-1.8-.887-2.08-.988-.28-.1-.484-.152-.688.153-.203.305-.79.988-.968 1.19-.178.203-.356.228-.66.076-.304-.152-1.284-.473-2.446-1.509-.904-.806-1.515-1.8-1.692-2.105-.178-.305-.019-.47.134-.621.137-.136.304-.356.456-.533.152-.178.203-.305.305-.508.1-.203.05-.381-.025-.533-.076-.152-.688-1.66-.942-2.273-.248-.598-.5-.517-.689-.527l-.585-.01c-.203 0-.533.076-.812.381-.28.305-1.067 1.043-1.067 2.543 0 1.5 1.092 2.95 1.244 3.152.152.203 2.149 3.278 5.208 4.595.728.314 1.296.502 1.739.643.73.233 1.394.2 1.92.122.586-.087 1.8-.736 2.054-1.447.254-.711.254-1.32.178-1.447-.076-.127-.28-.203-.584-.356z" />
        </svg>
        {hasItems && (
          <span className="absolute inset-0 rounded-full animate-ping bg-[#25D366]/40 pointer-events-none" />
        )}
      </button>

      {/* ── Facebook (medio) ── */}
      <a
        href={FACEBOOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Seguinos en Facebook"
        aria-label="Facebook"
        className={cn(
          'w-14 h-14 rounded-full shadow-lg',
          'flex items-center justify-center',
          'bg-[#1877F2] hover:bg-[#0f65d4] hover:scale-110 active:scale-95',
          'transition-all duration-300'
        )}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.093 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.261h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.1 24 12.073z" />
        </svg>
      </a>

      {/* ── Google Maps (arriba) ── */}
      <a
        href={MAPS_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Cómo llegar — Google Maps"
        aria-label="Google Maps"
        className={cn(
          'w-14 h-14 rounded-full shadow-lg',
          'flex items-center justify-center',
          'bg-red-500 hover:bg-red-600 hover:scale-110 active:scale-95',
          'transition-all duration-300'
        )}
      >
        {/* Google Maps pin SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
      </a>

    </div>
  )
}
