'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
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

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length)
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : ' '.repeat(len - str.length) + str
}

export default function MesaTicketPage() {
  const params = useParams()
  const tableNumber = params.number as string
  const ticketRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    fetchOrder()
    const interval = setInterval(fetchOrder, 10000)
    return () => clearInterval(interval)
  }, [fetchOrder])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

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

  const handleDownload = async () => {
    if (!ticketRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(ticketRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      })
      const link = document.createElement('a')
      link.download = `ticket-mesa-${tableNumber}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      // Fallback: print
      window.print()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-lg font-mono">Cargando...</div>
      </div>
    )
  }

  if (noOrder || !order) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-xs w-full font-mono">
          <div className="text-center text-lg font-bold mb-2">RESTAURANTE SUMAK</div>
          <div className="text-center text-xs text-gray-500 mb-4">Juan B Alberdi 247, Guaymallén</div>
          <div className="border-t border-dashed border-gray-300 my-3" />
          <div className="text-center text-sm">Mesa {tableNumber}</div>
          <div className="text-center text-xs text-gray-400 mt-2">No hay pedidos activos</div>
          <div className="border-t border-dashed border-gray-300 my-3" />
          <a
            href="/"
            className="block text-center text-amber-600 font-bold text-sm underline"
          >
            Ver nuestro menú
          </a>
        </div>
      </div>
    )
  }

  const orderDate = formatDate(order.created_at)
  const orderTime = formatTime(order.created_at)

  return (
    <div className="min-h-screen bg-gray-100 py-4 px-3">
      {/* Ticket con formato recibo */}
      <div
        ref={ticketRef}
        className="max-w-sm mx-auto bg-white shadow-xl rounded-sm overflow-hidden"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        {/* Borde superior zigzag */}
        <div className="h-3 bg-white" style={{
          backgroundImage: 'linear-gradient(135deg, #f3f4f6 33.33%, transparent 33.33%), linear-gradient(225deg, #f3f4f6 33.33%, transparent 33.33%)',
          backgroundSize: '12px 12px',
        }} />

        {/* Header */}
        <div className="px-5 pt-4 pb-2 text-center">
          <div className="text-lg font-bold tracking-wider">RESTAURANTE SUMAK</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Juan B Alberdi 247, Guaymallén, Mendoza</div>
          <div className="text-[10px] text-gray-500">Tel: +54 9 261 752-6242</div>
        </div>

        <div className="mx-5 border-t-2 border-dashed border-gray-300" />

        {/* Info pedido */}
        <div className="px-5 py-2 text-xs">
          <div className="flex justify-between">
            <span>MESA: <span className="font-bold text-base">{tableNumber}</span></span>
            <span>{orderDate} {orderTime}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>⏱️ {timeAgo(order.created_at)}</span>
            {order.employee_name && <span>Atendió: {order.employee_name}</span>}
          </div>
          {isPaid && (
            <div className="text-center mt-2 font-bold text-green-700 text-sm bg-green-50 py-1 rounded">
              ★ PAGADO ★
            </div>
          )}
          {!isPaid && allDelivered && (
            <div className="text-center mt-2 font-bold text-blue-700 text-sm bg-blue-50 py-1 rounded">
              ★ PEDIDO COMPLETO ★
            </div>
          )}
        </div>

        <div className="mx-5 border-t border-dashed border-gray-300" />

        {/* Column headers */}
        <div className="px-5 py-1.5 text-[10px] text-gray-500 flex">
          <span className="flex-1">{padRight('ITEM', 20)}</span>
          <span className="w-8 text-center">QTY</span>
          <span className="w-16 text-right">PRECIO</span>
          <span className="w-14 text-right">ESTADO</span>
        </div>

        <div className="mx-5 border-t border-gray-200" />

        {/* Items */}
        <div className="px-5 py-1">
          {order.items.map((item) => {
            const isDelivered = !!item.delivered_at
            const subtotal = item.unit_price * item.quantity
            return (
              <div key={item.id} className="py-1.5 border-b border-gray-50 last:border-b-0">
                <div className={`flex text-xs ${isDelivered ? 'text-gray-400' : 'text-gray-800'}`}>
                  <span className={`flex-1 font-medium ${isDelivered ? 'line-through' : ''}`}>
                    {item.name}
                  </span>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <span className={`w-16 text-right ${isDelivered ? 'line-through' : ''}`}>
                    ${subtotal.toLocaleString('es-AR')}
                  </span>
                  <span className="w-14 text-right text-[10px]">
                    {isDelivered && item.delivered_at
                      ? `✓${formatTime(item.delivered_at)}`
                      : item.sent_to_kitchen_at
                        ? '🔥cocina'
                        : '⏳espera'
                    }
                  </span>
                </div>
                {item.line_note && (
                  <div className={`text-[10px] ml-2 ${isDelivered ? 'text-gray-300' : 'text-amber-600'}`}>
                    → {item.line_note}
                  </div>
                )}
                {item.is_bonus && (
                  <div className="text-[10px] ml-2 text-purple-500">
                    ★ BONIFICADO{item.bonus_reason ? `: ${item.bonus_reason}` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mx-5 border-t-2 border-dashed border-gray-300" />

        {/* Total */}
        <div className="px-5 py-3">
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span className="text-lg">${total.toLocaleString('es-AR')}</span>
          </div>
          {order.payment_method && (
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Método de pago:</span>
              <span>{order.payment_method}</span>
            </div>
          )}
        </div>

        <div className="mx-5 border-t border-dashed border-gray-300" />

        {/* Footer ticket */}
        <div className="px-5 py-3 text-center">
          <div className="text-[10px] text-gray-400">Gracias por su visita</div>
          <div className="text-[10px] text-gray-400 mt-0.5">restaurante-sumak.vercel.app</div>
          <div className="text-[10px] text-gray-300 mt-1">
            {padLeft('', 10)}#{order.id.substring(0, 8).toUpperCase()}{padRight('', 10)}
          </div>
        </div>

        {/* Borde inferior zigzag */}
        <div className="h-3 bg-white" style={{
          backgroundImage: 'linear-gradient(315deg, #f3f4f6 33.33%, transparent 33.33%), linear-gradient(45deg, #f3f4f6 33.33%, transparent 33.33%)',
          backgroundSize: '12px 12px',
        }} />
      </div>

      {/* Propina — fuera del ticket para que no se descargue */}
      {(order.is_open || isPaid) && (
        <div className="max-w-sm mx-auto mt-4 bg-white rounded-lg shadow-md p-4" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          <div className="text-center font-bold text-sm mb-3">💰 ¿Querés dejar propina?</div>
          <div className="flex gap-2 mb-3">
            {[10, 15, 20].map((pct) => (
              <button
                key={pct}
                onClick={() => { setTipPercent(tipPercent === pct ? null : pct); setShowTipInput(false); setCustomTip('') }}
                className={`flex-1 py-2 rounded text-xs font-bold transition-all border ${
                  tipPercent === pct
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {pct}%
                <div className="text-[10px] font-normal">${Math.round(total * pct / 100).toLocaleString('es-AR')}</div>
              </button>
            ))}
            <button
              onClick={() => { setTipPercent(null); setShowTipInput(!showTipInput) }}
              className={`flex-1 py-2 rounded text-xs font-bold transition-all border ${
                showTipInput
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-gray-700 border-gray-300'
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-xs mb-3 font-mono"
            />
          )}
          {tipAmount > 0 && (
            <a
              href={`https://www.mercadopago.com.ar/checkout/v1/payment/redirect/?preference-id=propina-${order.id}&amount=${tipAmount}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-green-600 text-white text-center font-bold py-2.5 rounded text-sm hover:bg-green-700 transition-colors"
            >
              Dejar propina ${tipAmount.toLocaleString('es-AR')} 💚
            </a>
          )}
        </div>
      )}

      {/* Acciones — fuera del ticket */}
      <div className="max-w-sm mx-auto mt-4 space-y-2 pb-8">
        <button
          onClick={handleDownload}
          className="w-full bg-gray-800 text-white text-center font-bold py-3 rounded-lg text-sm hover:bg-gray-900 transition-colors"
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
        >
          📥 Descargar ticket
        </button>
        <a
          href="/"
          className="block w-full bg-amber-600 text-white text-center font-bold py-3 rounded-lg text-sm hover:bg-amber-700 transition-colors"
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
        >
          📋 Ver nuestro menú
        </a>
      </div>
    </div>
  )
}
