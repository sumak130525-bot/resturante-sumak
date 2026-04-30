'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import type { MenuItem } from '@/lib/types'

// ─── Ticket helpers ───────────────────────────────────────────────────────────

function pad(str: string, width: number, right = false): string {
  const s = String(str)
  if (s.length >= width) return s.slice(0, width)
  const spaces = ' '.repeat(width - s.length)
  return right ? spaces + s : s + spaces
}

function formatTicketMoney(amount: number): string {
  return '$' + new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

type PrintData = {
  orderNumber: number
  dateStr: string
  timeStr: string
  items: TicketItem[]
  total: number
  diningOption: DiningOption
  tableNumber: string
  paymentMethod: PaymentMethod
  customerName: string
}

function printTicketPopup(data: PrintData): void {
  const LINE = '================================'
  const total = formatTicketMoney(data.total)

  const itemLines = data.items.map((item) => {
    const qty = String(item.quantity)
    const name = item.name
    const sub = formatTicketMoney(item.price * item.quantity)
    const prefix = qty + 'x ' + name
    const maxPrefix = 48 - sub.length - 1
    const dots = maxPrefix > prefix.length
      ? '.'.repeat(maxPrefix - prefix.length)
      : ' '
    return prefix + dots + sub
  }).join('\n')

  const mesaLine = data.diningOption === 'Comer dentro' && data.tableNumber
    ? `Mesa: ${data.tableNumber}\n`
    : ''

  const clienteLine = data.customerName && data.customerName !== 'POS'
    ? `Cliente: ${data.customerName}\n`
    : ''

  const totalLine = pad('TOTAL:', 10) + pad(total, 38 - 10, true)

  const ticketText = [
    '          SUMAK',
    '        Restaurante',
    LINE,
    `${data.dateStr}  ${data.timeStr}`,
    `Pedido: P-${String(data.orderNumber).padStart(3, '0')}`,
    mesaLine.trimEnd(),
    `Modalidad: ${data.diningOption}`,
    LINE,
    itemLines,
    LINE,
    totalLine,
    `Pago: ${data.paymentMethod.toUpperCase()}${data.paymentMethod === 'Efectivo' ? ' [ABRIR CAJON]' : ''}`,
    clienteLine.trimEnd(),
    LINE,
    '     Gracias por su visita!',
    '      Restaurante Sumak',
    '',
    '',
  ].filter((l) => l !== '').join('\n')

  // Save ticket text globally so the print button can use it
  ;(window as any).__pendingTicket = ticketText
}

// ─── Frequent Customer type ───────────────────────────────────────────────────

type FrequentCustomer = {
  id: string
  name: string
  phone: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 24 // 6 × 4 grid

// ─── Price format (ARS: $12.500) ──────────────────────────────────────────────

function formatARS(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketItem = {
  menu_item_id: string
  name: string
  price: number
  quantity: number
  image_url?: string | null
}

type DiningOption = 'Comer dentro' | 'Para llevar'
type PaymentMethod = 'Efectivo' | 'Transferencia'

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl bg-teal-600 text-white font-bold text-lg select-none animate-bounce-in"
      style={{ minWidth: 280, maxWidth: '90vw' }}
    >
      <span className="text-2xl">✓</span>
      <span>{message}</span>
      <button
        onClick={onDone}
        className="ml-auto text-white/70 hover:text-white text-xl leading-none"
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  )
}

// ─── POS Dish Card ────────────────────────────────────────────────────────────

function POSDishCard({ item, onAdd }: { item: MenuItem; onAdd: (item: MenuItem) => void }) {
  const isUnavailable = item.available === 0
  const [pressed, setPressed] = useState(false)

  const handleClick = () => {
    if (isUnavailable) return
    setPressed(true)
    onAdd(item)
    setTimeout(() => setPressed(false), 200)
  }

  return (
    <article
      onClick={handleClick}
      className={`relative w-full h-full rounded-xl overflow-hidden select-none transition-all duration-150 ${
        isUnavailable
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer active:scale-95 hover:ring-2 hover:ring-teal-400'
      } ${pressed ? 'scale-95 brightness-90' : ''}`}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Image */}
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
          <span className="text-4xl">🍽️</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Name + price */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5">
        <p
          className="font-bold leading-tight text-white text-[clamp(0.7rem,1.2vw,0.95rem)] truncate"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {item.name}
        </p>
        <p
          className="font-bold tabular-nums text-[clamp(0.75rem,1.3vw,1rem)] text-teal-300"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {formatARS(item.price)}
        </p>
      </div>

      {/* Agotado */}
      {isUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="px-2 py-0.5 rounded-full bg-gray-700/80 text-white text-[0.6rem] font-bold tracking-widest uppercase border border-white/20">
            Agotado
          </span>
        </div>
      )}
    </article>
  )
}

