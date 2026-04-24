'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'

function OrderEstadoContent() {
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const status = searchParams.get('status') ?? 'pending'
  const orderId = searchParams.get('order_id')

  const shortId = orderId ? orderId.slice(0, 8).toUpperCase() : null

  if (status === 'approved') {
    return (
      <div className="min-h-screen bg-sumak-cream flex flex-col items-center justify-center px-6 text-center">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
          <CheckCircle size={52} className="text-emerald-500" strokeWidth={1.5} />
        </div>
        <h1 className="font-serif text-3xl font-bold text-sumak-brown mb-3">
          {t('paymentApproved')}
        </h1>
        <p className="text-sumak-brown-light text-base leading-relaxed max-w-sm mb-2">
          {t('paymentApprovedDesc')}
        </p>
        {shortId && (
          <p className="text-xs text-sumak-brown-light/60 mb-8">
            {t('orderNumber', { id: shortId })}
          </p>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-sumak-brown text-sumak-gold font-bold py-3 px-6 rounded-full hover:bg-sumak-brown-mid transition-colors"
        >
          <ArrowLeft size={16} />
          {t('backToMenu')}
        </Link>
      </div>
    )
  }

  if (status === 'failure') {
    return (
      <div className="min-h-screen bg-sumak-cream flex flex-col items-center justify-center px-6 text-center">
        <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center mb-6">
          <XCircle size={52} className="text-red-500" strokeWidth={1.5} />
        </div>
        <h1 className="font-serif text-3xl font-bold text-sumak-brown mb-3">
          {t('paymentFailure')}
        </h1>
        <p className="text-sumak-brown-light text-base leading-relaxed max-w-sm mb-8">
          {t('paymentFailureDesc')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-sumak-brown text-sumak-gold font-bold py-3 px-6 rounded-full hover:bg-sumak-brown-mid transition-colors"
          >
            <ArrowLeft size={16} />
            {t('backToMenu')}
          </Link>
        </div>
      </div>
    )
  }

  // pending (default)
  return (
    <div className="min-h-screen bg-sumak-cream flex flex-col items-center justify-center px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-yellow-100 flex items-center justify-center mb-6">
        <Clock size={52} className="text-yellow-500" strokeWidth={1.5} />
      </div>
      <h1 className="font-serif text-3xl font-bold text-sumak-brown mb-3">
        {t('paymentPending')}
      </h1>
      <p className="text-sumak-brown-light text-base leading-relaxed max-w-sm mb-2">
        {t('paymentPendingDesc')}
      </p>
      {shortId && (
        <p className="text-xs text-sumak-brown-light/60 mb-8">
          {t('orderNumber', { id: shortId })}
        </p>
      )}
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-sumak-brown text-sumak-gold font-bold py-3 px-6 rounded-full hover:bg-sumak-brown-mid transition-colors"
      >
        <ArrowLeft size={16} />
        {t('backToMenu')}
      </Link>
    </div>
  )
}

export default function PedidoEstadoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-sumak-cream flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sumak-brown border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OrderEstadoContent />
    </Suspense>
  )
}
