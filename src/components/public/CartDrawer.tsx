'use client'

import { useState } from 'react'
import { X, Trash2, ShoppingBag, ArrowRight, Sparkles } from 'lucide-react'
import { cn, formatPrice } from '@/lib/utils'
import type { CartItem, MenuItem } from '@/lib/types'
import { OrderForm } from './OrderForm'

interface CartDrawerProps {
  cart: CartItem[]
  open: boolean
  onClose: () => void
  onAdd: (item: MenuItem) => void
  onRemove: (itemId: string) => void
  onClear: () => void
}

export function CartDrawer({
  cart,
  open,
  onClose,
  onAdd,
  onRemove,
  onClear,
}: CartDrawerProps) {
  const [showOrderForm, setShowOrderForm] = useState(false)

  const total = cart.reduce((s, c) => s + c.menu_item.price * c.quantity, 0)
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0)

  const handleOrderSuccess = () => {
    setShowOrderForm(false)
    onClear()
    onClose()
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

              {/* CTA */}
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
