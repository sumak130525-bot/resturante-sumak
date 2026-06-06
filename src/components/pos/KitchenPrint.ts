// ─── Kitchen print helpers ────────────────────────────────────────────────────
// Genera líneas ESC/POS para comandas de cocina y tickets pre-cuenta.
// Usa el mismo sistema de markers que el print-server.

const PAPER_WIDTH = 48

function pad(str: string, width: number, right = false): string {
  const s = String(str)
  if (s.length >= width) return s.slice(0, width)
  const spaces = ' '.repeat(width - s.length)
  return right ? spaces + s : s + spaces
}

function centerLine(text: string): string {
  return `[CENTER]${text}[/CENTER]`
}

function boldLine(text: string): string {
  return `[BOLD]${text}[/BOLD]`
}

function sep(): string {
  return `[SEP:-:${PAPER_WIDTH}]`
}

function formatARS(n: number): string {
  return '$' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type KitchenItem = {
  name: string
  quantity: number
  line_note?: string | null
  person_number?: number | null
}

export type PreBillItem = {
  name: string
  quantity: number
  unit_price: number
  is_bonus?: boolean
  line_note?: string | null
}

// ─── Comanda de cocina ────────────────────────────────────────────────────────

export function buildKitchenComanda(
  tableNumber: number | string,
  items: KitchenItem[],
  round: number,
  employeeName?: string,
): string[] {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

  const lines: string[] = [
    centerLine(boldLine(`MESA ${tableNumber}`)),
    centerLine(`Ronda ${round}  |  ${timeStr}`),
    employeeName ? centerLine(employeeName) : '',
    sep(),
  ].filter(Boolean)

  // Agrupar por persona si hay person_number
  const hasPersons = items.some((i) => (i.person_number ?? 0) > 1)

  if (hasPersons) {
    const maxPerson = Math.max(...items.map((i) => i.person_number ?? 1))
    for (let p = 1; p <= maxPerson; p++) {
      const personItems = items.filter((i) => (i.person_number ?? 1) === p)
      if (personItems.length === 0) continue
      lines.push(`-- Persona ${p} --`)
      for (const item of personItems) {
        lines.push(boldLine(`${item.quantity}x  ${item.name}`))
        if (item.line_note) lines.push(`   > ${item.line_note}`)
      }
    }
  } else {
    for (const item of items) {
      lines.push(boldLine(`${item.quantity}x  ${item.name}`))
      if (item.line_note) lines.push(`   > ${item.line_note}`)
    }
  }

  lines.push(sep())
  lines.push('[BLANK:2]')

  return lines
}

// ─── Ticket pre-cuenta ────────────────────────────────────────────────────────

export function buildPreBillText(
  tableNumber: number | string,
  items: PreBillItem[],
  tipEnabled: boolean,
  tipPercentages: number[],
): string {
  const lines: string[] = [
    '[LOGO]',
    centerLine(boldLine('PRE-CUENTA')),
    centerLine(`Mesa ${tableNumber}`),
    sep(),
  ]

  // Items
  for (const item of items) {
    if (item.is_bonus) {
      lines.push(`${String(item.quantity).padEnd(3)}${item.name}`)
      lines.push(pad('GRATIS', PAPER_WIDTH, true))
    } else {
      const subtotal = item.unit_price * item.quantity
      const nameMaxLen = PAPER_WIDTH - 3
      const name = item.name.length > nameMaxLen ? item.name.slice(0, nameMaxLen) : item.name
      lines.push(`${String(item.quantity).padEnd(3)}${name}`)
      lines.push(pad(formatARS(subtotal), PAPER_WIDTH, true))
    }
    if (item.line_note) lines.push(`   > ${item.line_note}`)
  }

  // Total
  const total = items.reduce((sum, i) => {
    if (i.is_bonus) return sum
    return sum + i.unit_price * i.quantity
  }, 0)

  lines.push(sep())
  lines.push(boldLine(pad('SUBTOTAL:', PAPER_WIDTH - 12) + pad(formatARS(total), 12, true)))

  // Propinas sugeridas
  if (tipEnabled && tipPercentages.length > 0) {
    lines.push('[BLANK:1]')
    for (const pct of tipPercentages) {
      const tipAmount = Math.round(total * pct / 100)
      const label = `  Propina ${pct}%:`
      lines.push(pad(label, PAPER_WIDTH - 10) + pad(formatARS(tipAmount), 10, true))
    }
  }

  lines.push(sep())
  lines.push(centerLine('Gracias por su visita'))
  lines.push('[BLANK:3]')

  return lines.filter((l) => l !== '').join('\n')
}
