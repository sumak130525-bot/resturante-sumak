'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CURSOR_HIDE_MS      = 5_000
const FALLBACK_REFRESH_MS = 5 * 60 * 1_000
const MAX_VISIBLE         = 24   // 6 × 4 grid — no scroll on TV

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const DISPLAY_TABS = [
  { key: 'menu-dia',    label: { es: 'Menú del Día',  en: 'Daily Menu',   qu: "P'unchaw Mikhuna" } },
  { key: 'all',         label: { es: 'Menú Completo', en: 'Full Menu',    qu: 'Lliw Mikhuna'     } },
  { key: 'desayunos',   label: { es: 'Desayunos',     en: 'Breakfasts',   qu: 'Inti Llaqsimuy'   } },
  { key: 'sopas',       label: { es: 'Sopas',         en: 'Soups',        qu: 'Lawakuna'          } },
  { key: 'segundo',     label: { es: 'Segundos',      en: 'Main Dishes',  qu: 'Qhipa Mikhuna'     } },
  { key: 'bebidas',     label: { es: 'Bebidas',       en: 'Drinks',       qu: 'Upyay'             } },
  { key: 'postres',     label: { es: 'Postres',       en: 'Desserts',     qu: 'Mishki'            } },
  { key: 'para-llevar', label: { es: 'Para Llevar',   en: 'Take Away',    qu: 'Apakuy'            } },
] as const

type TabKey = (typeof DISPLAY_TABS)[number]['key']

const CATEGORY_EMOJI: Record<string, string> = {
  sopas: '🍲',
  segundo: '🍽️',
  desayunos: '🌅',
  bebidas: '🥤',
  postres: '🍮',
  'para-llevar': '🛍️',
  empanadas: '🥟',
  'platos-principales': '🍽️',
  acompanamientos: '🥗',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [])
  return time
}

function useWakeLock() {
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          // @ts-ignore
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch { /* unsupported */ }
    }
    acquire()
    const handleVis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', handleVis)
    return () => {
      document.removeEventListener('visibilitychange', handleVis)
      wakeLock?.release().catch(() => {})
    }
  }, [])
}

function useCursorHide() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function show() {
      document.body.style.cursor = 'default'
      clearTimeout(timer)
      timer = setTimeout(() => { document.body.style.cursor = 'none' }, CURSOR_HIDE_MS)
    }
    document.addEventListener('mousemove', show)
    show()
    return () => {
      document.removeEventListener('mousemove', show)
      clearTimeout(timer)
      document.body.style.cursor = 'default'
    }
  }, [])
}

// ─── Card Action Modal ────────────────────────────────────────────────────────

type ModalStep = 'menu' | 'confirm-delete'

interface CardModalProps {
  itemName: string
  step: ModalStep
  onChangeImage: () => void
  onDeleteRequest: () => void
  onConfirmDelete: () => void
  onCancel: () => void
  deleting: boolean
  uploading: boolean
}

function CardModal({
  itemName,
  step,
  onChangeImage,
  onDeleteRequest,
  onConfirmDelete,
  onCancel,
  deleting,
  uploading,
}: CardModalProps) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex flex-col items-center gap-3 rounded-xl px-4 py-4 mx-2"
        style={{
          background: '#1a1917',
          border: '1px solid rgba(255,255,255,0.12)',
          minWidth: '130px',
          maxWidth: '90%',
        }}
      >
        <p
          className="text-white font-bold text-center leading-tight"
          style={{ fontSize: 'clamp(0.7rem, 1.2vw, 0.95rem)' }}
        >
          {itemName}
        </p>

        {step === 'menu' ? (
          <>
            {/* Change image button */}
            <button
              onClick={onChangeImage}
              disabled={uploading}
              className="w-full rounded-lg font-bold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: '#2563eb',
                fontSize: 'clamp(0.65rem, 1.1vw, 0.85rem)',
                padding: '8px 6px',
              }}
            >
              {uploading ? '⏳ Subiendo...' : '📷 Cambiar imagen'}
            </button>

            {/* Delete button */}
            <button
              onClick={onDeleteRequest}
              disabled={uploading}
              className="w-full rounded-lg font-bold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: '#dc2626',
                fontSize: 'clamp(0.65rem, 1.1vw, 0.85rem)',
                padding: '8px 6px',
              }}
            >
              🗑️ Eliminar
            </button>

            {/* Cancel */}
            <button
              onClick={onCancel}
              disabled={uploading}
              className="w-full rounded-lg font-bold text-white/70 transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: '#3f3f46',
                fontSize: 'clamp(0.65rem, 1.1vw, 0.85rem)',
                padding: '8px 6px',
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <p
              className="text-white/70 text-center"
              style={{ fontSize: 'clamp(0.6rem, 1vw, 0.8rem)' }}
            >
              ¿Eliminar este plato?
            </p>
            <div className="flex gap-2 w-full">
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="flex-1 rounded-lg font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: '#dc2626',
                  fontSize: 'clamp(0.6rem, 1vw, 0.8rem)',
                  padding: '8px 4px',
                }}
              >
                {deleting ? '...' : 'Confirmar'}
              </button>
              <button
                onClick={onCancel}
                disabled={deleting}
                className="flex-1 rounded-lg font-bold text-white/80 transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: '#3f3f46',
                  fontSize: 'clamp(0.6rem, 1vw, 0.8rem)',
                  padding: '8px 4px',
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Drag ghost ───────────────────────────────────────────────────────────────

