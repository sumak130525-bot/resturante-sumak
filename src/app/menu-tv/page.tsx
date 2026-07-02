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
      <div className="bg-white/20 backdrop-blur-md rounded-full p-4 animate-pulse">
        <span className="text-white text-5xl font-bold">
          {direction === 'left' ? '‹' : '›'}
        </span>
      </div>
    </div>
  )
}

// ─── Hand Tracking with webcam ────────────────────────────────────────────────
function useHandSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  const [status, setStatus] = useState<'loading' | 'active' | 'error' | 'no-camera'>('loading')
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let rafId: number

    async function init() {
      // 1. Get camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
        })
      } catch {
        setStatus('no-camera')
        setDebugInfo('No se pudo acceder a la cámara. Permití el acceso.')
        return
      }

      if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

      // 2. Create hidden video
      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.muted = true
      video.style.position = 'fixed'
      video.style.bottom = '10px'
      video.style.right = '10px'
      video.style.width = '160px'
      video.style.height = '120px'
      video.style.borderRadius = '8px'
      video.style.border = '2px solid rgba(255,255,255,0.3)'
      video.style.zIndex = '100'
      video.style.opacity = '0.6'
      video.style.transform = 'scaleX(-1)'
      document.body.appendChild(video)
      await video.play()

      if (stopped) { video.remove(); stream.getTracks().forEach(t => t.stop()); return }

      // 3. Load MediaPipe Hands
      setDebugInfo('Cargando MediaPipe...')
      try {
        const loadScript = (src: string) =>
          new Promise<void>((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
            const s = document.createElement('script')
            s.src = src
            s.crossOrigin = 'anonymous'
            s.onload = () => resolve()
            s.onerror = () => reject(new Error(`Failed to load ${src}`))
            document.head.appendChild(s)
          })

        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js')
      } catch {
        setStatus('error')
        setDebugInfo('Error cargando MediaPipe. Usá flechas del teclado.')
        return
      }

      if (stopped) { video.remove(); stream.getTracks().forEach(t => t.stop()); return }

      // 4. Init Hands
      const mp = (window as any)
      if (!mp.Hands) {
        setStatus('error')
        setDebugInfo('MediaPipe Hands no disponible')
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

      // Track wrist X position
      const history: { x: number; t: number }[] = []
      let cooldown = false

      hands.onResults((results: any) => {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
          history.length = 0
          setDebugInfo('✋ Mostrá la mano frente a la cámara')
          return
        }

        const wrist = results.multiHandLandmarks[0][0]
        const now = Date.now()
        history.push({ x: wrist.x, t: now })

        // Keep last 400ms
        while (history.length > 0 && now - history[0].t > 400) history.shift()

        setDebugInfo(`🖐️ Mano detectada (x: ${(wrist.x * 100).toFixed(0)}%)`)

        if (history.length < 4 || cooldown) return

        const first = history[0]
        const last = history[history.length - 1]
        const dx = last.x - first.x
        const dt = last.t - first.t

        // Threshold: 12% of screen in under 400ms
        if (Math.abs(dx) > 0.12 && dt < 400) {
          // Camera is mirrored
          const dir = dx > 0 ? 'left' : 'right'
          cooldown = true
          setSwipeDirection(dir)
          onSwipe(dir)
          history.length = 0
          setTimeout(() => {
            cooldown = false
            setSwipeDirection(null)
          }, 700)
        }
      })

      await hands.initialize()
      setStatus('active')
      setDebugInfo('✅ Gestos activos — mové la mano ← →')

      // 5. Process frames
      async function processFrame() {
        if (stopped) return
        if (video.readyState >= 2) {
          try {
            await hands.send({ image: video })
          } catch {}
        }
        rafId = requestAnimationFrame(processFrame)
      }
      processFrame()

      // Cleanup
      return () => {
        stopped = true
        cancelAnimationFrame(rafId)
        hands.close()
        video.remove()
        stream?.getTracks().forEach(t => t.stop())
      }
    }

    const cleanup = init()

    return () => {
      stopped = true
      cancelAnimationFrame(rafId)
      cleanup?.then(fn => fn?.())
      stream?.getTracks().forEach(t => t.stop())
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

  const { status, swipeDirection, debugInfo } = useHandSwipe(handleSwipe)

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
        (i) => i.category_id === activeCategory.id && i.available !== 0
      )
    : menuItems.filter((i) => i.available !== 0)

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
        {/* Navigation dots */}
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

        {/* Camera status */}
        <div className="flex items-center gap-2 text-sm text-white/50">
          <div
            className={`w-3 h-3 rounded-full ${
              status === 'active' ? 'bg-green-400 animate-pulse'
                : status === 'loading' ? 'bg-yellow-400 animate-pulse'
                : 'bg-red-500'
            }`}
          />
          <span className="text-xs">{debugInfo || (status === 'loading' ? 'Iniciando cámara...' : '')}</span>
        </div>
      </div>

      {/* Swipe indicators */}
      {swipeDirection === 'left' && <SwipeIndicator direction="left" />}
      {swipeDirection === 'right' && <SwipeIndicator direction="right" />}
    </div>
  )
}
