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

// ─── Swipe indicator arrows ───────────────────────────────────────────────────
function SwipeIndicator({ direction }: { direction: 'left' | 'right' }) {
  return (
    <div
      className={`fixed top-1/2 -translate-y-1/2 z-50 pointer-events-none transition-opacity duration-300 ${
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

// ─── MediaPipe Hand Tracking ──────────────────────────────────────────────────
function useHandSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)

  // Track wrist position over time
  const posHistory = useRef<{ x: number; t: number }[]>([])
  const cooldown = useRef(false)

  const processFrame = useCallback(() => {
    // This is handled by the MediaPipe callback
  }, [])

  useEffect(() => {
    let animId: number
    let hands: any = null
    let camera: any = null

    async function init() {
      try {
        // Load MediaPipe scripts dynamically
        const loadScript = (src: string) =>
          new Promise<void>((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
              resolve()
              return
            }
            const s = document.createElement('script')
            s.src = src
            s.crossOrigin = 'anonymous'
            s.onload = () => resolve()
            s.onerror = reject
            document.head.appendChild(s)
          })

        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js')
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')

        const mp = (window as any)

        // Create video element (hidden)
        const video = document.createElement('video')
        video.style.display = 'none'
        document.body.appendChild(video)
        videoRef.current = video

        // Init MediaPipe Hands
        hands = new mp.Hands({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        })

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0, // Fastest
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
        })

        hands.onResults((results: any) => {
          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            posHistory.current = []
            return
          }

          // Wrist = landmark 0
          const wrist = results.multiHandLandmarks[0][0]
          const now = Date.now()
          posHistory.current.push({ x: wrist.x, t: now })

          // Keep last 500ms of history
          posHistory.current = posHistory.current.filter((p) => now - p.t < 500)

          if (posHistory.current.length < 5 || cooldown.current) return

          const first = posHistory.current[0]
          const last = posHistory.current[posHistory.current.length - 1]
          const dx = last.x - first.x
          const dt = last.t - first.t

          // Swipe threshold: moved > 15% of frame width in < 500ms
          if (Math.abs(dx) > 0.15 && dt < 500) {
            // Camera is mirrored, so dx is inverted
            const dir = dx > 0 ? 'left' : 'right'
            cooldown.current = true
            setSwipeDirection(dir)
            onSwipe(dir)
            posHistory.current = []
            setTimeout(() => {
              cooldown.current = false
              setSwipeDirection(null)
            }, 800)
          }
        })

        // Start camera
        camera = new mp.Camera(video, {
          onFrame: async () => {
            await hands.send({ image: video })
          },
          width: 320,
          height: 240,
        })

        await camera.start()
        setCameraActive(true)
      } catch (err) {
        console.error('[menu-tv] Camera/MediaPipe init error:', err)
      }
    }

    init()

    return () => {
      if (camera) {
        try { camera.stop() } catch {}
      }
      if (hands) {
        try { hands.close() } catch {}
      }
      if (videoRef.current) {
        videoRef.current.remove()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { cameraActive, swipeDirection }
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

  const { cameraActive, swipeDirection } = useHandSwipe(handleSwipe)

  // Also support keyboard arrows for testing
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
    <div className="h-screen w-screen bg-[#1a1a2e] flex flex-col overflow-hidden">
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

        {/* Camera status */}
        <div className="ml-auto shrink-0 flex items-center gap-2 text-sm text-white/50">
          <div
            className={`w-3 h-3 rounded-full ${
              cameraActive ? 'bg-green-400 animate-pulse' : 'bg-red-500'
            }`}
          />
          {cameraActive ? '📷 Gestos activos' : '📷 Sin cámara'}
        </div>
      </div>

      {/* Category title */}
      <div className="shrink-0 px-6 pt-4 pb-2">
        <h1 className="text-4xl font-black text-white tracking-tight">
          {activeCategory
            ? `${CATEGORY_ICONS[activeCategory.slug] ?? '🍴'} ${activeCategory.name}`
            : 'Todos'}
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Mové la mano ← → para cambiar de categoría
        </p>
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

      {/* Navigation dots */}
      <div className="shrink-0 flex justify-center gap-2 py-3 bg-[#16213e]">
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

      {/* Swipe indicators */}
      {swipeDirection === 'left' && <SwipeIndicator direction="left" />}
      {swipeDirection === 'right' && <SwipeIndicator direction="right" />}
    </div>
  )
}
