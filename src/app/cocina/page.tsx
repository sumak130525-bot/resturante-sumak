'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type KdsItem = {
  name: string
  quantity: number
  price: number
  modifiers?: string[]
}

type KdsOrder = {
  id: string
  source: 'WEB' | 'LOCAL'
  number: string
  customer: string
  status: string
  items: KdsItem[]
  total: number
  notes: string | null
  created_at: string
  orderNumber?: string
  diningOption?: string
  paymentMethod?: string
  tableNumber?: string
}

type FilterSource = 'ALL' | 'WEB' | 'LOCAL'
type ActiveTab = 'cocina' | 'entregados'

// ─── Colores por estado ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { border: string; badge: string; label: string; headerBg: string }> = {
  pending:   { border: 'border-yellow-400', badge: 'bg-yellow-400 text-yellow-900',  label: 'Pendiente',  headerBg: 'bg-yellow-500'  },
  confirmed: { border: 'border-blue-400',   badge: 'bg-blue-400 text-blue-900',      label: 'Confirmado', headerBg: 'bg-blue-600'    },
  ready:     { border: 'border-green-400',  badge: 'bg-green-400 text-green-900',    label: 'Listo',      headerBg: 'bg-green-600'   },
  delivered: { border: 'border-gray-500',   badge: 'bg-gray-500 text-white',         label: 'Entregado',  headerBg: 'bg-gray-600'    },
  cancelled: { border: 'border-red-600',    badge: 'bg-red-600 text-white',          label: 'Cancelado',  headerBg: 'bg-red-700'     },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(created_at: string): string {
  const diff = Math.floor((Date.now() - new Date(created_at).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function elapsedColor(created_at: string): string {
  const mins = (Date.now() - new Date(created_at).getTime()) / 60000
  if (mins < 10) return 'text-green-400'
  if (mins < 20) return 'text-yellow-400'
  return 'text-red-400'
}

function getOrderLabel(order: KdsOrder): string {
  if (order.source === 'LOCAL' && order.orderNumber) return order.orderNumber
  if (order.source === 'WEB' && order.tableNumber) return `MESA ${order.tableNumber}`
  if (order.source === 'WEB') return order.customer
  return order.number
}

// ─── Componente Card ──────────────────────────────────────────────────────────

function OrderCard({
  order,
  onDeliver,
  onRecover,
  isDelivered,
}: {
  order: KdsOrder
  onDeliver?: (id: string, source: 'WEB' | 'LOCAL') => void
  onRecover?: (id: string) => void
  isDelivered?: boolean
}) {
  const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending

  const diningBadge = order.diningOption
    ? {
        label: order.diningOption,
        cls: order.diningOption.toLowerCase().includes('llevar')
          ? 'bg-red-600 text-white'
          : 'bg-green-600 text-white',
      }
    : null

  const orderLabel = getOrderLabel(order)

  return (
    <div
      className={`relative flex flex-col bg-gray-900 rounded-2xl border-2 ${sc.border} shadow-xl overflow-hidden`}
    >
      {/* ── Cabecera con número de mesa GRANDE (estilo KDS Loyverse) ── */}
      <div className={`${sc.headerBg} px-4 pt-4 pb-3`}>
        {/* Número de orden grande y llamativo */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-white font-black text-5xl leading-none tracking-tight drop-shadow-lg">
              {orderLabel}
            </div>
            {/* Sub-info: cliente si es WEB con mesa */}
            {order.source === 'WEB' && order.tableNumber && (
              <div className="text-white/80 font-semibold text-sm mt-1 truncate">
                {order.customer}
              </div>
            )}
          </div>
          {/* Tiempo transcurrido */}
          <div className={`text-right text-sm font-mono font-bold shrink-0 ${elapsedColor(order.created_at)} bg-black/30 rounded-lg px-2 py-1`}>
            {elapsed(order.created_at)}
            <div className="text-white/50 text-xs font-normal">
              {new Date(order.created_at).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>

        {/* Badges: origen, estado, dining option, pago */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              order.source === 'WEB'
                ? 'bg-purple-900/80 text-purple-200'
                : 'bg-orange-900/80 text-orange-200'
            }`}
          >
            {order.source}
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/30 text-white/80">
            {order.number}
          </span>
          {diningBadge && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${diningBadge.cls}`}>
              {diningBadge.label}
            </span>
          )}
          {order.paymentMethod && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-black/30 text-white/70">
              {order.paymentMethod}
            </span>
          )}
        </div>
      </div>

      {/* ── Items ── */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-white">
              <span className="text-2xl font-black text-yellow-400 leading-none w-8 shrink-0">
                {item.quantity}×
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-base font-semibold leading-tight">{item.name}</span>
                {item.modifiers && item.modifiers.length > 0 && (
                  <span className="text-xs text-cyan-300 leading-snug mt-0.5">
                    {item.modifiers.join(' · ')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Notas */}
        {order.notes && (
          <p className="text-xs text-yellow-300 italic border-t border-gray-700 pt-2">
            Nota: {order.notes}
          </p>
        )}
      </div>

      {/* ── Botón de acción abajo ── */}
      <div className="px-4 pb-4">
        {isDelivered ? (
          onRecover && (
            <button
              onClick={() => onRecover(order.id)}
              className="w-full py-3 rounded-xl text-base font-bold bg-gray-700 text-gray-200 hover:bg-gray-600 active:scale-95 transition-all"
            >
              ↩ Recuperar
            </button>
          )
        ) : (
          onDeliver && (
            <button
              onClick={() => onDeliver(order.id, order.source)}
              className="w-full py-4 rounded-xl text-lg font-black bg-green-500 text-white hover:bg-green-400 active:scale-95 transition-all shadow-lg shadow-green-900/40 tracking-wide"
            >
              ENTREGADO
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CocinaPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([])
  const [deliveredOrders, setDeliveredOrders] = useState<KdsOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSource, setFilterSource] = useState<FilterSource>('ALL')
  const [activeTab, setActiveTab] = useState<ActiveTab>('cocina')
  const [lastCount, setLastCount] = useState(0)
  const audioRef = useRef<AudioContext | null>(null)
  const prevIdsRef = useRef<Set<string>>(new Set())

  // ── Sonido de notificación ──────────────────────────────────────────────────
  const playBeep = useCallback(() => {
    try {
      const ctx = audioRef.current ?? new AudioContext()
      audioRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.6, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {
      // ignorar
    }
  }, [])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/cocina/orders', { cache: 'no-store' })
      if (!res.ok) return
      const data: KdsOrder[] = await res.json()

      // Solo los no entregados van al estado activo
      setOrders(data)

      const newIds = new Set(data.map((o) => o.id))
      const incoming = data.filter((o) => !prevIdsRef.current.has(o.id))
      if (prevIdsRef.current.size > 0 && incoming.length > 0) {
        playBeep()
        setLastCount((c) => c + incoming.length)
      }
      prevIdsRef.current = newIds
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [playBeep])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 15_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('cocina-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  // ── Marcar como ENTREGADO ──────────────────────────────────────────────────
  const handleDeliver = useCallback(async (id: string, source: 'WEB' | 'LOCAL') => {
    // Encontrar el pedido
    const order = orders.find((o) => o.id === id)
    if (!order) return

    // Moverlo al historial local inmediatamente
    const deliveredOrder = { ...order, status: 'delivered' }
    setOrders((prev) => prev.filter((o) => o.id !== id))
    setDeliveredOrders((prev) => [deliveredOrder, ...prev])

    // Si es WEB, actualizar en Supabase
    if (source === 'WEB') {
      try {
        await fetch('/api/admin/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'delivered' }),
        })
      } catch {
        // Si falla, revertir
        setDeliveredOrders((prev) => prev.filter((o) => o.id !== id))
        setOrders((prev) => [order, ...prev])
      }
    }
    // Para LOCAL: solo se oculta de la vista (no se toca Loyverse)
  }, [orders])

  // ── Recuperar pedido desde historial ──────────────────────────────────────
  const handleRecover = useCallback((id: string) => {
    const order = deliveredOrders.find((o) => o.id === id)
    if (!order) return
    const recoveredOrder = { ...order, status: order.source === 'WEB' ? 'ready' : 'confirmed' }
    setDeliveredOrders((prev) => prev.filter((o) => o.id !== id))
    setOrders((prev) => [recoveredOrder, ...prev])

    // Si es WEB, actualizar en Supabase
    if (order.source === 'WEB') {
      fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'ready' }),
      }).catch(() => {})
    }
  }, [deliveredOrders])

  // ── Filtros ────────────────────────────────────────────────────────────────
  const activeOrders = orders.filter((o) => {
    if (filterSource !== 'ALL' && o.source !== filterSource) return false
    return true
  })

  const filteredDelivered = deliveredOrders.filter((o) => {
    if (filterSource !== 'ALL' && o.source !== filterSource) return false
    return true
  })

  const pendingCount = orders.filter((o) => o.status === 'pending').length

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      {/* ── Barra superior ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍳</span>
          <div>
            <h1 className="text-xl font-black leading-none">COCINA</h1>
            <p className="text-gray-400 text-xs">
              {activeTab === 'cocina' ? (
                <>
                  {activeOrders.length} pedidos activos
                  {pendingCount > 0 && (
                    <span className="ml-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-bold">
                      {pendingCount} pendientes
                    </span>
                  )}
                </>
              ) : (
                <>{filteredDelivered.length} entregados hoy</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          {lastCount > 0 && (
            <span
              className="bg-purple-700 text-white px-2 py-1 rounded-full text-xs font-bold cursor-pointer"
              onClick={() => setLastCount(0)}
            >
              +{lastCount} nuevos
            </span>
          )}
          <span>Actualiza cada 15s</span>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
      </header>

      {/* ── Tabs principales + Filtro de origen ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0 gap-3">
        {/* Tabs */}
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('cocina')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'cocina'
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            En cocina
            {orders.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab === 'cocina' ? 'bg-gray-900 text-white' : 'bg-gray-600 text-gray-200'}`}>
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('entregados')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'entregados'
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Entregados
            {deliveredOrders.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab === 'entregados' ? 'bg-gray-900 text-white' : 'bg-green-700 text-green-100'}`}>
                {deliveredOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Filtro origen + Refrescar */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            {(['ALL', 'WEB', 'LOCAL'] as FilterSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                className={`px-3 py-1 rounded-lg text-sm font-bold transition-all ${
                  filterSource === s
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'Todos' : s}
              </button>
            ))}
          </div>
          <button
            onClick={fetchOrders}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-all"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Contenido principal ── */}
      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === 'cocina' ? (
          loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400 text-xl animate-pulse">Cargando pedidos...</div>
            </div>
          ) : activeOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
              <span className="text-6xl">🍽️</span>
              <p className="text-xl font-semibold">Sin pedidos activos</p>
              <p className="text-sm">Los nuevos pedidos aparecen automáticamente</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onDeliver={handleDeliver}
                />
              ))}
            </div>
          )
        ) : (
          // ── Tab Entregados ──
          filteredDelivered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
              <span className="text-6xl">✅</span>
              <p className="text-xl font-semibold">Sin pedidos entregados aún</p>
              <p className="text-sm">Los pedidos marcados como entregados aparecen aquí</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredDelivered.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onRecover={handleRecover}
                  isDelivered
                />
              ))}
            </div>
          )
        )}
      </main>
    </div>
  )
}
