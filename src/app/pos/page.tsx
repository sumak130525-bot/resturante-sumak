'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import type { MenuItem } from '@/lib/types'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { useLanguagesEnabled } from '@/hooks/useLanguagesEnabled'
import { type TicketConfig, DEFAULT_TICKET_CONFIG } from '@/types/ticket-config'

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
  cashAmount?: number
  transferAmount?: number
  customerName: string
}

function buildTicketText(data: PrintData, cfg: TicketConfig = DEFAULT_TICKET_CONFIG): string {
  const W = cfg.width
  const marginLeft = cfg.marginLeft ?? 0
  const marginRight = cfg.marginRight ?? 0
  const leftPad = ' '.repeat(marginLeft)

  // Separator markers — rendered as full-width HTML elements in ticket/page.tsx
  const SEP = '---SEP---'
  const LINES = SEP

  const total = formatTicketMoney(data.total)

  // Section gap: at most 1 blank line between header/footer and separators
  const sectionSpacingVal = cfg.sectionSpacing ?? 4
  const sectionGap = sectionSpacingVal > 0 ? '\n' : ''
  // Extra blank lines between items based on itemSpacing
  const itemGap = cfg.itemSpacing && cfg.itemSpacing > 0 ? '\n'.repeat(Math.floor(cfg.itemSpacing / 2)) : ''

  const alignText = (s: string, align: 'center' | 'left') => {
    if (align === 'left') return leftPad + s
    // center alignment: return plain string; CSS text-align:center handles it in ticket/page.tsx
    return s
  }

  const addMargin = (s: string) => leftPad + s

  // Build item lines — flat list (person grouping handled in sectionized output below)
  const buildItemLines = (items: typeof data.items) => items.flatMap((item, idx) => {
    const qty = String(item.quantity)
    const sub = formatTicketMoney(item.price * item.quantity)
    const prefix = qty + 'x '
    const contentW = Math.max(1, W - marginLeft - marginRight)
    const maxNameLen = contentW - prefix.length
    const name = item.name.length > maxNameLen
      ? item.name.substring(0, maxNameLen)
      : item.name
    const line1 = addMargin(prefix + name)
    const line2 = addMargin(pad(sub, contentW, true))

    const modLines = (item.modifiers ?? []).map(
      (m) => addMargin(`  > ${m.optionName}${m.price > 0 ? ' (+)' : ''}`)
    )
    const lines = [line1, line2, ...modLines]
    if (itemGap && idx < items.length - 1) lines.push(itemGap)
    return lines
  })

  const mesaLine = (cfg.showTableNumber ?? true) && data.diningOption === 'Comer dentro' && data.tableNumber
    ? addMargin(`Mesa: ${data.tableNumber}`) : ''

  const clienteLine = (cfg.showCustomerName ?? true) && data.customerName && data.customerName !== 'POS'
    ? addMargin(`Cliente: ${data.customerName}`) : ''

  const paymentLabel = data.paymentMethod === 'Transferencia'
    ? 'TRANSFER'
    : data.paymentMethod === 'Mixto'
      ? 'MIXTO'
      : data.paymentMethod.toUpperCase()

  const infoLines: string[] = []
  if (cfg.showDate ?? true) infoLines.push(addMargin(`${data.dateStr}  ${data.timeStr}`))
  if (cfg.showOrderNumber ?? true) infoLines.push(addMargin(`Pedido: P-${String(data.orderNumber).padStart(3, '0')}`))
  if (mesaLine) infoLines.push(mesaLine)
  if (cfg.showDiningOption ?? true) infoLines.push(addMargin(`Modalidad: ${data.diningOption}`))

  // Persons line
  const hasMultiPerson = data.items.some((i) => (i.person_number ?? 0) > 1)
  if ((cfg.showPersons ?? true) && hasMultiPerson) {
    const maxPerson = Math.max(...data.items.map((i) => i.person_number ?? 1))
    infoLines.push(addMargin(`Personas: ${maxPerson}`))
  }

  // Order note (extracted from items or a dedicated field if present)
  // Note: data doesn't carry a top-level note field yet, so this is a placeholder
  // showOrderNote controls whether a note line is shown when available

  const totalLine = addMargin(`TOTAL: ${total}`)
  let payLine = ''
  if (cfg.showPaymentMethod ?? true) {
    const parts = [addMargin(`Pago: ${paymentLabel}`)]
    if (data.paymentMethod === 'Mixto') {
      if (data.cashAmount) parts.push(addMargin(`  Efectivo: ${formatTicketMoney(data.cashAmount)}`))
      if (data.transferAmount) parts.push(addMargin(`  Transfer: ${formatTicketMoney(data.transferAmount)}`))
    }
    payLine = parts.join('\n')
  }

  // Build item section — with person grouping if showPersonDetail is enabled
  let itemSection: string[]
  if ((cfg.showPersonDetail ?? true) && hasMultiPerson) {
    const maxPerson = Math.max(...data.items.map((i) => i.person_number ?? 1))
    itemSection = []
    for (let p = 1; p <= maxPerson; p++) {
      const personItems = data.items.filter((i) => (i.person_number ?? 1) === p)
      if (personItems.length === 0) continue
      itemSection.push(addMargin(`-- P${p} --`))
      itemSection.push(...buildItemLines(personItems))
    }
  } else {
    itemSection = buildItemLines(data.items)
  }

  // Feed lines before cut
  const feedLines = '\n'.repeat(Math.max(0, cfg.feedLinesBeforeCut ?? 3))

  const headerAlign = cfg.headerAlign ?? 'center'
  const footerAlign = cfg.footerAlign ?? 'center'

  return [
    cfg.header1 ? alignText(cfg.header1, headerAlign) : '',
    cfg.header2 ? alignText(cfg.header2, headerAlign) : '',
    LINES,
    ...infoLines,
    LINES,
    ...itemSection,
    LINES,
    totalLine,
    payLine,
    clienteLine,
    LINES,
    cfg.footer1 ? alignText(cfg.footer1, footerAlign) : '',
    cfg.footer2 ? alignText(cfg.footer2, footerAlign) : '',
    feedLines,
  ].filter((l) => l !== '').join('\n')
}

