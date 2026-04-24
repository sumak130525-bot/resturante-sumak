'use client'

import { useState } from 'react'
import { ChevronLeft, Loader2, Receipt, CreditCard } from 'lucide-react'
import { formatPrice, cn } from '@/lib/utils'
import { useTranslation, getItemName } from '@/lib/i18n'
import type { CartItem } from '@/lib/types'

interface OrderFormProps {
  cart: CartItem[]
  total: number
  onBack: () => void
  onSuccess: () => void
  mesa?: string | null
}

export function OrderForm({ cart, total, onBack, mesa }: OrderFormProps) {
  const { t, locale } = useTranslation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePagar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('nameRequired'))
      return
    }
    setError(null)
    setLoading(true)

    try {
      const notesValue = notes.trim()
        ? mesa
          ? `[Mesa ${mesa}] ${notes.trim()}`
          : notes.trim()
        : mesa
        ? `[Mesa ${mesa}]`
        : null

      const items = cart.map((c) => ({
        menu_item_id: c.menu_item.id,
        quantity: c.quantity,
        unit_price: c.menu_item.price,
        title: c.menu_item.name,
      }))

      const res = await fetch('/api/payments/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: phone.trim() || null,
          notes: notesValue,
          mesa: mesa ?? null,
          channel: 'web',
          items,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear preferencia de pago')

      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        throw new Error('No se recibió link de pago')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handlePagar} className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-sumak-brown-light hover:text-sumak-red transition-colors"
        >
          <ChevronLeft size={15} />
          {t('backToCart')}
        </button>

        {/* Order summary */}
        <div className="rounded-2xl bg-sumak-brown text-white p-4 space-y-2 shadow-premium">
          <div className="flex items-center gap-2 mb-3">
            <Receipt size={14} className="text-sumak-gold" />
            <p className="text-xs font-bold tracking-wider uppercase text-sumak-gold">
              {t('orderSummary')}
            </p>
          </div>
          {cart.map(({ menu_item, quantity }) => (
            <div key={menu_item.id} className="flex justify-between text-sm text-white/80">
              <span className="truncate flex-1 mr-3">
                {getItemName(menu_item, locale)}{' '}
                <span className="text-white/50">× {quantity}</span>
              </span>
              <span className="font-medium shrink-0">
                {formatPrice(menu_item.price * quantity)}
              </span>
            </div>
          ))}
          <div className="border-t border-white/10 mt-3 pt-3 flex justify-between font-bold">
            <span className="text-sumak-gold">{t('total')}</span>
            <span className="text-sumak-gold text-lg tabular-nums">
              {formatPrice(total)}
            </span>
          </div>
        </div>

        {/* Customer fields */}
        <div className="space-y-4">
          <h3 className="font-serif font-semibold text-sumak-brown text-base">
            {t('yourData')}
          </h3>

          <div>
            <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
              {t('nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
              {t('phoneLabel')} <span className="normal-case font-normal text-sumak-brown-pale">{t('phoneOptional')}</span>
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
              {t('notesLabel')} <span className="normal-case font-normal text-sumak-brown-pale">{t('notesOptional')}</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesSamplePlaceholder')}
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
            'bg-[#009ee3] text-white font-bold',
            'py-4 text-base rounded-pill',
            'transition-all duration-300',
            'hover:bg-[#0085c3] hover:scale-[1.02]',
            'active:scale-[0.98]',
            loading && 'opacity-80 cursor-not-allowed'
          )}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {t('redirectingMP')}
            </>
          ) : (
            <>
              <CreditCard size={18} />
              {t('payWithMP')}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
