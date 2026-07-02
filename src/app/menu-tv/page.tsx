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

// ─── Motion Detection (no ML needed, fast!) ──────────────────────────────────
function useMotionSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  const [status, setStatus] = useState<'loading' | 'active' | 'error'>('loading')
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let rafId: number
    const W = 160
    const H = 120

    async function init() {
      // 1. Get camera
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

      // 2. Video + Canvas (hidden processing)
      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.muted = true
      // Preview chiquito
      video.style.cssText = 'position:fixed;bottom:10px;right:10px;width:120px;height:90px;border-radius:8px;border:2px solid rgba(255,255,255,0.3);z-index:100;opacity:0.5;transform:scaleX(-1);'
      document.body.appendChild(video)
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      let prevFrame: Uint8ClampedArray | null = null
      let cooldown = false

      setStatus('active')
      setDebugInfo('✅ Cámara activa — mové la mano ← →')

      function processFrame() {
        if (stopped) return
        rafId = requestAnimationFrame(processFrame)

        if (video.readyState < 2) return

        // Draw current frame
        ctx.drawImage(video, 0, 0, W, H)
        const frame = ctx.getImageData(0, 0, W, H)
        const pixels = frame.data

        if (!prevFrame || cooldown) {
          prevFrame = new Uint8ClampedArray(pixels)
          return
        }

        // Compare frames: calculate motion center-of-mass on X axis
        // Split frame into left half and right half
        let leftMotion = 0
        let rightMotion = 0
        let totalMotion = 0
        const midX = W / 2
        const threshold = 40 // pixel brightness change threshold

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4
            const diff =
              Math.abs(pixels[i] - prevFrame[i]) +
              Math.abs(pixels[i + 1] - prevFrame[i + 1]) +
              Math.abs(pixels[i + 2] - prevFrame[i + 2])

            if (diff > threshold) {
              totalMotion++
              if (x < midX) {
                leftMotion++
              } else {
                rightMotion++
              }
            }
          }
        }

        prevFrame = new Uint8ClampedArray(pixels)

        // Need minimum total motion (at least 3% of pixels changed)
        const motionPercent = (totalMotion / (W * H)) * 100
        if (motionPercent < 3) return

        // Detect directional swipe: one side should have significantly more motion
        const total = leftMotion + rightMotion
        if (total === 0) return

        const leftRatio = leftMotion / total
        const rightRatio = rightMotion / total
        const imbalance = Math.abs(leftRatio - rightRatio)

        // Need at least 30% imbalance to count as directional swipe
        if (imbalance > 0.3 && motionPercent > 5) {
          // Camera is mirrored: left in camera = right in reality
          const dir = leftRatio > rightRatio ? 'right' : 'left'

          cooldown = true
          setSwipeDirection(dir)
          setDebugInfo(`👉 Swipe ${dir === 'right' ? '→' : '←'} (${motionPercent.toFixed(0)}% movimiento)`)
          onSwipe(dir)

          setTimeout(() => {
            cooldown = false
            setSwipeDirection(null)
            setDebugInfo('✅ Cámara activa — mové la mano ← →')
          }, 1000)
        }
      }

      processFrame()

      return () => {
        stopped = true
        cancelAnimationFrame(rafId)
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

  const { status, swipeDirection, debugInfo } = useMotionSwipe(handleSwipe)

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