function triggerPrint(ticketText: string, logoUrl?: string | null, cfg?: TicketConfig): void {
  const c = { ...DEFAULT_TICKET_CONFIG, ...(cfg ?? {}) }
  sessionStorage.setItem('pos_ticket', ticketText)
  if (logoUrl && c.showLogo) {
    sessionStorage.setItem('pos_ticket_logo', logoUrl)
  } else {
    sessionStorage.removeItem('pos_ticket_logo')
  }
  sessionStorage.setItem('pos_ticket_fontsize', c.fontSize)
  sessionStorage.setItem('pos_ticket_fontfamily', c.fontFamily)
  sessionStorage.setItem('pos_ticket_linespacing', String(c.lineSpacing))
  sessionStorage.setItem('pos_ticket_headerbold', String(c.headerBold))
  sessionStorage.setItem('pos_ticket_totalbold', String(c.totalBold))
  sessionStorage.setItem('pos_ticket_margintop', String(c.marginTop))
  sessionStorage.setItem('pos_ticket_marginbottom', String(c.marginBottom))
  sessionStorage.setItem('pos_ticket_marginleft', String(c.marginLeft))
  sessionStorage.setItem('pos_ticket_marginright', String(c.marginRight))
  sessionStorage.setItem('pos_ticket_separator', c.separator ?? '-')
  sessionStorage.setItem('pos_ticket_separatordouble', String(c.separatorDouble ?? false))
  window.location.href = '/pos/ticket'
}

function printTicketPopup(data: PrintData, cfg: TicketConfig = DEFAULT_TICKET_CONFIG): void {
  const ticketText = buildTicketText(data, cfg)
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

const MAX_VISIBLE = 50 // max items in normal grid (scrollable)
const GRID_SIZE = 96   // 6 columns × 16 rows, scrollable

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
  uid: string            // unique row key: menu_item_id + person_number (+ modifier hash)
  menu_item_id: string
  name: string
  price: number
  quantity: number
  image_url?: string | null
  modifiers?: SelectedModifier[]
  person_number?: number | null  // null / undefined = single-person mode
  customNote?: string            // free-text note per item (e.g. "sin chuño")
}

type DiningOption = 'Comer dentro' | 'Para llevar'
type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Mixto'

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

// ─── Assign Modal (dark themed, adapted from menu-display) ────────────────────

interface UnassignedItem {
  id: string
  name: string
  name_en?: string | null
  name_qu?: string | null
  price: number
  image_url?: string | null
  categories?: { name: string; slug: string } | null
}

interface AssignModalProps {
  position: number
  onAssign: (itemId: string) => Promise<void>
  onClose: () => void
}

function AssignModal({ position, onAssign, onClose }: AssignModalProps) {
  const [items, setItems] = useState<UnassignedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/menu-display/unassigned')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setItems(data.items ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  const handleSelect = async (id: string) => {
    setAssigning(id)
    try {
      await onAssign(id)
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#1a1917',
          border: '1px solid rgba(255,255,255,0.12)',
          width: 'min(92vw, 480px)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 shrink-0">
          <p className="text-white font-bold text-base mb-1">
            Agregar plato — celda {position}
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato..."
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-white/30 text-sm">
              Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-white/30 text-sm">
              Sin platos disponibles
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                disabled={!!assigning}
                onClick={() => handleSelect(item.id)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 text-left transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: assigning === item.id ? 'rgba(245,200,66,0.15)' : 'rgba(255,255,255,0.05)' }}
              >
                {/* Thumbnail */}
                <div
                  className="shrink-0 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center"
                  style={{ width: 40, height: 40 }}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-lg">{CATEGORY_ICONS[item.categories?.slug ?? ''] ?? '🍽️'}</span>
                  )}
                </div>

                {/* Name + price */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold leading-tight truncate">{item.name}</p>
                  {item.categories?.name && (
                    <p className="text-white/40 text-xs leading-tight truncate">{item.categories.name}</p>
                  )}
                </div>
                <p className="shrink-0 text-yellow-400 text-sm font-bold tabular-nums">
                  {formatARS(item.price)}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Cancel button */}
        <div className="px-3 pb-4 pt-1 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 font-bold text-white/70 transition-all active:scale-95"
            style={{ background: '#3f3f46', fontSize: '0.9rem' }}
          >
            Cancelar
          </button>
        </div>
      </div>
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

// ─── POS Dish Card ─────────────────────────────────────────────────────────────

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

type PrefillEgreso = { amount: number; description: string }

