'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn, formatPrice } from '@/lib/utils'
import type { Order, OrderStatus } from '@/lib/types'
import {
  Eye,
  Printer,
  MoreHorizontal,
  Clock,
  X,
  Globe,
  Smartphone,
  MessageCircle,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  ChevronDown,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; badgeClass: string; borderColor: string; dotClass: string }
> = {
  pending: {
    label: 'Pendiente',
    badgeClass: 'bg-red-100 text-red-700 border border-red-300',
    borderColor: 'border-l-red-500',
    dotClass: 'bg-red-500 animate-pulse',
  },
  confirmed: {
    label: 'Confirmado',
    badgeClass: 'bg-orange-100 text-orange-700 border border-orange-300',
    borderColor: 'border-l-orange-400',
    dotClass: 'bg-orange-400',
  },
  ready: {
    label: 'Listo',
    badgeClass: 'bg-blue-100 text-blue-700 border border-blue-300',
    borderColor: 'border-l-blue-500',
    dotClass: 'bg-blue-500',
  },
  delivered: {
    label: 'Entregado',
    badgeClass: 'bg-green-100 text-green-700 border border-green-300',
    borderColor: 'border-l-green-500',
    dotClass: 'bg-green-500',
  },
  cancelled: {
    label: 'Cancelado',
    badgeClass: 'bg-gray-100 text-gray-500 border border-gray-300',
    borderColor: 'border-l-gray-400',
    dotClass: 'bg-gray-400',
  },
}

const NEXT_ACTION: Record<OrderStatus, { status: OrderStatus; label: string } | null> = {
  pending: { status: 'confirmed', label: 'Confirmar' },
  confirmed: { status: 'ready', label: 'Marcar listo' },
  ready: { status: 'delivered', label: 'Entregar' },
  delivered: null,
  cancelled: null,
}

function formatTimeAR(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function getElapsedMinutes(isoString: string): number {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
}

function formatElapsed(isoString: string): string {
  const mins = getElapsedMinutes(isoString)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function isOverdue(order: Order): boolean {
  return (
    (order.status === 'pending' || order.status === 'confirmed') &&
    getElapsedMinutes(order.created_at) > 15
  )
}

function buildItemsSummary(order: Order): string {
  if (!order.order_items || order.order_items.length === 0) return '—'
  return order.order_items
    .map((item) => `${item.quantity}x ${item.menu_items?.name ?? 'Plato'}`)
    .join(', ')
}

function getTableLabel(order: Order): string {
  const t = order.table_number ?? order.mesa ?? null
  if (!t) return '—'
  const str = String(t)
  const num = str.replace(/[^\d]/g, '')
  return num ? `Mesa ${num}` : str
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ElapsedCell({ createdAt, overdue }: { createdAt: string; overdue: boolean }) {
  const [label, setLabel] = useState(() => formatElapsed(createdAt))

  useEffect(() => {
    setLabel(formatElapsed(createdAt))
    const id = setInterval(() => setLabel(formatElapsed(createdAt)), 30_000)
    return () => clearInterval(id)
  }, [createdAt])

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        overdue ? 'text-red-600 font-bold' : 'text-gray-500'
      )}
    >
      <Clock size={11} className={overdue ? 'text-red-500' : 'text-gray-400'} />
      {label}
    </span>
  )
}

function ChannelBadge({ channel }: { channel?: string | null }) {
  if (channel === 'pos') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
        <Smartphone size={10} />
        POS
      </span>
    )
  }
  if (channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
        <MessageCircle size={10} />
        WA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
      <Globe size={10} />
      WEB
    </span>
  )
}

function PaymentBadge({ method }: { method?: string | null }) {
  if (method === 'transfer' || method === 'mercadopago') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-purple-700">
        <CreditCard size={11} />
        <span className="hidden lg:inline">Transferencia</span>
      </span>
    )
  }
  if (method === 'mixed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
        <ArrowLeftRight size={11} />
        <span className="hidden lg:inline">Mixto</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
      <Banknote size={11} />
      <span className="hidden lg:inline">Efectivo</span>
    </span>
  )
}

// ─── Order Detail Modal ──────────────────────────────────────────────────────

interface OrderDetailModalProps {
  order: Order
  onClose: () => void
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
}

