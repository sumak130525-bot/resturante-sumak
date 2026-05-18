'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import type { MenuItem } from '@/lib/types'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { useLanguagesEnabled } from '@/hooks/useLanguagesEnabled'
import { type TicketConfig, DEFAULT_TICKET_CONFIG } from '@/types/ticket-config'
import WalkieTalkie from '@/components/WalkieTalkie'

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
    const isBonus = (item as TicketItem).is_bonus
    const displayPrice = isBonus ? 0 : item.price
    const sub = isBonus ? 'GRATIS' : formatTicketMoney(displayPrice * item.quantity)
    const prefix = qty + 'x '
    const contentW = Math.max(1, W - marginLeft - marginRight)
    const maxNameLen = contentW - prefix.length
    const bonusMark = isBonus ? '★ ' : ''
    const fullName = bonusMark + item.name
    const name = fullName.length > maxNameLen
      ? fullName.substring(0, maxNameLen)
      : fullName
    const line1 = addMargin(prefix + name)
    const line2 = addMargin(pad(sub, contentW, true))

    const modLines = (item.modifiers ?? []).map(
      (m) => addMargin(`  > ${m.optionName}${m.price > 0 ? ' (+)' : ''}`)
    )
    const bonusReasonLine = isBonus && (item as TicketItem).bonus_reason
      ? [addMargin(`  (${(item as TicketItem).bonus_reason})`)]
      : []
    const lines = [line1, line2, ...modLines, ...bonusReasonLine]
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
  is_bonus?: boolean             // bonificado = gratis
  bonus_reason?: string | null   // motivo de bonificación
  original_price?: number        // precio original antes de bonificar
}

// ─── Bonus Reason type ────────────────────────────────────────────────────────