interface DragGhostProps {
  item: MenuItem
  locale: Locale
  x: number
  y: number
}

function DragGhost({ item, locale, x, y }: DragGhostProps) {
  const name = getItemName(item, locale)
  const emoji = CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'
  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-lg overflow-hidden shadow-2xl"
      style={{
        width: 120,
        height: 90,
        left: x - 60,
        top: y - 45,
        opacity: 0.85,
        transform: 'scale(1.08)',
        transition: 'none',
      }}
    >
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt={name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/10">
          <span className="text-3xl select-none">{emoji}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1">
        <p className="text-white font-bold text-[0.65rem] leading-tight truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {name}
        </p>
      </div>
      <div className="absolute inset-0 ring-2 ring-[#F5C842] rounded-lg" />
    </div>
  )
}

// ─── Dish Card ────────────────────────────────────────────────────────────────

interface DishCardProps {
  item: MenuItem
  locale: Locale
  // Reorder mode props
  reorderMode?: boolean
  isDragging?: boolean
  isSelected?: boolean
  position?: number
  onReorderSelect?: (id: string) => void
  onDragStart?: (id: string, e: React.TouchEvent | React.MouseEvent) => void
}

function DishCard({ item, locale, reorderMode, isDragging, isSelected, position, onReorderSelect, onDragStart }: DishCardProps) {
  const isUnavailable = item.available === 0
  const name = getItemName(item, locale)
  const emoji = CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'

  const [modalStep, setModalStep] = useState<ModalStep | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleCardClick = () => {
    if (reorderMode) {
      onReorderSelect?.(item.id)
      return
    }
    if (!modalStep) setModalStep('menu')
  }

  const handleCancel = () => {
    setModalStep(null)
  }

  const handleDeleteRequest = () => {
    setModalStep('confirm-delete')
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/menu-display/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (res.ok) {
        setDeleted(true)
        setModalStep(null)
      }
    } catch {
      // silent fail — Realtime will reconcile
    } finally {
      setDeleting(false)
    }
  }

  const handleChangeImage = () => {
    const input = document.getElementById(`file-input-${item.id}`) as HTMLInputElement | null
    input?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('id', item.id)
      formData.append('image', file)

      await fetch('/api/menu-display/update-image', {
        method: 'POST',
        body: formData,
      })
      setModalStep(null)
    } catch {
      // silent fail — UI will recover on Realtime push
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
    if (reorderMode && onDragStart) {
      onDragStart(item.id, e)
    }
  }

  return (
    <article
      data-item-id={item.id}
      className={cn(
        'relative w-full h-full rounded-lg overflow-hidden cursor-pointer',
        'transition-all duration-300',
        isUnavailable && !deleted && !reorderMode && 'opacity-50',
        deleted && 'opacity-0 scale-95 pointer-events-none',
        reorderMode && isDragging && 'opacity-30',
        reorderMode && isSelected && !isDragging && 'ring-4 ring-[#F5C842] ring-offset-2 ring-offset-[#0d0c0b]',
        reorderMode && !isSelected && !isDragging && 'opacity-80 hover:opacity-100',
      )}
      onClick={handleCardClick}
      onTouchStart={reorderMode ? handlePointerDown : undefined}
      onMouseDown={reorderMode ? handlePointerDown : undefined}
    >
      {/* Hidden file input for camera/gallery */}
      <input
        id={`file-input-${item.id}`}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Full-bleed image */}
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5">
          <span className="text-5xl select-none">{emoji}</span>
        </div>
      )}

      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Name + price overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5">
        <p
          className={cn(
            'font-bold leading-tight text-white drop-shadow-sm',
            'text-[clamp(0.75rem,1.3vw,1.05rem)]',
            isUnavailable && !reorderMode && 'line-through opacity-70'
          )}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {name}
        </p>
        <p
          className={cn(
            'font-bold tabular-nums leading-tight',
            'text-[clamp(0.8rem,1.4vw,1.1rem)]',
            isUnavailable && !reorderMode ? 'text-gray-300 line-through' : 'text-[#F5C842]'
          )}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {formatPrice(item.price)}
        </p>
      </div>

      {/* Agotado badge — hidden in reorder mode to avoid clutter */}
      {isUnavailable && !reorderMode && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="px-2 py-0.5 rounded-full bg-gray-700/80 text-white text-[0.6rem] font-bold tracking-widest uppercase border border-white/20">
            Agotado
          </span>
        </div>
      )}

      {/* Reorder mode: position badge */}
      {reorderMode && position !== undefined && !isDragging && (
        <div
          className={cn(
            'absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs',
            isSelected
              ? 'bg-[#F5C842] text-[#3B2000]'
              : 'bg-black/70 text-white/80 border border-white/20'
          )}
        >
          {position}
        </div>
      )}

      {/* Reorder mode: selected overlay */}
      {reorderMode && isSelected && !isDragging && (
        <div className="absolute inset-0 bg-[#F5C842]/10 pointer-events-none" />
      )}

      {/* Action modal — disabled in reorder mode */}
      {!reorderMode && modalStep && (
        <CardModal
          itemName={name}
          step={modalStep}
          onChangeImage={handleChangeImage}
          onDeleteRequest={handleDeleteRequest}
          onConfirmDelete={handleConfirmDelete}
          onCancel={handleCancel}
          deleting={deleting}
          uploading={uploading}
        />
      )}
    </article>
  )
}