function OrderDetailModal({ order, onClose, onUpdateStatus }: OrderDetailModalProps) {
  const config = STATUS_CONFIG[order.status]
  const nextAction = NEXT_ACTION[order.status]
  const overdue = isOverdue(order)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            'px-5 py-4 flex items-center justify-between',
            overdue ? 'bg-red-50' : 'bg-gray-50'
          )}
        >
          <div className="flex items-center gap-3">
            <span className={cn('w-3 h-3 rounded-full', config.dotClass)} />
            <span className="font-serif font-bold text-sumak-brown text-lg">
              #{order.id.slice(0, 6).toUpperCase()}
            </span>
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', config.badgeClass)}>
              {config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Cliente</p>
              <p className="font-medium text-gray-800">{order.customer_name}</p>
              {order.customer_phone && (
                <a href={`tel:${order.customer_phone}`} className="text-xs text-sumak-red hover:underline">
                  {order.customer_phone}
                </a>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Mesa</p>
              <p className="font-medium text-gray-800">{getTableLabel(order)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Hora</p>
              <p className="font-medium text-gray-800">{formatTimeAR(order.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Canal / Pago</p>
              <div className="flex items-center gap-2 flex-wrap">
                <ChannelBadge channel={order.channel} />
                <PaymentBadge method={order.payment_method} />
              </div>
            </div>
          </div>

          {/* Items */}
          {order.order_items && order.order_items.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Pedido</p>
              <ul className="space-y-1.5 border border-gray-100 rounded-xl p-3 bg-gray-50">
                {order.order_items.map((item) => (
                  <li key={item.id} className="flex justify-between items-baseline text-sm">
                    <span className="text-gray-700">
                      <span className="font-bold text-sumak-red">{item.quantity}×</span>{' '}
                      {item.menu_items?.name ?? 'Plato'}
                    </span>
                    <span className="text-gray-500 text-xs">{formatPrice(item.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-800">
              <span className="font-semibold">Nota:</span> {order.notes}
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center border-t pt-3">
            <span className="text-sm text-gray-500 font-medium">Total</span>
            <span className="font-serif font-bold text-sumak-red text-2xl">
              {formatPrice(order.total)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {nextAction && (
              <button
                onClick={() => { onUpdateStatus(order.id, nextAction.status); onClose() }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-sumak-brown text-white hover:bg-sumak-brown/90 transition-all"
              >
                {nextAction.label} →
              </button>
            )}
            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <button
                onClick={() => { onUpdateStatus(order.id, 'cancelled'); onClose() }}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── More Actions Dropdown ───────────────────────────────────────────────────

interface MoreActionsProps {
  order: Order
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
}

function MoreActionsDropdown({ order, onUpdateStatus }: MoreActionsProps) {
  const [open, setOpen] = useState(false)

  const statuses: { status: OrderStatus; label: string }[] = [
    { status: 'pending', label: 'Pendiente' },
    { status: 'confirmed', label: 'Confirmado' },
    { status: 'ready', label: 'Listo' },
    { status: 'delivered', label: 'Entregado' },
    { status: 'cancelled', label: 'Cancelado' },
  ]

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Más opciones"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[140px]">
            {statuses
              .filter((s) => s.status !== order.status)
              .map((s) => (
                <button
                  key={s.status}
                  onClick={(e) => {
                    e.stopPropagation()
                    onUpdateStatus(order.id, s.status)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[s.status].dotClass)} />
                  {s.label}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Row Component ───────────────────────────────────────────────────────────

interface OrderRowProps {
  order: Order
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
  isNew?: boolean
}

function OrderRow({ order, onUpdateStatus, isNew }: OrderRowProps) {
  const [showDetail, setShowDetail] = useState(false)
  const config = STATUS_CONFIG[order.status]
  const overdue = isOverdue(order)
  const totalItems = order.order_items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0
  const summary = buildItemsSummary(order)
  const tableLabel = getTableLabel(order)

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className={cn(
          'flex items-center gap-0 bg-white border-l-4 rounded-r-xl shadow-sm hover:shadow-md transition-all cursor-pointer group',
          config.borderColor,
          overdue && 'border-l-red-500',
          isNew && 'ring-2 ring-sumak-gold ring-offset-1 animate-scale-in'
        )}
      >
        {/* Pedido */}
        <div className="w-[100px] flex-shrink-0 px-3 py-3">
          <p className="font-mono font-bold text-[13px] text-sumak-brown leading-tight">
            #{order.id.slice(0, 6).toUpperCase()}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{formatTimeAR(order.created_at)}</p>
        </div>

        {/* Resumen */}
        <div className="flex-1 min-w-0 px-3 py-3">
          <p className="text-[12px] text-gray-700 leading-snug line-clamp-2">{summary}</p>
          {order.notes && (
            <p className="text-[11px] text-amber-600 mt-0.5 truncate">
              Nota: {order.notes}
            </p>
          )}
        </div>

        {/* Mesa */}
        <div className="w-[80px] flex-shrink-0 px-2 py-3 hidden sm:block">
          <p className="text-[12px] text-gray-700 truncate">{tableLabel}</p>
        </div>

        {/* Canal */}
        <div className="w-[72px] flex-shrink-0 px-2 py-3 hidden md:flex items-center">
          <ChannelBadge channel={order.channel} />
        </div>

        {/* Estado */}
        <div className="w-[100px] flex-shrink-0 px-2 py-3 hidden lg:flex items-center">
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', config.badgeClass)}>
            {config.label}
          </span>
        </div>

        {/* Items */}
        <div className="w-[50px] flex-shrink-0 px-2 py-3 hidden xl:block text-center">
          <span className="text-[12px] font-semibold text-gray-600">{totalItems}</span>
        </div>

        {/* Total */}
        <div className="w-[90px] flex-shrink-0 px-3 py-3 text-right">
          <span className="text-[13px] font-bold text-green-700">{formatPrice(order.total)}</span>
        </div>

        {/* Pago */}
        <div className="w-[60px] flex-shrink-0 px-2 py-3 hidden xl:flex items-center justify-center">
          <PaymentBadge method={order.payment_method} />
        </div>

        {/* Tiempo */}
        <div className="w-[72px] flex-shrink-0 px-2 py-3 hidden md:flex items-center">
          <ElapsedCell createdAt={order.created_at} overdue={overdue} />
        </div>

        {/* Acciones */}
        <div
          className="w-[80px] flex-shrink-0 px-2 py-3 flex items-center justify-end gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowDetail(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-gray-100 transition-colors"
            title="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={() => window.print()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-gray-100 transition-colors hidden xl:inline-flex"
            title="Imprimir"
          >
            <Printer size={15} />
          </button>
          <MoreActionsDropdown order={order} onUpdateStatus={onUpdateStatus} />
        </div>
      </div>

      {showDetail && (
        <OrderDetailModal
          order={order}
          onClose={() => setShowDetail(false)}
          onUpdateStatus={onUpdateStatus}
        />
      )}
    </>
  )
}

// ─── Table Header ────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div className="flex items-center gap-0 px-0 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 mb-1">
      <div className="w-[100px] flex-shrink-0 px-3">Pedido</div>
      <div className="flex-1 min-w-0 px-3">Resumen</div>
      <div className="w-[80px] flex-shrink-0 px-2 hidden sm:block">Mesa</div>
      <div className="w-[72px] flex-shrink-0 px-2 hidden md:block">Canal</div>
      <div className="w-[100px] flex-shrink-0 px-2 hidden lg:block">Estado</div>
      <div className="w-[50px] flex-shrink-0 px-2 hidden xl:block text-center">Items</div>
      <div className="w-[90px] flex-shrink-0 px-3 text-right">Total</div>
      <div className="w-[60px] flex-shrink-0 px-2 hidden xl:block text-center">Pago</div>
      <div className="w-[72px] flex-shrink-0 px-2 hidden md:block">Tiempo</div>
      <div className="w-[80px] flex-shrink-0 px-2 text-right">Acciones</div>
    </div>
  )
}

// ─── Main Export ─────────────────────────────────────────────────────────────

interface OrdersTableProps {
  orders: Order[]
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>
  newOrderIds?: Set<string>
  activeFilter: OrderStatus | 'all'
}

export function OrdersTable({ orders, onUpdateStatus, newOrderIds, activeFilter }: OrdersTableProps) {
  const filtered = activeFilter === 'all' ? orders : orders.filter((o) => o.status === activeFilter)

  if (filtered.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-5xl mb-4">🍽️</p>
        <p className="text-lg font-medium">
          {activeFilter === 'all'
            ? 'No hay pedidos aún.'
            : `Sin pedidos en estado "${STATUS_CONFIG[activeFilter].label}".`}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <TableHeader />
      {filtered.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          onUpdateStatus={onUpdateStatus}
          isNew={newOrderIds?.has(order.id)}
        />
      ))}
    </div>
  )
}
