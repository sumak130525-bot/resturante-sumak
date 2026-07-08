'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import WhatsAppNotifier from '@/components/WhatsAppNotifier'
import type { MenuItem, Combo } from '@/lib/types'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { useLanguagesEnabled } from '@/hooks/useLanguagesEnabled'
import { type TicketConfig, DEFAULT_TICKET_CONFIG } from '@/types/ticket-config'
import WalkieTalkie from '@/components/WalkieTalkie'
import PinGate from '@/components/pos/PinGate'
import OpenTablesPanel, { type OpenTable } from '@/components/pos/OpenTablesPanel'
import { usePosAuth } from '@/hooks/usePosAuth'
import { buildKitchenComanda, buildPreBillText, type KitchenItem } from '@/components/pos/KitchenPrint'

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

// ─── ESC/POS marker helpers ───────────────────────────────────────────────────
// Wrap text with inline markers that the print-server interprets as ESC/POS commands.
// Used only when sending to the print-server (not for the HTML ticket fallback).
function escCenter(s: string) { return `[CENTER]${s}[/CENTER]` }
function escBold(s: string)   { return `[BOLD]${s}[/BOLD]` }

// 3nStar RPT008 80mm printer uses 48 chars per line (Font A 12x24)
const ESCPOS_PAPER_WIDTH = 48

function buildTicketText(
  data: PrintData,
  cfg: TicketConfig = DEFAULT_TICKET_CONFIG,
  forPrintServer = false,
): string {
  // For ESC/POS we always use 48; for HTML fallback we use the config width
  const W = forPrintServer ? ESCPOS_PAPER_WIDTH : cfg.width
  const marginLeft = cfg.marginLeft ?? 0
  const marginRight = cfg.marginRight ?? 0
  const leftPad = ' '.repeat(marginLeft)

  // Separator line for print-server: [SEP:<char>:<width>] uses full 48-char width
  const sepChar = cfg.separator ?? '-'
  // For ESC/POS always 48; separatorDouble handled in print-server via config
  const SEP_ESC = `[SEP:${sepChar}:${ESCPOS_PAPER_WIDTH}]`
  // Separator markers — rendered as full-width HTML elements in ticket/page.tsx
  const SEP_HTML = '---SEP---'
  const LINES = forPrintServer ? SEP_ESC : SEP_HTML

  // Section spacing: blank lines between header/items/footer sections
  // For ESC/POS: use [BLANK:n] marker; n = sectionSpacing / 2 (reasonable mapping)
  const sectionBlankLines = Math.max(0, Math.floor((cfg.sectionSpacing ?? 4) / 4))
  const SECTION_GAP = forPrintServer && sectionBlankLines > 0
    ? `[BLANK:${sectionBlankLines}]`
    : ''

  const total = formatTicketMoney(data.total)

  // Extra blank lines between items based on itemSpacing
  const itemGap = cfg.itemSpacing && cfg.itemSpacing > 0 ? '\n'.repeat(Math.floor(cfg.itemSpacing / 2)) : ''

  const alignText = (s: string, align: 'center' | 'left') => {
    if (!forPrintServer) {
      // HTML fallback: CSS handles centering; just apply margin for left
      return align === 'left' ? leftPad + s : s
    }
    // ESC/POS: wrap with [CENTER] marker
    return align === 'center' ? escCenter(s) : leftPad + s
  }

  const addMargin = (s: string) => leftPad + s

  // Build item lines — flat list (person grouping handled in sectionized output below)
  const buildItemLines = (items: typeof data.items) => items.flatMap((item, idx) => {
    const ticketItem = item as TicketItem

    // ── Combo sub-items: skip (they are concatenated in the header's line_note) ──
    if (ticketItem.combo_slot_label) return []

    const qty = String(item.quantity)
    const isBonus = ticketItem.is_bonus
    const isComboHeader = ticketItem.is_combo_header

    // For combo header: show name + price, no qty
    if (isComboHeader) {
      const sub = formatTicketMoney(item.price)
      const contentW = Math.max(1, W - marginLeft - marginRight)
      const prefix = '★ '
      const maxNameLen = contentW - prefix.length
      const name = item.name.length > maxNameLen ? item.name.substring(0, maxNameLen) : item.name
      const line1 = addMargin(prefix + name)
      const line2 = addMargin(pad(sub, contentW, true))
      // Add sub-item names indented
      const subItems = (data.items as TicketItem[]).filter((si) => si.combo_id === ticketItem.combo_id && si.combo_slot_label)
      const subLines = subItems.map((si) => addMargin(`  - ${si.name}`))
      const lines = [line1, line2, ...subLines]
      if (itemGap && idx < items.length - 1) lines.push(itemGap)
      return lines
    }

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
    const bonusReasonLine = isBonus && ticketItem.bonus_reason
      ? [addMargin(`  (${ticketItem.bonus_reason})`)]
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

  // TOTAL line: bold when forPrintServer and cfg.totalBold
  const rawTotalLine = addMargin(`TOTAL: ${total}`)
  const totalLine = (forPrintServer && (cfg.totalBold ?? true))
    ? escBold(rawTotalLine)
    : rawTotalLine

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

  // Feed lines before cut (only for HTML fallback; print-server uses feedLinesBeforeCut from config)
  const feedLines = forPrintServer ? '' : '\n'.repeat(Math.max(0, cfg.feedLinesBeforeCut ?? 3))

  const headerAlign = cfg.headerAlign ?? 'center'
  const footerAlign = cfg.footerAlign ?? 'center'

  // Header lines: apply bold if forPrintServer and cfg.headerBold
  const applyHeaderStyle = (s: string) =>
    (forPrintServer && (cfg.headerBold ?? true)) ? escBold(s) : s

  const header1Raw = cfg.header1 ? alignText(cfg.header1, headerAlign) : ''
  const header2Raw = cfg.header2 ? alignText(cfg.header2, headerAlign) : ''
  const footer1Raw = cfg.footer1 ? alignText(cfg.footer1, footerAlign) : ''
  const footer2Raw = cfg.footer2 ? alignText(cfg.footer2, footerAlign) : ''

  // Logo line for print-server — shows image, then header texts below
  const logoLine = (forPrintServer && (cfg.showLogo ?? true)) ? '[LOGO]' : ''

  return [
    logoLine,
    applyHeaderStyle(header1Raw),
    applyHeaderStyle(header2Raw),
    SECTION_GAP,
    LINES,
    ...infoLines,
    LINES,
    SECTION_GAP,
    ...itemSection,
    LINES,
    SECTION_GAP,
    totalLine,
    payLine,
    clienteLine,
    LINES,
    SECTION_GAP,
    footer1Raw,
    footer2Raw,
    feedLines,
  ].filter((l) => l !== '').join('\n')
}

async function tryPrintServer(
  ticketText: string,
  printServerUrl: string,
  cfg?: TicketConfig,
  logoUrl?: string | null,
): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const printConfig = cfg
      ? {
          headerAlign: cfg.headerAlign,
          footerAlign: cfg.footerAlign,
          headerBold: cfg.headerBold,
          totalBold: cfg.totalBold,
          width: ESCPOS_PAPER_WIDTH,   // always 48 for 3nStar RPT008 80mm
          feedLinesBeforeCut: cfg.feedLinesBeforeCut,
          autoCut: cfg.autoCut,
          showLogo: cfg.showLogo,
          logoText: cfg.header1 ?? 'SUMAK',
          logoUrl: (cfg.showLogo && logoUrl) ? logoUrl : undefined,
          sectionSpacing: cfg.sectionSpacing,
          separatorChar: cfg.separator,
          separatorDouble: cfg.separatorDouble,
        }
      : undefined
    const feedLinesBody = cfg?.feedLinesBeforeCut ?? 3
    const res = await fetch(`${printServerUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ticketText, cut: true, feedLines: feedLinesBody, config: printConfig }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) return false
    const data = await res.json()
    return data.ok === true
  } catch {
    return false
  }
}

async function tryOpenDrawer(printServerUrl: string): Promise<void> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 3000)
    await fetch(`${printServerUrl}/open-drawer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: controller.signal,
    })
  } catch {
    // silently ignore — drawer open is best-effort
  }
}

