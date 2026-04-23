'use client'

import { useState, useEffect } from 'react'
import { cn, formatPrice } from '@/lib/utils'
import type { Order, OrderStatus } from '@/lib/types'

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string
    badgeClass: string
    borderClass: string
    headerBg: string
    dot: string
  }
> = {
  pending: {
    label: 'Pendiente',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-400',
    borderClass: 'border-yellow-400',
    headerBg: 'bg-yellow-50',
    dot: 'bg-yellow-400 animate-pulse',
  },
  confirmed: {
    label: 'Confirmado',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-400',
    borderClass: 'border-blue-400',
    headerBg: 'bg-blue-50',
    dot: 'bg-blue-400',
  },
  ready: {
    label: 'Listo',
    badgeClass: 'bg-green-100 text-green-800 border-green-400',
    borderClass: 'border-green-400',
    headerBg: 'bg-green-50',
    dot: 'bg-green-500',
  },
  delivered: {
    label: 'Entregado',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-300',
    borderClass: 'border-gray-300',
    headerBg: 'bg-gray-50',
    dot: 'bg-gray-400',
  },
  cancelled: {
    label: 'Cancelado',
    badgeClass: 'bg-red-100 text-red-700 border-red-300',
    borderClass: 'border-red-400',
    headerBg: 'bg-red-50',
    dot: 'bg-red-400',
  },
}

const NEXT_ACTION: Record<OrderStatus, { status: OrderStatus; label: string; btnClass: string } | null> = {
  pending:   { status: 'confirmed', label: 'Confirmar',   btnClass: 'bg-blue-500 hover:bg-blue-600 text-white' },
  confirmed: { status: 'ready',     label: 'Listo',       btnClass: 'bg-green-500 hover:bg-green-600 text-white' },
  ready:     { status: 'delivered', label: 'Entregado',   btnClass: 'bg-gray-700 hover:bg-gray-800 text-white' },
  delivered: null,
  cancelled: null,
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
  })
}

function getElapsedMinutes(isoString: string): number {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
}

function formatElapsed(isoString: string): string {
  const mins = getElapsedMinutes(isoString)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `hace ${h}h ${m}min` : `hace ${h}h`
}

/** Muestra alerta roja si el pedido está pendiente o confirmado y lleva >15 min */
function isOverdue(order: Order): boolean {
  return (
    (order.status === 'pending' || order.status === 'confirmed') &&
    getElapsedMinutes(order.created_at) > 15
  )
}

function ElapsedBadge({ createdAt, overdue }: { createdAt: string; overdue: boolean }) {
  const [label, setLabel] = useState(() => formatElapsed(createdAt))

  useEffect(() => {
    setLabel(formatElapsed(createdAt))
    const id = setInterval(() => setLabel(formatElapsed(createdAt)), 30_000)
    return () => clearInterval(id)
  }, [createdAt])

  return (
    <span
      className={cn(
        'text-xs font-semibold px-2 py-0.5 rounded-full',
        overdue
          ? 'bg-red-100 text-red-700 border border-red-400 animate-pulse'
          : 'bg-gray-100 text-gray-500'
      )}
    >
      {label}
    </span>
  )
}

interface OrderCardProps {
  order: Order
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
  isNew?: boolean
}

function OrderCard({ order, onUpdateStatus, isNew }: OrderCardProps) {
  const config = STATUS_CONFIG[order.status]
  const nextAction = NEXT_ACTION[order.status]
  const orderNum = order.id.slice(0, 6).toUpperCase()
  const overdue = isOverdue(order)

  return (
    <div
      className={cn(
        'bg-white rounded-2xl shadow-card-rest border-2 flex flex-col overflow-hidden transition-shadow hover:shadow-premium',
        overdue ? 'border-red-500' : config.borderClass,
        isNew && 'animate-scale-in ring-2 ring-sumak-gold ring-offset-2'
      )}
    >
      {/* Header de comanda */}
      <div className={cn('px-4 py-3 flex items-center justify-between gap-2', overdue ? 'bg-red-50' : config.headerBg)}>
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', overdue ? 'bg-red-500 animate-pulse' : config.dot)} />
          <span className="font-serif font-bold text-sumak-brown text-lg tracking-wide">
            #{orderNum}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ElapsedBadge createdAt={order.created_at} overdue={overdue} />
          {order.channel === 'whatsapp' ? (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-[#dcfce7] text-[#16a34a] border-[#86efac]">
              WHATSAPP
            </span>
          ) : (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-purple-50 text-purple-700 border-purple-300">
              WEB
            </span>
          )}
          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', config.badgeClass)}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Cliente */}
        <div className="border-b border-dashed border-gray-200 pb-3">
          <p className="font-bold text-sumak-brown text-base leading-tight">{order.customer_name}</p>
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              className="text-xs text-sumak-red hover:underline mt-0.5 inline-block"
            >
              {order.customer_phone}
            </a>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(order.created_at)} · {formatTime(order.created_at)}
          </p>
        </div>

        {/* Platos */}
        {order.order_items && order.order_items.length > 0 && (
          <div className="flex-1">
            <p className="text-xs font-semibold text-sumak-brown-light uppercase tracking-wider mb-2">
              Pedido
            </p>
            <ul className="space-y-1.5">
              {order.order_items.map((item) => (
                <li key={item.id} className="flex justify-between items-baseline text-sm">
                  <span className="text-gray-700 flex-1 pr-2">
                    <span className="font-bold text-sumak-red">{item.quantity}×</span>{' '}
                    {item.menu_items?.name ?? 'Plato'}
                  </span>
                  <span className="text-gray-500 text-xs flex-shrink-0">{formatPrice(item.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notas */}
        {order.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Nota:</span> {order.notes}
          </div>
        )}

        {/* Total */}
        <div className="border-t-2 border-dashed border-gray-200 pt-3 flex justify-between items-center">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total</span>
          <span className="font-serif font-bold text-sumak-red text-xl">
            {formatPrice(order.total)}
          </span>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        {nextAction && (
          <button
            onClick={() => onUpdateStatus(order.id, nextAction.status)}
            className={cn(
              'w-full py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95',
              nextAction.btnClass
            )}
          >
            {nextAction.label} →
          </button>
        )}
        {order.status !== 'cancelled' && order.status !== 'delivered' && (
          <button
            onClick={() => onUpdateStatus(order.id, 'cancelled')}
            className="w-full py-2 rounded-xl font-medium text-xs text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

interface OrdersTableProps {
  orders: Order[]
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
  newOrderIds?: Set<string>
  activeFilter: OrderStatus | 'all'
}

export function OrdersTable({ orders, onUpdateStatus, newOrderIds, activeFilter }: OrdersTableProps) {
  const filtered =
    activeFilter === 'all' ? orders : orders.filter((o) => o.status === activeFilter)

  if (filtered.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-5xl mb-4">🍽️</p>
        <p className="text-lg font-medium">
          {activeFilter === 'all' ? 'No hay pedidos aún.' : `Sin pedidos en estado "${STATUS_CONFIG[activeFilter].label}".`}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filtered.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onUpdateStatus={onUpdateStatus}
          isNew={newOrderIds?.has(order.id)}
        />
      ))}
    </div>
  )
}
