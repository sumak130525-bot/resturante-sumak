'use client'

import { useState } from 'react'
import { ChevronLeft, CheckCircle, Loader2, Send, Receipt, CreditCard } from 'lucide-react'
import { formatPrice, cn } from '@/lib/utils'
import type { CartItem } from '@/lib/types'

interface OrderFormProps {
  cart: CartItem[]
  total: number
  onBack: () => void
  onSuccess: () => void
  mesa?: string | null
}

export function OrderForm({ cart, total, onBack, onSuccess, mesa }: OrderFormProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Por favor ingresa tu nombre.')
      return
    }
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: phone.trim() || null,
          notes: notes.trim() ? `[Mesa ${mesa}] ${notes.trim()}` : mesa ? `[Mesa ${mesa}]` : null,
          items: cart.map((c) => ({
            menu_item_id: c.menu_item.id,
            quantity: c.quantity,
            unit_price: c.menu_item.price,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al crear el pedido')
      }

      const data = await res.json()
      setOrderId(data.order_id ?? null)
      setDone(true)
      setTimeout(() => onSuccess(), 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  /* ── Success state ── */
  const handlePagarMercadoPago = async () => {
    if (!orderId || paymentLoading) return
    setPaymentLoading(true)
    try {
      const res = await fetch('/api/payments/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear preferencia')
      if (data.init_point) {
        window.location.href = data.init_point
      }
    } catch (err) {
      console.error('[MercadoPago] Error:', err)
    } finally {
      setPaymentLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle size={44} className="text-emerald-500" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="font-serif text-2xl font-bold text-sumak-brown mb-2">
            ¡Pedido recibido!
          </h3>
          <p className="text-sumak-brown-light text-sm leading-relaxed max-w-xs mx-auto">
            Tu pedido fue registrado. Completá el pago para que el equipo lo empiece a preparar.
          </p>
        </div>
        {orderId && (
          <button
            onClick={handlePagarMercadoPago}
            disabled={paymentLoading}
            className={cn(
              'w-full max-w-xs flex items-center justify-center gap-2.5',
              'bg-[#009ee3] text-white font-bold',
              'py-3.5 px-6 rounded-pill text-base',
              'transition-all duration-300',
              'hover:bg-[#0085c3] hover:scale-[1.02]',
              'active:scale-[0.98]',
              paymentLoading && 'opacity-70 cursor-not-allowed'
            )}
          >
            {paymentLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Redirigiendo…
              </>
            ) : (
              <>
                <CreditCard size={18} />
                Pagar con MercadoPago
              </>
            )}
          </button>
        )}
        <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-sumak-gold to-transparent rounded-full" />
        <p className="text-xs text-sumak-brown-light/60">Cerrando en un momento…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-sumak-brown-light hover:text-sumak-red transition-colors"
        >
          <ChevronLeft size={15} />
          Volver al carrito
        </button>

        {/* Order summary */}
        <div className="rounded-2xl bg-sumak-brown text-white p-4 space-y-2 shadow-premium">
          <div className="flex items-center gap-2 mb-3">
            <Receipt size={14} className="text-sumak-gold" />
            <p className="text-xs font-bold tracking-wider uppercase text-sumak-gold">
              Resumen del pedido
            </p>
          </div>
          {cart.map(({ menu_item, quantity }) => (
            <div key={menu_item.id} className="flex justify-between text-sm text-white/80">
              <span className="truncate flex-1 mr-3">
                {menu_item.name}{' '}
                <span className="text-white/50">× {quantity}</span>
              </span>
              <span className="font-medium shrink-0">
                {formatPrice(menu_item.price * quantity)}
              </span>
            </div>
          ))}
          <div className="border-t border-white/10 mt-3 pt-3 flex justify-between font-bold">
            <span className="text-sumak-gold">Total</span>
            <span className="text-sumak-gold text-lg tabular-nums">
              {formatPrice(total)}
            </span>
          </div>
        </div>

        {/* Customer fields */}
        <div className="space-y-4">
          <h3 className="font-serif font-semibold text-sumak-brown text-base">
            Tus datos
          </h3>

          <div>
            <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre completo"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
              Teléfono <span className="normal-case font-normal text-sumak-brown-pale">(opcional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 3001234567"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
              Notas <span className="normal-case font-normal text-sumak-brown-pale">(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sin cebolla, extra llajua, alergia a…"
              className="input-field resize-none h-20"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* Submit footer */}
      <div className="shrink-0 px-5 pb-6 pt-3 border-t border-sumak-cream-dark">
        <button
          type="submit"
          disabled={loading}
          className={cn(
            'w-full flex items-center justify-center gap-2.5',
            'btn-primary py-4 text-base rounded-pill',
            loading && 'opacity-80'
          )}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enviando pedido…
            </>
          ) : (
            <>
              <Send size={16} />
              Enviar pedido
            </>
          )}
        </button>
      </div>
    </form>
  )
}