function triggerPrintFallback(ticketText: string, logoUrl?: string | null, cfg?: TicketConfig): void {
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

async function triggerPrint(
  ticketText: string,
  logoUrl?: string | null,
  cfg?: TicketConfig,
  printServerUrl?: string | null,
  onPrinted?: () => void,
): Promise<void> {
  if (printServerUrl) {
    const ok = await tryPrintServer(ticketText, printServerUrl, cfg, logoUrl)
    if (ok) {
      onPrinted?.()
      return
    }
  }
  triggerPrintFallback(ticketText, logoUrl, cfg)
}

async function printTicketPopup(
  data: PrintData,
  cfg: TicketConfig = DEFAULT_TICKET_CONFIG,
  printServerUrl?: string | null,
  onPrinted?: () => void,
  logoUrl?: string | null,
): Promise<void> {
  const ticketText = buildTicketText(data, cfg, !!printServerUrl)
  // Save ticket text globally so the print button can use it
  ;(window as any).__pendingTicket = ticketText
  if (printServerUrl) {
    const ok = await tryPrintServer(ticketText, printServerUrl, cfg, logoUrl)
    if (ok) {
      onPrinted?.()
    }
  }
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
const DEFAULT_GRID_COLS = 6
const DEFAULT_GRID_ROWS = 16
const DEFAULT_GRID_SIZE = DEFAULT_GRID_COLS * DEFAULT_GRID_ROWS

// ─── Price format (ARS: $12.500) ──────────────────────────────────────────────

function formatARS(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function formatBillARS(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n)
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
  // ── Combos ────────────────────────────────────────────────────────────────
  is_combo_header?: boolean      // true = línea de cabecera del combo
  combo_id?: string              // ID del combo al que pertenece
  combo_slot_label?: string      // sub-item: etiqueta del slot al que pertenece
}

// ─── Combo selection state type ───────────────────────────────────────────────

type ActiveComboSelection = {
  combo: Combo
  // Tracks which slots are filled: slotLabel → array of filled item names
  filledSlots: { slotLabel: string; itemName: string; menu_item_id: string }[]
  // uid of the header item already added to the ticket
  headerUid: string
}

// ─── ComboOverlay component ───────────────────────────────────────────────────
// Renders an absolutely-positioned overlay over the combo grid cells.
// The overlay itself has pointer-events:none so the underlying dish cards remain
// tappable. Only the star badge has pointer-events:auto to activate the combo.

function ComboOverlay({
  combo,
  isActive,
  cellElemsRef,
  gridRef,
  onStartCombo,
  recomputeTick,
}: {
  combo: Combo
  isActive: boolean
  cellElemsRef: React.MutableRefObject<Map<number, HTMLElement>>
  gridRef: React.MutableRefObject<HTMLElement | null>
  onStartCombo: (combo: Combo) => void
  recomputeTick?: number
}) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    function compute() {
      if (!gridRef.current) return
      const gridRect = gridRef.current.getBoundingClientRect()
      const positions = combo.positions
      if (positions.length === 0) return

      let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity
      const scrollTop = gridRef.current.scrollTop
      const scrollLeft = gridRef.current.scrollLeft
      for (const pos of positions) {
        const el = cellElemsRef.current.get(pos)
        if (!el) return // not ready yet
        const r = el.getBoundingClientRect()
        minLeft = Math.min(minLeft, r.left - gridRect.left + scrollLeft)
        minTop = Math.min(minTop, r.top - gridRect.top + scrollTop)
        maxRight = Math.max(maxRight, r.right - gridRect.left + scrollLeft)
        maxBottom = Math.max(maxBottom, r.bottom - gridRect.top + scrollTop)
      }
      setRect({ left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop })
    }
    compute()
    // Recompute on resize/scroll
    window.addEventListener('resize', compute)
    const grid = gridRef.current
    if (grid) grid.addEventListener('scroll', compute)
    // ResizeObserver: recompute whenever the grid container changes size
    // (e.g. ticket panel opens/closes, window resize, any layout shift)
    let resizeObs: ResizeObserver | null = null
    if (grid && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(compute)
      resizeObs.observe(grid)
    }
    return () => {
      window.removeEventListener('resize', compute)
      if (grid) grid.removeEventListener('scroll', compute)
      if (resizeObs) resizeObs.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo.positions, cellElemsRef, gridRef, recomputeTick])

  if (!rect) return null

  const priceLabel = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0 }).format(combo.price)

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.left - 2,
        top: rect.top - 2,
        width: rect.width + 4,
        height: rect.height + 4,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* Gold border */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: isActive ? '3px solid #facc15' : '3px solid #d97706',
          borderRadius: '0.85rem',
          boxShadow: isActive ? '0 0 0 2px rgba(250,204,21,0.35)' : '0 0 0 1px rgba(217,119,6,0.25)',
          pointerEvents: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      />
      {/* Star badge — centered over the overlay */}
      <button
        onClick={(e) => { e.stopPropagation(); onStartCombo(combo) }}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: isActive ? '#ea580c' : '#f97316',
          color: '#fff',
          border: '2px solid rgba(255,255,255,0.35)',
          borderRadius: 9999,
          padding: '1px 4px',
          fontWeight: 900,
          fontSize: '0.72rem',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
          cursor: 'pointer',
          transition: 'background 0.15s, transform 0.1s',
          zIndex: 20,
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(0.93)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)')}
        onTouchStart={(e) => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(0.93)')}
        onTouchEnd={(e) => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)')}
        title={`Combo ${combo.name} — ${priceLabel}`}
      >
        <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff', textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>+</span>
        <span> $ {priceLabel}</span>
        {isActive && <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>✓</span>}
      </button>
    </div>
  )
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
  useEffect(() => {
    const id = setTimeout(onDone, 2000)
    return () => clearTimeout(id)
  }, [onDone])

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl bg-green-600 text-white font-bold text-lg select-none animate-bounce-in"
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

