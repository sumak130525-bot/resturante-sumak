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
  customer_name: string | null
  dining_option: string | null
  notes: string | null
  persons: number | null
  created_at: string
  is_open: boolean
  closed_at: string | null
  items: OrderItem[]
  order_number: number | null
}

type TicketConfig = {
  header1: string
  header2: string
  footer1: string
  footer2: string
  showLogo: boolean
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

function timeAgo(iso: string, endIso?: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const diff = end - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}min`
}

function timeBetween(startIso: string, endIso: string): string {
  const diff = new Date(endIso).getTime() - new Date(startIso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}min`
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
  const [ticketCfg, setTicketCfg] = useState<TicketConfig>({
    header1: 'RESTAURANTE SUMAK',
    header2: 'Juan B Alberdi 247, Guaymallén',
    footer1: 'Gracias por su visita',
    footer2: '',
    showLogo: true,
  })
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

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

  // Cargar config del ticket
  useEffect(() => {
    fetch('/api/admin/settings?key=ticket_config')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        if (d[0]?.value) {
          try {
            const cfg = JSON.parse(d[0].value)
            setTicketCfg((prev) => ({ ...prev, ...cfg }))
          } catch { /* ignore */ }
        }
      })
      .catch(() => {})

    fetch('/api/admin/settings?key=ticket_logo_url')
      .then((r) => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        if (d[0]?.value) setLogoUrl(d[0].value)
      })
      .catch(() => {})
  }, [])

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

  // Última entrega para parar el reloj
  const lastDeliveredAt = order?.items
    ?.map((i) => i.delivered_at)
    .filter(Boolean)
    .sort()
    .pop() ?? null

  // Tiempo total: si todos entregados, tiempo fijo; si no, sigue corriendo
  const totalTimeEnd = allDelivered ? lastDeliveredAt : null

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
      window.print()
    }
  }

  const [tipLoading, setTipLoading] = useState(false)

  const handleTip = async () => {
    if (tipAmount <= 0 || !order) return
    setTipLoading(true)
    try {
      const res = await fetch('/api/mesa/propina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tipAmount,
          order_id: order.id,
          table_number: tableNumber,
        }),
      })
      const data = await res.json()
      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        alert('Error al crear propina: ' + (data.error || 'intente de nuevo'))
      }
    } catch {
      alert('Error de conexión')
    } finally {
      setTipLoading(false)
    }
  }

  // Agrupar items por persona
  const hasMultiPerson = order?.items?.some((i) => (i.person_number ?? 0) > 1) ?? false
  const maxPerson = hasMultiPerson
    ? Math.max(...(order?.items ?? []).map((i) => i.person_number ?? 1))
    : 1

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-lg font-mono">Cargando...</div>
      </div>
    )
  }

  if (noOrder || !order) {
    return (
      <div className="min-h-screen bg-gray-200 flex flex-col items-center justify-center p-4">
        <div className="bg-white shadow-xl max-w-xs w-full font-mono text-center px-6 py-8" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          {logoUrl && <img src={logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain" />}
          <div className="font-bold text-sm">{ticketCfg.header1}</div>
          <div className="text-[10px] text-gray-500">{ticketCfg.header2}</div>
          <div className="border-t border-dashed border-gray-300 my-4" />
          <div className="text-sm">Mesa {tableNumber}</div>
          <div className="text-xs text-gray-400 mt-2">Sin pedidos activos</div>
          <div className="border-t border-dashed border-gray-300 my-4" />
          <a href="/" className="text-amber-600 font-bold text-sm underline">Ver menú</a>
        </div>
      </div>
    )
  }

  const renderItems = (items: OrderItem[]) => items.map((item) => {
    const isDelivered = !!item.delivered_at
    const subtotal = item.unit_price * item.quantity
    return (
      <div key={item.id} className="py-1 border-b border-dotted border-gray-200 last:border-b-0">
        <div className="flex text-xs leading-tight">
          <span className="w-6 text-gray-500">{item.quantity}x</span>
          <span className="flex-1">
            {item.is_bonus ? '★ ' : ''}{item.name}
          </span>
          <span className="w-20 text-right">
            {item.is_bonus ? 'GRATIS' : `$${subtotal.toLocaleString('es-AR')}`}
          </span>
        </div>
        {isDelivered && item.delivered_at && order && (
          <div className="text-[9px] text-green-600 ml-6 font-medium">
            ✅ Entregado en {timeBetween(order.created_at, item.delivered_at)}
          </div>
        )}
        {!isDelivered && item.sent_to_kitchen_at && (
          <div className="text-[9px] text-amber-500 ml-6">
            🔥 En cocina
          </div>
        )}
        {!isDelivered && !item.sent_to_kitchen_at && (
          <div className="text-[9px] text-gray-400 ml-6">⏳ En espera</div>
        )}
        {item.line_note && (
          <div className="text-[9px] ml-6 text-amber-600">→ {item.line_note}</div>
        )}
        {item.is_bonus && item.bonus_reason && (
          <div className="text-[9px] ml-6 text-purple-500">({item.bonus_reason})</div>
        )}
      </div>
    )
  })

  return (
    <div className="min-h-screen bg-gray-200 py-4 px-3">
      {/* Ticket */}
      <div
        ref={ticketRef}
        className="max-w-xs mx-auto bg-white shadow-xl"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        {/* Zigzag top */}
        <div className="h-3" style={{
          backgroundImage: 'linear-gradient(135deg, #e5e7eb 33.33%, transparent 33.33%), linear-gradient(225deg, #e5e7eb 33.33%, transparent 33.33%)',
          backgroundSize: '10px 10px',
        }} />

        {/* Header */}
        <div className="px-4 pt-3 pb-1 text-center">
          {logoUrl && ticketCfg.showLogo && (
            <img src={logoUrl} alt="Logo" className="w-14 h-14 mx-auto mb-1 object-contain" />
          )}
          <div className="font-bold text-sm tracking-wide">{ticketCfg.header1}</div>
          {ticketCfg.header2 && <div className="text-[9px] text-gray-500">{ticketCfg.header2}</div>}
        </div>

        <div className="mx-4 border-t border-dashed border-gray-300" />

        {/* Datos del pedido */}
        <div className="px-4 py-2 text-[10px] space-y-0.5">
          <div className="flex justify-between">
            <span>Fecha: {formatDate(order.created_at)}</span>
            <span>Hora: {formatTime(order.created_at)}</span>
          </div>
          {order.order_number && (
            <div>Pedido: P-{String(order.order_number).padStart(3, '0')}</div>
          )}
          <div className="flex justify-between">
            <span className="font-bold text-sm">Mesa: {tableNumber}</span>
            <span>⏱️ {allDelivered ? `Total: ${timeAgo(order.created_at, totalTimeEnd)}` : `${timeAgo(order.created_at)} ...`}</span>
          </div>
          {order.dining_option && <div>Modalidad: {order.dining_option}</div>}
          {order.employee_name && <div>Atendió: {order.employee_name}</div>}
          {order.customer_name && order.customer_name !== 'POS' && (
            <div>Cliente: {order.customer_name}</div>
          )}
          {hasMultiPerson && <div>Personas: {maxPerson}</div>}
          {order.notes && <div>Nota: {order.notes}</div>}
        </div>

        {/* Status */}
        {isPaid && (
          <div className="mx-4 text-center font-bold text-[10px] bg-gray-100 py-1 border border-gray-300">
            ★ ★ ★  PAGADO  ★ ★ ★
          </div>
        )}
        {!isPaid && allDelivered && (
          <div className="mx-4 text-center font-bold text-[10px] bg-gray-100 py-1 border border-gray-300">
            ★ PEDIDO COMPLETO ★
          </div>
        )}

        <div className="mx-4 border-t border-dashed border-gray-300 mt-1" />

        {/* Items */}
        <div className="px-4 py-1">
          {hasMultiPerson ? (
            Array.from({ length: maxPerson }, (_, i) => i + 1).map((p) => {
              const personItems = order.items.filter((i) => (i.person_number ?? 1) === p)
              if (personItems.length === 0) return null
              return (
                <div key={p}>
                  <div className="text-[10px] text-gray-500 text-center my-1">-- P{p} --</div>
                  {renderItems(personItems)}
                </div>
              )
            })
          ) : (
            renderItems(order.items)
          )}
        </div>

        <div className="mx-4 border-t-2 border-dashed border-gray-400" />

        {/* Total */}
        <div className="px-4 py-2">
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL:</span>
            <span>${total.toLocaleString('es-AR')}</span>
          </div>
          {order.payment_method && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              Pago: {order.payment_method === 'Transferencia' ? 'TRANSFER' : order.payment_method === 'Mixto' ? 'MIXTO' : order.payment_method.toUpperCase()}
            </div>
          )}
        </div>

        <div className="mx-4 border-t border-dashed border-gray-300" />

        {/* Footer */}
        <div className="px-4 py-2 text-center text-[9px] text-gray-400">
          {ticketCfg.footer1 && <div>{ticketCfg.footer1}</div>}
          {ticketCfg.footer2 && <div>{ticketCfg.footer2}</div>}
          <div className="mt-1 text-gray-300">#{order.id.substring(0, 8).toUpperCase()}</div>
        </div>

        {/* Zigzag bottom */}
        <div className="h-3" style={{
          backgroundImage: 'linear-gradient(315deg, #e5e7eb 33.33%, transparent 33.33%), linear-gradient(45deg, #e5e7eb 33.33%, transparent 33.33%)',
          backgroundSize: '10px 10px',
        }} />
      </div>

      {/* Propina — fuera del ticket */}
      {order && (
        <div className="max-w-xs mx-auto mt-3 bg-white shadow-md p-4" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          <div className="text-center font-bold text-xs mb-2">¿Querés dejar propina?</div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setTipPercent(tipPercent === 10 ? null : 10); setShowTipInput(false); setCustomTip('') }}
              className={`flex-1 py-2 rounded text-xs font-bold transition-all border ${
                tipPercent === 10 ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              10%
              <div className="text-[9px] font-normal">${Math.round(total * 10 / 100).toLocaleString('es-AR')}</div>
            </button>
            <button
              onClick={() => { setTipPercent(null); setShowTipInput(!showTipInput) }}
              className={`flex-1 py-2 rounded text-xs font-bold transition-all border ${
                showTipInput ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
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
              placeholder="Monto"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-2 font-mono"
            />
          )}
          {tipAmount > 0 && (
            <button
              onClick={handleTip}
              disabled={tipLoading}
              className="block w-full bg-green-600 text-white text-center font-bold py-2 rounded text-xs disabled:opacity-50"
            >
              {tipLoading ? 'Procesando...' : `Dejar propina $${tipAmount.toLocaleString('es-AR')}`}
            </button>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="max-w-xs mx-auto mt-3 space-y-2 pb-6" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
        <button
          onClick={handleDownload}
          className="w-full bg-gray-800 text-white text-center font-bold py-2.5 rounded text-xs"
        >
          📥 DESCARGAR TICKET
        </button>
        <a
          href="/"
          className="block w-full bg-amber-600 text-white text-center font-bold py-2.5 rounded text-xs"
        >
          📋 VER MENÚ COMPLETO
        </a>
      </div>
    </div>
  )
}
