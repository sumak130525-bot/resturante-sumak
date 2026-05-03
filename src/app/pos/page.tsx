'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import type { MenuItem } from '@/lib/types'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'

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

// ─── Modifier types ───────────────────────────────────────────────────────────

type ModifierOption = {
  id: string
  name: string
  price: number
}

type Modifier = {
  id: string
  name: string
  options: ModifierOption[]
}

// Selected modifier choice: one modifier → one option chosen
type SelectedModifier = {
  modifierId: string
  modifierName: string
  optionId: string
  optionName: string
  price: number
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

function buildTicketText(data: PrintData): string {
  const W = 22 // 58mm thermal = ~22 chars
  const LINE = '-'.repeat(W)
  const total = formatTicketMoney(data.total)

  const center = (s: string) => {
    const spaces = Math.max(0, Math.floor((W - s.length) / 2))
    return ' '.repeat(spaces) + s
  }

  const itemLines = data.items.flatMap((item) => {
    const qty = String(item.quantity)
    const sub = formatTicketMoney(item.price * item.quantity)
    const prefix = qty + 'x '
    const maxNameLen = W - prefix.length
    const name = item.name.length > maxNameLen
      ? item.name.substring(0, maxNameLen)
      : item.name
    const line1 = prefix + name
    const line2 = pad(sub, W, true)

    const modLines = (item.modifiers ?? []).map(
      (m) => `  > ${m.optionName}${m.price > 0 ? ' (+)' : ''}`
    )
    return [line1, line2, ...modLines]
  })

  const mesaLine = data.diningOption === 'Comer dentro' && data.tableNumber
    ? `Mesa: ${data.tableNumber}` : ''

  const clienteLine = data.customerName && data.customerName !== 'POS'
    ? `Cliente: ${data.customerName}` : ''

  const paymentLabel = data.paymentMethod === 'Transferencia' ? 'TRANSFER' : data.paymentMethod.toUpperCase()

  return [
    center('SUMAK'),
    center('Restaurante'),
    LINE,
    `${data.dateStr}  ${data.timeStr}`,
    `Pedido: P-${String(data.orderNumber).padStart(3, '0')}`,
    mesaLine,
    `Modalidad: ${data.diningOption}`,
    LINE,
    ...itemLines,
    LINE,
    `TOTAL: ${total}`,
    `Pago: ${paymentLabel}`,
    clienteLine,
    LINE,
    center('Gracias por su visita!'),
    center('Restaurante Sumak'),
    '',
    '',
  ].filter((l) => l !== '').join('\n')
}

function triggerPrint(ticketText: string, logoUrl?: string | null): void {
  sessionStorage.setItem('pos_ticket', ticketText)
  if (logoUrl) {
    sessionStorage.setItem('pos_ticket_logo', logoUrl)
  } else {
    sessionStorage.removeItem('pos_ticket_logo')
  }
  window.location.href = '/pos/ticket'
}

function printTicketPopup(data: PrintData): void {
  const ticketText = buildTicketText(data)
  // Save ticket text globally so the print button can use it
  ;(window as any).__pendingTicket = ticketText
}

// ─── Frequent Customer type ───────────────────────────────────────────────────

type FrequentCustomer = {
  id: string
  name: string
  phone: string | null
}

// ─── Category icons (same as public menu) ────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  sopas:               '🍲',
  'platos-principales':'🍽️',
  empanadas:           '🥟',
  acompanamientos:     '🥗',
  bebidas:             '🥤',
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
  modifiers?: SelectedModifier[]
}

type DiningOption = 'Comer dentro' | 'Para llevar'
type PaymentMethod = 'Efectivo' | 'Transferencia'

// ─── Build line_note string from modifiers (Loyverse format) ─────────────────

function buildLineNote(modifiers: SelectedModifier[]): string | null {
  if (!modifiers || modifiers.length === 0) return null
  // Only option names, no modifier group name
  const parts = modifiers.map((m) => m.optionName)
  return parts.join(' · ')
}

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

