'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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

// ─── Assign Modal ─────────────────────────────────────────────────────────────

interface AssignModalProps {
  availableItems: MenuItem[]
  locale: Locale
  assigning: boolean
  onSelect: (item: MenuItem) => void
  onCancel: () => void
}

function AssignModal({ availableItems, locale, assigning, onSelect, onCancel }: AssignModalProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return availableItems
    return availableItems.filter((item) => {
      const name = getItemName(item, locale).toLowerCase()
      const cat = (item.categories?.name ?? '').toLowerCase()
      return name.includes(q) || cat.includes(q)
    })
  }, [availableItems, search, locale])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)' }}
      onClick={onCancel}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#1a1917',
          border: '1px solid rgba(255,255,255,0.14)',
          width: 'min(480px, 90vw)',
          maxHeight: '75vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-white font-bold text-base">Agregar plato</p>
          <button
            onClick={onCancel}
            className="text-white/50 hover:text-white text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-white/10">
          <input
            autoFocus
            type="text"
            placeholder="Buscar plato o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-[#F5C842]/50"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-white/30 text-sm">
              Sin resultados
            </div>
          ) : (
            filtered.map((item) => {
              const name = getItemName(item, locale)
              const catName = item.categories?.name ?? item.categories?.slug ?? ''
              return (
                <button
                  key={item.id}
                  onClick={() => !assigning && onSelect(item)}
                  disabled={assigning}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/8 active:bg-white/12 disabled:opacity-50 border-b border-white/5"
                  style={{ minHeight: '56px' }}
                >
                  {/* Thumb */}
                  <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden bg-white/5 flex items-center justify-center">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg">{CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'}</span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{name}</p>
                    <p className="text-white/40 text-xs truncate">{catName}</p>
                  </div>

                  {/* Price */}
                  <p className="shrink-0 text-[#F5C842] font-bold text-sm tabular-nums">
                    {formatPrice(item.price)}
                  </p>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <button
            onClick={onCancel}
            className="w-full rounded-lg py-2 text-sm font-bold text-white/70 transition-all active:scale-95"
            style={{ background: '#3f3f46' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Empty Cell ───────────────────────────────────────────────────────────────

interface EmptyCellProps {
  onClick: () => void
  reorderMode?: boolean
}

function EmptyCell({ onClick, reorderMode }: EmptyCellProps) {
  if (reorderMode) {
    return (
      <div
        className="w-full h-full rounded-lg"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      />
    )
  }
  return (
    <button
      onClick={onClick}
      className="w-full h-full rounded-lg flex items-center justify-center transition-all duration-200 group hover:scale-[1.03] active:scale-95"
      style={{
        border: '2px dashed rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <span
        className="text-white/25 group-hover:text-white/50 transition-colors duration-200 select-none"
        style={{ fontSize: 'clamp(1.2rem, 2.5vw, 2rem)', lineHeight: 1 }}
      >
        +
      </span>
    </button>
  )
}

// ─── Dish Card ────────────────────────────────────────────────────────────────

interface DishCardProps {
  item: MenuItem
  locale: Locale
  // Reorder mode props
  reorderMode?: boolean
  isSelected?: boolean
  position?: number
  onReorderSelect?: (id: string) => void
}

function DishCard({ item, locale, reorderMode, isSelected, position, onReorderSelect }: DishCardProps) {
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
    // Trigger hidden file input
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
      // Image update propagates via Realtime subscription
      setModalStep(null)
    } catch {
      // silent fail — UI will recover on Realtime push
    } finally {
      setUploading(false)
      // Reset so same file can be selected again if needed
      e.target.value = ''
    }
  }

  return (
    <article
      className={cn(
        'relative w-full h-full rounded-lg overflow-hidden cursor-pointer',
        'transition-all duration-300',
        isUnavailable && !deleted && !reorderMode && 'opacity-50',
        deleted && 'opacity-0 scale-95 pointer-events-none',
        reorderMode && isSelected && 'ring-4 ring-[#F5C842] ring-offset-2 ring-offset-[#0d0c0b]',
        reorderMode && !isSelected && 'opacity-80 hover:opacity-100',
      )}
      onClick={handleCardClick}
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
      {reorderMode && position !== undefined && (
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
      {reorderMode && isSelected && (
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
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)

  // ── Assign modal state ──
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningSlot, setAssigningSlot]     = useState<number | null>(null) // target display_order slot
  const [assigning, setAssigning]             = useState(false)

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

  // Items NOT in the current tab — candidates for the assign modal
  const assignableCategoryId = useMemo(() => {
    // For non-virtual tabs we need the actual category id to assign to
    if (activeTab === 'all' || activeTab === 'menu-dia') return null
    return categories.find((c) => c.slug === activeTab)?.id ?? null
  }, [activeTab, categories])

  const itemsNotInTab = useMemo(() => {
    if (!assignableCategoryId) return []
    return menuItems.filter((i) => i.category_id !== assignableCategoryId)
  }, [menuItems, assignableCategoryId])

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

  // Toggle reorder mode — deselect on exit
  const toggleReorderMode = () => {
    setReorderMode((prev) => !prev)
    setSelectedId(null)
  }

  // Handle card tap in reorder mode
  const handleReorderSelect = useCallback(async (tappedId: string) => {
    if (saving) return

    // First tap: select
    if (selectedId === null) {
      setSelectedId(tappedId)
      return
    }

    // Tap same card again: deselect
    if (selectedId === tappedId) {
      setSelectedId(null)
      return
    }

    // Second tap on a different card: swap display_order
    const itemA = filteredItems.find((i) => i.id === selectedId)
    const itemB = filteredItems.find((i) => i.id === tappedId)
    if (!itemA || !itemB) {
      setSelectedId(null)
      return
    }

    // Derive effective positions: use 1-based index as fallback if display_order is 0/null
    const posA = itemA.display_order && itemA.display_order > 0
      ? itemA.display_order
      : filteredItems.indexOf(itemA) + 1
    const posB = itemB.display_order && itemB.display_order > 0
      ? itemB.display_order
      : filteredItems.indexOf(itemB) + 1

    setSaving(true)
    setSelectedId(null)
    try {
      await fetch('/api/menu-display/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            { id: itemA.id, display_order: posB },
            { id: itemB.id, display_order: posA },
          ],
        }),
      })
      // Refetch so the grid reflects the new order
      await refetch()
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }, [selectedId, filteredItems, saving, refetch])

  // Open assign modal for an empty slot
  const handleEmptyCellClick = useCallback((slotIndex: number) => {
    if (activeTab === 'all' || activeTab === 'menu-dia') return // virtual tabs — no assign
    setAssigningSlot(slotIndex + 1) // 1-based display_order
    setAssignModalOpen(true)
  }, [activeTab])

  // Assign a dish to the current tab
  const handleAssignItem = useCallback(async (item: MenuItem) => {
    if (!assignableCategoryId || assigning) return
    setAssigning(true)
    try {
      await fetch('/api/menu-display/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          category_id: assignableCategoryId,
          display_order: assigningSlot ?? filteredItems.length + 1,
        }),
      })
      setAssignModalOpen(false)
      await refetch()
    } catch {
      // silent fail — Realtime will reconcile
    } finally {
      setAssigning(false)
    }
  }, [assignableCategoryId, assigning, assigningSlot, filteredItems.length, refetch])

  const tabLabel = (tab: (typeof DISPLAY_TABS)[number]) =>
    tab.label[locale as keyof typeof tab.label] ?? tab.label.es

  // Build padded cell list: actual items + empty slots up to MAX_VISIBLE
  const emptyCellCount = Math.max(0, MAX_VISIBLE - filteredItems.length)
  const isVirtualTab = activeTab === 'all' || activeTab === 'menu-dia'

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
          <span className="text-[#F5C842]">
            {selectedId
              ? 'Toca otro plato para intercambiar posiciones'
              : 'Toca un plato para seleccionarlo'}
          </span>
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
          // Span all cells for empty state on virtual tabs
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
                isSelected={selectedId === item.id}
                position={index + 1}
                onReorderSelect={handleReorderSelect}
              />
            ))}
            {Array.from({ length: emptyCellCount }).map((_, i) => (
              <EmptyCell
                key={`empty-${i}`}
                reorderMode={reorderMode}
                onClick={() => handleEmptyCellClick(filteredItems.length + i)}
              />
            ))}
          </>
        )}
      </main>

      {/* ── Assign modal ── */}
      {assignModalOpen && (
        <AssignModal
          availableItems={itemsNotInTab}
          locale={locale}
          assigning={assigning}
          onSelect={handleAssignItem}
          onCancel={() => setAssignModalOpen(false)}
        />
      )}
    </div>
  )
}
