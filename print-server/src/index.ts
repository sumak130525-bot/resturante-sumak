import http from 'node:http'
import net from 'node:net'
import { URL } from 'node:url'

const SERVER_HOST = process.env.PRINT_SERVER_HOST ?? '0.0.0.0'
const SERVER_PORT = Number(process.env.PRINT_SERVER_PORT ?? 4000)
const PRINTER_HOST = process.env.PRINTER_HOST ?? '192.168.100.55'
const PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100)
const REQUEST_LIMIT_BYTES = 64 * 1024

type PrintPayload = {
  text?: string
  cut?: boolean
  feedLines?: number
}

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
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
}

function buildEscPosBuffer(text: string, cut = true, feedLines = 4): Buffer {
  const safeFeedLines = Math.max(0, Math.min(8, feedLines))
  const normalized = normalizeText(text)
  const chunks: Buffer[] = []

  chunks.push(Buffer.from([0x1b, 0x40]))
  chunks.push(Buffer.from([0x1b, 0x74, 0x10]))
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]))
  chunks.push(Buffer.from(normalized + '\n', 'latin1'))
  chunks.push(Buffer.from([0x1b, 0x64, safeFeedLines]))

  if (cut) {
    chunks.push(Buffer.from([0x1d, 0x56, 0x42, 0x00]))
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

  const buffer = buildEscPosBuffer(payload.text, payload.cut !== false, payload.feedLines ?? 4)
  await printRaw(buffer)
  sendJson(res, 200, { ok: true })
}

async function handleOpenDrawer(res: http.ServerResponse) {
  // ESC p 0 50 50 — standard drawer kick command
  const buffer = Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32])
  await printRaw(buffer)
  sendJson(res, 200, { ok: true })
}

async function handleTestPrint(res: http.ServerResponse) {
  const now = new Date().toLocaleString('es-AR', { hour12: false })
  const ticket = [
    'SUMAK',
    'Restaurante',
    '--------------------------------',
    `Prueba impresion directa`,
    `Fecha: ${now}`,
    'Impresora: 3nStar 80mm',
    '--------------------------------',
    '1x Ticket de prueba',
    '                         $0',
    '--------------------------------',
    'TOTAL: $0',
    '--------------------------------',
    'Servidor local OK',
  ].join('\n')

  const buffer = buildEscPosBuffer(ticket, true, 4)
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
