'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

type OrderItem = {
  id: string
  name: string
  quantity: number
  unit_price: number
  line_note: string | null
  person_number: number | null
  is_bonus: boolean
  bonus_reason: string | null
  sent_to_kitchen_at: string | null
  delivered_at: string | null
}

type Order = {
  id: string
  table_number: string
  status: string
  total: number
  payment_method: string | null
  employee_name: string | null
  created_at: string
  is_open: boolean
  closed_at: string | null
  items: OrderItem[]
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Mendoza',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Hace un momento'
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  return `Hace ${hrs}h ${mins % 60}min`
}

export default function MesaTicketPage() {
  const params = useParams()
  const tableNumber = params.number as string

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [noOrder, setNoOrder] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [tipPercent, setTipPercent] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [showTipInput, setShowTipInput] = useState(false)

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/mesa/${tableNumber}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.order) {
        setOrder(data.order)
        setNoOrder(false)
      } else {
        setOrder(null)
        setNoOrder(true)
      }
    } catch {
      setNoOrder(true)
    } finally {
      setLoading(false)
    }
  }, [tableNumber])

  // Fetch inicial y polling cada 10s
  useEffect(() => {
    fetchOrder()
    const interval = setInterval(fetchOrder, 10000)
    return () => clearInterval(interval)
  }, [fetchOrder])

  // Actualizar "Hace X min" cada 30s
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  // Forzar re-render para timeAgo
  void now

  const total = order?.total ?? 0
  const tipAmount = tipPercent
    ? Math.round(total * tipPercent / 100)
    : showTipInput && customTip
      ? Number(customTip)
      : 0

  const allDelivered = order?.items?.length
    ? order.items.every((i) => i.delivered_at)
    : false
  const isPaid = order?.status === 'delivered' || order?.closed_at

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="animate-pulse text-amber-600 text-lg font-semibold">Cargando...</div>
      </div>
    )
  }

  if (noOrder || !order) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">🍽️</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Mesa {tableNumber}</h1>
        <p className="text-gray-500 mb-6">No hay pedidos activos en esta mesa</p>
        <a
          href="/"
          className="bg-amber-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-amber-700 transition-colors"
        >
          📋 Ver nuestro menú
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-amber-50">
      {/* Header */}
      <div className="bg-amber-600 text-white px-4 py-4 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">🪑 Mesa {tableNumber}</h1>
            <p className="text-amber-100 text-sm">Restaurante Sumak</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">⏱️ {timeAgo(order.created_at)}</div>
            <div className="text-xs text-amber-200">{formatTime(order.created_at)}</div>
          </div>
        </div>
        {isPaid && (
          <div className="mt-2 bg-green-500 text-white text-center py-1 rounded-lg text-sm font-bold">
            ✅ Pedido pagado
          </div>
        )}
        {!isPaid && allDelivered && (
          <div className="mt-2 bg-blue-500 text-white text-center py-1 rounded-lg text-sm font-bold">
            ✅ Pedido completo — ¡Buen provecho!
          </div>
        )}
      </div>

      {/* Items */}
      <div className="p-4 space-y-2">
        {order.items.map((item) => {
          const isDelivered = !!item.delivered_at
          return (
            <div
              key={item.id}
              className={`bg-white rounded-xl p-3 shadow-sm border flex items-center gap-3 ${
                isDelivered ? 'border-green-200 bg-green-50/50' : 'border-gray-100'
              }`}
            >
              <div className="flex-1">
                <div className={`font-semibold ${isDelivered ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {item.name} x{item.quantity}
                </div>
                {item.line_note && (
                  <div className="text-xs text-amber-600 mt-0.5">📝 {item.line_note}</div>
                )}
                {item.is_bonus && (
                  <div className="text-xs text-purple-600 mt-0.5">🎁 Bonificado{item.bonus_reason ? `: ${item.bonus_reason}` : ''}</div>
                )}
              </div>
              <div className="text-right">
                <div className={`font-bold ${isDelivered ? 'text-gray-400' : 'text-gray-800'}`}>
                  ${(item.unit_price * item.quantity).toLocaleString('es-AR')}
                </div>
                {isDelivered && item.delivered_at && (
                  <div className="text-xs text-green-600 font-medium">
                    ✅ {formatTime(item.delivered_at)}
                  </div>
                )}
                {!isDelivered && item.sent_to_kitchen_at && (
                  <div className="text-xs text-amber-500 font-medium">
                    🔥 En cocina
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="mx-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center text-lg font-bold text-gray-800">
          <span>Total</span>
          <span>${total.toLocaleString('es-AR')}</span>
        </div>
        {order.payment_method && (
          <div className="text-xs text-gray-400 mt-1">
            Pago: {order.payment_method}
          </div>
        )}
      </div>

      {/* Propina */}
      {(order.is_open || isPaid) && (
        <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm border border-amber-200">
          <h3 className="font-bold text-gray-800 mb-3">💰 ¿Querés dejar propina?</h3>
          <div className="flex gap-2 mb-3">
            {[10, 15, 20].map((pct) => (
              <button
                key={pct}
                onClick={() => { setTipPercent(tipPercent === pct ? null : pct); setShowTipInput(false); setCustomTip('') }}
                className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all border-2 ${
                  tipPercent === pct
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {pct}%
                <div className="text-xs font-normal">${Math.round(total * pct / 100).toLocaleString('es-AR')}</div>
              </button>
            ))}
            <button
              onClick={() => { setTipPercent(null); setShowTipInput(!showTipInput) }}
              className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all border-2 ${
                showTipInput
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              Otro
            </button>
          </div>
          {showTipInput && (
            <input
              type="number"
              value={customTip}
              onChange={(e) => setCustomTip(e.target.value)}
              placeholder="Monto de propina"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-3"
            />
          )}
          {tipAmount > 0 && (
            <a
              href={`https://www.mercadopago.com.ar/checkout/v1/payment/redirect/?preference-id=propina-${order.id}&amount=${tipAmount}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-green-600 text-white text-center font-bold py-3 rounded-xl hover:bg-green-700 transition-colors"
            >
              Dejar propina de ${tipAmount.toLocaleString('es-AR')} 💚
            </a>
          )}
        </div>
      )}

      {/* Link al menú */}
      <div className="mx-4 mt-4 mb-8">
        <a
          href="/"
          className="block w-full bg-amber-600 text-white text-center font-bold py-3 rounded-xl hover:bg-amber-700 transition-colors"
        >
          📋 Ver nuestro menú completo
        </a>
      </div>
    </div>
  )
}
