import http from 'node:http'
import net from 'node:net'
import { URL } from 'node:url'

const SERVER_HOST = process.env.PRINT_SERVER_HOST ?? '0.0.0.0'
const SERVER_PORT = Number(process.env.PRINT_SERVER_PORT ?? 4000)
const PRINTER_HOST = process.env.PRINTER_HOST ?? '192.168.100.55'
const PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100)
const REQUEST_LIMIT_BYTES = 64 * 1024

// ─── ESC/POS command bytes ────────────────────────────────────────────────────
const ESC = 0x1b
const GS  = 0x1d

const CMD_INIT          = Buffer.from([ESC, 0x40])
const CMD_CODEPAGE      = Buffer.from([ESC, 0x74, 0x10])   // PC437
const CMD_ALIGN_LEFT    = Buffer.from([ESC, 0x61, 0x00])
const CMD_ALIGN_CENTER  = Buffer.from([ESC, 0x61, 0x01])
const CMD_ALIGN_RIGHT   = Buffer.from([ESC, 0x61, 0x02])
const CMD_BOLD_ON       = Buffer.from([ESC, 0x45, 0x01])
const CMD_BOLD_OFF      = Buffer.from([ESC, 0x45, 0x00])
// Double-size: GS ! 0x11 = double width + double height
const CMD_DOUBLE_SIZE   = Buffer.from([GS, 0x21, 0x11])
const CMD_NORMAL_SIZE   = Buffer.from([GS, 0x21, 0x00])
// Full cut
const CMD_CUT           = Buffer.from([GS, 0x56, 0x42, 0x00])

// ─── Types ────────────────────────────────────────────────────────────────────

type PrintConfig = {
  headerAlign?: 'center' | 'left'
  footerAlign?: 'center' | 'left'
  headerBold?: boolean
  totalBold?: boolean
  width?: number
  feedLinesBeforeCut?: number
  autoCut?: boolean
  showLogo?: boolean
  logoText?: string   // text to print as logo (double-size)
}

type PrintPayload = {
  text?: string
  cut?: boolean
  feedLines?: number
  config?: PrintConfig
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (Buffer.byteLength(body, 'utf8') > REQUEST_LIMIT_BYTES) {
        reject(new Error('El ticket supera el tamaño máximo permitido'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[★]/g, '*')
    .replace(/[—–]/g, '-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
}

// ─── Marker-aware ESC/POS builder ────────────────────────────────────────────
//
// Supported inline markers (case-insensitive):
//   [CENTER]  ... [/CENTER]  → ESC a 1 / ESC a 0
//   [BOLD]    ... [/BOLD]    → ESC E 1 / ESC E 0
//   [LOGO]                   → print logoText in double-size then restore (no closing tag needed)
//   [SEP:<char>:<width>]     → print a separator line using <char> repeated <width> times
//
// Markers are stripped from output; surrounding text is printed as-is.
//
function buildEscPosBuffer(text: string, cut = true, feedLines = 4, cfg: PrintConfig = {}): Buffer {
  const safeFeedLines = Math.max(0, Math.min(8, feedLines))
  const normalized = normalizeText(text)
  const chunks: Buffer[] = []

  // Init printer
  chunks.push(CMD_INIT)
  chunks.push(CMD_CODEPAGE)
  chunks.push(CMD_ALIGN_LEFT)

  // Logo (double-size text) if requested before processing lines
  if (cfg.showLogo) {
    const logoText = cfg.logoText ?? 'SUMAK'
    chunks.push(CMD_ALIGN_CENTER)
    chunks.push(CMD_DOUBLE_SIZE)
    if (cfg.headerBold) chunks.push(CMD_BOLD_ON)
    chunks.push(Buffer.from(logoText + '\n', 'latin1'))
    if (cfg.headerBold) chunks.push(CMD_BOLD_OFF)
    chunks.push(CMD_NORMAL_SIZE)
    chunks.push(CMD_ALIGN_LEFT)
  }

  // Parse the text line by line, interpreting inline markers
  const lines = normalized.split('\n')

  // Track current state
  let isCentered = false
  let isBold = false

  const setAlign = (center: boolean) => {
    if (center === isCentered) return
    isCentered = center
    chunks.push(center ? CMD_ALIGN_CENTER : CMD_ALIGN_LEFT)
  }

  const setBold = (bold: boolean) => {
    if (bold === isBold) return
    isBold = bold
    chunks.push(bold ? CMD_BOLD_ON : CMD_BOLD_OFF)
  }

  // Regex to split a line by markers
  const MARKER_RE = /\[(\/?)(\w+)(?::([^\]]*))?\]/gi

  for (const rawLine of lines) {
    // Detect whole-line [SEP:char:width] with optional spaces
    const sepMatch = rawLine.trim().match(/^\[SEP:(.):(\d+)\]$/)
    if (sepMatch) {
      const sepChar = sepMatch[1]
      const sepWidth = parseInt(sepMatch[2], 10)
      // preserve current alignment for separator line
      chunks.push(Buffer.from(sepChar.repeat(sepWidth) + '\n', 'latin1'))
      continue
    }

    // Process inline markers within the line
    let lastIndex = 0
    let match: RegExpExecArray | null
    MARKER_RE.lastIndex = 0

    // Collect segments: { text?: string, tag?: string, close?: boolean, arg?: string }
    const segments: Array<{ text?: string; tag?: string; close?: boolean; arg?: string }> = []

    while ((match = MARKER_RE.exec(rawLine)) !== null) {
      // Text before this marker
      if (match.index > lastIndex) {
        segments.push({ text: rawLine.slice(lastIndex, match.index) })
      }
      const isClose = match[1] === '/'
      const tagName = match[2].toUpperCase()
      const arg = match[3]
      segments.push({ tag: tagName, close: isClose, arg })
      lastIndex = match.index + match[0].length
    }
    // Remaining text after last marker
    if (lastIndex < rawLine.length) {
      segments.push({ text: rawLine.slice(lastIndex) })
    }
    // If no markers, the whole line is text
    if (segments.length === 0) {
      segments.push({ text: rawLine })
    }

    // Check if this line has any actual text content (besides markers)
    const hasTextContent = segments.some((s) => s.text !== undefined && s.text.length > 0)

    // Emit segments
    for (const seg of segments) {
      if (seg.tag) {
        switch (seg.tag) {
          case 'CENTER':
            setAlign(!seg.close)
            break
          case 'BOLD':
            setBold(!seg.close)
            break
          case 'LOGO': {
            // Inline [LOGO] tag — emit logo in double-size
            const logoText = cfg.logoText ?? 'SUMAK'
            chunks.push(CMD_ALIGN_CENTER)
            chunks.push(CMD_DOUBLE_SIZE)
            if (cfg.headerBold) chunks.push(CMD_BOLD_ON)
            chunks.push(Buffer.from(logoText + '\n', 'latin1'))
            if (cfg.headerBold) chunks.push(CMD_BOLD_OFF)
            chunks.push(CMD_NORMAL_SIZE)
            chunks.push(isCentered ? CMD_ALIGN_CENTER : CMD_ALIGN_LEFT)
            break
          }
          case 'SEP': {
            // Inline [SEP:char:width]
            const sepChar = seg.arg ? seg.arg.split(':')[0] : '-'
            const sepWidthStr = seg.arg ? seg.arg.split(':')[1] : undefined
            const sepWidth = sepWidthStr ? parseInt(sepWidthStr, 10) : (cfg.width ?? 32)
            chunks.push(Buffer.from(sepChar.repeat(sepWidth) + '\n', 'latin1'))
            break
          }
        }
      } else if (seg.text !== undefined) {
        chunks.push(Buffer.from(seg.text, 'latin1'))
      }
    }

    // Newline at end of line (only if there was actual content or markers)
    if (hasTextContent || segments.some((s) => s.tag)) {
      chunks.push(Buffer.from('\n', 'latin1'))
    } else if (!hasTextContent && segments.every((s) => !s.tag)) {
      // Empty line → just a newline
      chunks.push(Buffer.from('\n', 'latin1'))
    }
  }

  // Reset formatting before cut
  setBold(false)
  setAlign(false)
  chunks.push(CMD_NORMAL_SIZE)

  chunks.push(Buffer.from([ESC, 0x64, safeFeedLines]))

  if (cut) {
    chunks.push(CMD_CUT)
  }

  return Buffer.concat(chunks)
}

function printRaw(buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }

    socket.setTimeout(8000)
    socket.once('error', finish)
    socket.once('timeout', () => finish(new Error('Tiempo de espera agotado conectando con la impresora')))
    socket.connect(PRINTER_PORT, PRINTER_HOST, () => {
      socket.write(buffer, (error) => {
        if (error) {
          finish(error)
          return
        }
        socket.end()
      })
    })
    socket.once('close', () => finish())
  })
}