// ─── Customer Combobox ────────────────────────────────────────────────────────

function CustomerCombobox({
  value,
  onChange,
  customers,
}: {
  value: string
  onChange: (v: string) => void
  customers: FrequentCustomer[]
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(value.toLowerCase()) ||
        (c.phone ?? '').includes(value)
      )
    : customers

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Nombre del cliente"
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(c.name) }}
                className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors"
              >
                <span className="font-semibold text-sm text-gray-900">{c.name}</span>
                {c.phone && (
                  <span className="ml-2 text-xs text-gray-400">{c.phone}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Ticket Panel ─────────────────────────────────────────────────────────────

function TicketPanel({
  items,
  diningOption,
  tableNumber,
  paymentMethod,
  customerName,
  customers,
  onUpdateQty,
  onRemove,
  onDiningChange,
  onTableChange,
  onPaymentChange,
  onCustomerChange,
  onSubmit,
  submitting,
}: {
  items: TicketItem[]
  diningOption: DiningOption
  tableNumber: string
  paymentMethod: PaymentMethod
  customerName: string
  customers: FrequentCustomer[]
  onUpdateQty: (id: string, delta: number) => void
  onRemove: (id: string) => void
  onDiningChange: (v: DiningOption) => void
  onTableChange: (v: string) => void
  onPaymentChange: (v: PaymentMethod) => void
  onCustomerChange: (v: string) => void
  onSubmit: () => void
  submitting: boolean
}) {
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const isEmpty = items.length === 0

  return (
    <div className="flex flex-col h-full bg-white" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-4 py-3 bg-teal-600 shrink-0">
        <h2 className="text-white font-black text-lg leading-none">Ticket</h2>
        {!isEmpty && (
          <p className="text-teal-100 text-xs mt-0.5">{items.reduce((s, i) => s + i.quantity, 0)} items</p>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 py-8">
            <span className="text-4xl">🛒</span>
            <p className="text-sm font-semibold">Sin items</p>
            <p className="text-xs">Tocá un plato para agregar</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.menu_item_id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
                  <p className="text-teal-600 font-bold text-xs tabular-nums">
                    {formatARS(item.price)} × {item.quantity} = {formatARS(item.price * item.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onUpdateQty(item.menu_item_id, -1)}
                    className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-90 flex items-center justify-center font-black text-gray-700 text-base transition-all"
                    aria-label="Quitar uno"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-black text-gray-900 tabular-nums text-base">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(item.menu_item_id, +1)}
                    className="w-8 h-8 rounded-lg bg-teal-100 hover:bg-teal-200 active:scale-90 flex items-center justify-center font-black text-teal-700 text-base transition-all"
                    aria-label="Agregar uno"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onRemove(item.menu_item_id)}
                    className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 active:scale-90 flex items-center justify-center text-red-600 font-black text-sm transition-all ml-1"
                    aria-label="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Controls */}
      <div className="px-3 pb-3 pt-2 flex flex-col gap-2.5 border-t border-gray-100 shrink-0">
        {/* Total */}
        <div className="flex items-center justify-between px-1">
          <span className="text-gray-500 text-sm font-semibold">Total</span>
          <span className="text-gray-900 font-black text-xl tabular-nums">{formatARS(total)}</span>
        </div>

        {/* Dining option toggle */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1 px-1">Modalidad</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['Comer dentro', 'Para llevar'] as DiningOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => onDiningChange(opt)}
                className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  diningOption === opt
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt === 'Comer dentro' ? '🪑 Dentro' : '🛍️ Llevar'}
              </button>
            ))}
          </div>
        </div>

        {/* Table number (only if Comer dentro) */}
        {diningOption === 'Comer dentro' && (
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1 px-1">Número de mesa</p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={tableNumber}
              onChange={(e) => onTableChange(e.target.value)}
              placeholder="Mesa #"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
            />
          </div>
        )}

        {/* Payment method */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1 px-1">Pago</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['Efectivo', 'Transferencia'] as PaymentMethod[]).map((pm) => (
              <button
                key={pm}
                onClick={() => onPaymentChange(pm)}
                className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  paymentMethod === pm
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {pm === 'Efectivo' ? '💵 Efectivo' : '📲 Transfer'}
              </button>
            ))}
          </div>
        </div>

        {/* Customer */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1 px-1">Cliente</p>
          <CustomerCombobox
            value={customerName}
            onChange={onCustomerChange}
            customers={customers}
          />
        </div>

        {/* Submit */}
        <button
          onClick={onSubmit}
          disabled={isEmpty || submitting}
          className={`w-full py-4 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-95 shadow-md ${
            isEmpty || submitting
              ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
          }`}
          style={{ minHeight: 56 }}
        >
          {submitting ? 'Enviando...' : 'ENVIAR PEDIDO'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { menuItems, loading } = useMenuRealtime()

  // Frequent customers
  const [customers, setCustomers] = useState<FrequentCustomer[]>([])
  useEffect(() => {
    fetch('/api/admin/customers')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCustomers(data))
      .catch(() => {})
  }, [])

  // Ticket state
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
  const [diningOption, setDiningOption] = useState<DiningOption>('Comer dentro')
  const [tableNumber, setTableNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo')
  const [customerName, setCustomerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showPrintBtn, setShowPrintBtn] = useState(false)

  // Ticket panel open/close
  const [ticketOpen, setTicketOpen] = useState(false)

  // Only display items with display_order > 0, capped at 24
  const displayItems = menuItems.slice(0, MAX_VISIBLE)

  const handleAddItem = useCallback((item: MenuItem) => {
    setTicketItems((prev) => {
      const existing = prev.find((i) => i.menu_item_id === item.id)
      if (existing) {
        return prev.map((i) =>
          i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          image_url: item.image_url,
        },
      ]
    })
    // Auto-open ticket when first item added
    setTicketOpen(true)
  }, [])

  const handleUpdateQty = useCallback((id: string, delta: number) => {
    setTicketItems((prev) => {
      const item = prev.find((i) => i.menu_item_id === id)
      if (!item) return prev
      const newQty = item.quantity + delta
      if (newQty <= 0) return prev.filter((i) => i.menu_item_id !== id)
      return prev.map((i) => i.menu_item_id === id ? { ...i, quantity: newQty } : i)
    })
  }, [])

  const handleRemove = useCallback((id: string) => {
    setTicketItems((prev) => prev.filter((i) => i.menu_item_id !== id))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (ticketItems.length === 0) return
    setSubmitting(true)
    try {
      const total = ticketItems.reduce((s, i) => s + i.price * i.quantity, 0)
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: ticketItems,
          total,
          dining_option: diningOption,
          table_number: diningOption === 'Comer dentro' && tableNumber ? Number(tableNumber) : null,
          payment_method: paymentMethod,
          customer_name: customerName || 'POS',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al enviar')

      // Capture snapshot for print BEFORE resetting state
      const now = new Date()
      const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      const orderNumber: number = data.order?.order_number ?? data.order?.id ?? data.order_id ?? 0
      const snapshot: PrintData = {
        orderNumber,
        dateStr,
        timeStr,
        items: [...ticketItems],
        total,
        diningOption,
        tableNumber,
        paymentMethod,
        customerName: customerName || '',
      }

      // Reset ticket
      setTicketItems([])
      setTableNumber('')
      setCustomerName('')
      setTicketOpen(false)
      setToast('Pedido enviado a cocina')

      // Print ticket via popup window
      printTicketPopup(snapshot)
      setShowPrintBtn(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar pedido'
      setToast(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }, [ticketItems, diningOption, tableNumber, paymentMethod, customerName])

  const ticketCount = ticketItems.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100 overflow-hidden select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Header ── */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 bg-teal-600 shadow-md">
        <Image
          src="/logo-sumak.png"
          alt="Sumak"
          width={36}
          height={36}
          className="rounded-full border-2 border-white/30 object-cover shrink-0"
          priority
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-xl leading-none">Punto de Venta</h1>
          <p className="text-teal-100 text-xs mt-0.5">Sumak</p>
        </div>
        {/* Ticket toggle button */}
        <button
          onClick={() => setTicketOpen((o) => !o)}
          className={`relative flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-base transition-all active:scale-95 shadow-md ${
            ticketOpen
              ? 'bg-white text-teal-700'
              : 'bg-teal-700 text-white hover:bg-teal-800'
          }`}
          style={{ minHeight: 48 }}
        >
          <span className="text-xl">🧾</span>
          <span className="hidden sm:inline">Ticket</span>
          {ticketCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-green-400 text-gray-900 text-xs font-black flex items-center justify-center">
              {ticketCount}
            </span>
          )}
        </button>
      </header>

      {/* ── Main content: grid + ticket panel ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── Left: Dish Grid ── */}
        <main
          className="flex-1 min-w-0 p-2 overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gridTemplateRows: 'repeat(4, 1fr)',
            gap: '6px',
          }}
        >
          {loading ? (
            Array.from({ length: MAX_VISIBLE }).map((_, i) => (
              <div key={i} className="w-full h-full rounded-xl bg-gray-200 animate-pulse" />
            ))
          ) : (
            Array.from({ length: MAX_VISIBLE }).map((_, gridIndex) => {
              const position = gridIndex + 1
              const item = displayItems.find((i) => i.display_order === position)
              if (item) {
                return <POSDishCard key={item.id} item={item} onAdd={handleAddItem} />
              }
              return <div key={`empty-${gridIndex}`} className="w-full h-full rounded-xl bg-gray-200/60" />
            })
          )}
        </main>

        {/* ── Right: Ticket Panel (slide-in) ── */}
        <aside
          className={`shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-xl transition-all duration-300 overflow-hidden ${
            ticketOpen ? 'w-80 xl:w-96' : 'w-0'
          }`}
          style={{ minHeight: 0 }}
        >
          {ticketOpen && (
            <TicketPanel
              items={ticketItems}
              diningOption={diningOption}
              tableNumber={tableNumber}
              paymentMethod={paymentMethod}
              customerName={customerName}
              customers={customers}
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              onDiningChange={setDiningOption}
              onTableChange={setTableNumber}
              onPaymentChange={setPaymentMethod}
              onCustomerChange={setCustomerName}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}
        </aside>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <Toast message={toast} onDone={() => setToast(null)} />
      )}

      {/* ── PRINT BUTTON (shown after order sent) ── */}
      {showPrintBtn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <p className="text-lg font-bold text-green-600">✅ Pedido enviado</p>
            <button
              onClick={() => {
                const ticket = (window as any).__pendingTicket
                if (ticket) {
                  document.body.innerHTML = `<pre style="font-family:'Courier New',monospace;font-size:12px;line-height:1.4;width:80mm;margin:0;padding:2mm;color:black;white-space:pre-wrap;">${ticket}</pre>`
                  window.print()
                  window.location.reload()
                }
              }}
              className="px-8 py-4 bg-green-500 text-white text-2xl font-bold rounded-xl shadow-lg active:scale-95"
            >
              🖨️ IMPRIMIR TICKET
            </button>
            <button
              onClick={() => setShowPrintBtn(false)}
              className="px-6 py-2 text-gray-500 text-base underline"
            >
              Omitir
            </button>
          </div>
        </div>
      )}

      {/* ── Floating ticket button (mobile fallback, shown when panel closed and has items) ── */}
      {!ticketOpen && ticketCount > 0 && (
        <button
          onClick={() => setTicketOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl shadow-2xl font-black text-base transition-all active:scale-95"
          style={{ minHeight: 56 }}
        >
          <span className="text-xl">🧾</span>
          <span>Ver Ticket ({ticketCount})</span>
        </button>
      )}

    </div>
  )
}