function CashMovementsModal({ onClose, prefillEgreso }: { onClose: () => void; prefillEgreso?: PrefillEgreso }) {
  const [tab, setTab] = useState<'ingreso' | 'egreso'>(prefillEgreso ? 'egreso' : 'ingreso')
  const [amount, setAmount] = useState(prefillEgreso ? String(prefillEgreso.amount) : '')
  const [description, setDescription] = useState(prefillEgreso ? prefillEgreso.description : '')
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
        '----------------------',
        tab === 'ingreso' ? '  INGRESO DE EFECTIVO' : '  EGRESO DE EFECTIVO',
        '----------------------',
        `${dateStr}  ${timeStr}`,
        '',
        `Monto: $${parsed.toLocaleString('es-AR')}`,
        description.trim() ? `Det: ${description.trim()}` : '',
        '',
        '----------------------',
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

// ─── Dish Card (normal mode) ───────────────────────────────────────────────────
function POSDishCard({
  item,
  onAdd,
  locale,
  editMode,
  onUnassign,
}: {
  item: MenuItem
  onAdd: (item: MenuItem) => void
  locale: Locale
  editMode: boolean
  onUnassign: (item: MenuItem) => void
}) {
  const isUnavailable = item.available === 0 || item.available_qty === 0
  const isSoldOutByQty = item.available_qty === 0
  const hasLimitedQty = item.available_qty !== null && item.available_qty !== undefined && item.available_qty >= 1 && item.available_qty <= 3
  const [pressed, setPressed] = useState(false)

  const handleClick = () => {
    if (editMode) return // clicks in edit mode handled by X button only
    if (isUnavailable) return
    setPressed(true)
    onAdd(item)
    setTimeout(() => setPressed(false), 200)
  }

  return (
    <article
      onClick={handleClick}
      className={`relative w-full h-full rounded-xl overflow-hidden select-none transition-all duration-150 ${
        editMode
          ? 'cursor-default border-2 border-red-500/40'
          : isUnavailable
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

      {/* Edit mode overlay */}
      {editMode && (
        <div className="absolute inset-0 bg-red-900/20" />
      )}

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
      {!editMode && (isSoldOutByQty || isUnavailable) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="px-3 py-1 rounded-full bg-red-600/90 text-white text-sm font-bold tracking-wide uppercase border-2 border-white/40 shadow-lg">
            AGOTADO
          </span>
        </div>
      )}

      {/* Últimos X disponibles badge */}
      {!editMode && hasLimitedQty && (
        <div className="absolute top-1 right-1">
          <span className="px-2 py-1 rounded-lg bg-orange-500 text-white text-xs font-bold shadow-lg border border-orange-300/50">
            Últimos {item.available_qty}
          </span>
        </div>
      )}

      {/* Edit mode: red X button (top-right) */}
      {editMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onUnassign(item)
          }}
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-black text-sm shadow-lg hover:bg-red-700 active:scale-90 transition-all z-10"
          aria-label="Quitar de grilla"
        >
          ✕
        </button>
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
  cashAmount,
  transferAmount,
  customerName,
  orderNotes,
  customers,
  submitting,
  total,
  onTableChange,
  onPaymentChange,
  onCashAmountChange,
  onTransferAmountChange,
  onCustomerChange,
  onNotesChange,
  onCancel,
  onConfirm,
}: {
  diningOption: DiningOption
  tableNumber: string
  paymentMethod: PaymentMethod
  cashAmount: string
  transferAmount: string
  customerName: string
  orderNotes: string
  customers: FrequentCustomer[]
  submitting: boolean
  total: number
  onTableChange: (v: string) => void
  onPaymentChange: (v: PaymentMethod) => void
  onCashAmountChange: (v: string) => void
  onTransferAmountChange: (v: string) => void
  onCustomerChange: (v: string) => void
  onNotesChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  // Validation for mixed payment
  const mixedValid = paymentMethod !== 'Mixto' || (() => {
    const ca = parseFloat(cashAmount.replace(',', '.') || '0')
    const ta = parseFloat(transferAmount.replace(',', '.') || '0')
    return Math.abs(ca + ta - total) < 1
  })()

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
            <div className="grid grid-cols-3 gap-1.5">
              {(['Efectivo', 'Transferencia', 'Mixto'] as PaymentMethod[]).map((pm) => (
                <button
                  key={pm}
                  onClick={() => onPaymentChange(pm)}
                  className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                    paymentMethod === pm
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {pm === 'Efectivo' ? '💵 Efectivo' : pm === 'Transferencia' ? '📲 Transfer' : '💰 Mixto'}
                </button>
              ))}
            </div>

            {/* Mixed payment fields */}
            {paymentMethod === 'Mixto' && (
              <div className="mt-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Monto efectivo</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={cashAmount}
                    onChange={(e) => onCashAmountChange(e.target.value)}
                    placeholder="$ 0"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Monto transferencia</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={transferAmount}
                    onChange={(e) => onTransferAmountChange(e.target.value)}
                    placeholder="$ 0"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
                  />
                </div>
                {/* Validation feedback */}
                {(() => {
                  const ca = parseFloat(cashAmount.replace(',', '.') || '0')
                  const ta = parseFloat(transferAmount.replace(',', '.') || '0')
                  const diff = ca + ta - total
                  if (Math.abs(diff) < 1) {
                    return <p className="text-xs text-green-600 font-semibold">✓ Suma correcta</p>
                  }
                  return (
                    <p className="text-xs text-red-500 font-semibold">
                      La suma debe ser {formatARS(total)} (falta {formatARS(Math.abs(diff))})
                    </p>
                  )
                })()}
              </div>
            )}
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
            disabled={submitting || !mixedValid}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md ${
              submitting || !mixedValid
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

// ─── Change Payment Modal (for sent orders) ───────────────────────────────────

type SentOrder = {
  id: string
  customer_name: string
  total: number
  payment_method: string
  cash_amount?: number | null
  transfer_amount?: number | null
  created_at: string
  status?: string | null
}

function ChangePaymentModal({
  order,
  onClose,
  onSuccess,
}: {
  order: SentOrder
  onClose: () => void
  onSuccess: () => void
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    if (order.payment_method === 'mixed') return 'Mixto'
    if (order.payment_method === 'transfer') return 'Transferencia'
    return 'Efectivo'
  })
  const [cashAmount, setCashAmount] = useState(order.cash_amount ? String(order.cash_amount) : '')
  const [transferAmount, setTransferAmount] = useState(order.transfer_amount ? String(order.transfer_amount) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mixedValid = paymentMethod !== 'Mixto' || (() => {
    const ca = parseFloat(cashAmount.replace(',', '.') || '0')
    const ta = parseFloat(transferAmount.replace(',', '.') || '0')
    return Math.abs(ca + ta - order.total) < 1
  })()

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const ca = paymentMethod === 'Mixto' ? parseFloat(cashAmount.replace(',', '.') || '0') : null
      const ta = paymentMethod === 'Mixto' ? parseFloat(transferAmount.replace(',', '.') || '0') : null
      const pm = paymentMethod === 'Mixto' ? 'mixed' : paymentMethod === 'Transferencia' ? 'transfer' : 'cash'

      const res = await fetch(`/api/pos/orders/${order.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: pm, cash_amount: ca, transfer_amount: ta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-orange-500 flex items-center justify-between">
          <div>
            <h3 className="text-white font-black text-lg leading-none">Cambiar método de pago</h3>
            <p className="text-orange-100 text-xs mt-0.5">{order.customer_name} · {formatARS(order.total)}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Método de pago</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Efectivo', 'Transferencia', 'Mixto'] as PaymentMethod[]).map((pm) => (
                <button
                  key={pm}
                  onClick={() => setPaymentMethod(pm)}
                  className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                    paymentMethod === pm
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {pm === 'Efectivo' ? '💵 Efectivo' : pm === 'Transferencia' ? '📲 Transfer' : '💰 Mixto'}
                </button>
              ))}
            </div>

            {paymentMethod === 'Mixto' && (
              <div className="mt-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Monto efectivo</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="$ 0"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Monto transferencia</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="$ 0"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
                  />
                </div>
                {(() => {
                  const ca = parseFloat(cashAmount.replace(',', '.') || '0')
                  const ta = parseFloat(transferAmount.replace(',', '.') || '0')
                  const diff = ca + ta - order.total
                  if (Math.abs(diff) < 1) {
                    return <p className="text-xs text-green-600 font-semibold">✓ Suma correcta</p>
                  }
                  return (
                    <p className="text-xs text-red-500 font-semibold">
                      La suma debe ser {formatARS(order.total)}
                    </p>
                  )
                })()}
              </div>
            )}
          </div>

          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !mixedValid}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md ${
              saving || !mixedValid
                ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
            }`}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Order Modal ───────────────────────────────────────────────────────

type CancelResult = {
  payment_method: string
  total: number
  cash_amount?: number | null
  transfer_amount?: number | null
  orderId: string
}

function CancelOrderModal({
  order,
  onClose,
  onSuccess,
}: {
  order: SentOrder
  onClose: () => void
  onSuccess: (result: CancelResult) => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/pos/orders/${order.id}/cancel`, { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al anular')
      onSuccess({
        payment_method: data.payment_method ?? order.payment_method,
        total: data.total ?? order.total,
        cash_amount: data.cash_amount ?? order.cash_amount,
        transfer_amount: data.transfer_amount ?? order.transfer_amount,
        orderId: order.id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setCancelling(false)
  }

  const orderLabel = order.id.slice(-6)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-red-600 flex items-center justify-between">
          <div>
            <h3 className="text-white font-black text-lg leading-none">Anular pedido</h3>
            <p className="text-red-100 text-xs mt-0.5">{order.customer_name} · {formatARS(order.total)}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-3">
          <p className="text-gray-800 text-sm font-semibold">
            ¿Anular pedido <span className="font-black text-gray-900">{orderLabel}</span> por <span className="font-black text-red-600">{formatARS(order.total)}</span>?
          </p>
          <p className="text-gray-500 text-xs">Se registrará la devolución en caja y se revertirá el stock de inventario.</p>
          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={cancelling}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={cancelling}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md ${
              cancelling
                ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
            }`}
          >
            {cancelling ? 'Anulando...' : 'Confirmar anulación'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ticket Item Row ──────────────────────────────────────────────────────────

function TicketItemRow({
  item,
  onUpdateQty,
  onRemove,
  onUpdateNote,
}: {
  item: TicketItem
  onUpdateQty: (uid: string, delta: number) => void
  onRemove: (uid: string) => void
  onUpdateNote: (uid: string, note: string) => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
  const unitTotal = item.price + modExtra
  return (
    <li className="flex flex-col bg-gray-50 rounded-xl px-2.5 py-1.5 border border-gray-100 gap-1">
      <div className="flex items-start gap-1.5">
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
          {item.customNote && !noteOpen && (
            <p className="text-orange-600 text-xs leading-tight pl-2 mt-0.5 italic">✎ {item.customNote}</p>
          )}
          <p className="text-teal-600 font-bold text-xs tabular-nums mt-0.5">
            {formatARS(unitTotal)} × {item.quantity} = {formatARS(unitTotal * item.quantity)}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <button
            onClick={() => setNoteOpen((o) => !o)}
            className={`w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all active:scale-90 ${
              item.customNote
                ? 'bg-orange-100 hover:bg-orange-200 text-orange-600'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-500'
            }`}
            aria-label="Agregar nota"
            title="Nota del ítem"
          >
            ✎
          </button>
          <button
            onClick={() => onUpdateQty(item.uid, -1)}
            className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 active:scale-90 flex items-center justify-center font-black text-gray-700 text-sm transition-all"
            aria-label="Quitar uno"
          >
            −
          </button>
          <span className="w-6 text-center font-black text-gray-900 tabular-nums text-sm">{item.quantity}</span>
          <button
            onClick={() => onUpdateQty(item.uid, +1)}
            className="w-6 h-6 rounded-md bg-teal-100 hover:bg-teal-200 active:scale-90 flex items-center justify-center font-black text-teal-700 text-sm transition-all"
            aria-label="Agregar uno"
          >
            +
          </button>
          <button
            onClick={() => onRemove(item.uid)}
            className="w-6 h-6 rounded-md bg-red-100 hover:bg-red-200 active:scale-90 flex items-center justify-center text-red-600 font-black text-xs transition-all ml-0.5"
            aria-label="Eliminar"
          >
            ✕
          </button>
        </div>
      </div>
      {noteOpen && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <input
            type="text"
            value={item.customNote ?? ''}
            onChange={(e) => onUpdateNote(item.uid, e.target.value)}
            placeholder="Ej: sin chuño, solo papas..."
            autoFocus
            className="flex-1 rounded-lg border border-orange-300 px-2 py-1 text-xs font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            onClick={() => setNoteOpen(false)}
            className="shrink-0 text-xs text-gray-400 hover:text-gray-600 font-bold px-1"
            aria-label="Cerrar nota"
          >
            ✓
          </button>
        </div>
      )}
    </li>
  )
}

// ─── Ticket Panel ─────────────────────────────────────────────────────────────

function TicketPanel({
  items,
  diningOption,
  persons,
  activePerson,
  onUpdateQty,
  onRemove,
  onUpdateNote,
  onDiningChange,
  onPersonsChange,
  onActivePersonChange,
  onOpenConfirm,
}: {
  items: TicketItem[]
  diningOption: DiningOption
  persons: number
  activePerson: number
  onUpdateQty: (uid: string, delta: number) => void
  onRemove: (uid: string) => void
  onUpdateNote: (uid: string, note: string) => void
  onDiningChange: (v: DiningOption) => void
  onPersonsChange: (v: number) => void
  onActivePersonChange: (v: number) => void
  onOpenConfirm: () => void
}) {
  const total = items.reduce((s, i) => {
    const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
    return s + (i.price + modExtra) * i.quantity
  }, 0)
  const isEmpty = items.length === 0
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  const multiPerson = persons > 1

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

      {/* Persons selector */}
      <div className="px-3 pt-2 pb-1.5 shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Personas:</span>
          <button
            onClick={() => {
              const next = Math.max(1, persons - 1)
              onPersonsChange(next)
              if (activePerson > next) onActivePersonChange(next)
            }}
            className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 active:scale-90 flex items-center justify-center font-black text-gray-700 text-sm transition-all"
            aria-label="Menos personas"
          >
            −
          </button>
          <span className="w-5 text-center font-black text-gray-900 tabular-nums text-sm">{persons}</span>
          <button
            onClick={() => onPersonsChange(Math.min(9, persons + 1))}
            className="w-6 h-6 rounded-md bg-teal-100 hover:bg-teal-200 active:scale-90 flex items-center justify-center font-black text-teal-700 text-sm transition-all"
            aria-label="Más personas"
          >
            +
          </button>
          {/* Person tabs (only when > 1) */}
          {multiPerson && (
            <div className="flex gap-1 ml-1 flex-wrap">
              {Array.from({ length: persons }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => onActivePersonChange(p)}
                  className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                    activePerson === p
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  P{p}
                </button>
              ))}
            </div>
          )}
        </div>
        {multiPerson && (
          <p className="text-[10px] text-teal-600 font-semibold mt-1 leading-none">
            Agregando para Persona {activePerson}
          </p>
        )}
      </div>

      {/* Items list — flex-1, scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 py-8">
            <span className="text-4xl">🛒</span>
            <p className="text-sm font-semibold">Sin items</p>
            <p className="text-xs">Tocá un plato para agregar</p>
          </div>
        ) : multiPerson ? (
          // Multi-person view: grouped by person
          <div className="flex flex-col gap-2">
            {Array.from({ length: persons }, (_, i) => i + 1).map((p) => {
              const personItems = items.filter((it) => it.person_number === p)
              if (personItems.length === 0) return null
              const personTotal = personItems.reduce((s, it) => {
                const modExtra = (it.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
                return s + (it.price + modExtra) * it.quantity
              }, 0)
              return (
                <div key={p}>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs font-black text-teal-700 uppercase tracking-wide">P{p}:</span>
                    <span className="text-xs font-bold text-gray-500 tabular-nums">{formatARS(personTotal)}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {personItems.map((item) => (
                      <TicketItemRow key={item.uid} item={item} onUpdateQty={onUpdateQty} onRemove={onRemove} onUpdateNote={onUpdateNote} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ) : (
          // Single-person view: flat list (unchanged)
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <TicketItemRow key={item.uid} item={item} onUpdateQty={onUpdateQty} onRemove={onRemove} onUpdateNote={onUpdateNote} />
            ))}
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
  const { languagesEnabled } = useLanguagesEnabled()

  // Force locale to 'es' when languages are disabled
  useEffect(() => {
    if (!languagesEnabled && locale !== 'es') setLocale('es')
  }, [languagesEnabled, locale, setLocale])

  // Logo (fetched once on load)
  const [ticketLogo, setTicketLogo] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/admin/settings?key=ticket_logo')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data) && data[0]?.value) setTicketLogo(data[0].value) })
      .catch(() => {})
  }, [])

  // Ticket config (fetched once on load)
  const [ticketCfg, setTicketCfg] = useState<TicketConfig>(DEFAULT_TICKET_CONFIG)
  useEffect(() => {
    fetch('/api/settings/ticket-config')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setTicketCfg({ ...DEFAULT_TICKET_CONFIG, ...data }) })
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
      fetch('/api/admin/modifiers').then((r) => r.ok ? r.json() : { modifiers: [] }),
      fetch('/api/admin/item-modifiers').then((r) => r.ok ? r.json() : { mappings: {} }),
    ]).then(([modData, mapData]) => {
      setAllModifiers(modData.modifiers ?? [])
      setItemModifierMap(mapData.mappings ?? {})
    }).catch(() => {})
  }, [])

  // Modifier modal state
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null)
  const [pendingModifiers, setPendingModifiers] = useState<Modifier[]>([])

  // Persons state (per-person ordering)
  const [persons, setPersons] = useState(1)
  const [activePerson, setActivePerson] = useState(1)

  // Ticket state
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
  const [diningOption, setDiningOption] = useState<DiningOption>('Comer dentro')
  const [tableNumber, setTableNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo')
  const [cashAmount, setCashAmount] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showPrintBtn, setShowPrintBtn] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)
  const [cashModalPrefill, setCashModalPrefill] = useState<PrefillEgreso | undefined>(undefined)

  // Sent orders panel (Feature 2)
  const [sentOrders, setSentOrders] = useState<SentOrder[]>([])
  const [loadingSentOrders, setLoadingSentOrders] = useState(false)
  const [showSentOrders, setShowSentOrders] = useState(false)
  const [changePaymentOrder, setChangePaymentOrder] = useState<SentOrder | null>(null)
  const [cancelOrder, setCancelOrder] = useState<SentOrder | null>(null)

  const loadSentOrders = useCallback(async () => {
    setLoadingSentOrders(true)
    try {
      const res = await fetch('/api/pos/orders/recent')
      if (res.ok) {
        const data = await res.json()
        setSentOrders(data.orders ?? [])
      }
    } catch (e) { void e }
    setLoadingSentOrders(false)
  }, [])

  useEffect(() => {
    if (showSentOrders) loadSentOrders()
  }, [showSentOrders, loadSentOrders])

  // Ticket panel open/close
  const [ticketOpen, setTicketOpen] = useState(false)

  // ─── Edit mode state ──────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [assigningPosition, setAssigningPosition] = useState<number | null>(null)

  // Toggle edit mode
  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  // Unassign item: set display_order to 0
  const handleUnassign = useCallback(async (item: MenuItem) => {
    try {
      await fetch('/api/menu-display/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id: item.id, display_order: 0 }] }),
      })
      // Realtime subscription will update the grid automatically
    } catch (e) { void e }
  }, [])

  // Assign item to a position
  const handleAssign = useCallback(async (itemId: string) => {
    if (assigningPosition === null) return
    await fetch('/api/menu-display/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ id: itemId, display_order: assigningPosition }] }),
    })
    setAssigningPosition(null)
  }, [assigningPosition])

  // Category filter — persisted in sessionStorage so it survives page refresh
  const [activeCategory, setActiveCategory] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pos_activeCategory') ?? 'all'
    }
    return 'all'
  })

  useEffect(() => {
    sessionStorage.setItem('pos_activeCategory', activeCategory)
  }, [activeCategory])

  // Items for normal mode: filter by category, exclude unpositioned (display_order=0), cap at MAX_VISIBLE
  const filteredItems = (activeCategory === 'all'
    ? menuItems
    : menuItems.filter((item) => {
        const cat = categories.find((c) => c.slug === activeCategory)
        return cat ? item.category_id === cat.id : true
      })
  ).filter((item) => (item.display_order ?? 0) > 0)

  // Items for category tabs: filter by category, only show assigned items (display_order > 0)
  const categoryItems = activeCategory === 'all'
    ? []
    : menuItems.filter((item) => {
        if ((item.display_order ?? 0) <= 0) return false
        const cat = categories.find((c) => c.slug === activeCategory)
        return cat ? item.category_id === cat.id : true
      })

  const displayItems = activeCategory === 'all' ? filteredItems.slice(0, GRID_SIZE) : filteredItems.slice(0, MAX_VISIBLE)

  // Items for edit mode: all positioned items (display_order 1-24), not filtered by category
  const positionedItems = menuItems.filter((item) => (item.display_order ?? 0) > 0)

  // Add item to ticket (called after modifier selection or directly)
  const addItemToTicket = useCallback((item: MenuItem, modifiers?: SelectedModifier[]) => {
    setTicketItems((prev) => {
      const personNum = persons > 1 ? activePerson : null
      const noMods = !modifiers || modifiers.length === 0

      if (noMods) {
        // Build uid for single-person or multi-person no-mod item
        const uid = `${item.id}__p${personNum ?? 0}`
        const existing = prev.find((i) => i.uid === uid)
        if (existing) {
          return prev.map((i) => i.uid === uid ? { ...i, quantity: i.quantity + 1 } : i)
        }
        return [
          ...prev,
          {
            uid,
            menu_item_id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            image_url: item.image_url,
            person_number: personNum,
          },
        ]
      }

      // With modifiers: always new entry (unique modifier combination)
      const modHash = (modifiers ?? []).map((m) => m.optionId).sort().join(',')
      const uid = `${item.id}__p${personNum ?? 0}__m${modHash}__${Date.now()}`
      return [
        ...prev,
        {
          uid,
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          image_url: item.image_url,
          modifiers,
          person_number: personNum,
        },
      ]
    })
    setTicketOpen(true)
  }, [persons, activePerson])

  const handleAddItem = useCallback((item: MenuItem) => {
    const modifierIds = itemModifierMap[item.id] ?? []
    if (modifierIds.length === 0) {
      // No modifiers — add directly
      addItemToTicket(item)
      return
    }

    // Has modifiers — show modal
    const modifiersForItem = allModifiers.filter((m) => modifierIds.includes(m.id))
    if (modifiersForItem.length === 0) {
      // Modifiers mapped but groups not found — add directly
      addItemToTicket(item)
      return
    }
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

  const handleUpdateQty = useCallback((uid: string, delta: number) => {
    setTicketItems((prev) => {
      const item = prev.find((i) => i.uid === uid)
      if (!item) return prev
      const newQty = item.quantity + delta
      if (newQty <= 0) return prev.filter((i) => i.uid !== uid)
      return prev.map((i) => i.uid === uid ? { ...i, quantity: newQty } : i)
    })
  }, [])

  const handleRemove = useCallback((uid: string) => {
    setTicketItems((prev) => prev.filter((i) => i.uid !== uid))
  }, [])

  const handleUpdateNote = useCallback((uid: string, note: string) => {
    setTicketItems((prev) => prev.map((i) => i.uid === uid ? { ...i, customNote: note } : i))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (ticketItems.length === 0) return
    setSubmitting(true)
    try {
      const total = ticketItems.reduce((s, i) => {
        const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
        return s + (i.price + modExtra) * i.quantity
      }, 0)

      // Build items with line_note for modifiers + person_number if multi-person
      const itemsPayload = ticketItems.map((item) => {
        const modNote = buildLineNote(item.modifiers ?? [])
        const customNote = item.customNote?.trim() || null
        const line_note = modNote && customNote
          ? `${modNote} · ${customNote}`
          : modNote ?? customNote
        return {
          menu_item_id: item.menu_item_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price + (item.modifiers ?? []).reduce((s, m) => s + m.price, 0),
          line_note,
          ...(persons > 1 && item.person_number ? { person_number: item.person_number } : {}),
        }
      })

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
          payment_method: paymentMethod === 'Mixto' ? 'mixed' : paymentMethod === 'Transferencia' ? 'transfer' : 'cash',
          cash_amount: paymentMethod === 'Mixto'
            ? parseFloat(cashAmount.replace(',', '.') || '0')
            : paymentMethod === 'Efectivo' ? total : null,
          transfer_amount: paymentMethod === 'Mixto'
            ? parseFloat(transferAmount.replace(',', '.') || '0')
            : paymentMethod === 'Transferencia' ? total : null,
          customer_name: customerName || 'POS',
          notes: finalNotes,
          persons: persons > 1 ? persons : 1,
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
        cashAmount: paymentMethod === 'Mixto' ? parseFloat(cashAmount.replace(',', '.') || '0') : undefined,
        transferAmount: paymentMethod === 'Mixto' ? parseFloat(transferAmount.replace(',', '.') || '0') : undefined,
        customerName: customerName || '',
      }

      // Reset ticket
      setTicketItems([])
      setTableNumber('')
      setCustomerName('')
      setOrderNotes('')
      setCashAmount('')
      setTransferAmount('')
      setTicketOpen(false)
      setShowConfirmModal(false)
      setPersons(1)
      setActivePerson(1)
      setToast('Pedido enviado a cocina')

      // Print ticket via popup window
      printTicketPopup(snapshot, ticketCfg)
      setShowPrintBtn(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar pedido'
      setToast(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }, [ticketItems, diningOption, tableNumber, paymentMethod, cashAmount, transferAmount, customerName, orderNotes, persons])

  const ticketCount = ticketItems.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="fixed inset-0 flex flex-col bg-black overflow-hidden select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top Bar: POS + Categories + Language + Clock + Ticket ── */}
      <header className={`shrink-0 flex items-center gap-2 px-3 py-1.5 shadow-md transition-colors ${editMode ? 'bg-red-950' : 'bg-sumak-brown'}`}>
        <h1 className="text-sumak-gold font-black text-lg leading-none shrink-0">POS</h1>
        <div className="h-5 w-px bg-sumak-gold/30 shrink-0" />
        {/* Category Tabs inline */}
        <div
          className="flex-1 flex gap-1.5 overflow-x-auto min-w-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            onClick={() => { setActiveCategory('all'); }}
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
              onClick={() => { setActiveCategory(cat.slug); setEditMode(false); }}
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
        {languagesEnabled && (
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
        )}
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
        {/* Sent orders button (change payment) */}
        <button
          onClick={() => setShowSentOrders(true)}
          title="Pedidos enviados"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light active:scale-95 transition-all shrink-0 font-bold text-base"
        >
          📋
        </button>
        {/* Edit mode button — only visible in Todos tab */}
        {activeCategory === 'all' && (
        <button
          onClick={toggleEditMode}
          title={editMode ? 'Salir del modo edición' : 'Editar grilla'}
          className={`flex items-center justify-center w-8 h-8 rounded-lg active:scale-95 transition-all shrink-0 font-bold text-base ${
            editMode
              ? 'bg-red-600 text-white ring-2 ring-red-400'
              : 'bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light'
          }`}
        >
          ✏️
        </button>
        )}
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
            className="flex-1 min-w-0 p-2 overflow-y-auto"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gridTemplateRows: editMode ? 'repeat(4, calc(25% - 5px))' : 'repeat(4, calc(25% - 5px))',
              gridAutoRows: 'calc(25% - 5px)',
              gap: '6px',
            }}
          >
            {loading ? (
              Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-full h-full rounded-xl bg-sumak-cream-dark animate-pulse" />
              ))
            ) : editMode && activeCategory === 'all' ? (
              // Edit mode (only in Todos): fixed 24-cell grid, find items by display_order
              Array.from({ length: GRID_SIZE }).map((_, gridIndex) => {
                const position = gridIndex + 1
                const item = positionedItems.find((i) => i.display_order === position)
                if (item) {
                  return (
                    <POSDishCard
                      key={item.id}
                      item={item}
                      onAdd={handleAddItem}
                      locale={locale}
                      editMode={true}
                      onUnassign={handleUnassign}
                    />
                  )
                }
                // Empty cell: show + button
                return (
                  <button
                    key={`empty-${position}`}
                    onClick={() => setAssigningPosition(position)}
                    className="w-full h-full rounded-xl bg-gray-900/60 border border-gray-700/50 flex items-center justify-center hover:bg-gray-800/60 active:bg-gray-700/60 transition-all group"
                    aria-label={`Agregar plato en celda ${position}`}
                  >
                    <span className="text-white/20 text-2xl font-bold group-hover:text-white/40 transition-colors select-none">+</span>
                  </button>
                )
              })
            ) : activeCategory === 'all' ? (
              // Normal mode Todos: fixed 24-cell grid by position
              Array.from({ length: GRID_SIZE }).map((_, gridIndex) => {
                const position = gridIndex + 1
                const item = displayItems.find((i) => i.display_order === position)
                if (item) {
                  return (
                    <POSDishCard
                      key={item.id}
                      item={item}
                      onAdd={handleAddItem}
                      locale={locale}
                      editMode={false}
                      onUnassign={handleUnassign}
                    />
                  )
                }
                return <div key={`empty-${position}`} className="w-full h-full" />
              })
            ) : (
              // Category tab: items from that category, grouped by subcategory if Bebidas
              (() => {
                const activeCat = categories.find((c) => c.slug === activeCategory)
                const isBebidas =
                  activeCat?.slug === 'bebidas' ||
                  activeCat?.name?.toLowerCase().includes('bebida')
                const hasSubcategories = isBebidas && categoryItems.some((i) => i.subcategory)

                if (!hasSubcategories) {
                  return categoryItems.map((item) => (
                    <POSDishCard
                      key={item.id}
                      item={item}
                      onAdd={handleAddItem}
                      locale={locale}
                      editMode={false}
                      onUnassign={handleUnassign}
                    />
                  ))
                }

                // Bebidas with subcategories: group and render with separators
                const SUBCATEGORY_ORDER_POS = ['Naturales de la casa', 'Sin alcohol', 'Con alcohol']
                const subMap = new Map<string, typeof categoryItems>()
                for (const item of categoryItems) {
                  const key = item.subcategory ?? ''
                  if (!subMap.has(key)) subMap.set(key, [])
                  subMap.get(key)!.push(item)
                }
                const groups: { subcategory: string | null; items: typeof categoryItems }[] = []
                for (const sub of SUBCATEGORY_ORDER_POS) {
                  if (subMap.has(sub)) groups.push({ subcategory: sub, items: subMap.get(sub)! })
                }
                if (subMap.has('')) groups.push({ subcategory: null, items: subMap.get('')! })

                return groups.flatMap(({ subcategory, items: subItems }) => [
                  ...(subcategory
                    ? [
                        <div
                          key={`sep-${subcategory}`}
                          style={{ gridColumn: '1 / -1' }}
                          className="flex flex-col pt-1 pb-0.5"
                        >
                          <span className="text-sumak-gold font-bold text-xs uppercase tracking-widest leading-none">
                            {subcategory}
                          </span>
                          <div className="h-px bg-sumak-gold/30 mt-1" />
                        </div>,
                      ]
                    : []),
                  ...subItems.map((item) => (
                    <POSDishCard
                      key={item.id}
                      item={item}
                      onAdd={handleAddItem}
                      locale={locale}
                      editMode={false}
                      onUnassign={handleUnassign}
                    />
                  )),
                ])
              })()
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
              persons={persons}
              activePerson={activePerson}
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              onUpdateNote={handleUpdateNote}
              onDiningChange={setDiningOption}
              onPersonsChange={setPersons}
              onActivePersonChange={setActivePerson}
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
          cashAmount={cashAmount}
          transferAmount={transferAmount}
          customerName={customerName}
          orderNotes={orderNotes}
          customers={customers}
          submitting={submitting}
          total={ticketItems.reduce((s, i) => s + (i.price + (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)) * i.quantity, 0)}
          onTableChange={setTableNumber}
          onPaymentChange={setPaymentMethod}
          onCashAmountChange={setCashAmount}
          onTransferAmountChange={setTransferAmount}
          onCustomerChange={setCustomerName}
          onNotesChange={setOrderNotes}
          onCancel={() => setShowConfirmModal(false)}
          onConfirm={handleSubmit}
        />
      )}

      {/* ── Cash Movements Modal ── */}
      {showCashModal && (
        <CashMovementsModal
          onClose={() => { setShowCashModal(false); setCashModalPrefill(undefined) }}
          prefillEgreso={cashModalPrefill}
        />
      )}

      {/* ── Sent Orders Panel ── */}
      {showSentOrders && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSentOrders(false) }}
        >
          <div className="bg-white rounded-t-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}>
            {/* Header */}
            <div className="px-5 py-4 bg-teal-600 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-black text-lg leading-none">Pedidos recientes</h3>
                <p className="text-teal-100 text-xs mt-0.5">Últimos pedidos del turno</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadSentOrders}
                  disabled={loadingSentOrders}
                  className="text-teal-100 hover:text-white text-sm font-semibold disabled:opacity-50"
                >
                  {loadingSentOrders ? '...' : '↺ Actualizar'}
                </button>
                <button onClick={() => setShowSentOrders(false)} className="text-white/70 hover:text-white text-xl leading-none ml-2">✕</button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
              {loadingSentOrders ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : sentOrders.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Sin pedidos recientes</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sentOrders.map((order) => {
                    const pmLabel =
                      order.payment_method === 'mixed' ? '💰 Mixto'
                      : order.payment_method === 'transfer' ? '📲 Transfer'
                      : '💵 Efectivo'
                    const isCancelled = order.status === 'cancelled'
                    const isDelivered = order.status === 'delivered'
                    return (
                      <li key={order.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${isCancelled ? 'bg-red-50 border-red-200 opacity-75' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm truncate ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>{order.customer_name}</span>
                            {isCancelled && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase">Anulado</span>
                            )}
                            <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs font-bold tabular-nums ${isCancelled ? 'text-gray-400 line-through' : 'text-teal-700'}`}>{formatARS(order.total)}</span>
                            <span className="text-xs text-gray-500">{pmLabel}</span>
                            {order.payment_method === 'mixed' && order.cash_amount != null && order.transfer_amount != null && (
                              <span className="text-xs text-gray-400">({formatARS(order.cash_amount)} ef + {formatARS(order.transfer_amount)} tr)</span>
                            )}
                          </div>
                        </div>
                        {!isCancelled && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isDelivered && (
                              <button
                                onClick={() => { setCancelOrder(order); setShowSentOrders(false) }}
                                className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs active:scale-95 transition-all"
                                title="Anular pedido"
                              >
                                Anular
                              </button>
                            )}
                            <button
                              onClick={() => { setChangePaymentOrder(order); setShowSentOrders(false) }}
                              className="px-3 py-1.5 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold text-xs active:scale-95 transition-all"
                              title="Cambiar método de pago"
                            >
                              ✎ Pago
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Change Payment Modal ── */}
      {changePaymentOrder && (
        <ChangePaymentModal
          order={changePaymentOrder}
          onClose={() => setChangePaymentOrder(null)}
          onSuccess={() => {
            setChangePaymentOrder(null)
            setToast('Método de pago actualizado')
          }}
        />
      )}

      {/* ── Cancel Order Modal ── */}
      {cancelOrder && (
        <CancelOrderModal
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          onSuccess={(result) => {
            setCancelOrder(null)
            loadSentOrders()
            const orderLabel = result.orderId.slice(-6)
            if (result.payment_method === 'cash') {
              setCashModalPrefill({
                amount: Number(result.total),
                description: `Devolución pedido #${orderLabel}`,
              })
              setShowCashModal(true)
            } else if (result.payment_method === 'mixed') {
              const cashAmt = Number(result.cash_amount ?? 0)
              const transferAmt = Number(result.transfer_amount ?? 0)
              if (cashAmt > 0) {
                const desc = transferAmt > 0
                  ? `Devolución efectivo pedido #${orderLabel} (también devolver ${formatARS(transferAmt)} por transfer)`
                  : `Devolución efectivo pedido #${orderLabel}`
                setCashModalPrefill({ amount: cashAmt, description: desc })
                setShowCashModal(true)
              } else if (transferAmt > 0) {
                setToast(`Pedido anulado. Realizar devolución de ${formatARS(transferAmt)} por transferencia`)
              } else {
                setToast('Pedido anulado')
              }
            } else {
              // transfer
              setToast(`Pedido anulado. Realizar devolución de ${formatARS(Number(result.total))} por transferencia`)
            }
          }}
        />
      )}

      {/* ── Assign Modal (edit mode) ── */}
      {assigningPosition !== null && (
        <AssignModal
          position={assigningPosition}
          onAssign={handleAssign}
          onClose={() => setAssigningPosition(null)}
        />
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
                  triggerPrint(ticket, ticketLogo, ticketCfg)
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
