'use client'

import { cn, formatPrice } from '@/lib/utils'
import type { Order, OrderStatus } from '@/lib/types'

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; next: OrderStatus | null }
> = {
  pending: {
    label: 'Pendiente',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    next: 'confirmed',
  },
  confirmed: {
    label: 'Confirmado',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    next: 'ready',
  },
  ready: {
    label: 'Listo',
    color: 'bg-green-100 text-green-800 border-green-300',
    next: 'delivered',
  },
  delivered: {
    label: 'Entregado',
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    next: null,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-700 border-red-300',
    next: null,
  },
}

interface OrdersTableProps {
  orders: Order[]
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
}

export function OrdersTable({ orders, onUpdateStatus }: OrdersTableProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p>No hay pedidos aún.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const config = STATUS_CONFIG[order.status]
        return (
          <div
            key={order.id}
            className={cn(
              'bg-white rounded-2xl shadow-sm border-l-4 p-5',
              order.status === 'pending' && 'border-yellow-400',
              order.status === 'confirmed' && 'border-blue-400',
              order.status === 'ready' && 'border-green-400',
              order.status === 'delivered' && 'border-gray-300',
              order.status === 'cancelled' && 'border-red-400'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              {/* Info principal */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sumak-brown">{order.customer_name}</span>
                  {order.customer_phone && (
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="text-xs text-sumak-red hover:underline"
                    >
                      {order.customer_phone}
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleString('es-CO')} •{' '}
                  #{order.id.slice(0, 8).toUpperCase()}
                </p>
                {order.notes && (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-1 mt-2 inline-block">
                    📝 {order.notes}
                  </p>
                )}
              </div>

              {/* Estado y acciones */}
              <div className="flex flex-col items-end gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold px-3 py-1 rounded-full border',
                    config.color
                  )}
                >
                  {config.label}
                </span>
                <div className="flex gap-2">
                  {config.next && (
                    <button
                      onClick={() => onUpdateStatus(order.id, config.next!)}
                      className="text-xs bg-sumak-brown text-white px-3 py-1.5 rounded-lg hover:bg-sumak-red transition-colors font-medium"
                    >
                      → {STATUS_CONFIG[config.next].label}
                    </button>
                  )}
                  {order.status !== 'cancelled' && order.status !== 'delivered' && (
                    <button
                      onClick={() => onUpdateStatus(order.id, 'cancelled')}
                      className="text-xs border border-red-300 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Items del pedido */}
            {order.order_items && order.order_items.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm text-gray-600">
                      <span>
                        {item.menu_items?.name ?? 'Plato'} × {item.quantity}
                      </span>
                      <span className="font-medium">{formatPrice(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                  <span className="font-bold text-sumak-red">
                    Total: {formatPrice(order.total)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