function CashMovementsModal({ onClose, prefillEgreso, printServerUrl }: { onClose: () => void; prefillEgreso?: PrefillEgreso; printServerUrl?: string | null }) {
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
      setTimeout(async () => {
        setSuccess(null)
        // Try print-server first; fallback to ticket page
        if (printServerUrl) {
          const printed = await tryPrintServer(receiptText, printServerUrl)
          if (printed) {
            // Also open drawer for cash inflows/outflows
            void tryOpenDrawer(printServerUrl)
            return
          }
        }
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
  printServerUrl,
}: {
  shift: Shift
  onClose: () => void
  onClosed: () => void
  printServerUrl?: string | null
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [countedAmount, setCountedAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  // Pre-calculate live summary using same logic as close endpoint
  useEffect(() => {
    let cancelled = false
    setLoadingSummary(true)

    async function loadPreview() {
      try {
        const res = await fetch('/api/pos/shifts/preview')
        if (!res.ok) throw new Error('Error loading preview')
        const data = await res.json()
        if (cancelled) return

        setSummary({
          opening_amount: data.opening_amount,
          closing_amount: 0,
          expected_amount: data.expected_amount,
          difference: 0,
          total_cash_sales: data.total_cash_sales,
          total_transfer_sales: data.total_transfer_sales,
          total_mixed_sales: data.total_mixed_sales,
          total_income: data.total_income,
          total_expense: data.total_expense,
          total_refunds: data.total_refunds,
          opened_at: data.opened_at,
          closed_at: new Date().toISOString(),
        })
      } catch (e) { void e }
      if (!cancelled) setLoadingSummary(false)
    }

    loadPreview()
    return () => { cancelled = true }
  }, [shift])

  const counted = parseFloat(countedAmount.replace(/\./g, '').replace(',', '.') || '0')
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

      // Open cash drawer (non-blocking)
      if (printServerUrl) {
        fetch(`${printServerUrl}/open-drawer`, { method: 'POST' }).catch(() => {})
      }
      if (printServerUrl) {
        // Thermal printer: send ticket directly, then close modal normally
        await triggerShiftPrint(data.summary, printServerUrl)
        onClosed()
      } else {
        // PWA standalone (APK): window.open is blocked — navigate to /pos/ticket via location.href.
        // The page is replaced so onClosed() won't run, but the shift is already closed in DB.
        // The ticket page will redirect back to /pos when the user finishes printing.
        await triggerShiftPrint(data.summary, null)
      }
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

async function triggerShiftPrint(summary: ShiftSummary, printServerUrl?: string | null): Promise<void> {
  const text = buildShiftCloseTicket(summary)
  if (printServerUrl) {
    const ok = await tryPrintServer(text, printServerUrl)
    if (ok) return
  }
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
  // Mark that a shift was just closed so the ticket page redirects back to /pos
  sessionStorage.setItem('pos_shift_just_closed', 'true')
  // Use location.href instead of window.open — window.open is blocked in PWA standalone (APK)
  window.location.href = '/pos/ticket'
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
  bills = [1000, 2000, 10000, 20000],
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
  bills?: number[]
}) {
  // Validation for mixed payment
  const mixedValid = paymentMethod !== 'Mixto' || (() => {
    const ca = parseFloat(cashAmount.replace(',', '.') || '0')
    const ta = parseFloat(transferAmount.replace(',', '.') || '0')
    return Math.abs(ca + ta - total) < 1
  })()

  // Cash denomination helper state
  const [selectedBill, setSelectedBill] = useState<number | null>(null)

  const handlePaymentChange = (pm: PaymentMethod) => {
    setSelectedBill(null)
    onPaymentChange(pm)
  }

  const BILLS = bills

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
                  onClick={() => handlePaymentChange(pm)}
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

            {/* Cash denomination helper */}
            {paymentMethod === 'Efectivo' && (
              <div className="mt-3">
                <p className="text-xs font-bold text-gray-400 mb-2">Billete recibido</p>
                <div className="flex gap-2">
                  {BILLS.map((bill) => (
                    <button
                      key={bill}
                      onClick={() => setSelectedBill(selectedBill === bill ? null : bill)}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 border ${
                        selectedBill === bill
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-teal-400 hover:bg-teal-50'
                      }`}
                    >
                      {formatBillARS(bill)}
                    </button>
                  ))}
                </div>
                {selectedBill !== null && (
                  <div className={`mt-2 px-3 py-2 rounded-xl text-sm font-black text-center ${
                    selectedBill < total
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : selectedBill === total
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                    {selectedBill < total
                      ? 'No alcanza'
                      : selectedBill === total
                        ? 'Pago exacto'
                        : `Vuelto: $${formatBillARS(selectedBill - total)}`
                    }
                  </div>
                )}
              </div>
            )}

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
  updated_at?: string | null
  delivered_at?: string | null
  status?: string | null
  table_number?: number | null
  notes?: string | null
  employee_name?: string | null
  order_items?: Array<{
    id: string
    menu_item_id: string
    name: string
    price: number
    quantity: number
    status?: string | null
  }>
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

// ─── Swap Item Modal ──────────────────────────────────────────────────────────

function SwapItemModal({
  order,
  menuItems,
  onClose,
  onSuccess,
  onRefund,
}: {
  order: SentOrder
  menuItems: Array<{ id: string; name: string; price: number; category_id?: string }>
  onClose: () => void
  onSuccess: () => void
  onRefund: (amount: number, method: 'cash' | 'transfer') => void
}) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [newMenuItemId, setNewMenuItemId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ difference: number; old_item: string; new_item: string } | null>(null)
  const [showRefundChoice, setShowRefundChoice] = useState(false)

  const [cancellingItem, setCancellingItem] = useState(false)
  const [showCancelItemConfirm, setShowCancelItemConfirm] = useState(false)

  const handleCancelItem = async () => {
    if (!selectedItem) return
    setCancellingItem(true)
    setError(null)
    try {
      const res = await fetch(`/api/pos/orders/${order.id}/cancel-item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_item_id: selectedItem }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setResult({ difference: -data.refund_amount, old_item: data.item_name, new_item: '(cancelado)' })
      setShowCancelItemConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setCancellingItem(false)
  }

  const items = order.order_items ?? []
  const selectedOrderItem = items.find((i) => i.id === selectedItem)

  const filteredMenu = menuItems.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    m.id !== selectedOrderItem?.menu_item_id
  )

  const newMenuItem = menuItems.find((m) => m.id === newMenuItemId)
  const priceDiff = selectedOrderItem && newMenuItem
    ? (Number(newMenuItem.price) - Number(selectedOrderItem.price)) * Number(selectedOrderItem.quantity)
    : 0

  const handleSwap = async () => {
    if (!selectedItem || !newMenuItemId || !newMenuItem) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/pos/orders/${order.id}/swap-item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_item_id: selectedItem,
          new_menu_item_id: newMenuItemId,
          new_name: newMenuItem.name,
          new_price: newMenuItem.price,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setResult(data)
      setTimeout(() => onSuccess(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
        <div className="px-5 py-4 bg-purple-600 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-black text-lg leading-none">Cambiar plato</h3>
            <p className="text-purple-200 text-xs mt-0.5">{order.customer_name}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: 0 }}>
          {result ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-green-600 font-bold text-lg">✓ Plato cambiado</p>
              <p className="text-sm text-gray-600">{result.old_item} → {result.new_item}</p>
              {result.difference > 0 && (
                <p className="text-sm font-bold text-blue-600">
                  Cobrar diferencia: +${result.difference.toLocaleString('es-AR')}
                </p>
              )}
              {result.difference < 0 && !showRefundChoice && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-red-600">
                    Devolución: ${Math.abs(result.difference).toLocaleString('es-AR')}
                  </p>
                  <button
                    onClick={() => setShowRefundChoice(true)}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700"
                  >
                    Realizar devolución
                  </button>
                </div>
              )}
              {result.difference < 0 && showRefundChoice && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-red-600">
                    Devolver ${Math.abs(result.difference).toLocaleString('es-AR')} por:
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => { onRefund(Math.abs(result.difference), 'cash'); onClose() }}
                      className="px-4 py-3 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700"
                    >
                      💵 Efectivo
                    </button>
                    <button
                      onClick={() => { onRefund(Math.abs(result.difference), 'transfer'); onClose() }}
                      className="px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700"
                    >
                      📱 Transferencia
                    </button>
                  </div>
                </div>
              )}
              {result.difference === 0 && (
                <p className="text-sm text-gray-500">Sin diferencia de precio</p>
              )}
            </div>
          ) : (
            <>
              {/* Step 1: Select item to replace */}
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">1. Seleccionar plato a cambiar</p>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setSelectedItem(item.id); setNewMenuItemId('') }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                        selectedItem === item.id
                          ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      <span className="font-semibold text-sm text-gray-800">{item.quantity}x {item.name}</span>
                      <span className="text-xs text-gray-500 ml-2">${Number(item.price).toLocaleString('es-AR')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Actions - Cancel item or Swap */}
              {selectedItem && !showCancelItemConfirm && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCancelItemConfirm(true)}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-red-100 text-red-700 hover:bg-red-200 active:scale-95 transition-all"
                  >
                    ✕ Cancelar plato
                  </button>
                  <p className="self-center text-xs text-gray-400">ó cambiar por otro ↓</p>
                </div>
              )}

              {/* Cancel item confirmation */}
              {showCancelItemConfirm && selectedOrderItem && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-red-700">
                    ¿Cancelar {selectedOrderItem.quantity}x {selectedOrderItem.name} (${(Number(selectedOrderItem.price) * Number(selectedOrderItem.quantity)).toLocaleString('es-AR')})?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCancelItemConfirm(false)}
                      className="flex-1 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Volver
                    </button>
                    <button
                      onClick={handleCancelItem}
                      disabled={cancellingItem}
                      className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {cancellingItem ? 'Cancelando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Select replacement */}
              {selectedItem && !showCancelItemConfirm && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">2. Elegir nuevo plato</p>
                  <input
                    type="text"
                    placeholder="Buscar plato..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredMenu.slice(0, 20).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setNewMenuItemId(m.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-all text-sm ${
                          newMenuItemId === m.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-100 hover:border-purple-300'
                        }`}
                      >
                        <span className="font-medium text-gray-800">{m.name}</span>
                        <span className="text-xs text-gray-500 ml-2">${Number(m.price).toLocaleString('es-AR')}</span>
                      </button>
                    ))}
                  </div>

                  {/* Price difference preview */}
                  {newMenuItemId && (
                    <div className={`mt-3 px-3 py-2 rounded-xl text-sm font-bold ${
                      priceDiff > 0 ? 'bg-blue-50 text-blue-700' : priceDiff < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'
                    }`}>
                      {priceDiff > 0 ? `Cobrar diferencia: +$${priceDiff.toLocaleString('es-AR')}` :
                       priceDiff < 0 ? `Devolver: $${Math.abs(priceDiff).toLocaleString('es-AR')}` :
                       'Sin diferencia de precio'}
                    </div>
                  )}
                </div>
              )}

              {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
            </>
          )}
        </div>

        {!result && (
          <div className="px-4 py-3 border-t border-gray-100 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">Cancelar</button>
            <button
              onClick={handleSwap}
              disabled={!selectedItem || !newMenuItemId || saving}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Cambiando...' : 'Confirmar cambio'}
            </button>
          </div>
        )}
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

  // ── Combo header: gold border, show price, no qty controls ──
  if (item.is_combo_header) {
    return (
      <li className="flex flex-col rounded-xl px-2.5 py-1.5 border gap-1 bg-yellow-950 border-yellow-600">
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <p className="font-black text-yellow-300 text-sm leading-tight truncate">
              ★ {item.name}
            </p>
            <p className="font-bold text-xs tabular-nums mt-0.5 text-yellow-400">
              {formatARS(item.price)}
            </p>
          </div>
          <button
            onClick={() => onRemove(item.uid)}
            className="w-6 h-6 rounded-md bg-red-900 hover:bg-red-800 active:scale-90 flex items-center justify-center text-red-300 font-black text-xs transition-all ml-0.5 shrink-0"
            aria-label="Eliminar combo"
          >
            ✕
          </button>
        </div>
      </li>
    )
  }

  // ── Combo sub-item: indented, price 0, no qty/bonus controls ──
  if (item.combo_slot_label) {
    return (
      <li className="flex flex-col rounded-lg px-2 py-1 border gap-0.5 bg-amber-500 border-amber-600 ml-3">
        <div className="flex items-center gap-1.5">
          <span className="text-white text-xs shrink-0">└</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-xs leading-tight truncate">
              {item.name}
              <span className="text-white/80 text-[10px] ml-1">({item.combo_slot_label})</span>
            </p>
          </div>
          <button
            onClick={() => onRemove(item.uid)}
            className="w-5 h-5 rounded-md bg-red-900 hover:bg-red-800 active:scale-90 flex items-center justify-center text-white font-black text-[10px] transition-all shrink-0"
            aria-label="Quitar del combo"
          >
            ✕
          </button>
        </div>
      </li>
    )
  }

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

// ─── Mixed Payment Modal (solo para pago mixto) ───────────────────────────────────────

function MixedPaymentModal({
  total,
  cashAmount,
  transferAmount,
  onCashAmountChange,
  onTransferAmountChange,
  submitting,
  onCancel,
  onConfirm,
}: {
  total: number
  cashAmount: string
  transferAmount: string
  onCashAmountChange: (v: string) => void
  onTransferAmountChange: (v: string) => void
  submitting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const ca = parseFloat(cashAmount.replace(',', '.') || '0')
  const ta = parseFloat(transferAmount.replace(',', '.') || '0')
  const mixedValid = Math.abs(ca + ta - total) < 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 flex flex-col overflow-hidden">
        <div className="px-5 py-4 bg-teal-600">
          <h3 className="text-white font-black text-lg leading-none">Pago Mixto</h3>
          <p className="text-teal-100 text-xs mt-0.5">Total: {formatARS(total)}</p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Monto efectivo</p>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={cashAmount}
              onChange={(e) => {
                onCashAmountChange(e.target.value)
                const cash = parseFloat(e.target.value.replace(',', '.') || '0')
                if (cash >= 0 && cash <= total) {
                  onTransferAmountChange(String(Math.round(total - cash)))
                }
              }}
              placeholder="$ 0"
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-lg font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
            />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">Monto transferencia</p>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={transferAmount}
              onChange={(e) => onTransferAmountChange(e.target.value)}
              placeholder="$ 0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-lg font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
            />
          </div>
          {(ca > 0 || ta > 0) && (
            mixedValid
              ? <p className="text-xs text-green-600 font-semibold">✓ Suma correcta</p>
              : <p className="text-xs text-red-500 font-semibold">La suma debe ser {formatARS(total)} (falta {formatARS(Math.abs(ca + ta - total))})</p>
          )}
        </div>
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
            {submitting ? 'Cobrando...' : 'Cobrar e Imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ticket Panel ─────────────────────────────────────────────────────────────────────────────

function TicketPanel({
  items,
  diningOption,
  persons,
  activePerson,
  tableNumber,
  paymentMethod,
  cashAmount,
  transferAmount,
  customerName,
  orderNotes,
  submitting,
  customers,
  onUpdateQty,
  onRemove,
  onUpdateNote,
  onDiningChange,
  onPersonsChange,
  onActivePersonChange,
  onTableChange,
  onPaymentChange,
  onCashAmountChange,
  onTransferAmountChange,
  onCustomerChange,
  onNotesChange,
  onDirectSubmit,
  onBonusClick,
  onUnbonus,
  // ─── Mesa abierta / roles ───────────────────────────────────────
  canCharge,
  canSendKitchen,
  canRequestBill,
  onSendKitchen,
  onRequestBill,
  sendingKitchen,
  activeOpenOrder,
  selectedBill,
  onBillSelect,
  onForcePrint,
  bills = [1000, 2000, 10000, 20000],
  // ─── Combos ────────────────────────────────────────────────────
  activeComboSelection,
  onCancelCombo,
}: {
  items: TicketItem[]
  diningOption: DiningOption
  persons: number
  activePerson: number
  tableNumber: string
  paymentMethod: PaymentMethod
  cashAmount: string
  transferAmount: string
  customerName: string
  orderNotes: string
  submitting: boolean
  customers: FrequentCustomer[]
  onUpdateQty: (uid: string, delta: number) => void
  onRemove: (uid: string) => void
  onUpdateNote: (uid: string, note: string) => void
  onDiningChange: (v: DiningOption) => void
  onPersonsChange: (v: number) => void
  onActivePersonChange: (v: number) => void
  onTableChange: (v: string) => void
  onPaymentChange: (v: PaymentMethod) => void
  onCashAmountChange: (v: string) => void
  onTransferAmountChange: (v: string) => void
  onCustomerChange: (v: string) => void
  onNotesChange: (v: string) => void
  onDirectSubmit: () => void
  onBonusClick?: (uid: string) => void
  onUnbonus?: (uid: string) => void
  // ─── Mesa abierta / roles ───────────────────────────────────────
  canCharge?: boolean
  canSendKitchen?: boolean
  canRequestBill?: boolean
  onSendKitchen?: () => void
  onRequestBill?: () => void
  sendingKitchen?: boolean
  activeOpenOrder?: { id: string; table_number: number; existingItems: TicketItem[] } | null
  selectedBill?: number | null
  onBillSelect?: (bill: number) => void
  onForcePrint?: (v: boolean) => void
  bills?: number[]
  // ─── Combos ────────────────────────────────────────────────────
  activeComboSelection?: ActiveComboSelection | null
  onCancelCombo?: () => void
}) {
  const total = items.reduce((s, i) => {
    if (i.is_bonus) return s
    const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
    return s + (i.price + modExtra) * i.quantity
  }, 0)
  const bonusCount = items.filter((i) => i.is_bonus).length
  const isEmpty = items.length === 0
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)
  const multiPerson = persons > 1

  const needsTable = diningOption === 'Comer dentro' && !tableNumber
  const canDirectSubmit = !isEmpty && !needsTable && paymentMethod !== 'Mixto'

  const PM_OPTIONS: { value: PaymentMethod; label: string; icon: string; activeClass: string }[] = [
    { value: 'Efectivo',      label: 'Efectivo', icon: '💵', activeClass: 'bg-green-500 text-white shadow-sm'  },
    { value: 'Transferencia', label: 'Transfer', icon: '📲', activeClass: 'bg-blue-500 text-white shadow-sm'   },
    { value: 'Mixto',         label: 'Mixto',    icon: '💰', activeClass: 'bg-purple-600 text-white shadow-sm' },
  ]

  return (
    <div className="flex flex-col h-full bg-white" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-4 py-2.5 bg-teal-700 shrink-0">
        <h2 className="text-white font-black text-base leading-none">Ticket</h2>
        {!isEmpty && (
          <p className="text-teal-100 text-xs mt-0.5">
            {itemCount} items{bonusCount > 0 && ` · ${bonusCount} bonif.`}
          </p>
        )}
      </div>

      {/* Single scrollable area: options + items + total + button */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>

        {/* Dining option toggle */}
        <div className="px-3 pt-2.5 pb-2 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-1.5 bg-gray-100 rounded-xl p-1">
            {([
              { value: 'Comer dentro' as DiningOption, label: 'Aquí', icon: '🪱' },
              { value: 'Para llevar' as DiningOption, label: 'Llevar', icon: '🛍️' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => onDiningChange(opt.value)}
                className={`py-2 rounded-lg font-bold text-sm transition-all active:scale-[0.98] ${
                  diningOption === opt.value
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mesa (chips 1-20) -- solo si Comer dentro */}
        {diningOption === 'Comer dentro' && (
          <div className="px-3 pt-2 pb-2 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Mesa</p>
            <div className="flex flex-nowrap gap-1 overflow-x-auto scrollbar-hide">
              {Array.from({ length: 20 }, (_, i) => String(i + 1)).map((n) => (
                <button
                  key={n}
                  onClick={() => onTableChange(tableNumber === n ? '' : n)}
                  className={`flex-shrink-0 w-7 h-7 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                    tableNumber === n
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {!tableNumber && (
              <p className="text-[10px] text-amber-600 font-semibold mt-1">Seleccioná la mesa</p>
            )}
          </div>
        )}

        {/* Método de pago */}
        <div className="px-3 pt-2 pb-2 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Pago</p>
          <div className="grid grid-cols-3 gap-1.5">
            {PM_OPTIONS.map((pm) => (
              <button
                key={pm.value}
                onClick={() => onPaymentChange(pm.value)}
                className={`py-2 rounded-xl font-bold text-xs transition-all active:scale-[0.97] ${
                  paymentMethod === pm.value
                    ? pm.activeClass
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {pm.icon} {pm.label}
              </button>
            ))}
          </div>

          {/* Cash denomination helper - calculadora de vuelto */}
          {paymentMethod === 'Efectivo' && (canCharge ?? true) && (
            <div className="mt-2">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {bills.map((bill) => (
                  <button
                    key={bill}
                    onClick={() => onBillSelect?.(bill)}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-base transition-all active:scale-95 border-2 ${
                      selectedBill === bill
                        ? 'bg-teal-600 text-white border-teal-600 shadow-md'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {formatBillARS(bill)}
                  </button>
                ))}
              </div>
              {selectedBill != null && (
                <div className={`mt-1.5 px-2 py-1.5 rounded-lg text-xs font-black text-center ${
                  selectedBill < total
                    ? 'bg-red-50 text-red-600'
                    : selectedBill === total
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-green-50 text-green-700'
                }`}>
                  {selectedBill < total
                    ? '❌ No alcanza'
                    : selectedBill === total
                      ? '✅ Pago exacto'
                      : `💰 Vuelto: $${formatBillARS(selectedBill - total)}`
                  }
                </div>
              )}
            </div>
          )}
        </div>

        {/* Personas */}
        <div className="px-3 pt-2 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Personas:</span>
            <button
              onClick={() => {
                const next = Math.max(1, persons - 1)
                onPersonsChange(next)
                if (activePerson > next) onActivePersonChange(next)
              }}
              className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 active:scale-90 flex items-center justify-center font-black text-gray-700 text-sm transition-all"
            >−</button>
            <span className="w-5 text-center font-black text-gray-900 tabular-nums text-sm">{persons}</span>
            <button
              onClick={() => onPersonsChange(Math.min(9, persons + 1))}
              className="w-6 h-6 rounded-md bg-teal-100 hover:bg-teal-200 active:scale-90 flex items-center justify-center font-black text-teal-700 text-sm transition-all"
            >+</button>
            {multiPerson && (
              <div className="flex gap-1 ml-1 flex-wrap">
                {Array.from({ length: persons }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => onActivePersonChange(p)}
                    className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                      activePerson === p ? 'bg-teal-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    P{p}
                  </button>
                ))}
              </div>
            )}
          </div>
          {multiPerson && (
            <p className="text-[10px] text-teal-600 font-semibold mt-1 leading-none">Agregando para Persona {activePerson}</p>
          )}
        </div>

        {/* Cliente */}
        <div className="px-3 pt-2 pb-2 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Cliente</p>
          <CustomerCombobox value={customerName} onChange={onCustomerChange} customers={customers} />
        </div>

        {/* Nota */}
        <div className="px-3 pt-2 pb-2 border-b border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Nota</p>
          <input
            type="text"
            value={orderNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Nota del pedido..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>

        {/* Items list */}
        <div className="px-3 py-2">
          {/* ── Combo selection indicator ───────────────────────────── */}
          {activeComboSelection && (() => {
            const combo = activeComboSelection.combo
            const filled = activeComboSelection.filledSlots
            // Build pending slots list
            const pending: string[] = []
            combo.slots.forEach((slot) => {
              const filledForSlot = filled.filter((f) => f.slotLabel === slot.label)
              const remaining = slot.qty - filledForSlot.length
              for (let i = 0; i < remaining; i++) pending.push(slot.label)
            })
            return (
              <div className="mb-2 rounded-xl border-2 border-yellow-500 bg-yellow-950 px-3 py-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-yellow-300 font-black text-sm">★ {combo.name}</span>
                  <button
                    onClick={onCancelCombo}
                    className="text-xs text-red-400 font-bold hover:text-red-300 px-2 py-0.5 rounded-lg bg-red-900/50 active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pending.map((label, i) => (
                    <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-800 text-yellow-200 border border-yellow-600">
                      {label}
                    </span>
                  ))}
                  {pending.length === 0 && (
                    <span className="text-[10px] text-green-400 font-bold">Combo completo</span>
                  )}
                </div>
                {pending.length > 0 && (
                  <p className="text-[10px] text-yellow-500">
                    Tocá {pending.length === 1 ? 'el item' : 'los items'} del combo en el menú
                  </p>
                )}
              </div>
            )
          })()}
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <span className="text-4xl">🛒</span>
              <p className="text-sm font-semibold">Sin items</p>
              <p className="text-xs">Tocá un plato para agregar</p>
            </div>
          ) : multiPerson ? (
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

        {/* Total + COBRAR E IMPRIMIR */}
        <div className="px-3 pb-3 pt-2.5 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-gray-500 text-sm font-semibold">Total</span>
            <span className="text-gray-900 font-black text-2xl tabular-nums">{formatARS(total)}</span>
          </div>

          {/* Botones por rol */}
          <div className="flex flex-col gap-2">
            {/* Enviar a cocina — visible para mozo (no puede cobrar) */}
            {canSendKitchen && !canCharge && (
              <button
                onClick={onSendKitchen}
                disabled={isEmpty || sendingKitchen}
                className={`w-full py-4 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-95 shadow-md ${
                  isEmpty || sendingKitchen
                    ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
                }`}
                style={{ minHeight: 56 }}
              >
                {sendingKitchen ? 'Enviando...' : '🍽️ Enviar a cocina'}
              </button>
            )}

            {/* Cobrar — solo cajero/gerente/dueño */}
            {(canCharge ?? true) && paymentMethod === 'Transferencia' && (
              <div className="flex gap-2">
                <button
                  onClick={() => { onForcePrint?.(false); onDirectSubmit() }}
                  disabled={isEmpty || submitting}
                  className={`flex-1 py-4 rounded-2xl font-black text-base tracking-wide transition-all active:scale-95 shadow-md ${
                    isEmpty || submitting
                      ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                      : 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
                  }`}
                  style={{ minHeight: 56 }}
                >
                  {submitting ? 'Cobrando...' : '✅ COBRAR'}
                </button>
                <button
                  onClick={() => { onForcePrint?.(true); onDirectSubmit() }}
                  disabled={isEmpty || submitting}
                  className={`flex-1 py-4 rounded-2xl font-black text-base tracking-wide transition-all active:scale-95 shadow-md ${
                    isEmpty || submitting
                      ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer'
                  }`}
                  style={{ minHeight: 56 }}
                >
                  {submitting ? 'Cobrando...' : '🖨️ COBRAR + TICKET'}
                </button>
              </div>
            )}
            {(canCharge ?? true) && paymentMethod !== 'Transferencia' && (
              <button
                onClick={() => { onForcePrint?.(true); onDirectSubmit() }}
                disabled={isEmpty || submitting}
                className={`w-full py-4 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-95 shadow-md ${
                  isEmpty || submitting
                    ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                    : canDirectSubmit
                      ? 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
                      : paymentMethod === 'Mixto'
                        ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'
                        : 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer'
                }`}
                style={{ minHeight: 56 }}
              >
                {submitting ? 'Cobrando...' : '🖨️ COBRAR E IMPRIMIR'}
              </button>
            )}

            {/* Pedir cuenta — visible para mozo con mesa activa */}
            {canRequestBill && activeOpenOrder && !canCharge && (
              <button
                onClick={onRequestBill}
                disabled={!activeOpenOrder}
                className="w-full py-3 rounded-2xl font-bold text-base tracking-wide transition-all active:scale-95 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-md"
              >
                🧾 Pedir cuenta
              </button>
            )}
          </div>

          {!isEmpty && needsTable && (
            <p className="text-center text-[10px] text-amber-600 font-semibold mt-1.5">Ingresá una mesa para cobrar</p>
          )}
        </div>

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

function buildAdvanceReceiptText(payment: POSPayment, empName: string, empRole: string): string {
  const dateStr = toArgDateTimePOS(payment.created_at)
  const pmLabel = pmLabelPOS(payment.payment_method)
  let text = ''
  text += '[CENTER][BOLD]SUMAK RESTAURANTE[/BOLD][/CENTER]\n'
  text += '[CENTER]RECIBO DE ADELANTO[/CENTER]\n'
  text += '[SEP]\n'
  text += `Fecha: ${dateStr}\n`
  text += `Empleado: ${empName}\n`
  text += `Cargo: ${empRole || '—'}\n`
  text += '[SEP]\n'
  text += `[BOLD]MONTO ADELANTADO: ${formatARSPOS(payment.amount)}[/BOLD]\n`
  if (payment.description) text += `Concepto: ${payment.description}\n`
  text += `Método de pago: ${pmLabel}\n`
  if (payment.payment_method === 'mixed') {
    text += `  Efectivo: ${formatARSPOS(payment.cash_amount ?? 0)}\n`
    text += `  Transferencia: ${formatARSPOS(payment.transfer_amount ?? 0)}\n`
  }
  text += '[SEP]\n'
  text += '\n\n'
  text += '[CENTER]________________________[/CENTER]\n'
  text += '[CENTER]Firma del empleado[/CENTER]\n'
  return text
}

async function printAdvancePOS(payment: POSPayment, empName: string, empRole: string, printServerUrl?: string | null) {
  const text = buildAdvanceReceiptText(payment, empName, empRole)

  // Intentar print-server primero (térmica)
  if (printServerUrl) {
    const ok = await tryPrintServer(text, printServerUrl)
    if (ok) return
  }

  // Fallback: abrir página de recibo para window.print()
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

function EmployeePOSModal({ onClose, printServerUrl }: { onClose: () => void; printServerUrl: string | null }) {
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
        printAdvancePOS(pmt, emp?.name ?? '', emp?.role ?? '', printServerUrl)
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
                          onClick={() => printAdvancePOS(pmt, emp?.name ?? '', emp?.role ?? '', printServerUrl)}
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

  // ─── Autenticación por PIN ─────────────────────────────────────────────────
  const { session, permissions, isAuthenticated, logout } = usePosAuth()

  // ─── Mesa abierta ─────────────────────────────────────────────────────────
  // Orden actualmente cargada como "mesa abierta" (para agregar items)
  const [activeOpenOrder, setActiveOpenOrder] = useState<{
    id: string
    table_number: number
    existingItems: TicketItem[]  // items ya enviados a cocina (readonly)
  } | null>(null)
  // Panel lateral de mesas abiertas
  const [showOpenTables, setShowOpenTables] = useState(false)
  const [openTablesEnabled, setOpenTablesEnabled] = useState(false)
  const [openTablesRefresh, setOpenTablesRefresh] = useState(0)

  // Load open_tables_enabled setting
  useEffect(() => {
    fetch('/api/admin/settings?key=open_tables_enabled')
      .then(r => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        setOpenTablesEnabled(d[0]?.value === 'true')
      })
      .catch(() => {})
  }, [])
  // Estado de envío/cobro de mesa abierta
  const [sendingKitchen, setSendingKitchen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<number | null>(null)
  const [closingTable, setClosingTable] = useState(false)
  const [posBills, setPosBills] = useState<number[]>([1000, 2000, 10000, 20000])

  // Load pos_bills setting
  useEffect(() => {
    fetch('/api/admin/settings?key=pos_bills')
      .then(r => r.ok ? r.json() : [])
      .then((d: { key: string; value: string }[]) => {
        if (d[0]?.value) {
          const parsed = d[0].value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0)
          if (parsed.length > 0) setPosBills(parsed)
        }
      })
      .catch(() => {})
  }, [])
  // Modal de pre-cuenta
  const [preBillModal, setPreBillModal] = useState<{
    table: number
    total: number
    items: { name: string; quantity: number; unit_price: number; is_bonus: boolean }[]
    tipEnabled: boolean
    tipPercentages: number[]
  } | null>(null)

  // Force locale to 'es' when languages are disabled
  useEffect(() => {
    if (!languagesEnabled && locale !== 'es') setLocale('es')
  }, [languagesEnabled, locale, setLocale])

  // Logo and ticket config are NOT cached at mount — fetched fresh on each print (see fetchFreshPrintConfig)
  // We keep these refs to avoid passing stale closures into handleSubmit
  const ticketCfgRef = useRef<TicketConfig>(DEFAULT_TICKET_CONFIG)
  const ticketLogoRef = useRef<string | null>(null)

  /**
   * Fetch fresh ticket config + logo from DB right before printing.
   * Returns the latest cfg and logoUrl so each print uses current admin settings.
   */
  const fetchFreshPrintConfig = useCallback(async (): Promise<{ cfg: TicketConfig; logoUrl: string | null }> => {
    try {
      const [cfgRes, logoRes] = await Promise.all([
        fetch('/api/admin/settings?key=ticket_config'),
        fetch('/api/admin/settings?key=ticket_logo'),
      ])
      const cfgData = cfgRes.ok ? await cfgRes.json() : null
      const logoData = logoRes.ok ? await logoRes.json() : null

      let cfg: TicketConfig = DEFAULT_TICKET_CONFIG
      if (Array.isArray(cfgData) && cfgData[0]?.value) {
        try {
          const parsed = typeof cfgData[0].value === 'string' ? JSON.parse(cfgData[0].value) : cfgData[0].value
          cfg = { ...DEFAULT_TICKET_CONFIG, ...parsed }
        } catch { /* use default */ }
      }

      const logoUrl: string | null = (Array.isArray(logoData) && logoData[0]?.value) ? String(logoData[0].value) : null

      // Update refs so they are available in other callbacks
      ticketCfgRef.current = cfg
      ticketLogoRef.current = logoUrl

      return { cfg, logoUrl }
    } catch {
      return { cfg: ticketCfgRef.current, logoUrl: ticketLogoRef.current }
    }
  }, [])

  // Print server URL (fetched once on load)
  const [printServerUrl, setPrintServerUrl] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/admin/settings?key=print_server_url')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const val = Array.isArray(data) && data[0]?.value ? data[0].value as string : null
        setPrintServerUrl(val)
      })
      .catch(() => {})
  }, [])

  // Grid settings (fetched once on load)
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS)
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE)
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings?key=grid_cols').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/settings?key=grid_rows').then((r) => r.ok ? r.json() : []),
    ]).then(([colsData, rowsData]) => {
      const cols = colsData[0]?.value ? parseInt(colsData[0].value, 10) : DEFAULT_GRID_COLS
      const rows = rowsData[0]?.value ? parseInt(rowsData[0].value, 10) : DEFAULT_GRID_ROWS
      const safeCols = isNaN(cols) ? DEFAULT_GRID_COLS : cols
      const safeRows = isNaN(rows) ? DEFAULT_GRID_ROWS : rows
      setGridCols(safeCols)
      setGridSize(safeCols * safeRows)
    }).catch(() => {})
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

  // ─── Combos ───────────────────────────────────────────────────────────────────
  const [combos, setCombos] = useState<Combo[]>([])
  const [activeComboSelection, setActiveComboSelection] = useState<ActiveComboSelection | null>(null)
  // Tick incremented after order/ticket clear to force ComboOverlay to recompute cell positions
  const [comboOverlayTick, setComboOverlayTick] = useState(0)

  useEffect(() => {
    fetch('/api/admin/combos')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCombos(Array.isArray(data) ? data.filter((c: Combo) => c.active) : []))
      .catch(() => {})
  }, [])

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
  const [showMixedModal, setShowMixedModal] = useState(false)
  const [showMixtoModal, setShowMixtoModal] = useState(false)
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
  const [swapItemOrder, setSwapItemOrder] = useState<SentOrder | null>(null)

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
  const [posSearch, setPosSearch] = useState('')
  const [showPosSearch, setShowPosSearch] = useState(false)

  // Tick every 30s to update live timers in sent orders
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

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

  // Search filter for "Todos" tab — search ALL menu items (not just grid-assigned)
  const searchFilteredItems = (activeCategory === 'all' && posSearch.trim())
    ? menuItems.filter((item) => item.name.toLowerCase().includes(posSearch.toLowerCase()))
    : filteredItems

  // Items for category tabs: filter by category, only show assigned items (display_order > 0)
  const categoryItems = activeCategory === 'all'
    ? []
    : menuItems.filter((item) => {
        if ((item.display_order ?? 0) <= 0) return false
        const cat = categories.find((c) => c.slug === activeCategory)
        return cat ? item.category_id === cat.id : true
      })

  const displayItems = activeCategory === 'all' ? searchFilteredItems.slice(0, posSearch.trim() ? 50 : gridSize) : filteredItems.slice(0, MAX_VISIBLE)

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
    // ── If in combo selection mode, add as sub-item ──────────────────────────
    if (activeComboSelection) {
      const combo = activeComboSelection.combo
      const filled = activeComboSelection.filledSlots

      // Find the next unfilled slot that accepts this item's category
      const pendingSlot = combo.slots.find((slot) => {
        // Count how many items are already filled for this slot
        const count = filled.filter((f) => f.slotLabel === slot.label).length
        if (count >= slot.qty) return false
        // If the slot has a category restriction, check it
        if (slot.category_id) {
          return slot.category_id === (item.category_id ?? '')
        }
        return true
      })

      if (!pendingSlot) {
        // No slot found for this item — just add normally
        const modifierIds = itemModifierMap[item.id] ?? []
        if (modifierIds.length === 0) {
          addItemToTicket(item)
        } else {
          const modifiersForItem = allModifiers.filter((m) => modifierIds.includes(m.id))
          if (modifiersForItem.length === 0) {
            addItemToTicket(item)
          } else {
            setPendingItem(item)
            setPendingModifiers(modifiersForItem)
          }
        }
        return
      }

      // Add sub-item to ticket (price 0, with combo_slot_label)
      const personNum = persons > 1 ? activePerson : null
      const subUid = `combo__${activeComboSelection.headerUid}__slot__${pendingSlot.label}__${item.id}__${Date.now()}`
      const subItem: TicketItem = {
        uid: subUid,
        menu_item_id: item.id,
        name: item.name,
        price: 0,
        quantity: 1,
        image_url: item.image_url,
        person_number: personNum,
        combo_id: combo.id,
        combo_slot_label: pendingSlot.label,
      }
      setTicketItems((prev) => [...prev, subItem])
      setTicketOpen(true)

      // Update filled slots
      const newFilled = [
        ...filled,
        { slotLabel: pendingSlot.label, itemName: item.name, menu_item_id: item.id },
      ]
      const totalRequired = combo.slots.reduce((s, sl) => s + sl.qty, 0)
      if (newFilled.length >= totalRequired) {
        // All slots filled — exit combo mode
        setActiveComboSelection(null)
      } else {
        setActiveComboSelection({ ...activeComboSelection, filledSlots: newFilled })
      }
      return
    }

    // ── Normal add ────────────────────────────────────────────────────────────
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
  }, [itemModifierMap, allModifiers, addItemToTicket, activeComboSelection, persons, activePerson])

  const handleStartCombo = useCallback((combo: Combo) => {
    // If already in mode for this combo, cancel it
    if (activeComboSelection?.combo.id === combo.id) {
      // Remove header and all sub-items for this combo
      setTicketItems((prev) => prev.filter((i) => i.uid !== activeComboSelection.headerUid && i.combo_id !== combo.id))
      setActiveComboSelection(null)
      return
    }
    // Cancel any previous combo selection
    if (activeComboSelection) {
      setTicketItems((prev) => prev.filter(
        (i) => i.uid !== activeComboSelection.headerUid && i.combo_id !== activeComboSelection.combo.id
      ))
    }
    // Add combo header item
    const personNum = persons > 1 ? activePerson : null
    const headerUid = `combo_header__${combo.id}__${Date.now()}`
    const headerItem: TicketItem = {
      uid: headerUid,
      menu_item_id: combo.id,
      name: combo.name,
      price: combo.price,
      quantity: 1,
      image_url: combo.image_urls?.[0] ?? null,
      person_number: personNum,
      is_combo_header: true,
      combo_id: combo.id,
    }
    setTicketItems((prev) => [...prev, headerItem])
    setTicketOpen(true)
    setActiveComboSelection({ combo, filledSlots: [], headerUid })
  }, [activeComboSelection, persons, activePerson])

  const handleCancelCombo = useCallback(() => {
    if (!activeComboSelection) return
    // Remove header and all sub-items
    setTicketItems((prev) => prev.filter(
      (i) => i.uid !== activeComboSelection.headerUid && i.combo_id !== activeComboSelection.combo.id
    ))
    setActiveComboSelection(null)
  }, [activeComboSelection])

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
      // Combo headers and sub-items are not quantity-adjustable
      if (item.is_combo_header || item.combo_slot_label) return prev
      const newQty = item.quantity + delta
      if (newQty <= 0) return prev.filter((i) => i.uid !== uid)
      return prev.map((i) => i.uid === uid ? { ...i, quantity: newQty } : i)
    })
  }, [])

  const handleRemove = useCallback((uid: string) => {
    setTicketItems((prev) => {
      const item = prev.find((i) => i.uid === uid)
      // If removing a combo header, also remove all sub-items
      if (item?.is_combo_header && item.combo_id) {
        setActiveComboSelection(null)
        return prev.filter((i) => i.uid !== uid && i.combo_id !== item.combo_id)
      }
      // If removing a combo sub-item, just remove it
      return prev.filter((i) => i.uid !== uid)
    })
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

  // ─── Cargar mesa abierta ────────────────────────────────────────────────────
  const handleLoadOpenTable = useCallback(async (table: OpenTable) => {
    try {
      // Cargar items existentes de la mesa
      const res = await fetch(`/api/pos/orders/${table.order_id}/pre-bill`)
      if (!res.ok) {
        setToast('Error al cargar mesa')
        return
      }
      const data = await res.json()
      const orderItems = (data.items ?? []) as {
        id: string
        quantity: number
        unit_price: number
        line_note: string | null
        is_bonus: boolean
        menu_items: { name: string; subcategory?: string } | null
        sent_to_kitchen_at: string | null
      }[]

      // Convertir items de la orden a TicketItem[]
      const existingItems: TicketItem[] = orderItems
        .filter((i) => i.sent_to_kitchen_at !== null)  // solo items ya enviados
        .map((i) => ({
          uid: `open__${i.id}`,
          menu_item_id: '',  // no necesario para display
          name: i.menu_items?.name ?? 'Item',
          price: i.unit_price,
          quantity: i.quantity,
          is_bonus: i.is_bonus,
        }))

      setActiveOpenOrder({
        id: table.order_id,
        table_number: table.table_number,
        existingItems,
      })

      // Precargar número de mesa
      setTableNumber(String(table.table_number))
      setDiningOption('Comer dentro')
      // Limpiar items nuevos (solo los pendientes que aún no se enviaron)
      const pendingItems: TicketItem[] = orderItems
        .filter((i) => i.sent_to_kitchen_at === null)
        .map((i) => ({
          uid: `pending__${i.id}`,
          menu_item_id: '',
          name: i.menu_items?.name ?? 'Item',
          price: i.unit_price,
          quantity: i.quantity,
          is_bonus: i.is_bonus,
        }))
      setTicketItems(pendingItems.length > 0 ? pendingItems : [])
      setTicketOpen(true)
    } catch {
      setToast('Error al cargar la mesa')
    }
  }, [])

  // ─── Enviar items a cocina (mesa abierta) ───────────────────────────────────
  const handleSendKitchen = useCallback(async () => {
    if (ticketItems.length === 0) return
    setSendingKitchen(true)

    try {
      let targetOrderId = activeOpenOrder?.id ?? null
      let targetTableNumber = activeOpenOrder?.table_number ?? (tableNumber ? parseInt(tableNumber, 10) : null)

      // Si no hay mesa activa, crear nueva orden abierta
      if (!targetOrderId) {
        if (!tableNumber) {
          setToast('Indica número de mesa antes de enviar a cocina')
          return
        }
        const newItemsPayload = ticketItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          name: item.name,
          price: item.is_bonus ? 0 : item.price,
          quantity: item.quantity,
          line_note: item.customNote ?? buildLineNote(item.modifiers ?? []),
          person_number: item.person_number ?? null,
          is_bonus: item.is_bonus ?? false,
          bonus_reason: item.bonus_reason ?? null,
          original_price: item.original_price ?? null,
          ...(item.is_combo_header ? { is_combo_header: true, combo_id: item.combo_id } : {}),
          ...(item.combo_slot_label ? { combo_slot_label: item.combo_slot_label, combo_id: item.combo_id } : {}),
        }))
        const total = ticketItems.reduce((s, i) => s + (i.is_bonus ? 0 : i.price) * i.quantity, 0)
        const createRes = await fetch('/api/pos/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: newItemsPayload,
            total,
            dining_option: diningOption,
            table_number: parseInt(tableNumber, 10),
            notes: orderNotes,
            persons,
            is_open: true,
            employee_id: session?.employee.id,
            employee_name: session?.employee.name,
          }),
        })
        if (!createRes.ok) {
          const err = await createRes.json()
          setToast(err.error ?? 'Error al crear mesa')
          return
        }
        const createData = await createRes.json()
        targetOrderId = createData.order_id ?? createData.order?.id ?? null
        targetTableNumber = parseInt(tableNumber, 10)

        if (!targetOrderId) {
          setToast('Error al crear mesa')
          return
        }

        setActiveOpenOrder({ id: targetOrderId, table_number: targetTableNumber!, existingItems: [] })
      } else {
        // Mesa ya existe: agregar items
        const newItemsPayload = ticketItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.is_bonus ? 0 : item.price,
          line_note: item.customNote ?? buildLineNote(item.modifiers ?? []),
          person_number: item.person_number ?? null,
          is_bonus: item.is_bonus ?? false,
          bonus_reason: item.bonus_reason ?? null,
          original_price: item.original_price ?? null,
          ...(item.is_combo_header ? { is_combo_header: true, combo_id: item.combo_id } : {}),
          ...(item.combo_slot_label ? { combo_slot_label: item.combo_slot_label, combo_id: item.combo_id } : {}),
        }))

        const addRes = await fetch(`/api/pos/orders/${targetOrderId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: newItemsPayload, employee_id: session?.employee.id }),
        })
        if (!addRes.ok) {
          const err = await addRes.json()
          setToast(err.error ?? 'Error al agregar items')
          return
        }
      }

      // Marcar items como enviados y obtener datos para comanda
      const sendRes = await fetch(`/api/pos/orders/${targetOrderId}/send-kitchen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: session?.employee.id, employee_name: session?.employee.name }),
      })
      if (!sendRes.ok) {
        const err = await sendRes.json()
        setToast(err.error ?? 'Error al enviar a cocina')
        return
      }
      const sendData = await sendRes.json()

      // Imprimir comanda de cocina
      const kitchenItems: KitchenItem[] = (sendData.items_sent ?? []).map((i: { name: string; quantity: number; line_note?: string | null; person_number?: number | null }) => ({
        name: i.name,
        quantity: i.quantity,
        line_note: i.line_note,
        person_number: i.person_number,
      }))
      const comandaLines = buildKitchenComanda(
        targetTableNumber ?? activeOpenOrder?.table_number ?? tableNumber,
        kitchenItems,
        sendData.round ?? 1,
        session?.employee.name,
      )
      const comandaText = comandaLines.join('\n')

      if (printServerUrl) {
        await tryPrintServer(comandaText, printServerUrl)
      }

      // Actualizar items existentes y limpiar pendientes
      setActiveOpenOrder((prev) => {
        if (!prev) return { id: targetOrderId!, table_number: targetTableNumber!, existingItems: kitchenItems.map((ki) => ({ uid: `sent__${ki.name}`, menu_item_id: '', name: ki.name, price: 0, quantity: ki.quantity })) }
        const newExisting: TicketItem[] = kitchenItems.map((ki) => ({
          uid: `sent__${Date.now()}__${ki.name}`,
          menu_item_id: '',
          name: ki.name,
          price: 0,
          quantity: ki.quantity,
        }))
        return { ...prev, existingItems: [...prev.existingItems, ...newExisting] }
      })
      setTicketItems([])
      setActiveComboSelection(null)
      // Re-trigger ComboOverlay recompute after the grid re-renders
      requestAnimationFrame(() => setComboOverlayTick((t) => t + 1))
      setOpenTablesRefresh((n) => n + 1)
      setToast(`Mesa ${targetTableNumber ?? tableNumber} — enviado a cocina`)
    } catch {
      setToast('Error al enviar a cocina')
    } finally {
      setSendingKitchen(false)
    }
  }, [activeOpenOrder, ticketItems, session, printServerUrl, tableNumber, diningOption, orderNotes, persons])

  // ─── Pedir cuenta (imprime pre-cuenta, NO cobra) ────────────────────────────
  const handleRequestBill = useCallback(async () => {
    if (!activeOpenOrder) return
    try {
      const res = await fetch(`/api/pos/orders/${activeOpenOrder.id}/pre-bill`)
      if (!res.ok) {
        setToast('Error al obtener cuenta')
        return
      }
      const data = await res.json()
      const total = (data.order?.total ?? 0) as number
      const items = (data.items ?? []) as { quantity: number; unit_price: number; is_bonus?: boolean; line_note?: string | null; menu_items?: { name: string } | null }[]
      const preBillItems = items.map((i) => ({
        name: i.menu_items?.name ?? 'Item',
        quantity: i.quantity,
        unit_price: i.unit_price,
        is_bonus: i.is_bonus ?? false,
        line_note: i.line_note ?? null,
      }))

      const preBillText = buildPreBillText(
        activeOpenOrder.table_number,
        preBillItems,
        data.tip_enabled ?? false,
        data.tip_percentages ?? [],
      )

      if (printServerUrl) {
        const ok = await tryPrintServer(preBillText, printServerUrl)
        if (ok) {
          setToast(`Pre-cuenta mesa ${activeOpenOrder.table_number} impresa`)
          return
        }
      }
      // Fallback: mostrar modal con precuenta
      setPreBillModal({
        table: activeOpenOrder.table_number,
        total,
        items: preBillItems,
        tipEnabled: data.tip_enabled ?? false,
        tipPercentages: data.tip_percentages ?? [],
      })
    } catch {
      setToast('Error al imprimir pre-cuenta')
    }
  }, [activeOpenOrder, printServerUrl])

  // ─── Abrir mesa nueva ────────────────────────────────────────────────────────
  const handleOpenNewTable = useCallback(() => {
    setActiveOpenOrder(null)
    setTicketItems([])
    requestAnimationFrame(() => setComboOverlayTick((t) => t + 1))
    setActiveComboSelection(null)
    setTableNumber('')
    setDiningOption('Comer dentro')
    setTicketOpen(true)
  }, [])

  // ─── Cerrar / limpiar mesa activa ────────────────────────────────────────────
  const handleClearActiveTable = useCallback(() => {
    setActiveOpenOrder(null)
    setTicketItems([])
    requestAnimationFrame(() => setComboOverlayTick((t) => t + 1))
    setActiveComboSelection(null)
    setTableNumber('')
    setTicketOpen(false)
  }, [])

  // ─── Cobrar mesa abierta (desde panel lateral) ───────────────────────────────
  // Carga los items de la mesa en el TicketPanel para que el cajero cobre normalmente
  const handleCloseOpenTable = useCallback((table: OpenTable) => {
    setShowOpenTables(false)
    void handleLoadOpenTable(table)
  }, [handleLoadOpenTable])

  // ─── Cancelar mesa abierta (desde panel lateral) ─────────────────────────────
  const handleCancelOpenTable = useCallback(async (orderId: string, tableNumber: number) => {
    if (!window.confirm(`¿Cancelar mesa ${tableNumber}? Se perderán todos los items.`)) return

    try {
      const res = await fetch(`/api/pos/orders/${orderId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json()
        setToast(err.error ?? 'Error al cancelar mesa')
        return
      }
      // Cancel ya setea is_open=false, solo limpiar si era la mesa activa
      if (activeOpenOrder?.id === orderId) {
        setActiveOpenOrder(null)
        setTicketItems([])
        requestAnimationFrame(() => setComboOverlayTick((t) => t + 1))
        setActiveComboSelection(null)
        setTableNumber('')
        setTicketOpen(false)
      }
      setOpenTablesRefresh((n) => n + 1)
      setToast(`Mesa ${tableNumber} cancelada`)
    } catch {
      setToast('Error al cancelar mesa')
    }
  }, [activeOpenOrder])

  const [forceprint, setForceprint] = useState(false)
  const forceprintRef = useRef(false)
  const handleSubmit = useCallback(async () => {
    if (ticketItems.length === 0) return
    setSubmitting(true)
    try {
      // ── COBRAR MESA ABIERTA: cerrar la orden existente ────────────────────────
      if (activeOpenOrder) {
        const pmValue =
          paymentMethod === 'Mixto' ? 'mixto'
          : paymentMethod === 'Transferencia' ? 'transferencia'
          : 'efectivo'
        const totalVal = ticketItems.reduce((s, i) => {
          if (i.is_bonus) return s
          const modExtra = (i.modifiers ?? []).reduce((ms: number, m: { price: number }) => ms + m.price, 0)
          return s + (i.price + modExtra) * i.quantity
        }, 0)
        const cashVal = paymentMethod === 'Mixto'
          ? parseFloat(cashAmount.replace(',', '.') || '0')
          : paymentMethod === 'Efectivo' ? totalVal : undefined
        const transferVal = paymentMethod === 'Mixto'
          ? parseFloat(transferAmount.replace(',', '.') || '0')
          : paymentMethod === 'Transferencia' ? totalVal : undefined

        const closeRes = await fetch(`/api/pos/orders/${activeOpenOrder.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_method: pmValue,
            cash_amount: cashVal,
            transfer_amount: transferVal,
            employee_id: session?.employee.id,
          }),
        })
        if (!closeRes.ok) {
          const err = await closeRes.json()
          throw new Error(err.error ?? 'Error al cobrar mesa')
        }
        const closeData = await closeRes.json()
        const orderTotal = (closeData.order?.total ?? totalVal) as number

        // Construir snapshot para imprimir (items actuales en ticket)
        const now = new Date()
        const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
        const orderNumber = Date.now() % 1000
        const allItemsForPrint = [
          ...activeOpenOrder.existingItems,
          ...ticketItems,
        ]
        const snapshot: PrintData = {
          orderNumber,
          dateStr,
          timeStr,
          items: allItemsForPrint,
          total: orderTotal,
          diningOption,
          tableNumber,
          paymentMethod,
          cashAmount: cashVal,
          transferAmount: transferVal,
          customerName: '',
        }

        // Limpiar estado antes de imprimir
        const closedTableNumber = activeOpenOrder.table_number
        setActiveOpenOrder(null)
        setTicketItems([])
        requestAnimationFrame(() => setComboOverlayTick((t) => t + 1))
        setActiveComboSelection(null)
        setTableNumber('')
        setCustomerName('')
        setOrderNotes('')
        setCashAmount('')
        setTransferAmount('')
        setTicketOpen(false)
        setPersons(1)
        setActivePerson(1)
        setOpenTablesRefresh((n) => n + 1)
        setToast(`Mesa ${closedTableNumber} cobrada`)

        // Imprimir ticket (Efectivo/Mixto siempre, Transfer opcional)
        const shouldPrintOpen = paymentMethod === 'Efectivo' || paymentMethod === 'Mixto' || forceprintRef.current
        if (shouldPrintOpen) {
          const { cfg: freshCfg, logoUrl: freshLogoUrl } = await fetchFreshPrintConfig()
          const ticketText = buildTicketText(snapshot, freshCfg, !!printServerUrl)
          let printed = false
          if (printServerUrl) {
            printed = await tryPrintServer(ticketText, printServerUrl, freshCfg, freshLogoUrl)
            if (printed) {
              if (paymentMethod === 'Efectivo' || paymentMethod === 'Mixto') {
                void tryOpenDrawer(printServerUrl)
              }
              setToast(`Mesa ${closedTableNumber} cobrada · Ticket impreso`)
            }
          }
          if (!printed) {
            const fallbackText = buildTicketText(snapshot, freshCfg, false)
            triggerPrintFallback(fallbackText, freshLogoUrl, freshCfg)
          }
        }
        return
      }

      // ── COBRAR PEDIDO NORMAL (sin mesa abierta) ───────────────────────────────
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
          ...(item.is_combo_header ? { is_combo_header: true, combo_id: item.combo_id } : {}),
          ...(item.combo_slot_label ? { combo_slot_label: item.combo_slot_label, combo_id: item.combo_id } : {}),
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
          employee_id: session?.employee.id,
          employee_name: session?.employee.name,
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
      requestAnimationFrame(() => setComboOverlayTick((t) => t + 1))
      setActiveComboSelection(null)
      setTableNumber('')
      setCustomerName('')
      setOrderNotes('')
      setCashAmount('')
      setTransferAmount('')
      setTicketOpen(false)
      setShowConfirmModal(false)
      setShowMixtoModal(false)
      setPersons(1)
      setActivePerson(1)
      const toastMsg = diningOption === 'Comer dentro' && tableNumber
        ? `Mesa ${tableNumber} — cobrado`
        : 'Pedido cobrado'
      setToast(toastMsg)

      // Print ticket directly (print-server + fallback)
      // Efectivo/Mixto: siempre imprime (necesita abrir caja)
      // Transferencia: solo imprime si el usuario lo pidió
      const shouldPrint = paymentMethod === 'Efectivo' || paymentMethod === 'Mixto' || forceprintRef.current
      if (shouldPrint) {
        const { cfg: freshCfg, logoUrl: freshLogoUrl } = await fetchFreshPrintConfig()
        const ticketText = buildTicketText(snapshot, freshCfg, !!printServerUrl)
        let printed = false
        if (printServerUrl) {
          printed = await tryPrintServer(ticketText, printServerUrl, freshCfg, freshLogoUrl)
          if (printed) {
            // Open cash drawer for cash or mixed
            if (paymentMethod === 'Efectivo' || paymentMethod === 'Mixto') {
              void tryOpenDrawer(printServerUrl)
            }
            setToast('Pedido enviado · Ticket impreso')
          }
        }
        if (!printed) {
          const fallbackText = buildTicketText(snapshot, freshCfg, false)
          triggerPrintFallback(fallbackText, freshLogoUrl, freshCfg)
        }
      }
      setShowPrintBtn(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar pedido'
      setToast(`Error: ${msg}`)
    } finally {
      setSubmitting(false)
      setForceprint(false)
      forceprintRef.current = false
    }
  }, [activeOpenOrder, session, ticketItems, diningOption, tableNumber, paymentMethod, cashAmount, transferAmount, customerName, orderNotes, persons, fetchFreshPrintConfig, printServerUrl, forceprint])

  // Direct submit: goes straight if no modal needed; opens mixed modal for Mixto
  const handleDirectSubmit = useCallback(() => {
    if (ticketItems.length === 0) return
    if (paymentMethod === 'Mixto') {
      setShowMixedModal(true)
      return
    }
    void handleSubmit()
  }, [ticketItems, paymentMethod, handleSubmit])

  const ticketCount = ticketItems.reduce((s, i) => s + i.quantity, 0)

  // ─── PIN Gate ───────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <PinGate
        title="POS Sumak"
        subtitle="Ingresa tu PIN para continuar"
        onAuth={(emp) => {
          void emp
          // usePosAuth persiste la sesión en sessionStorage al hacer login
          // PinGate llama onAuth después de validar; forzamos re-render recargando
          window.location.reload()
        }}
      />
    )
  }

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
          {(['es', 'en'] as Locale[]).map((lang) => (
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
        {/* Search button */}
        {activeCategory === 'all' && !editMode && (
          <button
            onClick={() => setShowPosSearch(!showPosSearch)}
            title="Buscar producto"
            className={`flex items-center justify-center w-8 h-8 rounded-lg active:scale-95 transition-all shrink-0 font-bold text-base ${
              showPosSearch ? 'bg-sumak-gold text-sumak-brown' : 'bg-sumak-brown-mid text-sumak-gold hover:bg-sumak-brown-light'
            }`}
          >
            🔍
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
        {/* Mesas abiertas button */}
        {openTablesEnabled && permissions.canOpenTable && (
          <button
            onClick={() => setShowOpenTables(true)}
            title="Mesas abiertas"
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-sumak-brown-mid text-amber-400 hover:bg-sumak-brown-light active:scale-95 transition-all shrink-0 font-bold text-base"
          >
            🪑
          </button>
        )}
        {/* Usuario activo + cambiar PIN */}
        {session && (
          <button
            onClick={logout}
            title={`${session.employee.name} — Click para cerrar sesión`}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sumak-brown-mid text-sumak-gold hover:bg-red-900/60 active:scale-95 transition-all shrink-0 text-xs font-bold max-w-[80px]"
          >
            <span className="truncate">{session.employee.name.split(' ')[0]}</span>
          </button>
        )}
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
          {/* Search bar for "Todos" tab — toggled by search button */}
          {activeCategory === 'all' && !editMode && showPosSearch && (
            <div className="px-2 pt-2 flex gap-2">
              <input
                type="text"
                placeholder="Buscar producto..."
                value={posSearch}
                onChange={(e) => setPosSearch(e.target.value)}
                autoFocus
                className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-gold bg-white"
              />
              <button
                onClick={() => { setShowPosSearch(false); setPosSearch('') }}
                className="px-3 py-2 rounded-xl bg-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-300"
              >
                ✕
              </button>
            </div>
          )}
          {/* Dish Grid */}
          <main
            ref={(el) => { gridRef.current = el }}
            className="flex-1 min-w-0 p-2 overflow-y-auto"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridTemplateRows: editMode ? 'repeat(4, calc(25% - 5px))' : 'repeat(4, calc(25% - 5px))',
              gridAutoRows: 'calc(25% - 5px)',
              gap: '6px',
              position: 'relative',
            }}
          >
            {loading ? (
              Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-full h-full rounded-xl bg-sumak-cream-dark animate-pulse" />
              ))
            ) : editMode && activeCategory === 'all' ? (
              // Edit mode (only in Todos): fixed grid, find items by display_order
              Array.from({ length: gridSize }).map((_, gridIndex) => {
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
            ) : activeCategory === 'all' && posSearch.trim() ? (
              // Search mode: simple list of matching items
              searchFilteredItems.slice(0, 50).map((item) => (
                <div key={item.id} className="relative w-full h-full rounded-xl">
                  <POSDishCard
                    item={item}
                    onAdd={handleAddItem}
                    locale={locale}
                    editMode={false}
                    onUnassign={handleUnassign}
                    onDragStart={handleDragStart}
                    isDragging={false}
                  />
                </div>
              ))
            ) : activeCategory === 'all' ? (
              // Normal mode Todos: fixed grid by position, combos shown as overlays
              Array.from({ length: gridSize }).map((_, gridIndex) => {
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
          {/* Combo overlays — rendered over the grid, outside grid flow */}
          {!editMode && activeCategory === 'all' && !posSearch.trim() && combos.map((combo) => (
            <ComboOverlay
              key={combo.id}
              combo={combo}
              isActive={activeComboSelection?.combo.id === combo.id}
              cellElemsRef={cellElemsRef}
              gridRef={gridRef}
              onStartCombo={handleStartCombo}
              recomputeTick={comboOverlayTick}
            />
          ))}
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
              tableNumber={tableNumber}
              paymentMethod={paymentMethod}
              cashAmount={cashAmount}
              transferAmount={transferAmount}
              customerName={customerName}
              orderNotes={orderNotes}
              submitting={submitting}
              customers={customers}
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              onUpdateNote={handleUpdateNote}
              onDiningChange={setDiningOption}
              onPersonsChange={setPersons}
              onActivePersonChange={setActivePerson}
              onTableChange={setTableNumber}
              onPaymentChange={setPaymentMethod}
              onCashAmountChange={setCashAmount}
              onTransferAmountChange={setTransferAmount}
              onCustomerChange={setCustomerName}
              onNotesChange={setOrderNotes}
              onDirectSubmit={handleDirectSubmit}
              onBonusClick={handleBonusClick}
              onUnbonus={handleUnbonus}
              canCharge={permissions.canCharge}
              canSendKitchen={permissions.canSendKitchen}
              canRequestBill={permissions.canRequestBill}
              onSendKitchen={() => void handleSendKitchen()}
              onRequestBill={() => void handleRequestBill()}
              sendingKitchen={sendingKitchen}
              activeOpenOrder={activeOpenOrder}
              selectedBill={selectedBill}
              onBillSelect={(bill) => setSelectedBill(selectedBill === bill ? null : bill)}
              onForcePrint={(v: boolean) => { setForceprint(v); forceprintRef.current = v }}
              bills={posBills}
              activeComboSelection={activeComboSelection}
              onCancelCombo={handleCancelCombo}
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

      {/* ── Confirm Modal (legacy, replaced by direct submit + MixedPaymentModal) ── */}

      {/* ── Mixed Payment Modal ── */}
      {showMixedModal && (
        <MixedPaymentModal
          total={ticketItems.reduce((s, i) => {
            if (i.is_bonus) return s
            const modExtra = (i.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
            return s + (i.price + modExtra) * i.quantity
          }, 0)}
          cashAmount={cashAmount}
          transferAmount={transferAmount}
          onCashAmountChange={setCashAmount}
          onTransferAmountChange={setTransferAmount}
          submitting={submitting}
          onCancel={() => setShowMixedModal(false)}
          onConfirm={() => { setShowMixedModal(false); void handleSubmit() }}
        />
      )}

      {/* ── Cash Movements Modal ── */}
      {showCashModal && (
        <CashMovementsModal
          onClose={() => { setShowCashModal(false); setCashModalPrefill(undefined) }}
          prefillEgreso={cashModalPrefill}
          printServerUrl={printServerUrl}
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
                    // Table number: direct column or extract from notes
                    const tableMatch = order.notes?.match(/[Mm]esa\s*(\d+)/)
                    const tableNum = order.table_number ?? (tableMatch ? parseInt(tableMatch[1]) : null)
                    // Time: if delivered, frozen at delivered_at. If still in kitchen, live clock.
                    const createdAt = new Date(order.created_at)
                    const endTime = isDelivered && order.delivered_at ? new Date(order.delivered_at) : new Date()
                    const mins = Math.floor((endTime.getTime() - createdAt.getTime()) / 60000)
                    const timeStr = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`
                    return (
                      <li key={order.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${isCancelled ? 'bg-red-50 border-red-200 opacity-75' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {tableNum && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-black">M{tableNum}</span>
                            )}
                            <span className={`font-bold text-sm truncate ${isCancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>{order.customer_name}</span>
                            {isCancelled && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase">Anulado</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs font-bold tabular-nums ${isCancelled ? 'text-gray-400 line-through' : 'text-teal-700'}`}>{formatARS(order.total)}</span>
                            <span className="text-xs text-gray-500">{pmLabel}</span>
                            <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {!isCancelled && (
                              <span className={`text-xs font-bold ${isDelivered ? 'text-green-600' : mins > 30 ? 'text-red-600' : 'text-orange-500'}`}>
                                {isDelivered ? `✓ ${timeStr}` : `⏱ ${timeStr}`}
                              </span>
                            )}
                            {order.employee_name && (
                              <span className="text-xs text-gray-400 truncate">· {order.employee_name}</span>
                            )}
                          </div>
                        </div>
                        {!isCancelled && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isDelivered && (
                              <>
                                <button
                                  onClick={() => { setSwapItemOrder(order); setShowSentOrders(false) }}
                                  className="px-3 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 font-bold text-xs active:scale-95 transition-all"
                                  title="Cambiar plato"
                                >
                                  Cambiar
                                </button>
                                <button
                                  onClick={() => { setCancelOrder(order); setShowSentOrders(false) }}
                                  className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs active:scale-95 transition-all"
                                  title="Anular pedido"
                                >
                                  Anular
                                </button>
                              </>
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

      {/* ── Swap Item Modal ── */}
      {swapItemOrder && (
        <SwapItemModal
          order={swapItemOrder}
          menuItems={menuItems}
          onClose={() => setSwapItemOrder(null)}
          onSuccess={() => {
            setSwapItemOrder(null)
            loadSentOrders()
            setToast('Plato cambiado correctamente')
          }}
          onRefund={(amount, method) => {
            setSwapItemOrder(null)
            loadSentOrders()
            if (method === 'cash') {
              setCashModalPrefill({
                amount,
                description: `Devolución cambio plato`,
              })
              setShowCashModal(true)
            } else {
              setToast(`Realizar devolución de ${formatARS(amount)} por transferencia`)
            }
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
          printServerUrl={printServerUrl}
        />
      )}

      {/* ── Employee Payments Modal ── */}
      {showEmpPayModal && (
        <EmployeePOSModal onClose={() => setShowEmpPayModal(false)} printServerUrl={printServerUrl} />
      )}

      {/* ── Mesas abiertas panel ── */}
      {showOpenTables && (
        <OpenTablesPanel
          onSelectTable={handleLoadOpenTable}
          onClose={() => setShowOpenTables(false)}
          refreshTrigger={openTablesRefresh}
          onCloseTable={permissions.canCharge ? handleCloseOpenTable : undefined}
          onCancelTable={permissions.canCharge ? handleCancelOpenTable : undefined}
        />
      )}

      {/* ── Modal Pre-cuenta ── */}
      {preBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-amber-500 px-4 py-3 flex items-center justify-between">
              <span className="text-white font-bold text-lg">Pre-cuenta Mesa {preBillModal.table}</span>
              <button onClick={() => setPreBillModal(null)} className="text-white/80 hover:text-white text-xl font-bold leading-none">✕</button>
            </div>
            <div className="px-4 py-3 space-y-1 max-h-64 overflow-y-auto">
              {preBillModal.items.filter(i => !i.is_bonus).map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm text-gray-700">
                  <span>{item.quantity}× {item.name}</span>
                  <span>${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0 }).format(item.unit_price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 px-4 py-3">
              <div className="flex justify-between font-bold text-gray-900 text-base">
                <span>TOTAL</span>
                <span>${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0 }).format(preBillModal.total)}</span>
              </div>
              {preBillModal.tipEnabled && preBillModal.tipPercentages.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {preBillModal.tipPercentages.map(pct => (
                    <div key={pct} className="flex justify-between text-xs text-gray-500">
                      <span>Propina {pct}%</span>
                      <span>${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0 }).format(Math.round(preBillModal.total * pct / 100))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 pb-4 space-y-2">
              <button
                onClick={() => {
                  // Cargar todos los items de la precuenta al ticket para poder cobrar
                  const billItems: TicketItem[] = preBillModal.items.map((item, idx) => ({
                    uid: `bill__${idx}__${Date.now()}`,
                    menu_item_id: '',
                    name: item.name,
                    price: item.unit_price,
                    quantity: item.quantity,
                    is_bonus: item.is_bonus,
                  }))
                  setTicketItems(billItems)
                  setTicketOpen(true)
                  setPreBillModal(null)
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-xl transition-colors"
              >
                💰 Cobrar
              </button>
              <button
                onClick={() => setPreBillModal(null)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner compacto de mesa abierta activa ── */}
      {activeOpenOrder && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-amber-600/95 text-white px-2 py-1 flex items-center gap-2 text-xs font-semibold shadow-lg">
          <span>🪑 M{activeOpenOrder.table_number}</span>
          {permissions.canSendKitchen && ticketItems.length > 0 && (
            <button
              onClick={() => void handleSendKitchen()}
              disabled={sendingKitchen}
              className="ml-auto px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
            >
              {sendingKitchen ? '...' : `🔥 Cocina (${ticketItems.length})`}
            </button>
          )}
          {permissions.canRequestBill && (
            <button
              onClick={() => void handleRequestBill()}
              className={`${permissions.canSendKitchen && ticketItems.length > 0 ? '' : 'ml-auto '}px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 active:scale-95 transition-all`}
            >
              💰 Cuenta
            </button>
          )}
          <button
            onClick={handleClearActiveTable}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white active:scale-95 transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* WhatsApp Notifications */}
      <WhatsAppNotifier />

    </div>
  )
}