// ─── Skeleton grid ────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <>
      {Array.from({ length: MAX_VISIBLE }).map((_, i) => (
        <div key={i} className="w-full h-full rounded-lg bg-white/5 animate-pulse" />
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MenuDisplayPage() {
  const { menuItems, categories, loading, refetch } = useMenuRealtime()
  const { locale, setLocale } = useTranslation()
  const [activeTab, setActiveTab]   = useState<TabKey>('all')
  const [visible, setVisible]       = useState(true)
  const time = useClock()
  useWakeLock()
  useCursorHide()

  // ── Reorder mode state ──
  const [reorderMode, setReorderMode] = useState(false)
  const [saving, setSaving]           = useState(false)

  // ── Drag state ──
  const [draggingId, setDraggingId]   = useState<string | null>(null)
  const [ghostPos, setGhostPos]       = useState<{ x: number; y: number } | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  // tap-tap fallback for touch (when no drag movement detected)
  const [selectedId, setSelectedId]   = useState<string | null>(null)

  const dragRef = useRef<{
    startX: number
    startY: number
    moved: boolean
    itemId: string
  } | null>(null)

  // Only show tabs that have items (plus always-visible ones)
  const availableSlugs = new Set(categories.map((c) => c.slug))
  const visibleTabs = DISPLAY_TABS.filter((tab) => {
    if (tab.key === 'all' || tab.key === 'menu-dia') return true
    return availableSlugs.has(tab.key)
  })

  // Filter items for current tab — cap at MAX_VISIBLE (TV has no scroll)
  const filteredItems = (() => {
    let items: typeof menuItems
    if (activeTab === 'all') {
      items = menuItems
    } else if (activeTab === 'menu-dia') {
      items = menuItems.filter(
        (i) => i.categories?.slug === 'segundo' || i.categories?.slug === 'sopas'
      )
    } else {
      items = menuItems.filter((i) => i.categories?.slug === activeTab)
    }
    return items.slice(0, MAX_VISIBLE)
  })()

  // Tab switch with fade transition — manual only, no auto-rotate
  const switchTab = useCallback((key: TabKey) => {
    setVisible(false)
    setTimeout(() => {
      setActiveTab(key)
      setVisible(true)
    }, 200)
  }, [])

  // Fallback refresh every 5 min (Supabase Realtime fallback)
  useEffect(() => {
    const id = setInterval(refetch, FALLBACK_REFRESH_MS)
    return () => clearInterval(id)
  }, [refetch])

  // Toggle reorder mode — reset drag/select state
  const toggleReorderMode = () => {
    setReorderMode((prev) => !prev)
    setSelectedId(null)
    setDraggingId(null)
    setGhostPos(null)
    setDropTargetIndex(null)
  }

  // ── Drag & Drop helpers ──

  // Given a point (clientX, clientY), find which grid cell index (0-based, 0..23) is under it
  function getCellIndexAtPoint(x: number, y: number): { kind: 'item'; id: string } | { kind: 'empty'; index: number } | null {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    // Walk up to find data-item-id or data-empty-index
    let cur: Element | null = el
    while (cur) {
      const itemId = (cur as HTMLElement).dataset?.itemId
      if (itemId) return { kind: 'item', id: itemId }
      const emptyIdx = (cur as HTMLElement).dataset?.emptyIndex
      if (emptyIdx !== undefined) return { kind: 'empty', index: parseInt(emptyIdx, 10) }
      cur = cur.parentElement
    }
    return null
  }

  const commitDrop = useCallback(async (draggedId: string, target: ReturnType<typeof getCellIndexAtPoint>) => {
    if (!target || saving) return
    setSaving(true)
    setDraggingId(null)
    setGhostPos(null)
    setDropTargetIndex(null)
    dragRef.current = null

    try {
      const draggedItem = filteredItems.find((i) => i.id === draggedId)
      if (!draggedItem) return

      const posA = draggedItem.display_order && draggedItem.display_order > 0
        ? draggedItem.display_order
        : filteredItems.indexOf(draggedItem) + 1

      if (target.kind === 'item' && target.id !== draggedId) {
        // Swap with another item
        const targetItem = filteredItems.find((i) => i.id === target.id)
        if (!targetItem) return
        const posB = targetItem.display_order && targetItem.display_order > 0
          ? targetItem.display_order
          : filteredItems.indexOf(targetItem) + 1

        await fetch('/api/menu-display/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [
              { id: draggedItem.id, display_order: posB },
              { id: targetItem.id, display_order: posA },
            ],
          }),
        })
      } else if (target.kind === 'empty') {
        // Move to empty slot
        const newOrder = filteredItems.length + target.index + 1
        await fetch('/api/menu-display/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [{ id: draggedItem.id, display_order: newOrder }],
          }),
        })
      }

      await refetch()
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }, [filteredItems, saving, refetch])

  // ── Drag start ──
  const handleDragStart = useCallback((itemId: string, e: React.TouchEvent | React.MouseEvent) => {
    if (saving) return
    const isTouchEvent = 'touches' in e
    const clientX = isTouchEvent ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = isTouchEvent ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY

    dragRef.current = { startX: clientX, startY: clientY, moved: false, itemId }
    // Don't start ghost immediately — wait for movement to distinguish tap from drag
  }, [saving])

  // ── Global move / up handlers (attached once, removed on cleanup) ──
  useEffect(() => {
    if (!reorderMode) return

    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current) return
      const t = e.touches[0]
      const dx = Math.abs(t.clientX - dragRef.current.startX)
      const dy = Math.abs(t.clientY - dragRef.current.startY)
      if (!dragRef.current.moved && (dx > 8 || dy > 8)) {
        dragRef.current.moved = true
        setDraggingId(dragRef.current.itemId)
        setSelectedId(null)
      }
      if (dragRef.current.moved) {
        e.preventDefault()
        setGhostPos({ x: t.clientX, y: t.clientY })
        const target = getCellIndexAtPoint(t.clientX, t.clientY)
        if (target && target.kind === 'empty') setDropTargetIndex(target.index)
        else if (target && target.kind === 'item' && target.id !== dragRef.current.itemId) setDropTargetIndex(null)
        else setDropTargetIndex(null)
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return
      const dx = Math.abs(e.clientX - dragRef.current.startX)
      const dy = Math.abs(e.clientY - dragRef.current.startY)
      if (!dragRef.current.moved && (dx > 8 || dy > 8)) {
        dragRef.current.moved = true
        setDraggingId(dragRef.current.itemId)
        setSelectedId(null)
      }
      if (dragRef.current.moved) {
        setGhostPos({ x: e.clientX, y: e.clientY })
        const target = getCellIndexAtPoint(e.clientX, e.clientY)
        if (target && target.kind === 'empty') setDropTargetIndex(target.index)
        else setDropTargetIndex(null)
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!dragRef.current) return
      const { moved, itemId } = dragRef.current
      if (moved) {
        const t = e.changedTouches[0]
        const target = getCellIndexAtPoint(t.clientX, t.clientY)
        commitDrop(itemId, target)
      } else {
        // It was a tap — use tap-tap logic
        dragRef.current = null
        setDraggingId(null)
        setGhostPos(null)
        setDropTargetIndex(null)
        setSelectedId((prev) => {
          if (prev === null) return itemId
          if (prev === itemId) return null
          // second tap on different item: handled below
          return prev
        })
        // Handle second tap swap (async, needs selectedId at time of tap)
        setSelectedId((prev) => {
          if (prev !== null && prev !== itemId) {
            // trigger swap
            const itemA = filteredItems.find((i) => i.id === prev)
            const itemB = filteredItems.find((i) => i.id === itemId)
            if (itemA && itemB && !saving) {
              const posA = itemA.display_order && itemA.display_order > 0 ? itemA.display_order : filteredItems.indexOf(itemA) + 1
              const posB = itemB.display_order && itemB.display_order > 0 ? itemB.display_order : filteredItems.indexOf(itemB) + 1
              setSaving(true)
              fetch('/api/menu-display/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: [{ id: itemA.id, display_order: posB }, { id: itemB.id, display_order: posA }] }),
              }).then(() => refetch()).catch(() => {}).finally(() => setSaving(false))
            }
            return null
          }
          return prev
        })
      }
    }

    function onMouseUp(e: MouseEvent) {
      if (!dragRef.current) return
      const { moved, itemId } = dragRef.current
      if (moved) {
        const target = getCellIndexAtPoint(e.clientX, e.clientY)
        commitDrop(itemId, target)
      } else {
        dragRef.current = null
        setDraggingId(null)
        setGhostPos(null)
        setDropTargetIndex(null)
      }
    }

    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [reorderMode, commitDrop, filteredItems, saving, refetch])

  // Tap-tap: handle empty cell tap when a card is selected
  const handleEmptyCellTap = useCallback(async (emptyIndex: number) => {
    if (!reorderMode || !selectedId || saving) return
    const item = filteredItems.find((i) => i.id === selectedId)
    if (!item) return
    setSelectedId(null)
    setSaving(true)
    try {
      const newOrder = filteredItems.length + emptyIndex + 1
      await fetch('/api/menu-display/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id: item.id, display_order: newOrder }] }),
      })
      await refetch()
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }, [reorderMode, selectedId, filteredItems, saving, refetch])

  const tabLabel = (tab: (typeof DISPLAY_TABS)[number]) =>
    tab.label[locale as keyof typeof tab.label] ?? tab.label.es

  const emptyCellCount = Math.max(0, MAX_VISIBLE - filteredItems.length)
  const isVirtualTab = activeTab === 'all' || activeTab === 'menu-dia'

  const draggingItem = draggingId ? filteredItems.find((i) => i.id === draggingId) ?? null : null

  const hintText = draggingId
    ? 'Suelta para mover el plato'
    : selectedId
      ? 'Toca otro plato para intercambiar, o un espacio vacío para mover'
      : 'Arrastra un plato o tócalo para seleccionarlo'

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#0d0c0b] overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Header: single compact row ── */}
      <header className="shrink-0 flex items-center gap-3 px-3 py-1.5 min-h-0">
        {/* Left: logo + brand */}
        <div className="flex items-center gap-2 shrink-0">
          <Image
            src="/logo-sumak.png"
            alt="Sumak"
            width={36}
            height={36}
            className="rounded-full border border-[#F5C842]/40 object-cover"
            priority
          />
          <span
            className="font-serif font-bold text-base leading-none"
            style={{
              background: 'linear-gradient(135deg, #F5C842 0%, #D4A017 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Sumak
          </span>
        </div>

        {/* Center: category tabs */}
        <nav className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                className={cn(
                  'whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold shrink-0',
                  'transition-all duration-200',
                  isActive
                    ? 'bg-[#F5C842] text-[#3B2000] shadow-md'
                    : 'bg-white/10 text-white/60 border border-white/10 hover:bg-white/20 hover:text-white'
                )}
              >
                {tabLabel(tab)}
              </button>
            )
          })}
        </nav>

        {/* Right: reorder toggle + language switcher + clock */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Reorder mode toggle */}
          <button
            onClick={toggleReorderMode}
            disabled={saving}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200 disabled:opacity-50',
              reorderMode
                ? 'bg-[#F5C842] text-[#3B2000] shadow-md'
                : 'bg-white/10 text-white/60 border border-white/10 hover:bg-white/20 hover:text-white'
            )}
          >
            {saving ? '...' : 'Ordenar'}
          </button>

          <div className="flex items-center gap-0.5">
            {(['es', 'en', 'qu'] as Locale[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase transition-all duration-200',
                  locale === lang
                    ? 'bg-[#F5C842] text-[#3B2000]'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {lang}
              </button>
            ))}
          </div>
          <div className="font-mono text-lg font-bold text-white/80 tabular-nums tracking-tight min-w-[4.5ch] text-right">
            {time}
          </div>
        </div>
      </header>

      {/* Reorder mode hint bar */}
      {reorderMode && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1 text-xs font-semibold"
          style={{ background: 'rgba(245,200,66,0.12)', borderBottom: '1px solid rgba(245,200,66,0.2)' }}>
          <span className="text-[#F5C842]">{hintText}</span>
        </div>
      )}

      {/* ── 6 × 4 grid — fills all remaining height ── */}
      <main
        className={cn(
          'flex-1 min-h-0 p-1 transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          gap: '4px',
        }}
      >
        {loading ? (
          <SkeletonGrid />
        ) : filteredItems.length === 0 && isVirtualTab ? (
          <div
            className="flex flex-col items-center justify-center gap-3 text-white/30"
            style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }}
          >
            <span className="text-6xl">🍽️</span>
            <p className="text-lg font-semibold">Sin platos en esta categoría</p>
          </div>
        ) : (
          <>
            {filteredItems.map((item, index) => (
              <DishCard
                key={item.id}
                item={item}
                locale={locale}
                reorderMode={reorderMode}
                isDragging={draggingId === item.id}
                isSelected={selectedId === item.id}
                position={index + 1}
                onReorderSelect={(id) => {
                  // tap-tap: only fires when not dragging
                  if (draggingId) return
                  setSelectedId((prev) => {
                    if (prev === null) return id
                    if (prev === id) return null
                    // swap
                    const itemA = filteredItems.find((i) => i.id === prev)
                    const itemB = filteredItems.find((i) => i.id === id)
                    if (itemA && itemB && !saving) {
                      const posA = itemA.display_order && itemA.display_order > 0 ? itemA.display_order : filteredItems.indexOf(itemA) + 1
                      const posB = itemB.display_order && itemB.display_order > 0 ? itemB.display_order : filteredItems.indexOf(itemB) + 1
                      setSaving(true)
                      fetch('/api/menu-display/reorder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ updates: [{ id: itemA.id, display_order: posB }, { id: itemB.id, display_order: posA }] }),
                      }).then(() => refetch()).catch(() => {}).finally(() => setSaving(false))
                    }
                    return null
                  })
                }}
                onDragStart={handleDragStart}
              />
            ))}
            {Array.from({ length: emptyCellCount }).map((_, i) => (
              <div
                key={`empty-${i}`}
                data-empty-index={i}
                className={cn(
                  'w-full h-full rounded-lg transition-all duration-200',
                  reorderMode
                    ? cn(
                        'cursor-pointer',
                        dropTargetIndex === i
                          ? 'ring-2 ring-[#F5C842] bg-[#F5C842]/10'
                          : selectedId
                            ? 'border border-dashed border-white/20 bg-white/[0.04]'
                            : 'bg-black/20'
                      )
                    : 'bg-black/20'
                )}
                onClick={() => handleEmptyCellTap(i)}
              />
            ))}
          </>
        )}
      </main>

      {/* ── Drag ghost ── */}
      {draggingItem && ghostPos && (
        <DragGhost item={draggingItem} locale={locale} x={ghostPos.x} y={ghostPos.y} />
      )}
    </div>
  )
}
