'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { OrdersTable } from '@/components/admin/OrdersTable'
import type { OrderStatus } from '@/lib/types'
import { Bell, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type FilterOption = OrderStatus | 'all'

const FILTERS: { value: FilterOption; label: string; activeClass: string }[] = [
  { value: 'all',       label: 'Todos',      activeClass: 'bg-sumak-brown text-white' },
  { value: 'pending',   label: 'Pendientes', activeClass: 'bg-yellow-400 text-yellow-900' },
  { value: 'confirmed', label: 'Confirmados',activeClass: 'bg-blue-500 text-white' },
  { value: 'ready',     label: 'Listos',     activeClass: 'bg-green-500 text-white' },
  { value: 'delivered', label: 'Entregados', activeClass: 'bg-gray-500 text-white' },
  { value: 'cancelled', label: 'Cancelados', activeClass: 'bg-red-500 text-white' },
]

/** Genera un beep de notificación usando Web Audio API */
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

    playTone(880, 0,    0.15)
    playTone(1100, 0.18, 0.15)
    playTone(1320, 0.36, 0.25)
  } catch {
    // silently ignore if audio is blocked
  }
}

export default function AdminOrdersPage() {
  const { orders, loading, newOrderCount, resetNewCount, refetch } = useOrdersRealtime()
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all')
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)

  // Detectar pedidos nuevos para el efecto y el sonido
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
        const merged = new Set<string>()
        prev.forEach((id) => merged.add(id))
        incomingIds.forEach((id) => merged.add(id))
        return merged
      })
      // Quitar el highlight después de 8 segundos
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

  // Conteo por estado para mostrar en filtros
  const countByStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    acc['all'] = (acc['all'] ?? 0) + 1
    return acc
  }, {})

  return (
    <AdminLayoutClient active="orders">
      <div className="pb-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Comandas</h1>
            {newOrderCount > 0 && (
              <button
                onClick={resetNewCount}
                className="flex items-center gap-2 bg-sumak-gold text-sumak-brown text-sm font-bold px-3 py-1.5 rounded-full animate-pulse-ring"
              >
                <Bell size={14} />
                {newOrderCount} nuevo{newOrderCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <button
            onClick={refetch}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {/* Indicador realtime */}
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 px-4 py-2 rounded-lg mb-5 w-fit">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Tiempo real activado — los pedidos aparecen automáticamente
        </div>

        {/* Filtros por estado */}
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map((f) => {
            const count = countByStatus[f.value] ?? 0
            const isActive = activeFilter === f.value
            return (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                  isActive
                    ? cn(f.activeClass, 'border-transparent shadow-sm')
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {f.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.2rem] text-center',
                      isActive ? 'bg-white/30' : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Grid de comandas */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3 animate-float">🍽️</p>
            <p>Cargando pedidos...</p>
          </div>
        ) : (
          <OrdersTable
            orders={orders}
            onUpdateStatus={handleUpdateStatus}
            newOrderIds={newOrderIds}
            activeFilter={activeFilter}
          />
        )}
      </div>
    </AdminLayoutClient>
  )
}
