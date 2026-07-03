'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import type { MenuItem } from '@/lib/types'

// ─── Price format ─────────────────────────────────────────────────────────────
function formatARS(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

const CATEGORY_ICONS: Record<string, string> = {
  sopas: '🍲',
  'platos-principales': '🍽️',
  empanadas: '🥟',
  acompanamientos: '🥗',
  bebidas: '🥤',
}

// ─── Dish Card (read-only) ────────────────────────────────────────────────────
function DishCard({ item }: { item: MenuItem }) {
  const isUnavailable = item.available === 0 || item.available_qty === 0

  return (
    <article
      className={`relative rounded-2xl overflow-hidden select-none ${
        isUnavailable ? 'opacity-40' : ''
      }`}
      style={{ aspectRatio: '1' }}
    >
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
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <span className="text-5xl">🍽️</span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
        <p
          className="font-bold leading-tight text-white text-lg truncate"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}
        >
          {item.name}
        </p>
        <p
          className="font-bold tabular-nums text-xl text-yellow-300"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}
        >
          {formatARS(item.price)}
        </p>
      </div>

      {isUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="px-4 py-1.5 rounded-full bg-red-600 text-white text-base font-bold uppercase border-2 border-white/40">
            AGOTADO
          </span>
        </div>
      )}
    </article>
  )
}

// ─── Swipe indicator ──────────────────────────────────────────────────────────
function SwipeIndicator({ direction }: { direction: 'left' | 'right' }) {
  return (
    <div
      className={`fixed top-1/2 -translate-y-1/2 z-50 pointer-events-none ${
        direction === 'left' ? 'left-4' : 'right-4'
      }`}
    >
      <div className="bg-white/30 backdrop-blur-md rounded-full p-6 animate-pulse">
        <span className="text-white text-6xl font-bold">
          {direction === 'left' ? '‹' : '›'}
        </span>
      </div>
    </div>
  )
}