async function handlePrint(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await readBody(req)
  const payload = JSON.parse(body || '{}') as PrintPayload

  if (!payload.text || typeof payload.text !== 'string') {
    sendJson(res, 400, { ok: false, error: 'Falta el campo text' })
    return
  }

  const cfg = payload.config ?? {}
  const cut = cfg.autoCut !== undefined ? cfg.autoCut : payload.cut !== false
  const feedLines = cfg.feedLinesBeforeCut ?? payload.feedLines ?? 4
  const buffer = buildEscPosBuffer(payload.text, cut, feedLines, cfg)
  await printRaw(buffer)
  sendJson(res, 200, { ok: true })
}

async function handleOpenDrawer(res: http.ServerResponse) {
  // ESC p 0 50 50 — standard drawer kick command
  const buffer = Buffer.from([ESC, 0x70, 0x00, 0x32, 0x32])
  await printRaw(buffer)
  sendJson(res, 200, { ok: true })
}

async function handleTestPrint(res: http.ServerResponse) {
  const now = new Date().toLocaleString('es-AR', { hour12: false })
  const ticket = [
    '[LOGO]',
    '[CENTER]Restaurante[/CENTER]',
    '[SEP:-:32]',
    `Prueba impresion directa`,
    `Fecha: ${now}`,
    'Impresora: 3nStar 80mm',
    '[SEP:-:32]',
    '1x Ticket de prueba',
    '                         $0',
    '[SEP:-:32]',
    '[BOLD]TOTAL: $0[/BOLD]',
    '[SEP:-:32]',
    '[CENTER]Servidor local OK[/CENTER]',
  ].join('\n')

  const buffer = buildEscPosBuffer(ticket, true, 4, {
    showLogo: false, // logo handled inline via [LOGO] marker
    headerBold: true,
    width: 32,
  })
  await printRaw(buffer)
  sendJson(res, 200, { ok: true })
}

const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        printer: `${PRINTER_HOST}:${PRINTER_PORT}`,
        server: `${SERVER_HOST}:${SERVER_PORT}`,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/print') {
      await handlePrint(req, res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/test-print') {
      await handleTestPrint(res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/open-drawer') {
      await handleOpenDrawer(res)
      return
    }

    sendJson(res, 404, { ok: false, error: 'Ruta no encontrada' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    sendJson(res, 500, { ok: false, error: message })
  }
})

server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`Servidor de impresion Sumak escuchando en http://${SERVER_HOST}:${SERVER_PORT}`)
  console.log(`Impresora configurada en ${PRINTER_HOST}:${PRINTER_PORT}`)
})
