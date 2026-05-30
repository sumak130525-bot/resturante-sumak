"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_net_1 = __importDefault(require("node:net"));
const node_url_1 = require("node:url");
const jimp_1 = require("jimp");
const SERVER_HOST = process.env.PRINT_SERVER_HOST ?? '0.0.0.0';
const SERVER_PORT = Number(process.env.PRINT_SERVER_PORT ?? 4000);
const PRINTER_HOST = process.env.PRINTER_HOST ?? '192.168.100.55';
const PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100);
const REQUEST_LIMIT_BYTES = 256 * 1024; // 256 KB — logo bitmap needs more room
// ─── Printer constants ────────────────────────────────────────────────────────
// 3nStar RPT008 — 80 mm paper, Font A 12×24 dots → 48 chars per line
const PAPER_WIDTH_CHARS = 48;
// ─── ESC/POS command bytes ────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const CMD_INIT = Buffer.from([ESC, 0x40]);
const CMD_CODEPAGE = Buffer.from([ESC, 0x74, 0x10]); // PC437
const CMD_ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const CMD_ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const CMD_ALIGN_RIGHT = Buffer.from([ESC, 0x61, 0x02]);
const CMD_BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const CMD_BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
// GS ! 0x00 = normal size (Font A)
const CMD_NORMAL_SIZE = Buffer.from([GS, 0x21, 0x00]);
// Full cut
const CMD_CUT = Buffer.from([GS, 0x56, 0x42, 0x00]);
// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(body));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            body += chunk;
            if (Buffer.byteLength(body, 'utf8') > REQUEST_LIMIT_BYTES) {
                reject(new Error('El ticket supera el tamaño máximo permitido'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
function normalizeText(text) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[★]/g, '*')
        .replace(/[—–]/g, '-')
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'");
}
// ─── Logo bitmap helpers ──────────────────────────────────────────────────────
// Max printable width for 3nStar RPT008 80mm = 576 dots (72mm printable @ 8 dots/mm)
// We cap at 384 dots (= 48 chars × 8 dots per char column) to match char width
const MAX_LOGO_WIDTH_DOTS = 384;
/**
 * Download an image from a URL and return raw bytes.
 */
function downloadImage(url) {
    // Handle data URIs (base64)
    if (url.startsWith('data:')) {
        const match = url.match(/^data:[^;]+;base64,(.+)$/);
        if (match)
            return Promise.resolve(Buffer.from(match[1], 'base64'));
        return Promise.reject(new Error('Invalid data URI'));
    }
    return new Promise((resolve, reject) => {
        const parsedUrl = new node_url_1.URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const lib = isHttps ? node_https_1.default : node_http_1.default;
        const req = lib.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect once
                downloadImage(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode} al descargar logo`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Timeout descargando logo'));
        });
        req.on('error', reject);
    });
}
/**
 * Convert an image buffer to an ESC/POS GS v 0 raster bitmap command.
 *
 * GS v 0 format:
 *   GS 'v' '0' m xL xH yL yH d1...dk
 *   m=0 (normal mode)
 *   xL+xH*256 = bytes per line (width in bytes, ceil(pixels/8))
 *   yL+yH*256 = number of lines (height in pixels)
 *
 * Pixel data: 1 bit per pixel, MSB first, 0=black 1=white (inverted from bitmap)
 */
async function buildLogoBitmap(imageBuffer) {
    try {
        // Load image with Jimp
        const img = await jimp_1.Jimp.read(imageBuffer);
        // Resize to fit within MAX_LOGO_WIDTH_DOTS wide, maintain aspect ratio
        const origW = img.bitmap.width;
        const origH = img.bitmap.height;
        let newW = origW;
        let newH = origH;
        if (origW > MAX_LOGO_WIDTH_DOTS) {
            newW = MAX_LOGO_WIDTH_DOTS;
            newH = Math.round(origH * (MAX_LOGO_WIDTH_DOTS / origW));
        }
        img.resize({ w: newW, h: newH });
        const width = img.bitmap.width;
        const height = img.bitmap.height;
        const bytesPerLine = Math.ceil(width / 8);
        // Build the pixel data: for each row, pack 8 pixels into 1 byte (MSB first)
        // ESC/POS: bit=1 means black dot (ink), bit=0 means no dot
        // Jimp RGBA: dark pixels have low R/G/B values
        const pixelData = Buffer.alloc(bytesPerLine * height, 0);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // getPixelColor returns RGBA as 32-bit: 0xRRGGBBAA
                const rgba = img.getPixelColor(x, y);
                const r = (rgba >>> 24) & 0xff;
                const g = (rgba >>> 16) & 0xff;
                const b = (rgba >>> 8) & 0xff;
                const a = (rgba) & 0xff;
                // Convert to greyscale; consider pixel black if luminance < 128 and alpha > 0
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const isBlack = a > 0 && lum < 128;
                if (isBlack) {
                    const byteIdx = y * bytesPerLine + Math.floor(x / 8);
                    const bitPos = 7 - (x % 8); // MSB first
                    pixelData[byteIdx] |= (1 << bitPos);
                }
            }
        }
        // Build GS v 0 command
        const xL = bytesPerLine & 0xff;
        const xH = (bytesPerLine >> 8) & 0xff;
        const yL = height & 0xff;
        const yH = (height >> 8) & 0xff;
        const header = Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
        return Buffer.concat([header, pixelData]);
    }
    catch (err) {
        console.error('Error construyendo bitmap del logo:', err);
        return null;
    }
}
// ─── Marker-aware ESC/POS builder ────────────────────────────────────────────
//
// Supported inline markers (case-insensitive):
//   [CENTER]  ... [/CENTER]     → ESC a 1 / restore prev align
//   [RIGHT]   ... [/RIGHT]      → ESC a 2 / restore prev align
//   [BOLD]    ... [/BOLD]       → ESC E 1 / ESC E 0
//   [LOGO]                      → print logo bitmap OR text logo in normal size + center
//   [SEP:<char>:<width>]        → separator line, includes trailing \n
//   [BLANK:<n>]                 → emit n blank lines
//
// Configuration (from PrintConfig):
//   cfg.width            → paper width in chars (default: 48)
//   cfg.headerAlign      → 'center' | 'left'  (applied to header via [CENTER] markers in text)
//   cfg.headerBold       → true/false
//   cfg.totalBold        → true/false (handled via [BOLD] markers in text)
//   cfg.feedLinesBeforeCut  → ESC d n  (default 3)
//   cfg.autoCut          → true/false
//   cfg.showLogo         → true/false
//   cfg.logoUrl          → URL for bitmap logo (async pre-downloaded)
//   cfg.logoText         → fallback text logo
//   cfg.sectionSpacing   → extra blank lines between sections (from TicketConfig)
//   cfg.separatorChar    → char used by [SEP] when width=0 sentinel (auto)
//   cfg.separatorDouble  → if true, each [SEP] emits two lines
//
async function buildEscPosBuffer(text, cut = true, feedLines = 3, cfg = {}, logoBitmapBuffer) {
    const paperWidth = cfg.width ?? PAPER_WIDTH_CHARS;
    const safeFeedLines = Math.max(0, Math.min(20, feedLines));
    const normalized = normalizeText(text);
    const chunks = [];
    // Init printer
    chunks.push(CMD_INIT);
    chunks.push(CMD_CODEPAGE);
    chunks.push(CMD_ALIGN_LEFT);
    // Track current alignment and bold state
    let currentAlign = 'left';
    let isBold = false;
    const setAlign = (align) => {
        if (align === currentAlign)
            return;
        currentAlign = align;
        if (align === 'center')
            chunks.push(CMD_ALIGN_CENTER);
        else if (align === 'right')
            chunks.push(CMD_ALIGN_RIGHT);
        else
            chunks.push(CMD_ALIGN_LEFT);
    };
    const setBold = (bold) => {
        if (bold === isBold)
            return;
        isBold = bold;
        chunks.push(bold ? CMD_BOLD_ON : CMD_BOLD_OFF);
    };
    // Regex to split a line by markers
    const MARKER_RE = /\[(\/?)(\w+)(?::([^\]]*))?\]/gi;
    const lines = normalized.split('\n');
    for (const rawLine of lines) {
        // Detect whole-line [SEP:char:width] (may have leading/trailing spaces)
        const sepMatch = rawLine.trim().match(/^\[SEP:(.):(\d+)\]$/);
        if (sepMatch) {
            const sepChar = sepMatch[1];
            const sepWidth = parseInt(sepMatch[2], 10) || paperWidth;
            // Always use full paper width for separators
            const effectiveWidth = paperWidth;
            chunks.push(Buffer.from(sepChar.repeat(effectiveWidth) + '\n', 'latin1'));
            if (cfg.separatorDouble) {
                chunks.push(Buffer.from(sepChar.repeat(effectiveWidth) + '\n', 'latin1'));
            }
            continue;
        }
        // Detect whole-line [BLANK:n]
        const blankMatch = rawLine.trim().match(/^\[BLANK:(\d+)\]$/);
        if (blankMatch) {
            const n = Math.max(0, Math.min(8, parseInt(blankMatch[1], 10)));
            for (let i = 0; i < n; i++)
                chunks.push(Buffer.from('\n', 'latin1'));
            continue;
        }
        // Process inline markers within the line
        let lastIndex = 0;
        let match;
        MARKER_RE.lastIndex = 0;
        const segments = [];
        while ((match = MARKER_RE.exec(rawLine)) !== null) {
            if (match.index > lastIndex) {
                segments.push({ text: rawLine.slice(lastIndex, match.index) });
            }
            const isClose = match[1] === '/';
            const tagName = match[2].toUpperCase();
            const arg = match[3];
            segments.push({ tag: tagName, close: isClose, arg });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < rawLine.length) {
            segments.push({ text: rawLine.slice(lastIndex) });
        }
        if (segments.length === 0) {
            segments.push({ text: rawLine });
        }
        const hasTextContent = segments.some((s) => s.text !== undefined && s.text.length > 0);
        let selfNewlineEmitted = false;
        for (const seg of segments) {
            if (seg.tag) {
                switch (seg.tag) {
                    case 'CENTER':
                        setAlign(seg.close ? 'left' : 'center');
                        break;
                    case 'RIGHT':
                        setAlign(seg.close ? 'left' : 'right');
                        break;
                    case 'BOLD':
                        setBold(!seg.close);
                        break;
                    case 'LOGO': {
                        // Always center logo
                        setAlign('center');
                        if (logoBitmapBuffer) {
                            // Print bitmap logo
                            chunks.push(logoBitmapBuffer);
                            chunks.push(Buffer.from('\n', 'latin1'));
                            // Also print logoText as text below the image
                            const logoText = cfg.logoText ?? 'SUMAK';
                            if (logoText) {
                                if (cfg.headerBold ?? true)
                                    setBold(true);
                                chunks.push(Buffer.from(logoText + '\n', 'latin1'));
                                setBold(false);
                            }
                        }
                        else {
                            // Text fallback: print logoText in bold normal size (centered)
                            const logoText = cfg.logoText ?? 'SUMAK';
                            if (cfg.headerBold ?? true)
                                setBold(true);
                            chunks.push(Buffer.from(logoText + '\n', 'latin1'));
                            setBold(false);
                        }
                        setAlign('left');
                        selfNewlineEmitted = true;
                        break;
                    }
                    case 'SEP': {
                        // Inline [SEP:char:width] — always use full paper width
                        const parts = seg.arg ? seg.arg.split(':') : [];
                        const sepChar = parts[0] || (cfg.separatorChar ?? '-');
                        const effectiveWidth = paperWidth;
                        // preserve current alignment
                        chunks.push(Buffer.from(sepChar.repeat(effectiveWidth) + '\n', 'latin1'));
                        if (cfg.separatorDouble) {
                            chunks.push(Buffer.from(sepChar.repeat(effectiveWidth) + '\n', 'latin1'));
                        }
                        selfNewlineEmitted = true;
                        break;
                    }
                    case 'BLANK': {
                        const n = seg.arg ? Math.max(0, Math.min(8, parseInt(seg.arg, 10))) : 1;
                        for (let i = 0; i < n; i++)
                            chunks.push(Buffer.from('\n', 'latin1'));
                        selfNewlineEmitted = true;
                        break;
                    }
                }
            }
            else if (seg.text !== undefined) {
                chunks.push(Buffer.from(seg.text, 'latin1'));
            }
        }
        // Emit trailing newline for this line
        if (hasTextContent) {
            chunks.push(Buffer.from('\n', 'latin1'));
        }
        else if (!selfNewlineEmitted) {
            // Empty line or formatting-only tags without self-newline
            chunks.push(Buffer.from('\n', 'latin1'));
        }
        // selfNewlineEmitted && !hasTextContent → newline already included
    }
    // Reset formatting before cut
    setBold(false);
    setAlign('left');
    chunks.push(CMD_NORMAL_SIZE);
    // Feed before cut: ESC d n
    chunks.push(Buffer.from([ESC, 0x64, safeFeedLines]));
    if (cut) {
        chunks.push(CMD_CUT);
    }
    return Buffer.concat(chunks);
}
// ─── Pre-download logo if URL provided ───────────────────────────────────────
async function prepareLogoBitmap(cfg) {
    if (!cfg.showLogo)
        return null;
    if (!cfg.logoUrl)
        return null;
    try {
        const imgBuf = await downloadImage(cfg.logoUrl);
        const bitmap = await buildLogoBitmap(imgBuf);
        return bitmap;
    }
    catch (err) {
        console.error('Error preparando logo:', err);
        return null;
    }
}
// ─── Network printer ─────────────────────────────────────────────────────────
function printRaw(buffer) {
    return new Promise((resolve, reject) => {
        const socket = new node_net_1.default.Socket();
        let settled = false;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            if (error)
                reject(error);
            else
                resolve();
        };
        socket.setTimeout(8000);
        socket.once('error', finish);
        socket.once('timeout', () => finish(new Error('Tiempo de espera agotado conectando con la impresora')));
        socket.connect(PRINTER_PORT, PRINTER_HOST, () => {
            socket.write(buffer, (error) => {
                if (error) {
                    finish(error);
                    return;
                }
                socket.end();
            });
        });
        socket.once('close', () => finish());
    });
}
// ─── Request handlers ─────────────────────────────────────────────────────────
async function handlePrint(req, res) {
    const body = await readBody(req);
    const payload = JSON.parse(body || '{}');
    // DEBUG: log what POS sends
    console.log('=== PRINT REQUEST ===');
    console.log('feedLines:', payload.feedLines, '| config.feedLinesBeforeCut:', payload.config?.feedLinesBeforeCut);
    console.log('config:', JSON.stringify(payload.config || {}, null, 2));
    console.log('text (first 200):', payload.text?.substring(0, 200));
    console.log('=== END ===');
    if (!payload.text || typeof payload.text !== 'string') {
        sendJson(res, 400, { ok: false, error: 'Falta el campo text' });
        return;
    }
    const cfg = payload.config ?? {};
    const cut = cfg.autoCut !== undefined ? cfg.autoCut : payload.cut !== false;
    // Use EXACTLY the value from config (set by POS from DB). Fall back to payload.feedLines if config omits it.
    // No server-side default override — the POS is the source of truth for feedLinesBeforeCut.
    const feedLines = cfg.feedLinesBeforeCut !== undefined ? cfg.feedLinesBeforeCut : (payload.feedLines ?? 3);
    // If showLogo is true but logoUrl not provided, fetch it directly from the API
    if (cfg.showLogo && !cfg.logoUrl) {
        try {
            const logoRes = await fetch('https://restaurante-sumak.vercel.app/api/admin/settings?key=ticket_logo');
            const logoData = await logoRes.json();
            if (Array.isArray(logoData) && logoData[0]?.value) {
                cfg.logoUrl = logoData[0].value;
            }
        }
        catch { /* ignore — print without logo */ }
    }
    // Pre-download logo bitmap (may be null if not configured or error)
    const logoBitmap = await prepareLogoBitmap(cfg);
    const buffer = await buildEscPosBuffer(payload.text, cut, feedLines, cfg, logoBitmap);
    await printRaw(buffer);
    sendJson(res, 200, { ok: true });
}
async function handleOpenDrawer(res) {
    // ESC p 0 50 50 — standard drawer kick command
    const buffer = Buffer.from([ESC, 0x70, 0x00, 0x32, 0x32]);
    await printRaw(buffer);
    sendJson(res, 200, { ok: true });
}
async function handleTestPrint(res) {
    const now = new Date().toLocaleString('es-AR', { hour12: false });
    const W = PAPER_WIDTH_CHARS;
    const ticket = [
        '[LOGO]',
        `[CENTER]Restaurante[/CENTER]`,
        `[SEP:.:${W}]`,
        `Prueba impresion directa`,
        `Fecha: ${now}`,
        `Impresora: 3nStar 80mm (${W} chars)`,
        `[SEP:.:${W}]`,
        `1x Ticket de prueba`,
        `[RIGHT]$0[/RIGHT]`,
        `[SEP:.:${W}]`,
        `[BOLD]TOTAL: $0[/BOLD]`,
        `[SEP:.:${W}]`,
        `[CENTER]Servidor local OK[/CENTER]`,
    ].join('\n');
    const buffer = await buildEscPosBuffer(ticket, true, 12, {
        showLogo: false, // logo handled inline via [LOGO] marker
        headerBold: true,
        width: W,
    });
    await printRaw(buffer);
    sendJson(res, 200, { ok: true });
}
// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = node_http_1.default.createServer(async (req, res) => {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new node_url_1.URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (req.method === 'GET' && url.pathname === '/health') {
            sendJson(res, 200, {
                ok: true,
                printer: `${PRINTER_HOST}:${PRINTER_PORT}`,
                server: `${SERVER_HOST}:${SERVER_PORT}`,
                paperWidth: PAPER_WIDTH_CHARS,
            });
            return;
        }
        if (req.method === 'POST' && url.pathname === '/print') {
            await handlePrint(req, res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/test-print') {
            await handleTestPrint(res);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/open-drawer') {
            await handleOpenDrawer(res);
            return;
        }
        sendJson(res, 404, { ok: false, error: 'Ruta no encontrada' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        sendJson(res, 500, { ok: false, error: message });
    }
});
server.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`Servidor de impresion Sumak escuchando en http://${SERVER_HOST}:${SERVER_PORT}`);
    console.log(`Impresora configurada en ${PRINTER_HOST}:${PRINTER_PORT}`);
    console.log(`Ancho papel: ${PAPER_WIDTH_CHARS} chars (80mm Font A 12x24)`);
});