type BonusReason = {
  id: string
  name: string
  active: boolean
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

// ─── Shift types ──────────────────────────────────────────────────────────────

type Shift = {
  id: string
  opened_at: string
  closed_at?: string | null
  opening_amount: number
  closing_amount?: number | null
  expected_amount?: number | null
  difference?: number | null
  total_cash_sales?: number | null
  total_transfer_sales?: number | null
  total_mixed_sales?: number | null
  total_income?: number | null
  total_expense?: number | null
  notes?: string | null
  status: 'open' | 'closed'
}

type ShiftSummary = {
  opening_amount: number
  closing_amount: number
  expected_amount: number
  difference: number
  total_cash_sales: number
  total_transfer_sales: number
  total_mixed_sales: number
  total_income: number
  total_expense: number
  total_refunds: number
  opened_at: string
  closed_at: string
}

// ─── Open Shift Modal ─────────────────────────────────────────────────────────

function OpenShiftModal({ onOpen }: { onOpen: (shift: Shift) => void }) {
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = async () => {
    const parsed = parseFloat(amount.replace(',', '.') || '0')
    if (parsed < 0) { setError('Monto inválido'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/pos/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_amount: parsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al abrir turno')
      onOpen(data.shift)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-teal-600">
          <h3 className="text-white font-black text-xl leading-none">Abrir turno</h3>
          <p className="text-teal-100 text-xs mt-1">Ingresá el monto inicial en caja</p>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4">
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Monto inicial en caja</p>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleOpen() }}
              placeholder="$ 0"
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-2xl font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
            />
          </div>
          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleOpen}
            disabled={submitting}
            className={`w-full py-4 rounded-xl font-black text-lg transition-all active:scale-95 shadow-md text-white ${
              submitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {submitting ? 'Abriendo...' : 'Abrir Turno'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Close Shift Modal ────────────────────────────────────────────────────────

function CloseShiftModal({
  shift,
  onClose,
  onClosed,
}: {
  shift: Shift
  onClose: () => void
  onClosed: () => void
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [countedAmount, setCountedAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  // Pre-calculate live summary by fetching movements
  useEffect(() => {
    let cancelled = false
    setLoadingSummary(true)

    async function loadPreview() {
      try {
        const res = await fetch('/api/pos/shifts/current')
        const data = await res.json()
        if (cancelled) return

        // Get movements for current shift
        const movRes = await fetch('/api/pos/cash-movements')
        const movData = await movRes.json()

        if (cancelled) return

        const movements: Array<{ type: string; amount: number }> = movData.movements ?? []
        const totalIncome = movements
          .filter((m) => m.type === 'ingreso')
          .reduce((s, m) => s + Number(m.amount), 0)
        const totalExpense = movements
          .filter((m) => m.type === 'egreso')
          .reduce((s, m) => s + Number(m.amount), 0)

        // Estimated totals from movements
        const cashMov = movements.filter((m) => m.type === 'venta_efectivo')
        const transferMov = movements.filter((m) => m.type === 'venta_transferencia')
        const totalCash = cashMov.reduce((s, m) => s + Number(m.amount), 0)
        const totalTransfer = transferMov.reduce((s, m) => s + Number(m.amount), 0)

        const opening = Number(shift.opening_amount ?? 0)
        const expectedAmount = opening + totalCash + totalIncome - totalExpense

        setSummary({
          opening_amount: opening,
          closing_amount: 0,
          expected_amount: expectedAmount,
          difference: 0,
          total_cash_sales: totalCash,
          total_transfer_sales: totalTransfer,
          total_mixed_sales: 0,
          total_income: totalIncome,
          total_expense: totalExpense,
          total_refunds: 0,
          opened_at: shift.opened_at,
          closed_at: new Date().toISOString(),
        })
      } catch (e) { void e }
      if (!cancelled) setLoadingSummary(false)
    }

    loadPreview()
    return () => { cancelled = true }
  }, [shift])

  const counted = parseFloat(countedAmount.replace(',', '.') || '0')
  const expected = summary?.expected_amount ?? 0
  const difference = counted - expected
  const hasAmount = countedAmount.trim() !== ''

  const handleCloseAndPrint = async () => {
    if (!hasAmount) { setError('Ingresá el monto contado'); return }
    if (counted < 0) { setError('Monto inválido'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/pos/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closing_amount: counted, notes: notes.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cerrar turno')

      // Navigate to print page
      triggerShiftPrint(data.summary)
      onClosed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setSubmitting(false)
    }
  }

  const openedTime = new Date(shift.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const openedDate = new Date(shift.opened_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden max-h-[95vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-orange-500 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-black text-lg leading-none">Cerrar Turno</h3>
            <p className="text-orange-100 text-xs mt-0.5">Turno desde {openedDate} {openedTime}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4" style={{ minHeight: 0 }}>
          {loadingSummary ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : summary && (
            <>
              {/* Sales summary */}
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 flex flex-col gap-2">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Resumen de ventas</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Efectivo</span>
                  <span className="font-bold text-gray-900 tabular-nums">{formatCashARS(summary.total_cash_sales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Transferencia</span>
                  <span className="font-bold text-gray-900 tabular-nums">{formatCashARS(summary.total_transfer_sales)}</span>
                </div>
                {summary.total_mixed_sales > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Mixto</span>
                    <span className="font-bold text-gray-900 tabular-nums">{formatCashARS(summary.total_mixed_sales)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-1">
                  <span className="font-semibold text-gray-700">Total ventas</span>
                  <span className="font-black text-teal-700 tabular-nums">{formatCashARS(summary.total_cash_sales + summary.total_transfer_sales + summary.total_mixed_sales)}</span>
                </div>
              </div>

              {/* Movements summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-green-50 border border-green-100 p-3">
                  <p className="text-xs font-bold text-green-700 mb-1">Ingresos</p>
                  <p className="font-black text-green-700 tabular-nums text-sm">{formatCashARS(summary.total_income)}</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                  <p className="text-xs font-bold text-red-700 mb-1">Egresos</p>
                  <p className="font-black text-red-700 tabular-nums text-sm">{formatCashARS(summary.total_expense)}</p>
                </div>
              </div>

              {/* Expected amount */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold text-blue-700">Apertura</p>
                  <p className="font-bold text-blue-800 tabular-nums text-sm">{formatCashARS(summary.opening_amount)}</p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs font-bold text-blue-700">Monto esperado en caja</p>
                  <p className="font-black text-blue-800 tabular-nums">{formatCashARS(expected)}</p>
                </div>
              </div>
            </>
          )}

          {/* Counted amount */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Monto contado en caja</p>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={countedAmount}
              onChange={(e) => setCountedAmount(e.target.value)}
              placeholder="$ 0"
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-2xl font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
            />
          </div>

          {/* Difference indicator */}
          {hasAmount && (
            <div className={`rounded-xl p-3 flex items-center justify-between ${
              Math.abs(difference) < 1
                ? 'bg-green-50 border border-green-200'
                : difference > 0
                  ? 'bg-green-50 border border-green-300'
                  : 'bg-red-50 border border-red-200'
            }`}>
              <span className={`text-sm font-bold ${Math.abs(difference) < 1 ? 'text-green-700' : difference > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {Math.abs(difference) < 1 ? 'Sin diferencia' : difference > 0 ? 'Sobrante' : 'Faltante'}
              </span>
              <span className={`font-black text-lg tabular-nums ${Math.abs(difference) < 1 ? 'text-green-700' : difference > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {Math.abs(difference) < 1 ? '✓' : `${difference > 0 ? '+' : ''}${formatCashARS(difference)}`}
              </span>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Notas (opcional)</p>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del turno..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleCloseAndPrint}
            disabled={submitting || !hasAmount}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-md ${
              submitting || !hasAmount
                ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
            }`}
          >
            {submitting ? 'Cerrando...' : 'Cerrar e Imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shift print helpers ──────────────────────────────────────────────────────

function buildShiftCloseTicket(summary: ShiftSummary): string {
  const SEP = '---SEP---'
  const now = new Date(summary.closed_at)
  const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const openedTime = new Date(summary.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const closedTime = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

  const fmtNum = (n: number) => '$' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

  const totalVentas = summary.total_cash_sales + summary.total_transfer_sales + summary.total_mixed_sales
  const diff = summary.difference
  const diffLabel = Math.abs(diff) < 1 ? 'SIN DIFERENCIA' : diff > 0 ? `SOBRANTE: ${fmtNum(diff)}` : `FALTANTE: ${fmtNum(Math.abs(diff))}`

  return [
    'CIERRE DE CAJA',
    SEP,
    dateStr,
    `Turno: ${openedTime} - ${closedTime}`,
    SEP,
    'VENTAS',
    `Efectivo:     ${fmtNum(summary.total_cash_sales)}`,
    `Transfer:     ${fmtNum(summary.total_transfer_sales)}`,
    summary.total_mixed_sales > 0 ? `Mixto:        ${fmtNum(summary.total_mixed_sales)}` : '',
    `Total ventas: ${fmtNum(totalVentas)}`,
    SEP,
    `Ingresos:     ${fmtNum(summary.total_income)}`,
    `Egresos:      ${fmtNum(summary.total_expense)}`,
    SEP,
    `Apertura:     ${fmtNum(summary.opening_amount)}`,
    `Esperado:     ${fmtNum(summary.expected_amount)}`,
    `En caja:      ${fmtNum(summary.closing_amount)}`,
    SEP,
    diffLabel,
    '',
  ].filter((l) => l !== null && l !== undefined).join('\n')
}

function triggerShiftPrint(summary: ShiftSummary): void {
  const text = buildShiftCloseTicket(summary)
  sessionStorage.setItem('pos_ticket', text)
  sessionStorage.removeItem('pos_ticket_logo')
  sessionStorage.setItem('pos_ticket_fontsize', '12px')
  sessionStorage.setItem('pos_ticket_fontfamily', 'monospace')
  sessionStorage.setItem('pos_ticket_linespacing', '4')
  sessionStorage.setItem('pos_ticket_headerbold', 'true')
  sessionStorage.setItem('pos_ticket_margintop', '4')
  sessionStorage.setItem('pos_ticket_marginbottom', '4')
  sessionStorage.setItem('pos_ticket_marginleft', '0')
  sessionStorage.setItem('pos_ticket_marginright', '0')
  sessionStorage.setItem('pos_ticket_separator', '-')
  sessionStorage.setItem('pos_ticket_separatordouble', 'false')
  // Open print page in a new tab so the POS page is NOT reloaded and state is preserved
  window.open('/pos/ticket', '_blank')
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
  onDragStart,
  isDragging,
}: {
  item: MenuItem
  onAdd: (item: MenuItem) => void
  locale: Locale
  editMode: boolean
  onUnassign: (item: MenuItem) => void
  onDragStart?: (item: MenuItem, clientX: number, clientY: number) => void
  isDragging?: boolean
}) {
  const isUnavailable = item.available === 0 || item.available_qty === 0
  const isSoldOutByQty = item.available_qty === 0
  const hasLimitedQty = item.available_qty !== null && item.available_qty !== undefined && item.available_qty >= 1 && item.available_qty <= 3
  const [pressed, setPressed] = useState(false)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const pressStartPos = useRef<{ x: number; y: number } | null>(null)

  const startLongPress = (clientX: number, clientY: number) => {
    if (editMode) return
    didLongPress.current = false
    pressStartPos.current = { x: clientX, y: clientY }
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50)
      }
      onDragStart?.(item, clientX, clientY)
    }, 600)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    startLongPress(t.clientX, t.clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (longPressTimer.current !== null) {
      const t = e.touches[0]
      const start = pressStartPos.current
      if (start) {
        const dx = Math.abs(t.clientX - start.x)
        const dy = Math.abs(t.clientY - start.y)
        if (dx > 8 || dy > 8) cancelLongPress()
      }
    }
  }

  const handleTouchEnd = () => {
    cancelLongPress()
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    startLongPress(e.clientX, e.clientY)
  }

  const handleMouseUp = () => {
    cancelLongPress()
  }

  const handleClick = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      e.preventDefault()
      return
    }
    if (editMode) return
    if (isUnavailable) return
    setPressed(true)
    onAdd(item)
    setTimeout(() => setPressed(false), 200)
  }

  return (
    <article
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={cancelLongPress}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`relative w-full h-full rounded-xl overflow-hidden select-none transition-all duration-150 ${
        editMode
          ? 'cursor-default border-2 border-red-500/40'
          : isUnavailable
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer active:scale-95 hover:ring-2 hover:ring-sumak-gold'
      } ${pressed ? 'scale-95 brightness-90' : ''} ${isDragging ? 'opacity-40 scale-95' : ''}`}
      style={{ touchAction: isDragging ? 'none' : 'auto' }}
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

// ─── Drag Ghost ────────────────────────────────────────────────────────────────
function DragGhost({
  item,
  x,
  y,
  locale,
}: {
  item: MenuItem
  x: number
  y: number
  locale: Locale
}) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x - 60,
        top: y - 60,
        width: 120,
        height: 120,
        zIndex: 9999,
        pointerEvents: 'none',
        transform: 'scale(1.08)',
        transition: 'transform 0.1s',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      }}
    >
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '2.5rem' }}>🍽️</span>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px' }}>
        <p style={{ margin: 0, fontWeight: 700, color: '#fff', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {getItemName(item, locale)}
        </p>
        <p style={{ margin: 0, fontWeight: 700, color: '#f5c842', fontSize: '0.78rem', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {formatARS(item.price)}
        </p>
      </div>
    </div>
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

// ─── Bonus Reason Modal ───────────────────────────────────────────────────────

function BonusModal({
  itemName,
  reasons,
  onSelect,
  onCancel,
}: {
  itemName: string
  reasons: BonusReason[]
  onSelect: (reason: BonusReason) => void
  onCancel: () => void
}) {
  const activeReasons = reasons.filter((r) => r.active)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-yellow-500">
          <h3 className="text-white font-black text-base leading-none">★ Bonificar item</h3>
          <p className="text-yellow-100 text-xs mt-0.5 truncate">{itemName}</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeReasons.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-4">
              Sin motivos configurados. Agregá motivos desde Admin → Bonificaciones.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {activeReasons.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 font-semibold text-sm text-gray-900 transition-all active:scale-[0.98]"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-1 shrink-0">
          <button
            onClick={onCancel}
            className="w-full rounded-xl py-3 font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancelar
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
  onBonusClick,
  onUnbonus,
}: {
  item: TicketItem
  onUpdateQty: (uid: string, delta: number) => void
  onRemove: (uid: string) => void
  onUpdateNote: (uid: string, note: string) => void
  onBonusClick?: (uid: string) => void
  onUnbonus?: (uid: string) => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
  const unitTotal = item.price + modExtra   // always the actual price (0 if bonus)
  const displayUnitTotal = item.is_bonus ? 0 : unitTotal
  return (
    <li className={`flex flex-col rounded-xl px-2.5 py-1.5 border gap-1 ${item.is_bonus ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">
            {item.is_bonus && <span className="text-yellow-500 mr-1">★</span>}
            {item.name}
          </p>
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
          {item.is_bonus && item.bonus_reason && (
            <p className="text-yellow-700 text-xs leading-tight pl-2 mt-0.5 italic">★ {item.bonus_reason}</p>
          )}
          {item.customNote && !noteOpen && (
            <p className="text-orange-600 text-xs leading-tight pl-2 mt-0.5 italic">✎ {item.customNote}</p>
          )}
          <p className="font-bold text-xs tabular-nums mt-0.5">
            {item.is_bonus ? (
              <span className="text-yellow-600">
                <span className="line-through text-gray-400 mr-1">{formatARS(unitTotal)}</span>GRATIS
              </span>
            ) : (
              <span className="text-teal-600">
                {formatARS(displayUnitTotal)} × {item.quantity} = {formatARS(displayUnitTotal * item.quantity)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          {/* Bonus toggle button */}
          {item.is_bonus ? (
            <button
              onClick={() => onUnbonus && onUnbonus(item.uid)}
              className="w-6 h-6 rounded-md bg-yellow-400 hover:bg-yellow-500 active:scale-90 flex items-center justify-center text-white font-black text-xs transition-all"
              aria-label="Quitar bonificación"
              title="Quitar bonificación"
            >
              ★
            </button>
          ) : (
            <button
              onClick={() => onBonusClick && onBonusClick(item.uid)}
              className="w-6 h-6 rounded-md bg-gray-200 hover:bg-yellow-300 active:scale-90 flex items-center justify-center text-gray-500 hover:text-yellow-700 font-black text-xs transition-all"
              aria-label="Bonificar item"
              title="Bonificar item (gratis)"
            >
              ★
            </button>
          )}
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
  onBonusClick,
  onUnbonus,
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
  onBonusClick?: (uid: string) => void
  onUnbonus?: (uid: string) => void
}) {
  const total = items.reduce((s, i) => {
    if (i.is_bonus) return s   // bonificados no suman
    const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
    return s + (i.price + modExtra) * i.quantity
  }, 0)
  const bonusCount = items.filter((i) => i.is_bonus).length
  const isEmpty = items.length === 0
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  const multiPerson = persons > 1

  return (
    <div className="flex flex-col h-full bg-white" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-4 py-3 bg-teal-600 shrink-0">
        <h2 className="text-white font-black text-lg leading-none">Ticket</h2>
        {!isEmpty && (
          <p className="text-teal-100 text-xs mt-0.5">
            {itemCount} items{bonusCount > 0 && ` · ${bonusCount} bonificado${bonusCount !== 1 ? 's' : ''}`}
          </p>
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
                if (it.is_bonus) return s
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
                      <TicketItemRow
                        key={item.uid}
                        item={item}
                        onUpdateQty={onUpdateQty}
                        onRemove={onRemove}
                        onUpdateNote={onUpdateNote}
                        onBonusClick={onBonusClick}
                        onUnbonus={onUnbonus}
                      />
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
              <TicketItemRow
                key={item.uid}
                item={item}
                onUpdateQty={onUpdateQty}
                onRemove={onRemove}
                onUpdateNote={onUpdateNote}
                onBonusClick={onBonusClick}
                onUnbonus={onUnbonus}
              />
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

// ─── Employee POS Modal ───────────────────────────────────────────────────────

const ADMIN_PIN = '1590'

type POSEmployee = {
  id: string
  name: string
  role: string
  active: boolean
}

type POSPayment = {
  id: string
  employee_id: string
  type: 'advance' | 'salary'
  amount: number
  description: string | null
  payment_method: 'cash' | 'transfer' | 'mixed' | null
  cash_amount: number | null
  transfer_amount: number | null
  created_at: string
}

function formatARSPOS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(n)
}

function toArgDateTimePOS(utcIso: string): string {
  const ARG_OFFSET_MS = -3 * 60 * 60 * 1000
  const d = new Date(new Date(utcIso).getTime() - ARG_OFFSET_MS)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function pmLabelPOS(pm: 'cash' | 'transfer' | 'mixed' | null): string {
  if (pm === 'transfer') return 'Transferencia'
  if (pm === 'mixed') return 'Mixto'
  return 'Efectivo'
}

function printAdvancePOS(payment: POSPayment, empName: string, empRole: string) {
  const dateStr = toArgDateTimePOS(payment.created_at)
  const pmLabel = pmLabelPOS(payment.payment_method)
  const mixedRows = payment.payment_method === 'mixed'
    ? `<div class="row"><span>  Efectivo:</span><span>${formatARSPOS(payment.cash_amount ?? 0)}</span></div>
  <div class="row"><span>  Transferencia:</span><span>${formatARSPOS(payment.transfer_amount ?? 0)}</span></div>`
    : ''
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo Adelanto</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; padding: 4mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .separator { border-top: 1px dashed #000; margin: 3mm 0; }
  .row { display: flex; justify-content: space-between; margin: 1mm 0; }
  .title { font-size: 13px; font-weight: bold; margin-bottom: 2mm; }
  .subtitle { font-size: 10px; margin-bottom: 1mm; }
  .firma { margin-top: 10mm; border-top: 1px solid #000; padding-top: 2mm; width: 50mm; margin-left: auto; margin-right: auto; text-align: center; font-size: 10px; }
  @media print { @page { margin: 0; size: 72mm auto; } body { padding: 2mm; } }
</style>
</head>
<body>
  <div class="center">
    <div class="title">SUMAK RESTAURANTE</div>
    <div class="subtitle">RECIBO DE ADELANTO</div>
  </div>
  <div class="separator"></div>
  <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
  <div class="row"><span>Empleado:</span><span>${empName}</span></div>
  <div class="row"><span>Cargo:</span><span>${empRole || '—'}</span></div>
  <div class="separator"></div>
  <div class="row bold"><span>MONTO ADELANTADO:</span><span>${formatARSPOS(payment.amount)}</span></div>
  ${payment.description ? `<div class="row"><span>Concepto:</span><span>${payment.description}</span></div>` : ''}
  <div class="row"><span>Método de pago:</span><span>${pmLabel}</span></div>
  ${mixedRows}
  <div class="separator"></div>
  <div class="firma">Firma del empleado</div>
</body>
</html>`
  sessionStorage.setItem('pos_receipt_html', html)
  window.open('/pos/receipt', '_blank')
}

function EmployeePOSModal({ onClose }: { onClose: () => void }) {
  // Phase: 'pin' | 'main'
  const [phase, setPhase] = useState<'pin' | 'main'>('pin')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  // Main phase state
  const [employees, setEmployees] = useState<POSEmployee[]>([])
  const [loadingEmps, setLoadingEmps] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState('')
  const [payments, setPayments] = useState<POSPayment[]>([])
  const [loadingPmts, setLoadingPmts] = useState(false)

  // Advance form
  const [showAdvForm, setShowAdvForm] = useState(false)
  const [advAmount, setAdvAmount] = useState('')
  const [advDesc, setAdvDesc] = useState('')
  const [advPM, setAdvPM] = useState<'cash' | 'transfer' | 'mixed'>('cash')
  const [advCash, setAdvCash] = useState('')
  const [advTransfer, setAdvTransfer] = useState('')
  const [advSaving, setAdvSaving] = useState(false)
  const [advError, setAdvError] = useState<string | null>(null)

  const handlePinKey = (k: string) => {
    if (pinInput.length >= 4) return
    const next = pinInput + k
    setPinInput(next)
    setPinError(false)
    if (next.length === 4) {
      if (next === ADMIN_PIN) {
        setPhase('main')
        loadEmployees()
      } else {
        setPinError(true)
        setTimeout(() => setPinInput(''), 500)
      }
    }
  }

  const loadEmployees = async () => {
    setLoadingEmps(true)
    try {
      const res = await fetch('/api/empleados')
      if (res.ok) {
        const data: POSEmployee[] = await res.json()
        setEmployees(data.filter((e) => e.active))
      }
    } catch (e) { void e }
    setLoadingEmps(false)
  }

  const loadPayments = async (empId: string) => {
    setLoadingPmts(true)
    try {
      const res = await fetch(`/api/empleados/pagos?employee_id=${empId}`)
      if (res.ok) setPayments(await res.json())
      else setPayments([])
    } catch (e) { void e; setPayments([]) }
    setLoadingPmts(false)
  }

  const handleSelectEmp = (id: string) => {
    setSelectedEmp(id)
    setShowAdvForm(false)
    setAdvAmount(''); setAdvDesc(''); setAdvPM('cash'); setAdvCash(''); setAdvTransfer('')
    setAdvError(null)
    if (id) loadPayments(id)
    else setPayments([])
  }

  const handleAdvSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdvError(null)
    const amt = Number(advAmount)
    if (!amt || amt <= 0) { setAdvError('Ingresá un monto válido'); return }
    if (advPM === 'mixed') {
      const ca = Number(advCash) || 0
      const ta = Number(advTransfer) || 0
      if (Math.abs(ca + ta - amt) >= 1) {
        setAdvError(`La suma debe ser ${formatARSPOS(amt)}`)
        return
      }
    }
    setAdvSaving(true)
    try {
      const res = await fetch('/api/empleados/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmp,
          type: 'advance',
          amount: amt,
          description: advDesc || undefined,
          payment_method: advPM,
          cash_amount: advPM === 'mixed' ? Number(advCash) || 0 : advPM === 'cash' ? amt : 0,
          transfer_amount: advPM === 'mixed' ? Number(advTransfer) || 0 : advPM === 'transfer' ? amt : 0,
        }),
      })
      if (res.ok) {
        const pmt: POSPayment = await res.json()
        const emp = employees.find((e) => e.id === selectedEmp)
        setShowAdvForm(false)
        setAdvAmount(''); setAdvDesc(''); setAdvPM('cash'); setAdvCash(''); setAdvTransfer('')
        await loadPayments(selectedEmp)
        printAdvancePOS(pmt, emp?.name ?? '', emp?.role ?? '')
      } else {
        const d = await res.json()
        setAdvError(d.error ?? 'Error al registrar')
      }
    } catch (err) {
      setAdvError(err instanceof Error ? err.message : 'Error')
    }
    setAdvSaving(false)
  }

  const emp = employees.find((e) => e.id === selectedEmp)

  // ── PIN phase ──
  if (phase === 'pin') {
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3']
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#1a1917', border: '1px solid rgba(255,255,255,0.12)', width: 'min(92vw, 340px)' }}
        >
          <div className="px-5 pt-5 pb-3 text-center shrink-0">
            <p className="text-white font-bold text-lg mb-3">PIN Admin</p>
            <div className="flex gap-3 justify-center mb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < pinInput.length ? 'bg-white border-white' : 'border-white/30 bg-transparent'
                  } ${pinError ? 'border-red-400 bg-red-400' : ''}`}
                />
              ))}
            </div>
            {pinError && <p className="text-red-400 text-sm">PIN incorrecto</p>}
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-3 mb-3">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => handlePinKey(k)}
                  className="aspect-square rounded-full border-2 border-white/80 bg-black text-white text-2xl font-bold flex items-center justify-center hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all select-none"
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => { setPinInput((p) => p.slice(0, -1)); setPinError(false) }}
                className="aspect-square rounded-full border-2 border-white/30 bg-gray-700/60 text-white flex items-center justify-center hover:bg-gray-600/60 active:scale-95 transition-all select-none text-lg"
              >
                ⌫
              </button>
              <button
                onClick={() => handlePinKey('0')}
                className="aspect-square rounded-full border-2 border-white/80 bg-black text-white text-2xl font-bold flex items-center justify-center hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all select-none"
              >
                0
              </button>
              <button
                onClick={onClose}
                className="aspect-square rounded-full border-2 border-white/20 bg-transparent text-white/50 text-xs font-bold flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all select-none"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main phase ──
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: '#1a1917',
          border: '1px solid rgba(255,255,255,0.12)',
          width: 'min(95vw, 560px)',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 shrink-0 flex items-center justify-between" style={{ background: '#2d1f14' }}>
          <div>
            <p className="text-white font-bold text-base leading-none">Pagos de Empleados</p>
            <p className="text-amber-300/60 text-xs mt-0.5">Solo adelantos e historial</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Employee selector */}
        <div className="px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-white/50 text-xs font-bold uppercase tracking-wide mb-1.5">Empleado</p>
          {loadingEmps ? (
            <div className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          ) : (
            <select
              value={selectedEmp}
              onChange={(e) => handleSelectEmp(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <option value="" style={{ background: '#1a1917' }}>Seleccionar empleado…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id} style={{ background: '#1a1917' }}>
                  {e.name}{e.role ? ` (${e.role})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4" style={{ minHeight: 0 }}>
          {!selectedEmp ? (
            <p className="text-white/30 text-sm text-center py-8">Seleccioná un empleado para ver su historial</p>
          ) : (
            <>
              {/* Register advance button */}
              {!showAdvForm && (
                <button
                  onClick={() => setShowAdvForm(true)}
                  className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: '#c8930a', color: '#fff' }}
                >
                  + Registrar adelanto
                </button>
              )}

              {/* Advance form */}
              {showAdvForm && (
                <form onSubmit={handleAdvSubmit} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(200,147,10,0.1)', border: '1px solid rgba(200,147,10,0.3)' }}>
                  <p className="text-amber-300 font-bold text-sm">Registrar adelanto — {emp?.name}</p>

                  <div>
                    <p className="text-white/50 text-xs font-bold mb-1">Monto (ARS) *</p>
                    <input
                      type="number"
                      min="1"
                      value={advAmount}
                      onChange={(e) => setAdvAmount(e.target.value)}
                      required
                      placeholder="$ 0"
                      className="w-full rounded-xl px-3 py-2.5 text-lg font-bold text-white focus:outline-none tabular-nums"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                    />
                  </div>

                  <div>
                    <p className="text-white/50 text-xs font-bold mb-1">Descripción (opcional)</p>
                    <input
                      type="text"
                      value={advDesc}
                      onChange={(e) => setAdvDesc(e.target.value)}
                      placeholder="Concepto..."
                      className="w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                    />
                  </div>

                  <div>
                    <p className="text-white/50 text-xs font-bold mb-1.5">Método de pago</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['cash', 'transfer', 'mixed'] as const).map((pm) => (
                        <button
                          key={pm}
                          type="button"
                          onClick={() => setAdvPM(pm)}
                          className="py-2 rounded-xl font-bold text-xs transition-all active:scale-95"
                          style={{
                            background: advPM === pm
                              ? pm === 'cash' ? '#16a34a' : pm === 'transfer' ? '#2563eb' : '#7c3aed'
                              : 'rgba(255,255,255,0.08)',
                            color: '#fff',
                          }}
                        >
                          {pm === 'cash' ? '💵 Efectivo' : pm === 'transfer' ? '📲 Transfer' : '💰 Mixto'}
                        </button>
                      ))}
                    </div>

                    {advPM === 'mixed' && (
                      <div className="mt-2 flex flex-col gap-2">
                        <div>
                          <p className="text-white/40 text-xs mb-0.5">Efectivo</p>
                          <input
                            type="number"
                            min={0}
                            value={advCash}
                            onChange={(e) => setAdvCash(e.target.value)}
                            placeholder="$ 0"
                            className="w-full rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none tabular-nums"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                          />
                        </div>
                        <div>
                          <p className="text-white/40 text-xs mb-0.5">Transferencia</p>
                          <input
                            type="number"
                            min={0}
                            value={advTransfer}
                            onChange={(e) => setAdvTransfer(e.target.value)}
                            placeholder="$ 0"
                            className="w-full rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none tabular-nums"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                          />
                        </div>
                        {(() => {
                          const total = Number(advAmount) || 0
                          const ca = Number(advCash) || 0
                          const ta = Number(advTransfer) || 0
                          if (total > 0 && Math.abs(ca + ta - total) < 1) return <p className="text-xs text-green-400 font-semibold">✓ Suma correcta</p>
                          if (total > 0) return <p className="text-xs text-red-400 font-semibold">Debe sumar {formatARSPOS(total)}</p>
                          return null
                        })()}
                      </div>
                    )}
                  </div>

                  {advError && <p className="text-red-400 text-sm font-semibold">{advError}</p>}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowAdvForm(false); setAdvError(null) }}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white/50 hover:text-white transition-colors"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={advSaving}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: '#c8930a', color: '#fff' }}
                    >
                      {advSaving ? 'Guardando…' : '🖨️ Registrar e imprimir'}
                    </button>
                  </div>
                </form>
              )}

              {/* Payment history */}
              <div>
                <p className="text-white/40 text-xs font-bold uppercase tracking-wide mb-2">Historial de adelantos</p>
                {loadingPmts ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
                  </div>
                ) : payments.filter((p) => p.type === 'advance').length === 0 ? (
                  <p className="text-white/20 text-sm text-center py-4">Sin adelantos registrados</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {payments.filter((p) => p.type === 'advance').map((pmt) => (
                      <li
                        key={pmt.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm tabular-nums">{formatARSPOS(pmt.amount)}</p>
                          <p className="text-white/40 text-xs mt-0.5 truncate">
                            {toArgDateTimePOS(pmt.created_at)}
                            {pmt.description ? ` · ${pmt.description}` : ''}
                            {' · '}{pmLabelPOS(pmt.payment_method)}
                          </p>
                        </div>
                        <button
                          onClick={() => printAdvancePOS(pmt, emp?.name ?? '', emp?.role ?? '')}
                          className="shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all active:scale-95"
                          style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
                          title="Imprimir recibo"
                        >
                          🖨️
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
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

  // ─── Employee payments modal ──────────────────────────────────────────────────
  const [showEmpPayModal, setShowEmpPayModal] = useState(false)

  // ─── Shift state ──────────────────────────────────────────────────────────────
  const [currentShift, setCurrentShift] = useState<Shift | null | undefined>(undefined) // undefined = loading
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)

  // Fetch current shift on mount
  useEffect(() => {
    fetch('/api/pos/shifts/current')
      .then((r) => r.ok ? r.json() : { shift: null })
      .then((data) => {
        setCurrentShift(data.shift ?? null)
        if (!data.shift) setShowOpenShiftModal(true)
      })
      .catch(() => setCurrentShift(null))
  }, [])

  // Polling: re-verify shift every 30s to detect external closes (e.g. from admin)
  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/pos/shifts/current')
        .then((r) => r.ok ? r.json() : { shift: null })
        .then((data) => {
          const hasShift = !!data.shift
          setCurrentShift((prev) => {
            // If the shift just disappeared externally, show the open modal
            if (prev !== undefined && prev !== null && !hasShift) {
              setShowOpenShiftModal(true)
            }
            return data.shift ?? null
          })
        })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [])

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

  // ─── Drag & Drop state ────────────────────────────────────────────────────────
  const [draggedItem, setDraggedItem] = useState<MenuItem | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [dropTarget, setDropTarget] = useState<number | null>(null) // grid position (1-96)
  const gridRef = useRef<HTMLElement | null>(null)
  // Map position → cell DOM element for hit-testing
  const cellElemsRef = useRef<Map<number, HTMLElement>>(new Map())

  const getPositionFromPoint = useCallback((clientX: number, clientY: number): number | null => {
    let best: number | null = null
    cellElemsRef.current.forEach((el, position) => {
      const rect = el.getBoundingClientRect()
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        best = position
      }
    })
    return best
  }, [])

  const handleDragStart = useCallback((item: MenuItem, clientX: number, clientY: number) => {
    setDraggedItem(item)
    setDragPos({ x: clientX, y: clientY })
    setDropTarget(item.display_order ?? null)
  }, [])

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!draggedItem) return
    setDragPos({ x: clientX, y: clientY })
    const pos = getPositionFromPoint(clientX, clientY)
    setDropTarget(pos)
  }, [draggedItem, getPositionFromPoint])

  const handleDragEnd = useCallback(async (clientX: number, clientY: number) => {
    if (!draggedItem) return
    const targetPosition = getPositionFromPoint(clientX, clientY)
    const sourcePosition = draggedItem.display_order ?? 0

    if (targetPosition !== null && targetPosition !== sourcePosition) {
      // Find if another item occupies the target position
      const targetItem = menuItems.find((i) => i.display_order === targetPosition)
      try {
        if (targetItem) {
          // Swap
          await fetch('/api/menu-display/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              updates: [
                { id: draggedItem.id, display_order: targetPosition },
                { id: targetItem.id, display_order: sourcePosition },
              ],
            }),
          })
        } else {
          // Move to empty cell
          await fetch('/api/menu-display/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              updates: [{ id: draggedItem.id, display_order: targetPosition }],
            }),
          })
        }
      } catch (e) { void e }
    }
    setDraggedItem(null)
    setDropTarget(null)
  }, [draggedItem, menuItems, getPositionFromPoint])

  const cancelDrag = useCallback(() => {
    setDraggedItem(null)
    setDropTarget(null)
  }, [])

  // Global move/end listeners while dragging
  useEffect(() => {
    if (!draggedItem) return

    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY)
    const onMouseUp = (e: MouseEvent) => { void handleDragEnd(e.clientX, e.clientY) }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const t = e.touches[0]
      handleDragMove(t.clientX, t.clientY)
    }
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      void handleDragEnd(t.clientX, t.clientY)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrag()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [draggedItem, handleDragMove, handleDragEnd, cancelDrag])

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

  // ─── Bonus state ──────────────────────────────────────────────────────────────
  const [bonusReasons, setBonusReasons] = useState<BonusReason[]>([])
  const [bonusModalUid, setBonusModalUid] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/bonus-reasons')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setBonusReasons(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const handleBonusClick = useCallback((uid: string) => {
    setBonusModalUid(uid)
  }, [])

  const handleBonusSelect = useCallback((reason: BonusReason) => {
    setTicketItems((prev) => prev.map((item) => {
      if (item.uid !== bonusModalUid) return item
      const modExtra = (item.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
      return {
        ...item,
        is_bonus: true,
        bonus_reason: reason.name,
        original_price: item.price + modExtra,
        price: 0,
      }
    }))
    setBonusModalUid(null)
  }, [bonusModalUid])

  const handleUnbonus = useCallback((uid: string) => {
    setTicketItems((prev) => prev.map((item) => {
      if (item.uid !== uid || !item.is_bonus) return item
      // Restore original price
      const restoredPrice = item.original_price ?? item.price
      return {
        ...item,
        is_bonus: false,
        bonus_reason: null,
        price: restoredPrice,
        original_price: undefined,
      }
    }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (ticketItems.length === 0) return
    setSubmitting(true)
    try {
      const total = ticketItems.reduce((s, i) => {
        if (i.is_bonus) return s
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
        const modExtra = (item.modifiers ?? []).reduce((s, m) => s + m.price, 0)
        return {
          menu_item_id: item.menu_item_id,
          name: item.name,
          quantity: item.quantity,
          price: item.is_bonus ? 0 : item.price + modExtra,
          line_note,
          ...(persons > 1 && item.person_number ? { person_number: item.person_number } : {}),
          ...(item.is_bonus ? {
            is_bonus: true,
            bonus_reason: item.bonus_reason ?? null,
            original_price: item.original_price ?? (item.price + modExtra),
          } : {}),
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
        {/* Shift indicator + close button */}
        {currentShift ? (
          <button
            onClick={() => setShowCloseShiftModal(true)}
            title="Cerrar turno"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sumak-brown-mid text-sumak-gold hover:bg-red-900/60 active:scale-95 transition-all shrink-0 text-xs font-bold"
          >
            <span className="text-green-400">●</span>
            {new Date(currentShift.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </button>
        ) : currentShift === null ? (
          <button
            onClick={() => setShowOpenShiftModal(true)}
            title="Abrir turno"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-700 text-white hover:bg-teal-600 active:scale-95 transition-all shrink-0 text-xs font-bold"
          >
            <span className="text-yellow-300">○</span>
            Turno
          </button>
        ) : null}
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
        {/* Empleados button */}
        <button
          onClick={() => setShowEmpPayModal(true)}
          title="Pagos empleados"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light active:scale-95 transition-all shrink-0 font-bold text-base"
        >
          💰
        </button>
        {/* Walkie-talkie */}
        <WalkieTalkie device="pos" />
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
            ref={(el) => { gridRef.current = el }}
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
                const isDropTarget = draggedItem !== null && dropTarget === position && position !== (draggedItem.display_order ?? 0)
                if (item) {
                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        if (el) cellElemsRef.current.set(position, el)
                        else cellElemsRef.current.delete(position)
                      }}
                      className={`relative w-full h-full rounded-xl ${isDropTarget ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-black' : ''}`}
                    >
                      <POSDishCard
                        item={item}
                        onAdd={handleAddItem}
                        locale={locale}
                        editMode={true}
                        onUnassign={handleUnassign}
                        onDragStart={handleDragStart}
                        isDragging={draggedItem?.id === item.id}
                      />
                      {isDropTarget && (
                        <div className="absolute inset-0 rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none" />
                      )}
                    </div>
                  )
                }
                // Empty cell: show + button
                return (
                  <div
                    key={`empty-${position}`}
                    ref={(el) => {
                      if (el) cellElemsRef.current.set(position, el)
                      else cellElemsRef.current.delete(position)
                    }}
                    className={`relative w-full h-full ${isDropTarget ? 'rounded-xl ring-2 ring-blue-400 ring-offset-1 ring-offset-black' : ''}`}
                  >
                    <button
                      onClick={() => setAssigningPosition(position)}
                      className="w-full h-full rounded-xl bg-gray-900/60 border border-gray-700/50 flex items-center justify-center hover:bg-gray-800/60 active:bg-gray-700/60 transition-all group"
                      aria-label={`Agregar plato en celda ${position}`}
                    >
                      <span className="text-white/20 text-2xl font-bold group-hover:text-white/40 transition-colors select-none">+</span>
                    </button>
                    {isDropTarget && (
                      <div className="absolute inset-0 rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none" />
                    )}
                  </div>
                )
              })
            ) : activeCategory === 'all' ? (
              // Normal mode Todos: fixed 24-cell grid by position
              Array.from({ length: GRID_SIZE }).map((_, gridIndex) => {
                const position = gridIndex + 1
                const item = displayItems.find((i) => i.display_order === position)
                const isDropTarget = draggedItem !== null && dropTarget === position && position !== (draggedItem.display_order ?? 0)
                if (item) {
                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        if (el) cellElemsRef.current.set(position, el)
                        else cellElemsRef.current.delete(position)
                      }}
                      className={`relative w-full h-full rounded-xl ${isDropTarget ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-black' : ''}`}
                    >
                      <POSDishCard
                        item={item}
                        onAdd={handleAddItem}
                        locale={locale}
                        editMode={false}
                        onUnassign={handleUnassign}
                        onDragStart={handleDragStart}
                        isDragging={draggedItem?.id === item.id}
                      />
                      {isDropTarget && (
                        <div className="absolute inset-0 rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none" />
                      )}
                    </div>
                  )
                }
                return (
                  <div
                    key={`empty-${position}`}
                    ref={(el) => {
                      if (el) cellElemsRef.current.set(position, el)
                      else cellElemsRef.current.delete(position)
                    }}
                    className={`relative w-full h-full ${isDropTarget ? 'rounded-xl' : ''}`}
                  >
                    {isDropTarget && (
                      <div className="absolute inset-0 rounded-xl border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none" />
                    )}
                  </div>
                )
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
          {/* Drag ghost */}
          {draggedItem && (
            <DragGhost item={draggedItem} x={dragPos.x} y={dragPos.y} locale={locale} />
          )}
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
              onBonusClick={handleBonusClick}
              onUnbonus={handleUnbonus}
            />
          )}
        </aside>
      </div>

      {/* ── Bonus Modal ── */}
      {bonusModalUid && (
        <BonusModal
          itemName={ticketItems.find((i) => i.uid === bonusModalUid)?.name ?? ''}
          reasons={bonusReasons}
          onSelect={handleBonusSelect}
          onCancel={() => setBonusModalUid(null)}
        />
      )}

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

      {/* ── Open Shift Modal ── */}
      {showOpenShiftModal && (
        <OpenShiftModal
          onOpen={(shift) => {
            setCurrentShift(shift)
            setShowOpenShiftModal(false)
          }}
        />
      )}

      {/* ── Close Shift Modal ── */}
      {showCloseShiftModal && currentShift && (
        <CloseShiftModal
          shift={currentShift}
          onClose={() => setShowCloseShiftModal(false)}
          onClosed={() => {
            setShowCloseShiftModal(false)
            setCurrentShift(null)
            setShowOpenShiftModal(true)
          }}
        />
      )}

      {/* ── Employee Payments Modal ── */}
      {showEmpPayModal && (
        <EmployeePOSModal onClose={() => setShowEmpPayModal(false)} />
      )}

    </div>
  )
}
