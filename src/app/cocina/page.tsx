'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── LocalStorage helpers para dismissed IDs ─────────────────────────────────

const LS_KEY = 'sumak-cocina-dismissed'
const LS_SOUND_KEY = 'sumak-cocina-sound'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 horas

type DismissedEntry = { id: string; timestamp: number }

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Set()
    const entries: DismissedEntry[] = JSON.parse(raw)
    const now = Date.now()
    const valid = entries.filter((e) => now - e.timestamp < MAX_AGE_MS)
    if (valid.length !== entries.length) saveDismissed(valid)
    return new Set(valid.map((e) => e.id))
  } catch {
    return new Set()
  }
}

function saveDismissed(entries: DismissedEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries))
  } catch {}
}

function addDismissed(id: string) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const entries: DismissedEntry[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    const clean = entries.filter((e) => now - e.timestamp < MAX_AGE_MS && e.id !== id)
    clean.push({ id, timestamp: now })
    saveDismissed(clean)
  } catch {}
}

function removeDismissed(id: string) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const entries: DismissedEntry[] = JSON.parse(raw)
    saveDismissed(entries.filter((e) => e.id !== id))
  } catch {}
}

// ─── LocalStorage helpers para items tachados ────────────────────────────────

function struckKey(orderId: string) {
  return `sumak-cocina-struck-${orderId}`
}

function loadStruck(orderId: string): Set<number> {
  try {
    const raw = localStorage.getItem(struckKey(orderId))
    if (!raw) return new Set()
    const arr: number[] = JSON.parse(raw)
    return new Set(arr)
  } catch {
    return new Set()
  }
}

function saveStruck(orderId: string, indices: Set<number>) {
  try {
    localStorage.setItem(struckKey(orderId), JSON.stringify(Array.from(indices)))
  } catch {}
}

function clearStruck(orderId: string) {
  try {
    localStorage.removeItem(struckKey(orderId))
  } catch {}
}

// ─── Sonidos ──────────────────────────────────────────────────────────────────

type SoundOption = 'beep' | 'bell' | 'alert' | 'silent'

const SOUND_LABELS: Record<SoundOption, string> = {
  beep: 'Beep',
  bell: 'Campana',
  alert: 'Alerta',
  silent: 'Silencio',
}

function loadSound(): SoundOption {
  try {
    const v = localStorage.getItem(LS_SOUND_KEY)
    if (v === 'beep' || v === 'bell' || v === 'alert' || v === 'silent') return v
  } catch {}
  return 'beep'
}

function saveSound(s: SoundOption) {
  try {
    localStorage.setItem(LS_SOUND_KEY, s)
  } catch {}
}

// ── WAV synthesis helpers ──────────────────────────────────────────────────────

/**
 * Renders audio frames using Web Audio API OfflineAudioContext into a WAV
 * data URI. Falls back gracefully if unavailable.
 */
async function renderToWavDataUri(
  buildGraph: (ctx: OfflineAudioContext) => void,
  durationSec: number,
  sampleRate = 44100
): Promise<string | null> {
  try {
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * durationSec), sampleRate)
    buildGraph(offlineCtx)
    const buffer = await offlineCtx.startRendering()
    const samples = buffer.getChannelData(0)

    // PCM 16-bit WAV
    const numSamples = samples.length
    const byteLength = 44 + numSamples * 2
    const arrayBuffer = new ArrayBuffer(byteLength)
    const view = new DataView(arrayBuffer)

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, byteLength - 8, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)       // PCM
    view.setUint16(22, 1, true)       // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, numSamples * 2, true)
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, s * 0x7fff, true)
    }

    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return `data:audio/wav;base64,${btoa(binary)}`
  } catch {
    return null
  }
}

// Cache so we only render each sound once per session
const wavCache: Partial<Record<SoundOption, string>> = {}

