'use client'

import { useState } from 'react'
import { X, Trash2, ShoppingBag, ArrowRight, Sparkles, Phone, User } from 'lucide-react'
import { cn, formatPrice } from '@/lib/utils'
import { buildWhatsAppURL } from '@/lib/whatsapp'
import type { CartItem, MenuItem } from '@/lib/types'
import { OrderForm } from './OrderForm'

interface CartDrawerProps {
  cart: CartItem[]
  open: boolean
  onClose: () => void
  onAdd: (item: MenuItem) => void
  onRemove: (itemId: string) => void
  onClear: () => void
  mesa?: string | null
}

export function CartDrawer({
  cart,
  open,
  onClose,
  onAdd,
  onRemove,
  onClear,
  mesa,
}: CartDrawerProps) {
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [showWhatsAppForm, setShowWhatsAppForm] = useState(false)
  const [waName, setWaName] = useState('')
  const [waPhone, setWaPhone] = useState('')
  const [whatsappLoading, setWhatsappLoading] = useState(false)

  const total = cart.reduce((s, c) => s + c.menu_item.price * c.quantity, 0)
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0)

  const handleOrderSuccess = () => {
    setShowOrderForm(false)
    onClear()
    onClose()
  }

  const handleWhatsApp = async () => {
    if (whatsappLoading) return
    setWhatsappLoading(true)
    try {
      const items = cart.map((c) => ({
        menu_item_id: c.menu_item.id,
        quantity: c.quantity,
        unit_price: c.menu_item.price,
      }))
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: waName.trim() || 'Cliente WhatsApp',
          customer_phone: waPhone.trim() || null,
          notes: mesa ? `Mesa: ${mesa}` : null,
          items,
          channel: 'whatsapp',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('[WhatsApp order] POST /api/orders failed:', res.status, err)
      }
    } catch (err) {
      // Si falla el registro, igual abrimos WhatsApp
      console.error('[WhatsApp order] fetch error:', err)
    } finally {
      setWhatsappLoading(false)
      setShowWhatsAppForm(false)
      setWaName('')
      setWaPhone('')
      window.open(buildWhatsAppURL(cart, total, mesa), '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 bg-sumak-brown/60 backdrop-blur-sm z-40',
          'transition-all duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* ── Drawer panel ── */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-full w-full max-w-[400px]',
          'bg-sumak-cream flex flex-col z-50',
          'shadow-drawer',
          'transition-transform duration-500 ease-smooth',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-sumak-brown text-white shrink-0">
          <div className="flex items-center gap-3">
            <ShoppingBag size={20} className="text-sumak-gold" />
            <h2 className="font-serif font-bold text-lg">Tu pedido</h2>
            {totalItems > 0 && (
              <span className="bg-sumak-gold text-sumak-brown text-xs font-black w-5 h-5 rounded-full flex items-center justify-center animate-badge-pop">
                {totalItems}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={18} />
          </button>
        </div>
        <div className="andean-border-thin shrink-0" />

        {/* Content */}
        {cart.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-sumak-cream-dark flex items-center justify-center">
              <ShoppingBag size={36} strokeWidth={1} className="text-sumak-brown-light" />
            </div>
            <div>
              <p className="font-serif font-semibold text-lg text-sumak-brown mb-1">
                Tu carrito está vacío
              </p>
              <p className="text-sm text-sumak-brown-light">
                Agrega platos desde el menú para comenzar tu pedido.
              </p>
            </div>
            <button onClick={onClose} className="btn-outline text-sm px-5 py-2.5">
              Ver menú
            </button>
          </div>

        ) : showOrderForm ? (
          <OrderForm
            cart={cart}
            total={total}
            onBack={() => setShowOrderForm(false)}
            onSuccess={handleOrderSuccess}
            mesa={mesa}
          />

        ) : (
          <>
            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {cart.map(({ menu_item, quantity }) => (
                <div key={menu_item.id} className="cart-item animate-fade-up">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sumak-brown text-sm leading-snug truncate">
                      {menu_item.name}
                    </p>
                    <p className="text-xs text-sumak-brown-light mt-0.5">
                      {formatPrice(menu_item.price)} × {quantity}
                    </p>
                  </div>

                  {/* Right: subtotal + remove */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-sumak-red text-sm tabular-nums">
                      {formatPrice(menu_item.price * quantity)}
                    </span>
                    <button
                      onClick={() => onRemove(menu_item.id)}
                      className="p-1.5 rounded-lg text-sumak-brown-light/60 hover:text-sumak-red hover:bg-red-50 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-4 pb-6 pt-4 border-t border-sumak-cream-dark space-y-3">
              {/* Total */}
              <div className="flex justify-between items-center py-2 px-3 bg-sumak-cream-dark rounded-xl">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-sumak-gold" />
                  <span className="text-sm font-semibold text-sumak-brown">Total del pedido</span>
                </div>
                <span className="font-black text-xl text-sumak-red tabular-nums">
                  {formatPrice(total)}
                </span>
              </div>

              {/* CTA principal */}
              <button
                onClick={() => setShowOrderForm(true)}
                className={cn(
                  'w-full flex items-center justify-center gap-2',
                  'bg-sumak-brown text-sumak-gold font-bold',
                  'py-3.5 px-6 rounded-pill',
                  'transition-all duration-300 ease-smooth',
                  'hover:bg-sumak-brown-mid hover:shadow-gold-glow/30 hover:scale-[1.02]',
                  'active:scale-[0.98]'
                )}
              >
                Confirmar pedido
                <ArrowRight size={16} />
              </button>

              {/* CTA WhatsApp */}
              <button
                onClick={() => setShowWhatsAppForm(true)}
                className={cn(
                  'w-full flex items-center justify-center gap-2',
                  'bg-[#25D366] text-white font-bold',
                  'py-3 px-6 rounded-pill text-sm',
                  'transition-all duration-300',
                  'hover:bg-[#1ebe5d] hover:scale-[1.02]',
                  'active:scale-[0.98]'
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-4 h-4 fill-white shrink-0">
                  <path d="M16.002 3C9.374 3 4 8.373 4 15.001c0 2.124.556 4.121 1.528 5.856L4 29l8.368-1.51A11.96 11.96 0 0016.002 28C22.629 28 28 22.627 28 16S22.629 3 16.002 3zm0 21.81a9.76 9.76 0 01-5.02-1.387l-.36-.213-3.73.673.686-3.637-.234-.374a9.768 9.768 0 01-1.488-5.16C5.856 9.24 10.375 4.856 16.002 4.856c5.626 0 10.144 4.384 10.144 10.144 0 5.763-4.518 10.81-10.144 10.81zm5.558-7.603c-.304-.152-1.8-.887-2.08-.988-.28-.1-.484-.152-.688.153-.203.305-.79.988-.968 1.19-.178.203-.356.228-.66.076-.304-.152-1.284-.473-2.446-1.509-.904-.806-1.515-1.8-1.692-2.105-.178-.305-.019-.47.134-.621.137-.136.304-.356.456-.533.152-.178.203-.305.305-.508.1-.203.05-.381-.025-.533-.076-.152-.688-1.66-.942-2.273-.248-.598-.5-.517-.689-.527l-.585-.01c-.203 0-.533.076-.812.381-.28.305-1.067 1.043-1.067 2.543 0 1.5 1.092 2.95 1.244 3.152.152.203 2.149 3.278 5.208 4.595.728.314 1.296.502 1.739.643.73.233 1.394.2 1.92.122.586-.087 1.8-.736 2.054-1.447.254-.711.254-1.32.178-1.447-.076-.127-.28-.203-.584-.356z" />
                </svg>
                Pedir por WhatsApp
              </button>

              {/* Mini-formulario WhatsApp */}
              {showWhatsAppForm && (
                <div className="rounded-2xl border border-[#25D366]/30 bg-green-50 p-4 space-y-3 animate-fade-up">
                  <p className="text-sm font-semibold text-sumak-brown">¿A nombre de quién va el pedido?</p>

                  {/* Campo nombre */}
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sumak-brown-light pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Tu nombre *"
                      value={waName}
                      onChange={(e) => setWaName(e.target.value)}
                      autoFocus
                      className="w-full pl-8 pr-3 py-2.5 text-sm rounded-xl border border-sumak-cream-dark bg-white text-sumak-brown placeholder:text-sumak-brown-light/60 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366]"
                    />
                  </div>

                  {/* Campo teléfono */}
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sumak-brown-light pointer-events-none" />
                    <input
                      type="tel"
                      placeholder="Teléfono (opcional)"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 text-sm rounded-xl border border-sumak-cream-dark bg-white text-sumak-brown placeholder:text-sumak-brown-light/60 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366]"
                    />
                  </div>

                  {/* Botones */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setShowWhatsAppForm(false); setWaName(''); setWaPhone('') }}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold text-sumak-brown-light border border-sumak-cream-dark bg-white hover:bg-sumak-cream-dark transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleWhatsApp}
                      disabled={!waName.trim() || whatsappLoading}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all',
                        'bg-[#25D366] hover:bg-[#1ebe5d]',
                        (!waName.trim() || whatsappLoading) && 'opacity-50 cursor-not-allowed hover:bg-[#25D366]'
                      )}
                    >
                      {whatsappLoading ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Enviando...
                        </span>
                      ) : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={onClear}
                className="w-full text-xs text-sumak-brown-light hover:text-sumak-red transition-colors py-1"
              >
                Vaciar carrito
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