// ─── Modifier Modal ───────────────────────────────────────────────────────────

function ModifierModal({
  item,
  modifiers,
  onConfirm,
  onCancel,
}: {
  item: MenuItem
  modifiers: Modifier[]
  onConfirm: (selections: SelectedModifier[]) => void
  onCancel: () => void
}) {
  // State: modifierId → array of selected optionIds (multi-select per modifier)
  const [selections, setSelections] = useState<Record<string, string[]>>({})

  const handleOptionToggle = (modifierId: string, optionId: string) => {
    setSelections((prev) => {
      const current = prev[modifierId] ?? []
      if (current.includes(optionId)) {
        const next = current.filter((id) => id !== optionId)
        if (next.length === 0) {
          const copy = { ...prev }
          delete copy[modifierId]
          return copy
        }
        return { ...prev, [modifierId]: next }
      }
      return { ...prev, [modifierId]: [...current, optionId] }
    })
  }

  const handleConfirm = () => {
    const result: SelectedModifier[] = []
    for (const mod of modifiers) {
      const selectedOptionIds = selections[mod.id] ?? []
      for (const optId of selectedOptionIds) {
        const opt = mod.options.find((o) => o.id === optId)
        if (opt) {
          result.push({
            modifierId: mod.id,
            modifierName: mod.name,
            optionId: opt.id,
            optionName: opt.name,
            price: opt.price,
          })
        }
      }
    }
    onConfirm(result)
  }

  const extraTotal = Object.entries(selections).reduce((sum, [modId, optIds]) => {
    const mod = modifiers.find((m) => m.id === modId)
    return sum + (optIds as string[]).reduce((s, optId) => {
      const opt = mod?.options.find((o) => o.id === optId)
      return s + (opt?.price ?? 0)
    }, 0)
  }, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-teal-600 shrink-0">
          <h3 className="text-white font-black text-lg leading-none">{item.name}</h3>
          <p className="text-teal-100 text-xs mt-0.5">Seleccioná las opciones</p>
        </div>

        {/* Modifiers list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {modifiers.map((mod) => (
            <div key={mod.id} className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                {mod.name}
              </p>
              <div className="flex flex-col gap-1">
                {mod.options.map((opt) => {
                  const checked = (selections[mod.id] ?? []).includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleOptionToggle(mod.id, opt.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                        checked
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          checked
                            ? 'border-teal-500 bg-teal-500'
                            : 'border-gray-300'
                        }`}
                      >
                        {checked && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-900">{opt.name}</span>
                      {opt.price > 0 && (
                        <span className="text-xs font-bold text-teal-600 shrink-0">
                          +{formatARS(opt.price)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0">
          {extraTotal > 0 && (
            <p className="text-xs text-gray-500 mb-2 text-right">
              Extras: <span className="font-bold text-teal-600">+{formatARS(extraTotal)}</span>
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-teal-600 hover:bg-teal-700 text-white active:scale-95 transition-all shadow-md"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── POS Dish Card ────────────────────────────────────────────────────────────

// ─── ARS formatter ───────────────────────────────────────────────────────────

function formatCashARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount)
}

// ─── Cash Movement Modal ──────────────────────────────────────────────────────

type CashMovement = {
  id: string
  type: 'ingreso' | 'egreso' | 'venta_efectivo' | 'venta_transferencia'
  amount: number
  description: string | null
  created_at: string
}

function CashMovementsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'ingreso' | 'egreso'>('ingreso')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loadingMovements, setLoadingMovements] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadMovements = async () => {
    setLoadingMovements(true)
    try {
      const res = await fetch('/api/pos/cash-movements')
      const data = await res.json()
      setMovements(data.movements ?? [])
    } catch (e) { void e }
    setLoadingMovements(false)
  }

  useEffect(() => { loadMovements() }, [])

  const handleSubmit = async () => {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (!parsed || parsed <= 0) { setError('Ingresá un monto válido'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/pos/cash-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tab, amount: parsed, description: description.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')

      // Print receipt to open cash drawer
      const now = new Date()
      const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
      const receiptText = [
        '================================',
        tab === 'ingreso' ? '     INGRESO DE EFECTIVO' : '     EGRESO DE EFECTIVO',
        '================================',
        `Fecha: ${dateStr}  ${timeStr}`,
        '',
        `Monto: $${parsed.toLocaleString('es-AR')}`,
        description.trim() ? `Detalle: ${description.trim()}` : '',
        '',
        '================================',
      ].filter(Boolean).join('\n')
      sessionStorage.setItem('pos_ticket', receiptText)
      sessionStorage.setItem('pos_ticket_payment', tab === 'ingreso' ? 'Efectivo' : 'Efectivo')

      setAmount('')
      setDescription('')
      setSuccess(`${tab === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado`)
      setTimeout(() => {
        setSuccess(null)
        // Navigate to ticket page to print and open drawer
        window.location.href = '/pos/ticket'
      }, 500)
      loadMovements()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSubmitting(false)
  }

  const manualMovements = movements.filter((m) => m.type === 'ingreso' || m.type === 'egreso')
  const totalIngresos = manualMovements.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.amount), 0)
  const totalEgresos = manualMovements.filter((m) => m.type === 'egreso').reduce((s, m) => s + Number(m.amount), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-teal-600 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-black text-lg leading-none">Movimientos de caja</h3>
            <p className="text-teal-100 text-xs mt-0.5">Registrar ingresos y egresos manuales</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4" style={{ minHeight: 0 }}>
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1.5 bg-gray-100 rounded-xl p-1">
            {(['ingreso', 'egreso'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-2 rounded-lg font-bold text-sm transition-all ${
                  tab === t
                    ? t === 'ingreso' ? 'bg-green-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Monto</p>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$ 0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xl font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
            />
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Descripción (opcional)</p>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cambio de caja, pago proveedor..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          {/* Feedback */}
          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
          {success && <p className="text-green-600 text-sm font-semibold">{success}</p>}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md text-white ${
              submitting
                ? 'bg-gray-300 cursor-not-allowed'
                : tab === 'ingreso'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {submitting ? 'Registrando...' : `Registrar ${tab === 'ingreso' ? 'Ingreso' : 'Egreso'}`}
          </button>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs font-bold text-green-700 mb-1">Ingresos</p>
              <p className="font-black text-green-700 tabular-nums">{formatCashARS(totalIngresos)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs font-bold text-red-700 mb-1">Egresos</p>
              <p className="font-black text-red-700 tabular-nums">{formatCashARS(totalEgresos)}</p>
            </div>
          </div>

          {/* Movements list */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">Movimientos del turno</p>
            {loadingMovements ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : manualMovements.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin movimientos manuales aún</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {manualMovements.map((m) => (
                  <li key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                    m.type === 'ingreso' ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <span className={`font-bold text-sm ${m.type === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.type === 'ingreso' ? '↑' : '↓'}
                    </span>
                    <span className="flex-1 text-xs text-gray-700 truncate">{m.description ?? (m.type === 'ingreso' ? 'Ingreso' : 'Egreso')}</span>
                    <span className={`font-black text-sm tabular-nums ${m.type === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCashARS(Number(m.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Clock ─────────────────────────────────────────────────────────────────────
function POSClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])
  return <span className="text-sumak-gold/70 text-xs font-mono shrink-0">{time}</span>
}

// ─── Dish Card ──────────────────────────────────────────────────────────────────
function POSDishCard({ item, onAdd, locale }: { item: MenuItem; onAdd: (item: MenuItem) => void; locale: Locale }) {
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
          : 'cursor-pointer active:scale-95 hover:ring-2 hover:ring-sumak-gold'
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
          {getItemName(item, locale)}
        </p>
        <p
          className="font-bold tabular-nums text-[clamp(0.75rem,1.3vw,1rem)] text-sumak-gold-light"
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

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  diningOption,
  tableNumber,
  paymentMethod,
  customerName,
  orderNotes,
  customers,
  submitting,
  onTableChange,
  onPaymentChange,
  onCustomerChange,
  onNotesChange,
  onCancel,
  onConfirm,
}: {
  diningOption: DiningOption
  tableNumber: string
  paymentMethod: PaymentMethod
  customerName: string
  orderNotes: string
  customers: FrequentCustomer[]
  submitting: boolean
  onTableChange: (v: string) => void
  onPaymentChange: (v: PaymentMethod) => void
  onCustomerChange: (v: string) => void
  onNotesChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="px-5 py-4 bg-teal-600">
          <h3 className="text-white font-black text-lg leading-none">Confirmar pedido</h3>
        </div>

        {/* Modal body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Table number (only if Comer dentro) */}
          {diningOption === 'Comer dentro' && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">Número de mesa</p>
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
            <p className="text-xs font-bold text-gray-500 mb-1">Método de pago</p>
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
            <p className="text-xs font-bold text-gray-500 mb-1">Cliente</p>
            <CustomerCombobox
              value={customerName}
              onChange={onCustomerChange}
              customers={customers}
            />
          </div>

          {/* Order notes */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Nota del pedido</p>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Nota del pedido (opcional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
        </div>

        {/* Modal footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md ${
              submitting
                ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
            }`}
          >
            {submitting ? 'Enviando...' : 'Confirmar y Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ticket Panel ─────────────────────────────────────────────────────────────

function TicketPanel({
  items,
  diningOption,
  onUpdateQty,
  onRemove,
  onDiningChange,
  onOpenConfirm,
}: {
  items: TicketItem[]
  diningOption: DiningOption
  onUpdateQty: (id: string, delta: number) => void
  onRemove: (id: string) => void
  onDiningChange: (v: DiningOption) => void
  onOpenConfirm: () => void
}) {
  const total = items.reduce((s, i) => {
    const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
    return s + (i.price + modExtra) * i.quantity
  }, 0)
  const isEmpty = items.length === 0
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="flex flex-col h-full bg-white" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-4 py-3 bg-teal-600 shrink-0">
        <h2 className="text-white font-black text-lg leading-none">Ticket</h2>
        {!isEmpty && (
          <p className="text-teal-100 text-xs mt-0.5">{itemCount} items</p>
        )}
      </div>

      {/* Dining option — compact select */}
      <div className="px-3 pt-2.5 pb-1.5 shrink-0 border-b border-gray-100">
        <select
          value={diningOption}
          onChange={(e) => onDiningChange(e.target.value as DiningOption)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 cursor-pointer"
        >
          <option value="Comer dentro">🪑 Comer dentro</option>
          <option value="Para llevar">🛍️ Para llevar</option>
        </select>
      </div>

      {/* Items list — flex-1, scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 py-8">
            <span className="text-4xl">🛒</span>
            <p className="text-sm font-semibold">Sin items</p>
            <p className="text-xs">Tocá un plato para agregar</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
              const unitTotal = item.price + modExtra
              return (
                <li
                  key={item.menu_item_id}
                  className="flex items-start gap-1.5 bg-gray-50 rounded-xl px-2.5 py-1.5 border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
                    {(item.modifiers ?? []).length > 0 && (
                      <div className="mt-0.5">
                        {item.modifiers!.map((m, idx) => (
                          <p key={idx} className="text-gray-500 text-xs leading-tight pl-2">
                            · {m.optionName}
                            {m.price > 0 && (
                              <span className="text-teal-600"> +{formatARS(m.price)}</span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-teal-600 font-bold text-xs tabular-nums mt-0.5">
                      {formatARS(unitTotal)} × {item.quantity} = {formatARS(unitTotal * item.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <button
                      onClick={() => onUpdateQty(item.menu_item_id, -1)}
                      className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 active:scale-90 flex items-center justify-center font-black text-gray-700 text-sm transition-all"
                      aria-label="Quitar uno"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-black text-gray-900 tabular-nums text-sm">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(item.menu_item_id, +1)}
                      className="w-6 h-6 rounded-md bg-teal-100 hover:bg-teal-200 active:scale-90 flex items-center justify-center font-black text-teal-700 text-sm transition-all"
                      aria-label="Agregar uno"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onRemove(item.menu_item_id)}
                      className="w-6 h-6 rounded-md bg-red-100 hover:bg-red-200 active:scale-90 flex items-center justify-center text-red-600 font-black text-xs transition-all ml-0.5"
                      aria-label="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Bottom fixed bar */}
      <div className="px-3 pb-3 pt-3 border-t border-gray-200 shrink-0 bg-white">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-gray-500 text-sm font-semibold">Total</span>
          <span className="text-gray-900 font-black text-2xl tabular-nums">{formatARS(total)}</span>
        </div>
        <button
          onClick={onOpenConfirm}
          disabled={isEmpty}
          className={`w-full py-4 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-95 shadow-md ${
            isEmpty
              ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
          }`}
          style={{ minHeight: 56 }}
        >
          ENVIAR PEDIDO
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { menuItems, categories, loading } = useMenuRealtime()
  const { locale, setLocale } = useTranslation()

  // Logo (fetched once on load)
  const [ticketLogo, setTicketLogo] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/admin/settings?key=ticket_logo')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data) && data[0]?.value) setTicketLogo(data[0].value) })
      .catch(() => {})
  }, [])

  // Frequent customers
  const [customers, setCustomers] = useState<FrequentCustomer[]>([])
  useEffect(() => {
    fetch('/api/admin/customers')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCustomers(data))
      .catch(() => {})
  }, [])

  // Modifiers data (fetched once on load)
  const [allModifiers, setAllModifiers] = useState<Modifier[]>([])
  const [itemModifierMap, setItemModifierMap] = useState<Record<string, string[]>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/pos/modifiers').then((r) => r.ok ? r.json() : { modifiers: [] }),
      fetch('/api/admin/item-modifiers').then((r) => r.ok ? r.json() : { mappings: {} }),
    ]).then(([modData, mapData]) => {
      setAllModifiers(modData.modifiers ?? [])
      setItemModifierMap(mapData.mappings ?? {})
    }).catch(() => {})
  }, [])

  // Modifier modal state
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null)
  const [pendingModifiers, setPendingModifiers] = useState<Modifier[]>([])

  // Ticket state
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
  const [diningOption, setDiningOption] = useState<DiningOption>('Comer dentro')
  const [tableNumber, setTableNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo')
  const [customerName, setCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showPrintBtn, setShowPrintBtn] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)

  // Ticket panel open/close
  const [ticketOpen, setTicketOpen] = useState(false)

  // Category filter
  const [activeCategory, setActiveCategory] = useState('all')

  // Only display items with display_order > 0, capped at 24
  const filteredItems = activeCategory === 'all'
    ? menuItems
    : menuItems.filter((item) => {
        const cat = categories.find((c) => c.slug === activeCategory)
        return cat ? item.category_id === cat.id : true
      })
  const displayItems = filteredItems.slice(0, MAX_VISIBLE)

  // Add item to ticket (called after modifier selection or directly)
  const addItemToTicket = useCallback((item: MenuItem, modifiers?: SelectedModifier[]) => {
    setTicketItems((prev) => {
      // Items with modifiers are always added as new entries (unique combo)
      // Items without modifiers can be merged by menu_item_id
      if (!modifiers || modifiers.length === 0) {
        const existing = prev.find(
          (i) => i.menu_item_id === item.id && (!i.modifiers || i.modifiers.length === 0)
        )
        if (existing) {
          return prev.map((i) =>
            i.menu_item_id === item.id && (!i.modifiers || i.modifiers.length === 0)
              ? { ...i, quantity: i.quantity + 1 }
              : i
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
      }

      // With modifiers: always new entry (unique modifier combination)
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          image_url: item.image_url,
          modifiers,
        },
      ]
    })
    setTicketOpen(true)
  }, [])

  const handleAddItem = useCallback((item: MenuItem) => {
    const modifierIds = itemModifierMap[item.id] ?? []
    if (modifierIds.length === 0) {
      // No modifiers — add directly
      addItemToTicket(item)
      return
    }

    // Has modifiers — show modal
    const modifiersForItem = allModifiers.filter((m) => modifierIds.includes(m.id))
    setPendingItem(item)
    setPendingModifiers(modifiersForItem)
  }, [itemModifierMap, allModifiers, addItemToTicket])

  const handleModifierConfirm = useCallback((selections: SelectedModifier[]) => {
    if (!pendingItem) return
    addItemToTicket(pendingItem, selections)
    setPendingItem(null)
    setPendingModifiers([])
  }, [pendingItem, addItemToTicket])

  const handleModifierCancel = useCallback(() => {
    setPendingItem(null)
    setPendingModifiers([])
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
      const total = ticketItems.reduce((s, i) => {
        const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
        return s + (i.price + modExtra) * i.quantity
      }, 0)

      // Build items with line_note for modifiers
      const itemsPayload = ticketItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.name,
        quantity: item.quantity,
        price: item.price + (item.modifiers ?? []).reduce((s, m) => s + m.price, 0),
        line_note: buildLineNote(item.modifiers ?? []),
      }))

      // Mesa goes in notes for kitchen extraction (header), user note is separate
      const mesaPart = diningOption === 'Comer dentro' && tableNumber ? `Mesa ${tableNumber}` : ''
      const userNote = orderNotes.trim()
      const finalNotes = [mesaPart, userNote].filter(Boolean).join(' | ') || null

      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsPayload,
          total,
          dining_option: diningOption,
          table_number: diningOption === 'Comer dentro' && tableNumber ? Number(tableNumber) : null,
          payment_method: paymentMethod,
          customer_name: customerName || 'POS',
          notes: finalNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al enviar')

      // Capture snapshot for print BEFORE resetting state
      const now = new Date()
      const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
      const orderNumber: number = Date.now() % 1000
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
      setOrderNotes('')
      setTicketOpen(false)
      setShowConfirmModal(false)
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
  }, [ticketItems, diningOption, tableNumber, paymentMethod, customerName, orderNotes])

  const ticketCount = ticketItems.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="fixed inset-0 flex flex-col bg-black overflow-hidden select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top Bar: POS + Categories + Language + Clock + Ticket ── */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-sumak-brown shadow-md">
        <h1 className="text-sumak-gold font-black text-lg leading-none shrink-0">POS</h1>
        <div className="h-5 w-px bg-sumak-gold/30 shrink-0" />
        {/* Category Tabs inline */}
        <div
          className="flex-1 flex gap-1.5 overflow-x-auto min-w-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex items-center gap-1 whitespace-nowrap px-3 py-1 rounded-pill text-xs font-semibold transition-all shrink-0 ${
              activeCategory === 'all'
                ? 'bg-sumak-gold text-sumak-brown'
                : 'bg-white/20 text-sumak-gold/80 hover:bg-white/30'
            }`}
          >
            {locale === 'en' ? 'All' : locale === 'qu' ? 'Llipin' : 'Todos'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.slug)}
              className={`flex items-center gap-1 whitespace-nowrap px-3 py-1 rounded-pill text-xs font-semibold transition-all shrink-0 ${
                activeCategory === cat.slug
                  ? 'bg-sumak-gold text-sumak-brown'
                  : 'bg-white/20 text-sumak-gold/80 hover:bg-white/30'
              }`}
            >
              <span className="text-sm leading-none">{CATEGORY_ICONS[cat.slug] ?? '🍴'}</span>
              {locale === 'en' && cat.name_en ? cat.name_en : locale === 'qu' && cat.name_qu ? cat.name_qu : cat.name}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-sumak-gold/30 shrink-0" />
        {/* Language selector */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(['es', 'en', 'qu'] as Locale[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setLocale(lang)}
              className={`px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase transition-all ${
                locale === lang
                  ? 'bg-sumak-gold text-sumak-brown'
                  : 'text-sumak-gold/40 hover:text-sumak-gold/70'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
        {/* Clock */}
        <POSClock />
        {/* Cash movements button */}
        <button
          onClick={() => setShowCashModal(true)}
          title="Movimientos de caja"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light active:scale-95 transition-all shrink-0 font-bold text-base"
        >
          $
        </button>
        {/* Ticket toggle button */}
        <button
          onClick={() => setTicketOpen((o) => !o)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md shrink-0 ${
            ticketOpen
              ? 'bg-sumak-gold text-sumak-brown'
              : 'bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light'
          }`}
        >
          <span className="text-base">🧾</span>
          {ticketCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sumak-gold text-sumak-brown text-[10px] font-black flex items-center justify-center">
              {ticketCount}
            </span>
          )}
        </button>
      </header>

      {/* ── Main content: grid + ticket panel ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── Left: Dish Grid ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Dish Grid */}
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
              <div key={i} className="w-full h-full rounded-xl bg-sumak-cream-dark animate-pulse" />
            ))
          ) : (
            Array.from({ length: MAX_VISIBLE }).map((_, gridIndex) => {
              const position = gridIndex + 1
              const item = displayItems.find((i) => i.display_order === position)
                ?? (activeCategory !== 'all' ? displayItems[gridIndex] : undefined)
              if (item) {
                return <POSDishCard key={item.id} item={item} onAdd={handleAddItem} locale={locale} />
              }
              return <div key={`empty-${gridIndex}`} className="w-full h-full rounded-xl bg-sumak-cream-dark/40" />
            })
          )}
        </main>
        </div>

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
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              onDiningChange={setDiningOption}
              onOpenConfirm={() => setShowConfirmModal(true)}
            />
          )}
        </aside>
      </div>

      {/* ── Modifier Modal ── */}
      {pendingItem && (
        <ModifierModal
          item={pendingItem}
          modifiers={pendingModifiers}
          onConfirm={handleModifierConfirm}
          onCancel={handleModifierCancel}
        />
      )}

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <ConfirmModal
          diningOption={diningOption}
          tableNumber={tableNumber}
          paymentMethod={paymentMethod}
          customerName={customerName}
          orderNotes={orderNotes}
          customers={customers}
          submitting={submitting}
          onTableChange={setTableNumber}
          onPaymentChange={setPaymentMethod}
          onCustomerChange={setCustomerName}
          onNotesChange={setOrderNotes}
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={handleSubmit}
        />
      )}

      {/* ── Cash Movements Modal ── */}
      {showCashModal && (
        <CashMovementsModal onClose={() => setShowCashModal(false)} />
      )}

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
                  triggerPrint(ticket, ticketLogo)
                }
                setShowPrintBtn(false)
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
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 bg-sumak-brown hover:bg-sumak-brown-mid text-sumak-gold rounded-2xl shadow-2xl font-black text-base transition-all active:scale-95"
          style={{ minHeight: 56 }}
        >
          <span className="text-xl">🧾</span>
          <span>Ver Ticket ({ticketCount})</span>
        </button>
      )}

    </div>
  )
}
