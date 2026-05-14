'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { OrdersTable } from '@/components/admin/OrdersTable'
import type { Order, OrderStatus } from '@/lib/types'
import {
  Bell,
  RefreshCw,
  Calendar,
  SlidersHorizontal,
  Download,
  ChevronDown,
  X,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterOption = OrderStatus | 'all'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_TABS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'ready', label: 'Listos' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Cancelados' },
]

const TAB_ACTIVE: Record<FilterOption, string> = {
  all: 'bg-sumak-brown text-white border-sumak-brown',
  pending: 'bg-red-500 text-white border-red-500',
  confirmed: 'bg-orange-500 text-white border-orange-500',
  ready: 'bg-blue-500 text-white border-blue-500',
  delivered: 'bg-green-600 text-white border-green-600',
  cancelled: 'bg-gray-500 text-white border-gray-500',
}

const CHANNEL_OPTIONS = [
  { value: 'web', label: '🌐 Web' },
  { value: 'pos', label: '📱 POS' },
  { value: 'whatsapp', label: '💬 WhatsApp' },
]

const PAYMENT_OPTIONS = [
  { value: 'cash', label: '💵 Efectivo' },
  { value: 'transfer', label: '💳 Transferencia' },
  { value: 'mercadopago', label: '💳 MercadoPago' },
  { value: 'mixed', label: '🔄 Mixto' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toArgentinaDateStr(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-') // YYYY-MM-DD
}

function todayAR(): string {
  return toArgentinaDateStr(new Date())
}

function isOnDate(isoString: string, dateStr: string): boolean {
  const d = new Date(isoString)
  const local = d.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-')
  return local === dateStr
}

function playNotificationBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const playTone = (freq: number, start: number, duration: number, volume = 0.3) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration + 0.05)
    }
    playTone(880, 0, 0.15)
    playTone(1100, 0.18, 0.15)
    playTone(1320, 0.36, 0.25)
  } catch { /* silently ignore */ }
}

function exportToCSV(orders: Order[], filename: string) {
  const headers = ['ID', 'Hora', 'Cliente', 'Mesa', 'Canal', 'Estado', 'Items', 'Total', 'Pago', 'Notas']
  const rows = orders.map((o) => {
    const items = o.order_items?.map((i) => `${i.quantity}x ${i.menu_items?.name ?? ''}`).join('; ') ?? ''
    const mesa = o.table_number ?? o.mesa ?? ''
    const hora = new Date(o.created_at).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    })
    return [
      o.id.slice(0, 6).toUpperCase(),
      hora,
      o.customer_name,
      mesa,
      o.channel ?? 'web',
      o.status,
      String(o.order_items?.reduce((s, i) => s + i.quantity, 0) ?? 0),
      String(o.total),
      o.payment_method ?? '',
      (o.notes ?? '').replace(/,/g, ';'),
    ].map((v) => `"${v}"`).join(',')
  })
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Filter Modal ─────────────────────────────────────────────────────────────

interface FilterState {
  channels: string[]
  payments: string[]
  timeFrom: string
  timeTo: string
}

interface FilterModalProps {
  filters: FilterState
  onApply: (f: FilterState) => void
  onClose: () => void
}

