'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
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

type SoundOption = 'loud' | 'beep' | 'bell' | 'alert' | 'silent'

const SOUND_LABELS: Record<SoundOption, string> = {
  loud: 'Alarma fuerte',
  beep: 'Beep',
  bell: 'Campana',
  alert: 'Alerta',
  silent: 'Silencio',
}

function loadSound(): SoundOption {
  try {
    const v = localStorage.getItem(LS_SOUND_KEY)
    if (v === 'loud' || v === 'beep' || v === 'bell' || v === 'alert' || v === 'silent') return v
  } catch {}
  return 'loud'
}

function saveSound(s: SoundOption) {
  try {
    localStorage.setItem(LS_SOUND_KEY, s)
  } catch {}
}

// ── WAV synthesis helpers ──────────────────────────────────────────────────────

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
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
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
        gain.gain.setValueAtTime(1.0, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t)
        osc.stop(t + 0.18)
      }
    }, 0.7, sampleRate)
    if (uri) wavCache[sound] = uri
    return uri

  } else if (sound === 'loud') {
    const beepDuration = 0.09
    const beepGap = 0.10
    const numBeeps = 6
    const totalDuration = numBeeps * (beepDuration + beepGap)
    const uri = await renderToWavDataUri((ctx) => {
      for (let i = 0; i < numBeeps; i++) {
        const t = i * (beepDuration + beepGap)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(1100, t)
        gain.gain.setValueAtTime(1.0, t)
        gain.gain.setValueAtTime(1.0, t + beepDuration - 0.005)
        gain.gain.exponentialRampToValueAtTime(0.001, t + beepDuration)
        osc.start(t)
        osc.stop(t + beepDuration)
      }
    }, totalDuration, sampleRate)
    if (uri) wavCache[sound] = uri
    return uri
  }

  return null
}

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
  note?: string | null
}

type KdsOrder = {
  id: string
  source: 'WEB' | 'LOCAL' | 'POS'
  number: string
  customer: string
  status: string
  items: KdsItem[]
  total: number
  notes: string | null
  created_at: string
  channel?: 'web' | 'whatsapp' | 'pos'
  customer_phone?: string | null
  orderNumber?: string
  diningOption?: string
  paymentMethod?: string
  tableNumber?: string
}

type FilterSource = 'ALL' | 'WEB' | 'LOCAL' | 'POS'
type ActiveTab = 'cocina' | 'entregados'

// ─── Color de cabecera según tiempo transcurrido ──────────────────────────────