async function getWavDataUri(sound: SoundOption): Promise<string | null> {
  if (wavCache[sound]) return wavCache[sound]!

  const sampleRate = 44100

  if (sound === 'beep') {
    const uri = await renderToWavDataUri((ctx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, 0)
      osc.frequency.exponentialRampToValueAtTime(440, 0.5)
      gain.gain.setValueAtTime(1.0, 0)
      gain.gain.exponentialRampToValueAtTime(0.001, 0.8)
      osc.start(0)
      osc.stop(0.8)
    }, 0.85, sampleRate)
    if (uri) wavCache[sound] = uri
    return uri

  } else if (sound === 'bell') {
    const uri = await renderToWavDataUri((ctx) => {
      const makeNote = (freq: number, start: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, start)
        gain.gain.setValueAtTime(1.0, start)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4)
        osc.start(start)
        osc.stop(start + 0.4)
      }
      makeNote(660, 0)
      makeNote(880, 0.45)
    }, 0.9, sampleRate)
    if (uri) wavCache[sound] = uri
    return uri

  } else if (sound === 'alert') {
    const uri = await renderToWavDataUri((ctx) => {
      for (let i = 0; i < 3; i++) {
        const t = i * 0.22
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(800, t)
        gain.gain.setValueAtTime(0.7, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t)
        osc.stop(t + 0.18)
      }
    }, 0.7, sampleRate)
    if (uri) wavCache[sound] = uri
    return uri
  }

  return null
}

