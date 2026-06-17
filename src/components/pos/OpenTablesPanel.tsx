'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { UtensilsCrossed, Clock, ChefHat, X, DollarSign, Trash2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpenTable = {
  order_id: string
  table_number: number
  opened_at: string
  total: number
  notes: string | null
  item_count: number
  items_pending_kitchen: number
}

type OpenTablesPanelProps = {
  onSelectTable: (table: OpenTable) => void
  onClose: () => void
  onCloseTable?: (orderId: string, tableNumber: number) => void
  onCancelTable?: (orderId: string, tableNumber: number) => void
  refreshTrigger?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}

function formatARS(n: number) {
  return '$' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function OpenTablesPanel({ onSelectTable, onClose, onCloseTable, onCancelTable, refreshTrigger }: OpenTablesPanelProps) {
  const [tables, setTables] = useState<OpenTable[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/orders/open-tables')
      if (!res.ok) return
      const data = await res.json()
      setTables(data.tables ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchTables()
  }, [fetchTables, refreshTrigger])

  // Refresca cada 30s
  useEffect(() => {
    const id = setInterval(fetchTables, 30_000)
    return () => clearInterval(id)
  }, [fetchTables])

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Overlay */}
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Cerrar"
      />

      {/* Panel */}
      <div className="relative ml-auto h-full w-80 bg-gray-900 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <UtensilsCrossed size={20} className="text-amber-400" />
            <h2 className="text-white font-bold text-base">Mesas abiertas</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <div className="w-6 h-6 border-2 border-gray-500 border-t-amber-400 rounded-full animate-spin" />
            </div>
          )}

          {!loading && tables.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
              <UtensilsCrossed size={40} className="opacity-40" />
              <p className="text-sm">No hay mesas abiertas</p>
            </div>
          )}

          {tables.map((table) => (
            <div
              key={table.order_id}
              className={cn(
                'w-full text-left rounded-xl overflow-hidden',
                'bg-gray-800 border border-gray-700',
              )}
            >
              {/* Main card row — click to load */}
              <button
                onClick={() => { onSelectTable(table); onClose() }}
                className="w-full text-left px-3 pt-3 pb-2 hover:bg-gray-700 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-lg">Mesa {table.table_number}</span>
                    <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
                      ABIERTA
                    </span>
                  </div>
                  <span className="text-white font-semibold">{formatARS(table.total)}</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatElapsed(table.opened_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <UtensilsCrossed size={12} />
                    {table.item_count} items
                  </span>
                  {table.items_pending_kitchen > 0 && (
                    <span className="flex items-center gap-1 text-orange-400 font-semibold">
                      <ChefHat size={12} />
                      {table.items_pending_kitchen} sin enviar
                    </span>
                  )}
                </div>

                {table.notes && (
                  <p className="mt-1.5 text-xs text-gray-500 truncate">{table.notes}</p>
                )}
              </button>

              {/* Action buttons */}
              {(onCloseTable || onCancelTable) && (
                <div className="flex border-t border-gray-700">
                  {onCloseTable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCloseTable(table.order_id, table.table_number); onClose() }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-green-400 hover:bg-green-900/40 transition-colors"
                      title="Cobrar mesa"
                    >
                      <DollarSign size={13} />
                      Cobrar
                    </button>
                  )}
                  {onCloseTable && onCancelTable && (
                    <div className="w-px bg-gray-700" />
                  )}
                  {onCancelTable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCancelTable(table.order_id, table.table_number); onClose() }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-red-400 hover:bg-red-900/40 transition-colors"
                      title="Cancelar mesa"
                    >
                      <Trash2 size={13} />
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