function getHeaderColorByTime(createdAt: string): string {
  const mins = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (mins < 10) return 'bg-green-500'
  if (mins < 20) return 'bg-amber-400'
  return 'bg-red-500'
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
  if (mins < 10) return 'text-green-700'
  if (mins < 20) return 'text-amber-600'
  return 'text-red-600'
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
  onDeliver?: (id: string, source: 'WEB' | 'LOCAL' | 'POS') => void
  onRecover?: (id: string) => void
  isDelivered?: boolean
}) {
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

  const headerBg = isDelivered ? 'bg-gray-400' : getHeaderColorByTime(order.created_at)

  const diningBadge = order.diningOption
    ? {
        label: order.diningOption,
        cls: order.diningOption.toLowerCase().includes('llevar')
          ? 'bg-red-100 text-red-700 border border-red-200'
          : 'bg-green-100 text-green-700 border border-green-200',
      }
    : null

  const orderLabel = getOrderLabel(order)

  const handleHeaderClick = () => {
    if (isDelivered || !onDeliver) return
    clearStruck(order.id)
    onDeliver(order.id, order.source)
  }

  return (
    <div
      className={`relative flex flex-col bg-white rounded-2xl border ${
        allStruck && !isDelivered
          ? 'border-green-400 shadow-[0_0_12px_2px_rgba(74,222,128,0.45)] animate-pulse'
          : 'border-gray-200'
      } shadow-md overflow-hidden`}
    >
      {/* ── Cabecera: click para entregar ── */}
      <div
        className={`${headerBg} px-3 py-2 transition-opacity duration-150 ${
          !isDelivered && onDeliver ? 'cursor-pointer select-none' : ''
        }`}
        onClick={handleHeaderClick}
        title={!isDelivered && onDeliver ? 'Click para entregar' : undefined}
      >
        {/* Fila 1: Mesa/Orden + Tiempo */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white font-black text-2xl leading-none tracking-tight drop-shadow truncate">
              {orderLabel}
            </span>
            {order.source === 'WEB' && order.tableNumber && (
              <span className="text-white/80 font-semibold text-xs truncate hidden sm:inline">
                {order.customer}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-1 text-sm font-mono font-bold shrink-0 ${elapsedColor(order.created_at)} bg-white/40 rounded-lg px-2 py-0.5`}>
            <span>{elapsed(order.created_at)}</span>
            <span className="text-white/70 text-xs font-normal">
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
                ? 'bg-white/30 text-white'
                : order.source === 'POS'
                ? 'bg-white/30 text-white'
                : order.source === 'WEB'
                ? 'bg-white/30 text-white'
                : 'bg-white/30 text-white'
            }`}
          >
            {order.source === 'WEB' && order.channel === 'whatsapp' ? 'WHATSAPP' : order.source}
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/30 text-white">
            {order.number}
          </span>
          {diningBadge && (
            <span className={`text-xl font-bold px-2 py-0.5 rounded-full ${diningBadge.cls}`}>
              {diningBadge.label}
            </span>
          )}
          {order.paymentMethod && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/30 text-white">
              {order.paymentMethod}
            </span>
          )}
        </div>

        {/* Fila 3: Teléfono (solo si existe) */}
        {order.customer_phone && (
          <div className="flex items-center gap-1 mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80 shrink-0">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/>
            </svg>
            <span className="text-xs text-white/90 font-mono">{order.customer_phone}</span>
          </div>
        )}
      </div>

      {/* ── Items ── */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-3 bg-white">
        {allStruck && !isDelivered && (
          <div className="text-center text-green-600 text-xs font-bold animate-pulse">
            Todos listos — click para entregar
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {order.items.map((item, i) => {
            const struck = struckIndices.has(i)
            return (
              <li
                key={i}
                className={`flex items-start gap-2 cursor-pointer select-none transition-all duration-150`}
                onClick={() => toggleStruck(i)}
                title={struck ? 'Click para quitar tachado' : 'Click para tachar'}
              >
                <span className={`text-2xl font-black leading-none w-8 shrink-0 ${struck ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {item.quantity}×
                </span>
                <div className="flex flex-col min-w-0">
                  <span className={`text-xl font-semibold leading-tight ${struck ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {item.name}
                  </span>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <span className={`text-base leading-snug mt-0.5 ${struck ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {item.modifiers.join(' · ')}
                    </span>
                  )}
                  {item.note && (
                    <span className={`text-base font-semibold leading-snug mt-0.5 ${struck ? 'line-through text-gray-400' : 'text-red-600'}`}>
                      💬 {item.note}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {/* Notas */}
        {order.notes && (
          <p className="text-sm text-gray-600 italic border-t border-gray-100 pt-2">
            Nota: {order.notes}
          </p>
        )}
      </div>

      {/* ── Botón Recuperar (solo en tab Entregados) ── */}
      {isDelivered && onRecover && (
        <div className="px-4 pb-4 bg-white">
          <button
            onClick={() => onRecover(order.id)}
            className="w-full py-3 rounded-xl text-base font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200"
          >
            ↩ Recuperar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Reloj en tiempo real ──────────────────────────────────────────────────────

function ClockDisplay() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <>{time}</>
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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold transition-all text-gray-700 shadow-sm"
        title="Tono de notificación"
      >
        <span>{value === 'silent' ? '🔕' : '🔔'}</span>
        <span className="hidden sm:inline text-gray-600">{SOUND_LABELS[value]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 min-w-[160px] overflow-hidden">
          {(Object.keys(SOUND_LABELS) as SoundOption[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s)
                setOpen(false)
              }}
              className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${
                value === s
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {s === 'silent' ? '🔕' : '🔔'} {SOUND_LABELS[s]}
              {value === s && <span className="ml-2 text-teal-500">✓</span>}
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
  const [soundOption, setSoundOption] = useState<SoundOption>('loud')
  const [, setColorTick] = useState(0)
  const dismissedIdsRef = useRef<Set<string>>(new Set())
  const soundOptionRef = useRef<SoundOption>('loud')
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioUnlockedRef = useRef(false)
  const lastSoundTimestampRef = useRef<number>(0)
  const prevCountRef = useRef<number>(0)

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

      if (sound === 'loud') {
        const beepDuration = 0.09
        const beepGap = 0.10
        const numBeeps = 6
        for (let i = 0; i < numBeeps; i++) {
          const t = i * (beepDuration + beepGap)
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'square'
          osc.frequency.setValueAtTime(1100, ctx.currentTime + t)
          gain.gain.setValueAtTime(1.0, ctx.currentTime + t)
          gain.gain.setValueAtTime(1.0, ctx.currentTime + t + beepDuration - 0.005)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + beepDuration)
          osc.start(ctx.currentTime + t)
          osc.stop(ctx.currentTime + t + beepDuration)
        }
      } else if (sound === 'beep') {
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
          gain.gain.setValueAtTime(1.0, ctx.currentTime + t)
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
    if (s !== 'silent') {
      await playSoundWithRef(s)
    }
  }, [playSoundWithRef])

  // ── Sonido de notificación (con anti-duplicado de 3s) ──────────────────────
  const playBeep = useCallback(async () => {
    const now = Date.now()
    if (now - lastSoundTimestampRef.current < 3000) {
      console.log('[cocina] playBeep ignorado (anti-duplicado 3s)')
      return
    }
    lastSoundTimestampRef.current = now
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

      if (prevCountRef.current > 0 && data.length > prevCountRef.current) {
        console.log('[cocina] Polling fallback: pedidos aumentaron de', prevCountRef.current, 'a', data.length)
        await playBeep()
        setLastCount((c) => c + (data.length - prevCountRef.current))
      }
      prevCountRef.current = data.length
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [playBeep])

  useEffect(() => {
    if (!dismissedLoaded) return
    fetchOrders()
    const interval = setInterval(() => fetchOrders(), 5_000)
    return () => clearInterval(interval)
  }, [fetchOrders, dismissedLoaded])

  // ── Interval para actualizar colores de cabecera en tiempo real ───────────
  useEffect(() => {
    const colorInterval = setInterval(() => setColorTick((t) => t + 1), 30_000)
    return () => clearInterval(colorInterval)
  }, [])

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('cocina-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        console.log('[cocina] Realtime INSERT detected:', (payload.new as { id?: string })?.id)
        playBeep()
        fetchOrders()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders, playBeep])

  // ── Marcar como ENTREGADO ──────────────────────────────────────────────────
  const handleDeliver = useCallback(async (id: string, source: 'WEB' | 'LOCAL' | 'POS') => {
    const order = orders.find((o) => o.id === id)
    if (!order) return

    dismissedIdsRef.current.add(id)
    addDismissed(id)
    clearStruck(id)

    const deliveredOrder = { ...order, status: 'delivered' }
    setOrders((prev) => prev.filter((o) => o.id !== id))
    setDeliveredOrders((prev) => [deliveredOrder, ...prev])

    if (source === 'WEB' || source === 'POS') {
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

    const recoveredOrder = { ...order, status: order.source === 'WEB' || order.source === 'POS' ? 'ready' : 'confirmed' }
    setDeliveredOrders((prev) => prev.filter((o) => o.id !== id))
    setOrders((prev) => [...prev, recoveredOrder].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ))

    if (order.source === 'WEB' || order.source === 'POS') {
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
    <div className="min-h-screen bg-gray-100 text-gray-900 flex flex-col select-none">
      {/* ── Barra superior ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-teal-500 shrink-0 shadow-md relative">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-sumak.png"
            alt="Sumak"
            width={80}
            height={32}
            className="h-8 w-auto object-contain brightness-0 invert"
          />
          <div>
            <h1 className="text-xl font-black leading-none text-white">COCINA</h1>
            <p className="text-teal-100 text-xs">
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

        {/* Reloj central grande */}
        <div className="absolute left-1/2 -translate-x-1/2 text-white font-black text-4xl tabular-nums tracking-wider drop-shadow-lg">
          <ClockDisplay />
        </div>

        <div className="flex items-center gap-2 text-xs text-teal-100">
          {lastCount > 0 && (
            <span
              className="bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-bold cursor-pointer"
              onClick={() => setLastCount(0)}
            >
              +{lastCount} nuevos
            </span>
          )}
          <SoundSelector value={soundOption} onChange={handleSoundChange} />
          <span className="hidden sm:inline text-teal-100">Actualiza cada 5s</span>
          <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
        </div>
      </header>

      {/* ── Tabs principales + Filtro de origen ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0 gap-3 shadow-sm">
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('cocina')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'cocina'
                ? 'bg-teal-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            En cocina
            {orders.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab === 'cocina' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('entregados')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'entregados'
                ? 'bg-teal-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Entregados
            {deliveredOrders.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab === 'entregados' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>
                {deliveredOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Filtro origen + Refrescar */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['ALL', 'WEB', 'LOCAL', 'POS'] as FilterSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                className={`px-3 py-1 rounded-lg text-sm font-bold transition-all ${
                  filterSource === s
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-800'
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
            className={`px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold transition-all text-gray-700 shadow-sm ${refreshing ? 'opacity-60' : ''}`}
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
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
              <span className="text-6xl">🍽️</span>
              <p className="text-xl font-semibold text-gray-500">Sin pedidos activos</p>
              <p className="text-sm text-gray-400">Los nuevos pedidos aparecen automáticamente</p>
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
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
              <span className="text-6xl">✅</span>
              <p className="text-xl font-semibold text-gray-500">Sin pedidos entregados aún</p>
              <p className="text-sm text-gray-400">Los pedidos marcados como entregados aparecen aquí</p>
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