// WAV silencioso de ~0.1s (44 bytes header + 4410 muestras a cero @ 44100Hz)
// Sirve para desbloquear el Audio element en el primer click del usuario
function buildSilentWavDataUri(): string {
  const sampleRate = 44100
  const numSamples = Math.ceil(sampleRate * 0.1)
  const byteLength = 44 + numSamples * 2
  const arrayBuffer = new ArrayBuffer(byteLength)
  const view = new DataView(arrayBuffer)
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, byteLength - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  // samples are all 0 (silence)
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:audio/wav;base64,${btoa(binary)}`
}

const SILENT_WAV_URI = typeof window !== 'undefined' ? buildSilentWavDataUri() : ''

// ─── Tipos ────────────────────────────────────────────────────────────────────

type KdsItem = {
  name: string
  quantity: number
  price: number
  modifiers?: string[]
}

type KdsOrder = {
  id: string
  source: 'WEB' | 'LOCAL'
  number: string
  customer: string
  status: string
  items: KdsItem[]
  total: number
  notes: string | null
  created_at: string
  channel?: 'web' | 'whatsapp'
  customer_phone?: string | null
  orderNumber?: string
  diningOption?: string
  paymentMethod?: string
  tableNumber?: string
}

type FilterSource = 'ALL' | 'WEB' | 'LOCAL'
type ActiveTab = 'cocina' | 'entregados'

// ─── Colores por estado ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { border: string; badge: string; label: string; headerBg: string }> = {
  pending:   { border: 'border-yellow-400', badge: 'bg-yellow-400 text-yellow-900',  label: 'Pendiente',  headerBg: 'bg-yellow-500'  },
  confirmed: { border: 'border-blue-400',   badge: 'bg-blue-400 text-blue-900',      label: 'Confirmado', headerBg: 'bg-blue-600'    },
  ready:     { border: 'border-green-400',  badge: 'bg-green-400 text-green-900',    label: 'Listo',      headerBg: 'bg-green-600'   },
  delivered: { border: 'border-gray-500',   badge: 'bg-gray-500 text-white',         label: 'Entregado',  headerBg: 'bg-gray-600'    },
  cancelled: { border: 'border-red-600',    badge: 'bg-red-600 text-white',          label: 'Cancelado',  headerBg: 'bg-red-700'     },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(created_at: string): string {
  const diff = Math.floor((Date.now() - new Date(created_at).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function elapsedColor(created_at: string): string {
  const mins = (Date.now() - new Date(created_at).getTime()) / 60000
  if (mins < 10) return 'text-green-400'
  if (mins < 20) return 'text-yellow-400'
  return 'text-red-400'
}

function getOrderLabel(order: KdsOrder): string {
  if (order.source === 'LOCAL' && order.orderNumber) return order.orderNumber
  if (order.source === 'WEB' && order.tableNumber) return `MESA ${order.tableNumber}`
  if (order.source === 'WEB') return order.customer
  return order.number
}

// ─── Componente Card ──────────────────────────────────────────────────────────

function OrderCard({
  order,
  onDeliver,
  onRecover,
  isDelivered,
}: {
  order: KdsOrder
  onDeliver?: (id: string, source: 'WEB' | 'LOCAL') => void
  onRecover?: (id: string) => void
  isDelivered?: boolean
}) {
  const [singleClicked, setSingleClicked] = useState(false)
  const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Estado de items tachados ──
  const [struckIndices, setStruckIndices] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set()
    return loadStruck(order.id)
  })

  const allStruck = order.items.length > 0 && struckIndices.size === order.items.length

  const toggleStruck = (idx: number) => {
    if (isDelivered) return
    setStruckIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      saveStruck(order.id, next)
      return next
    })
  }

  const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending

  const diningBadge = order.diningOption
    ? {
        label: order.diningOption,
        cls: order.diningOption.toLowerCase().includes('llevar')
          ? 'bg-red-600 text-white'
          : 'bg-green-600 text-white',
      }
    : null

  const orderLabel = getOrderLabel(order)

  const handleHeaderClick = () => {
    if (isDelivered || !onDeliver) return
    if (singleClickTimer.current) clearTimeout(singleClickTimer.current)
    setSingleClicked(true)
    singleClickTimer.current = setTimeout(() => {
      setSingleClicked(false)
    }, 1200)
  }

  const handleHeaderDoubleClick = () => {
    if (isDelivered || !onDeliver) return
    if (singleClickTimer.current) clearTimeout(singleClickTimer.current)
    setSingleClicked(false)
    clearStruck(order.id)
    onDeliver(order.id, order.source)
  }

  return (
    <div
      className={`relative flex flex-col bg-gray-900 rounded-2xl border-2 ${
        allStruck && !isDelivered
          ? 'border-green-400 shadow-[0_0_12px_2px_rgba(74,222,128,0.45)] animate-pulse'
          : sc.border
      } shadow-xl overflow-hidden`}
    >
      {/* ── Cabecera: doble click para entregar ── */}
      <div
        className={`${sc.headerBg} px-3 py-2 transition-opacity duration-150 ${
          !isDelivered && onDeliver ? 'cursor-pointer select-none' : ''
        } ${singleClicked ? 'opacity-70' : 'opacity-100'}`}
        onClick={handleHeaderClick}
        onDoubleClick={handleHeaderDoubleClick}
        title={!isDelivered && onDeliver ? 'Doble click para entregar' : undefined}
      >
        {/* Tooltip de primer click */}
        {singleClicked && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-black/80 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap pointer-events-none">
            Doble click para entregar
          </div>
        )}

        {/* Fila 1: Mesa/Orden + Tiempo */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white font-black text-2xl leading-none tracking-tight drop-shadow-lg truncate">
              {orderLabel}
            </span>
            {order.source === 'WEB' && order.tableNumber && (
              <span className="text-white/70 font-semibold text-xs truncate hidden sm:inline">
                {order.customer}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-1 text-sm font-mono font-bold shrink-0 ${elapsedColor(order.created_at)} bg-black/30 rounded-lg px-2 py-0.5`}>
            <span>{elapsed(order.created_at)}</span>
            <span className="text-white/50 text-xs font-normal">
              {new Date(order.created_at).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Fila 2: Badges compactos */}
        <div className="flex flex-wrap gap-1 mt-1">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              order.source === 'WEB' && order.channel === 'whatsapp'
                ? 'bg-[#25D366]/20 text-[#25D366]'
                : order.source === 'WEB'
                ? 'bg-purple-900/80 text-purple-200'
                : 'bg-orange-900/80 text-orange-200'
            }`}
          >
            {order.source === 'WEB' && order.channel === 'whatsapp' ? 'WHATSAPP' : order.source}
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/30 text-white/80">
            {order.number}
          </span>
          {diningBadge && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${diningBadge.cls}`}>
              {diningBadge.label}
            </span>
          )}
          {order.paymentMethod && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-black/30 text-white/70">
              {order.paymentMethod}
            </span>
          )}
        </div>

        {/* Fila 3: Teléfono (solo si existe) */}
        {order.customer_phone && (
          <div className="flex items-center gap-1 mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60 shrink-0">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/>
            </svg>
            <span className="text-xs text-white/80 font-mono">{order.customer_phone}</span>
          </div>
        )}
      </div>

      {/* ── Items ── */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-3">
        {allStruck && !isDelivered && (
          <div className="text-center text-green-400 text-xs font-bold animate-pulse">
            Todos listos — doble click para entregar
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {order.items.map((item, i) => {
            const struck = struckIndices.has(i)
            return (
              <li
                key={i}
                className={`flex items-start gap-2 cursor-pointer select-none transition-opacity duration-150 ${
                  struck ? 'opacity-40' : 'text-white'
                }`}
                onClick={() => toggleStruck(i)}
                title={struck ? 'Click para quitar tachado' : 'Click para tachar'}
              >
                <span className={`text-2xl font-black leading-none w-8 shrink-0 ${struck ? 'text-gray-500' : 'text-yellow-400'}`}>
                  {item.quantity}×
                </span>
                <div className="flex flex-col min-w-0">
                  <span className={`text-base font-semibold leading-tight ${struck ? 'line-through text-gray-500' : ''}`}>
                    {item.name}
                  </span>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <span className={`text-xs leading-snug mt-0.5 ${struck ? 'line-through text-gray-600' : 'text-cyan-300'}`}>
                      {item.modifiers.join(' · ')}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {/* Notas */}
        {order.notes && (
          <p className="text-xs text-yellow-300 italic border-t border-gray-700 pt-2">
            Nota: {order.notes}
          </p>
        )}
      </div>

      {/* ── Botón Recuperar (solo en tab Entregados) ── */}
      {isDelivered && onRecover && (
        <div className="px-4 pb-4">
          <button
            onClick={() => onRecover(order.id)}
            className="w-full py-3 rounded-xl text-base font-bold bg-gray-700 text-gray-200 hover:bg-gray-600 active:scale-95 transition-all"
          >
            ↩ Recuperar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Selector de sonido ───────────────────────────────────────────────────────

function SoundSelector({
  value,
  onChange,
}: {
  value: SoundOption
  onChange: (s: SoundOption) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-all"
        title="Tono de notificación"
      >
        <span>{value === 'silent' ? '🔕' : '🔔'}</span>
        <span className="hidden sm:inline text-gray-300">{SOUND_LABELS[value]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[140px] overflow-hidden">
          {(Object.keys(SOUND_LABELS) as SoundOption[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s)
                setOpen(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${
                value === s
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {s === 'silent' ? '🔕' : '🔔'} {SOUND_LABELS[s]}
              {value === s && <span className="ml-2 text-green-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CocinaPage() {
  const [orders, setOrders] = useState<KdsOrder[]>([])
  const [deliveredOrders, setDeliveredOrders] = useState<KdsOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterSource, setFilterSource] = useState<FilterSource>('ALL')
  const [activeTab, setActiveTab] = useState<ActiveTab>('cocina')
  const [lastCount, setLastCount] = useState(0)
  const [dismissedLoaded, setDismissedLoaded] = useState(false)
  const [soundOption, setSoundOption] = useState<SoundOption>('beep')
  const prevIdsRef = useRef<Set<string>>(new Set())
  const dismissedIdsRef = useRef<Set<string>>(new Set())
  // Ref para leer el sonido actual dentro de callbacks sin stale closure
  const soundOptionRef = useRef<SoundOption>('beep')
  // AudioContext persistente — se desbloquea en el primer click
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioUnlockedRef = useRef(false)

  // Desbloquear AudioContext en cualquier interacción del usuario
  useEffect(() => {
    const unlock = async () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext()
        }
        const ctx = audioCtxRef.current
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }
        if (!audioUnlockedRef.current) {
          // Reproducir un buffer silencioso para desbloquear completamente
          const buf = ctx.createBuffer(1, 1, 22050)
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.connect(ctx.destination)
          src.start(0)
          audioUnlockedRef.current = true
          console.log('[cocina] AudioContext desbloqueado')
        }
      } catch (err) {
        console.warn('[cocina] AudioContext unlock error:', err)
      }
    }
    document.addEventListener('click', unlock)
    document.addEventListener('touchstart', unlock)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [])

  // Cargar dismissedIds y preferencia de sonido desde localStorage al montar
  useEffect(() => {
    dismissedIdsRef.current = loadDismissed()
    const saved = loadSound()
    soundOptionRef.current = saved
    setSoundOption(saved)
    setDismissedLoaded(true)
  }, [])

  // Función central de reproducción usando AudioContext
  const playSoundWithRef = useCallback(async (sound: SoundOption): Promise<void> => {
    if (sound === 'silent') return
    console.log('[cocina] playSound llamado, sound:', sound, 'unlocked:', audioUnlockedRef.current)
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      if (sound === 'beep') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5)
        gain.gain.setValueAtTime(1.0, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.8)
      } else if (sound === 'bell') {
        const makeNote = (freq: number, start: number) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
          gain.gain.setValueAtTime(1.0, ctx.currentTime + start)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.4)
          osc.start(ctx.currentTime + start)
          osc.stop(ctx.currentTime + start + 0.4)
        }
        makeNote(660, 0)
        makeNote(880, 0.45)
      } else if (sound === 'alert') {
        for (let i = 0; i < 3; i++) {
          const t = i * 0.22
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'square'
          osc.frequency.setValueAtTime(800, ctx.currentTime + t)
          gain.gain.setValueAtTime(0.7, ctx.currentTime + t)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18)
          osc.start(ctx.currentTime + t)
          osc.stop(ctx.currentTime + t + 0.18)
        }
      }
      console.log('[cocina] Sonido reproducido OK:', sound)
    } catch (err) {
      console.warn('[cocina] Error reproduciendo sonido:', err)
    }
  }, [])

  const handleSoundChange = useCallback(async (s: SoundOption) => {
    soundOptionRef.current = s
    setSoundOption(s)
    saveSound(s)
    // Reproducir preview del sonido seleccionado (viene de un click → siempre desbloqueado)
    if (s !== 'silent') {
      await playSoundWithRef(s)
    }
  }, [playSoundWithRef])

  // ── Sonido de notificación ──────────────────────────────────────────────────
  const playBeep = useCallback(async () => {
    await playSoundWithRef(soundOptionRef.current)
  }, [playSoundWithRef])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/cocina/orders', { cache: 'no-store' })
      if (!res.ok) return
      const raw: KdsOrder[] = await res.json()

      const data = raw.filter((o) => !dismissedIdsRef.current.has(o.id))

      setOrders(data)

      const newIds = new Set(data.map((o) => o.id))
      const incoming = data.filter((o) => !prevIdsRef.current.has(o.id))
      if (prevIdsRef.current.size > 0 && incoming.length > 0) {
        await playBeep()
        setLastCount((c) => c + incoming.length)
      }
      prevIdsRef.current = newIds
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [playBeep])

  useEffect(() => {
    if (!dismissedLoaded) return
    fetchOrders()
    const interval = setInterval(() => fetchOrders(), 15_000)
    return () => clearInterval(interval)
  }, [fetchOrders, dismissedLoaded])

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('cocina-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  // ── Marcar como ENTREGADO ──────────────────────────────────────────────────
  const handleDeliver = useCallback(async (id: string, source: 'WEB' | 'LOCAL') => {
    const order = orders.find((o) => o.id === id)
    if (!order) return

    dismissedIdsRef.current.add(id)
    addDismissed(id)
    clearStruck(id)

    const deliveredOrder = { ...order, status: 'delivered' }
    setOrders((prev) => prev.filter((o) => o.id !== id))
    setDeliveredOrders((prev) => [deliveredOrder, ...prev])

    if (source === 'WEB') {
      try {
        const res = await fetch('/api/admin/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'delivered' }),
        })
        if (!res.ok) throw new Error('PUT failed')
      } catch {
        dismissedIdsRef.current.delete(id)
        removeDismissed(id)
        setDeliveredOrders((prev) => prev.filter((o) => o.id !== id))
        setOrders((prev) => [order, ...prev])
      }
    }
  }, [orders])

  // ── Recuperar pedido desde historial ──────────────────────────────────────
  const handleRecover = useCallback((id: string) => {
    const order = deliveredOrders.find((o) => o.id === id)
    if (!order) return

    dismissedIdsRef.current.delete(id)
    removeDismissed(id)

    const recoveredOrder = { ...order, status: order.source === 'WEB' ? 'ready' : 'confirmed' }
    setDeliveredOrders((prev) => prev.filter((o) => o.id !== id))
    setOrders((prev) => [recoveredOrder, ...prev])

    if (order.source === 'WEB') {
      fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'ready' }),
      }).catch(() => {})
    }
  }, [deliveredOrders])

  // ── Filtros ────────────────────────────────────────────────────────────────
  const activeOrders = orders.filter((o) => {
    if (filterSource !== 'ALL' && o.source !== filterSource) return false
    return true
  })

  const filteredDelivered = deliveredOrders.filter((o) => {
    if (filterSource !== 'ALL' && o.source !== filterSource) return false
    return true
  })

  const pendingCount = orders.filter((o) => o.status === 'pending').length

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      {/* ── Barra superior ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍳</span>
          <div>
            <h1 className="text-xl font-black leading-none">COCINA</h1>
            <p className="text-gray-400 text-xs">
              {activeTab === 'cocina' ? (
                <>
                  {activeOrders.length} pedidos activos
                  {pendingCount > 0 && (
                    <span className="ml-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-bold">
                      {pendingCount} pendientes
                    </span>
                  )}
                </>
              ) : (
                <>{filteredDelivered.length} entregados hoy</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          {lastCount > 0 && (
            <span
              className="bg-purple-700 text-white px-2 py-1 rounded-full text-xs font-bold cursor-pointer"
              onClick={() => setLastCount(0)}
            >
              +{lastCount} nuevos
            </span>
          )}
          <SoundSelector value={soundOption} onChange={handleSoundChange} />
          <span className="hidden sm:inline">Actualiza cada 15s</span>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
      </header>

      {/* ── Tabs principales + Filtro de origen ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0 gap-3">
        {/* Tabs */}
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('cocina')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'cocina'
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            En cocina
            {orders.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab === 'cocina' ? 'bg-gray-900 text-white' : 'bg-gray-600 text-gray-200'}`}>
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('entregados')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'entregados'
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Entregados
            {deliveredOrders.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab === 'entregados' ? 'bg-gray-900 text-white' : 'bg-green-700 text-green-100'}`}>
                {deliveredOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Filtro origen + Refrescar */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            {(['ALL', 'WEB', 'LOCAL'] as FilterSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                className={`px-3 py-1 rounded-lg text-sm font-bold transition-all ${
                  filterSource === s
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'Todos' : s}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              setRefreshing(true)
              await fetchOrders()
              setRefreshing(false)
            }}
            disabled={refreshing}
            className={`px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-all ${refreshing ? 'opacity-60' : ''}`}
            title="Refrescar pedidos"
          >
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
          </button>
        </div>
      </div>

      {/* ── Contenido principal ── */}
      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === 'cocina' ? (
          loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400 text-xl animate-pulse">Cargando pedidos...</div>
            </div>
          ) : activeOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
              <span className="text-6xl">🍽️</span>
              <p className="text-xl font-semibold">Sin pedidos activos</p>
              <p className="text-sm">Los nuevos pedidos aparecen automáticamente</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onDeliver={handleDeliver}
                />
              ))}
            </div>
          )
        ) : (
          filteredDelivered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-600">
              <span className="text-6xl">✅</span>
              <p className="text-xl font-semibold">Sin pedidos entregados aún</p>
              <p className="text-sm">Los pedidos marcados como entregados aparecen aquí</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredDelivered.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onRecover={handleRecover}
                  isDelivered
                />
              ))}
            </div>
          )
        )}
      </main>
    </div>
  )
}