// ─── Hand Tracking: detect raised arm + lateral swipe ─────────────────────────
function useArmSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  const [status, setStatus] = useState<'loading' | 'active' | 'error'>('loading')
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [debugInfo, setDebugInfo] = useState('Iniciando cámara...')

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let intervalId: ReturnType<typeof setInterval>
    const W = 320
    const H = 240

    async function init() {
      // 1. Camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: W, height: H, facingMode: 'user' },
        })
      } catch {
        setStatus('error')
        setDebugInfo('No se pudo acceder a la cámara')
        return
      }

      if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.muted = true
      video.style.cssText = 'position:fixed;bottom:10px;right:10px;width:120px;height:90px;border-radius:8px;border:2px solid rgba(255,255,255,0.3);z-index:100;opacity:0.5;transform:scaleX(-1);'
      document.body.appendChild(video)
      await video.play()

      if (stopped) { video.remove(); stream.getTracks().forEach(t => t.stop()); return }

      // 2. Load MediaPipe Hands
      setDebugInfo('Cargando detección de manos...')
      try {
        const loadScript = (src: string) =>
          new Promise<void>((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
            const s = document.createElement('script')
            s.src = src
            s.crossOrigin = 'anonymous'
            s.onload = () => resolve()
            s.onerror = () => reject(new Error('Script load failed'))
            document.head.appendChild(s)
          })

        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js')
      } catch {
        setStatus('error')
        setDebugInfo('Error cargando MediaPipe')
        return
      }

      if (stopped) { video.remove(); stream.getTracks().forEach(t => t.stop()); return }

      const mp = (window as any)
      if (!mp.Hands) {
        setStatus('error')
        setDebugInfo('MediaPipe no disponible')
        return
      }

      const hands = new mp.Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
      })

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.4,
      })

      // Track wrist position for swipe
      const wristHistory: { x: number; y: number; t: number }[] = []
      let cooldown = false
      let handDetected = false
      let raisedOpenSince: number | null = null

      hands.onResults((results: any) => {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
          handDetected = false
          raisedOpenSince = null
          wristHistory.length = 0
          setDebugInfo('✋ Levantá la mano abierta para navegar')
          return
        }

        const landmarks = results.multiHandLandmarks[0]
        // 0=wrist, 9=middle_mcp
        // Fingertips: 8=index, 12=middle, 16=ring, 20=pinky
        // PIPs:       6=index, 10=middle, 14=ring, 18=pinky
        const wrist = landmarks[0]
        const middleMcp = landmarks[9]

        // 1) Mano en mitad superior del frame (wrist.y < 0.5)
        const isUpperFrame = wrist.y < 0.5

        // 2) Brazo levantado — umbral aumentado a 0.08
        const isRaised = middleMcp.y < wrist.y - 0.08

        // 3) Mano abierta — al menos 3 de 4 dedos extendidos (punta por encima del PIP)
        const fingerPairs = [[8, 6], [12, 10], [16, 14], [20, 18]]
        const extendedCount = fingerPairs.filter(
          ([tip, pip]) => landmarks[tip].y < landmarks[pip].y
        ).length
        const isOpen = extendedCount >= 3

        if (!isUpperFrame || !isRaised || !isOpen) {
          handDetected = false
          raisedOpenSince = null
          wristHistory.length = 0
          if (!isUpperFrame) {
            setDebugInfo('⬆️ Levantá la mano más arriba')
          } else if (!isRaised) {
            setDebugInfo('☝️ Levantá más el brazo')
          } else {
            setDebugInfo(`✊ Abrí la mano (${extendedCount}/4 dedos)`)
          }
          return
        }

        // 5) Requerir mano levantada+abierta por al menos 300ms antes de aceptar swipe
        const now = Date.now()
        if (raisedOpenSince === null) {
          raisedOpenSince = now
        }
        const readyForSwipe = now - raisedOpenSince >= 300

        handDetected = true
        wristHistory.push({ x: wrist.x, y: wrist.y, t: now })

        // Keep last 600ms
        while (wristHistory.length > 0 && now - wristHistory[0].t > 600) wristHistory.shift()

        if (!readyForSwipe) {
          setDebugInfo(`🖐️ Mano detectada — aguantá... (${Math.round(now - raisedOpenSince)}ms)`)
          return
        }

        setDebugInfo(`🖐️ Mano lista — mové a los lados`)

        if (wristHistory.length < 3 || cooldown) return

        const first = wristHistory[0]
        const last = wristHistory[wristHistory.length - 1]
        const dx = last.x - first.x
        const dy = Math.abs(last.y - first.y)
        const dt = last.t - first.t

        // 4) Swipe: movimiento horizontal > 15%, vertical bajo, en < 600ms
        if (Math.abs(dx) > 0.15 && dy < 0.15 && dt < 600 && dt > 50) {
          // Camera mirrored
          const dir = dx > 0 ? 'left' : 'right'
          cooldown = true
          setSwipeDirection(dir)
          setDebugInfo(`👉 Swipe ${dir === 'right' ? '→' : '←'} detectado`)
          onSwipe(dir)
          wristHistory.length = 0
          raisedOpenSince = null

          setTimeout(() => {
            cooldown = false
            setSwipeDirection(null)
            setDebugInfo('✅ Listo — mové la mano ← →')
          }, 1000)
        }
      })

      await hands.initialize()
      setStatus('active')
      setDebugInfo('✅ Listo — levantá la mano y mové a los lados')

      // Process frame every 150ms (not every frame — saves CPU)
      intervalId = setInterval(async () => {
        if (stopped || video.readyState < 2) return
        try {
          await hands.send({ image: video })
        } catch {}
      }, 150)

      return () => {
        stopped = true
        clearInterval(intervalId)
        try { hands.close() } catch {}
        video.remove()
        stream?.getTracks().forEach(t => t.stop())
      }
    }

    const cleanup = init()

    return () => {
      stopped = true
      cleanup?.then(fn => fn?.())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, swipeDirection, debugInfo }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MenuTVPage() {
  const { menuItems, categories, loading } = useMenuRealtime()
  const [activeCatIdx, setActiveCatIdx] = useState(0)

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      if (categories.length === 0) return
      setActiveCatIdx((prev) => {
        if (direction === 'right') {
          return prev < categories.length - 1 ? prev + 1 : 0
        } else {
          return prev > 0 ? prev - 1 : categories.length - 1
        }
      })
    },
    [categories.length]
  )

  // Ref para que el motion detector siempre tenga el callback actual
  const swipeRef = useRef(handleSwipe)
  swipeRef.current = handleSwipe

  const { status, swipeDirection, debugInfo } = useArmSwipe(
    useCallback((dir: 'left' | 'right') => swipeRef.current(dir), [])
  )

  // Keyboard arrows for testing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleSwipe('right')
      if (e.key === 'ArrowLeft') handleSwipe('left')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSwipe])

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Cargando menú...</div>
      </div>
    )
  }

  const activeCategory = categories[activeCatIdx]
  const categoryItems = activeCategory
    ? menuItems.filter(
        (i) => i.category_id === activeCategory.id && i.available !== 0 && (i.display_order ?? 0) > 0
      )
    : menuItems.filter((i) => i.available !== 0 && (i.display_order ?? 0) > 0)

  return (
    <div className="h-screen w-screen bg-[#1a1a2e] flex flex-col overflow-hidden select-none">
      {/* Header: Category tabs */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 bg-[#16213e] overflow-x-auto">
        {categories.map((cat, idx) => (
          <button
            key={cat.id}
            onClick={() => setActiveCatIdx(idx)}
            className={`flex items-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-full text-base font-bold transition-all shrink-0 ${
              idx === activeCatIdx
                ? 'bg-yellow-400 text-gray-900 scale-105 shadow-lg'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <span className="text-xl">{CATEGORY_ICONS[cat.slug] ?? '🍴'}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Category title */}
      <div className="shrink-0 px-6 pt-4 pb-2">
        <h1 className="text-4xl font-black text-white tracking-tight">
          {activeCategory
            ? `${CATEGORY_ICONS[activeCategory.slug] ?? '🍴'} ${activeCategory.name}`
            : 'Todos'}
        </h1>
      </div>

      {/* Items grid */}
      <main className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {categoryItems.map((item) => (
            <DishCard key={item.id} item={item} />
          ))}
        </div>

        {categoryItems.length === 0 && (
          <div className="flex items-center justify-center h-64 text-white/30 text-xl">
            No hay items en esta categoría
          </div>
        )}
      </main>

      {/* Bottom: dots + status */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#16213e]">
        <div className="flex gap-2">
          {categories.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveCatIdx(idx)}
              className={`w-3 h-3 rounded-full transition-all ${
                idx === activeCatIdx
                  ? 'bg-yellow-400 scale-125'
                  : 'bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-white/50">
          <div
            className={`w-3 h-3 rounded-full ${
              status === 'active' ? 'bg-green-400 animate-pulse'
                : status === 'loading' ? 'bg-yellow-400 animate-pulse'
                : 'bg-red-500'
            }`}
          />
          <span className="text-xs">{debugInfo}</span>
        </div>
      </div>

      {/* Swipe indicators */}
      {swipeDirection === 'left' && <SwipeIndicator direction="left" />}
      {swipeDirection === 'right' && <SwipeIndicator direction="right" />}
    </div>
  )
}
