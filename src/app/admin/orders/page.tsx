'use client'

import { useCallback } from 'react'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { OrdersTable } from '@/components/admin/OrdersTable'
import type { OrderStatus } from '@/lib/types'
import { Bell, RefreshCw } from 'lucide-react'

export default function AdminOrdersPage() {
  const { orders, loading, newOrderCount, resetNewCount, refetch } = useOrdersRealtime()

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

  return (
    <AdminLayoutClient active="orders">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Pedidos</h1>
            {newOrderCount > 0 && (
              <button
                onClick={resetNewCount}
                className="flex items-center gap-2 bg-sumak-gold text-sumak-brown text-sm font-bold px-3 py-1.5 rounded-full pulse-gold"
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

        {/* Info tiempo real */}
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-4 py-2 rounded-lg mb-6 w-fit">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Actualización automática activada — los pedidos aparecen aquí en tiempo real
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando pedidos...</div>
        ) : (
          <OrdersTable orders={orders} onUpdateStatus={handleUpdateStatus} />
        )}
      </div>
    </AdminLayoutClient>
  )
}