function FilterModal({ filters, onApply, onClose }: FilterModalProps) {
  const [local, setLocal] = useState<FilterState>({ ...filters })

  function toggleArr(key: 'channels' | 'payments', val: string) {
    setLocal((prev) => {
      const arr = prev[key]
      return {
        ...prev,
        [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val],
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Filtros avanzados</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {/* Canales */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Canal</p>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => toggleArr('channels', c.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg border transition-all',
                    local.channels.includes(c.value)
                      ? 'bg-sumak-brown text-white border-sumak-brown'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Métodos de pago */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Método de pago</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => toggleArr('payments', p.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg border transition-all',
                    local.payments.includes(p.value)
                      ? 'bg-sumak-brown text-white border-sumak-brown'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rango de hora */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rango de hora</p>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={local.timeFrom}
                onChange={(e) => setLocal((p) => ({ ...p, timeFrom: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              />
              <span className="text-gray-400 text-sm">–</span>
              <input
                type="time"
                value={local.timeTo}
                onChange={(e) => setLocal((p) => ({ ...p, timeTo: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={() => onApply({ channels: [], payments: [], timeFrom: '', timeTo: '' })}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Limpiar
          </button>
          <button
            onClick={() => onApply(local)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-sumak-brown text-white hover:bg-sumak-brown/90 transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({ onExportCSV }: { onExportCSV: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-colors"
      >
        <Download size={14} />
        Exportar
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[150px]">
            <button
              onClick={() => { onExportCSV(); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Download size={13} />
              Descargar CSV
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const { orders, loading, newOrderCount, resetNewCount, refetch } = useOrdersRealtime()
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all')
  const [selectedDate, setSelectedDate] = useState<string>(todayAR())
  const [showFilters, setShowFilters] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    channels: [],
    payments: [],
    timeFrom: '',
    timeTo: '',
  })
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)

  // Detect new orders for sound + highlight
  useEffect(() => {
    if (loading) return
    const currentIds = new Set(orders.map((o) => o.id))
    if (isFirstLoad.current) {
      prevOrderIdsRef.current = currentIds
      isFirstLoad.current = false
      return
    }
    const incoming = orders.filter((o) => !prevOrderIdsRef.current.has(o.id))
    if (incoming.length > 0) {
      playNotificationBeep()
      const incomingIds = new Set(incoming.map((o) => o.id))
      setNewOrderIds((prev) => {
        const merged = new Set<string>(prev)
        incomingIds.forEach((id) => merged.add(id))
        return merged
      })
      setTimeout(() => {
        setNewOrderIds((prev) => {
          const next = new Set(prev)
          incomingIds.forEach((id) => next.delete(id))
          return next
        })
      }, 8000)
    }
    prevOrderIdsRef.current = currentIds
  }, [orders, loading])

  const handleUpdateStatus = useCallback(async (id: string, status: OrderStatus) => {
    const res = await fetch('/api/admin/orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error ?? 'Error al actualizar estado')
    }
  }, [])

  // Filtered orders
  const filteredByDate = useMemo(
    () => orders.filter((o) => isOnDate(o.created_at, selectedDate)),
    [orders, selectedDate]
  )

  const filteredOrders = useMemo(() => {
    let list = filteredByDate
    if (advancedFilters.channels.length > 0) {
      list = list.filter((o) => advancedFilters.channels.includes(o.channel ?? 'web'))
    }
    if (advancedFilters.payments.length > 0) {
      list = list.filter((o) => advancedFilters.payments.includes(o.payment_method ?? 'cash'))
    }
    if (advancedFilters.timeFrom || advancedFilters.timeTo) {
      list = list.filter((o) => {
        const t = new Date(o.created_at).toLocaleTimeString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        if (advancedFilters.timeFrom && t < advancedFilters.timeFrom) return false
        if (advancedFilters.timeTo && t > advancedFilters.timeTo) return false
        return true
      })
    }
    return list
  }, [filteredByDate, advancedFilters])

  // Counts per status (from filteredOrders)
  const countByStatus = useMemo(
    () =>
      filteredOrders.reduce<Record<string, number>>((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1
        acc['all'] = (acc['all'] ?? 0) + 1
        return acc
      }, {}),
    [filteredOrders]
  )

  const activeFilterCount =
    advancedFilters.channels.length + advancedFilters.payments.length +
    (advancedFilters.timeFrom ? 1 : 0) + (advancedFilters.timeTo ? 1 : 0)

  // Total de pedidos filtrados (según tab activo)
  const filteredTotal = useMemo(() => {
    const list = activeFilter === 'all'
      ? filteredOrders
      : filteredOrders.filter((o) => o.status === activeFilter)
    return list.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
  }, [filteredOrders, activeFilter])

  const formattedTotal = filteredTotal.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  function handleExportCSV() {
    const list = activeFilter === 'all'
      ? filteredOrders
      : filteredOrders.filter((o) => o.status === activeFilter)
    const dateLabel = selectedDate.replace(/-/g, '')
    const statusLabel = activeFilter === 'all' ? 'todos' : activeFilter
    exportToCSV(list, `pedidos_${dateLabel}_${statusLabel}.csv`)
  }

  return (
    <AdminLayoutClient active="orders">
      <div className="pb-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Pedidos</h1>
            {newOrderCount > 0 && (
              <button
                onClick={resetNewCount}
                className="flex items-center gap-2 bg-sumak-gold text-sumak-brown text-sm font-bold px-3 py-1.5 rounded-full animate-pulse"
              >
                <Bell size={14} />
                {newOrderCount} nuevo{newOrderCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-brown transition-colors border border-gray-200 rounded-lg px-3 py-2 bg-white"
            >
              <RefreshCw size={14} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Realtime indicator */}
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 px-4 py-2 rounded-lg mb-5 w-fit">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Tiempo real activado
        </div>

        {/* Toolbar: tabs + date + actions */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {STATUS_TABS.map((tab) => {
              const count = countByStatus[tab.value] ?? 0
              const isActive = activeFilter === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveFilter(tab.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all whitespace-nowrap',
                    isActive
                      ? TAB_ACTIVE[tab.value]
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center',
                      isActive ? 'bg-white/25 text-current' : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* Total indicator */}
            <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="text-xs text-green-600 font-medium">Total</span>
              <span className="text-sm font-bold text-green-700">${formattedTotal}</span>
            </div>

            {/* Date picker */}
            <div className="relative flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent focus:outline-none text-sm text-gray-700 w-[120px] cursor-pointer"
              />
            </div>

            {/* Filters button */}
            <button
              onClick={() => setShowFilters(true)}
              className={cn(
                'flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2 transition-colors',
                activeFilterCount > 0
                  ? 'bg-sumak-brown text-white border-sumak-brown'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              )}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-white/25 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Export */}
            <ExportDropdown onExportCSV={handleExportCSV} />
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-gray-400">Filtros activos:</span>
            {advancedFilters.channels.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 text-xs bg-sumak-brown/10 text-sumak-brown px-2 py-1 rounded-full"
              >
                Canal: {c}
                <button
                  onClick={() =>
                    setAdvancedFilters((p) => ({ ...p, channels: p.channels.filter((v) => v !== c) }))
                  }
                  className="hover:text-red-600"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {advancedFilters.payments.map((pm) => (
              <span
                key={pm}
                className="inline-flex items-center gap-1 text-xs bg-sumak-brown/10 text-sumak-brown px-2 py-1 rounded-full"
              >
                Pago: {pm}
                <button
                  onClick={() =>
                    setAdvancedFilters((p) => ({ ...p, payments: p.payments.filter((v) => v !== pm) }))
                  }
                  className="hover:text-red-600"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {(advancedFilters.timeFrom || advancedFilters.timeTo) && (
              <span className="inline-flex items-center gap-1 text-xs bg-sumak-brown/10 text-sumak-brown px-2 py-1 rounded-full">
                Hora: {advancedFilters.timeFrom || '00:00'} – {advancedFilters.timeTo || '23:59'}
                <button
                  onClick={() =>
                    setAdvancedFilters((p) => ({ ...p, timeFrom: '', timeTo: '' }))
                  }
                  className="hover:text-red-600"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            <button
              onClick={() =>
                setAdvancedFilters({ channels: [], payments: [], timeFrom: '', timeTo: '' })
              }
              className="text-xs text-gray-400 hover:text-red-500 underline"
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* Orders list */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3 animate-bounce">🍽️</p>
            <p>Cargando pedidos...</p>
          </div>
        ) : (
          <OrdersTable
            orders={filteredOrders}
            onUpdateStatus={handleUpdateStatus}
            newOrderIds={newOrderIds}
            activeFilter={activeFilter}
          />
        )}

        {/* Filter Modal */}
        {showFilters && (
          <FilterModal
            filters={advancedFilters}
            onApply={(f) => { setAdvancedFilters(f); setShowFilters(false) }}
            onClose={() => setShowFilters(false)}
          />
        )}
      </div>
    </AdminLayoutClient>
  )
}
