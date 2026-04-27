'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CURSOR_HIDE_MS      = 5_000
const FALLBACK_REFRESH_MS = 15 * 1_000  // Refresh every 15s to pick up admin changes
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

// ─── Assign Dish Modal ────────────────────────────────────────────────────────

interface UnassignedItem {
  id: string
  name: string
  name_en?: string | null
  name_qu?: string | null
  price: number
  image_url?: string | null
  categories?: { name: string; slug: string } | null
}

interface AssignModalProps {
  position: number
  onAssign: (itemId: string) => Promise<void>
  onClose: () => void
}

function AssignModal({ position, onAssign, onClose }: AssignModalProps) {
  const [items, setItems] = useState<UnassignedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/menu-display/unassigned')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setItems(data.items ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  const handleSelect = async (id: string) => {
    setAssigning(id)
    try {
      await onAssign(id)
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#1a1917',
          border: '1px solid rgba(255,255,255,0.12)',
          width: 'min(92vw, 480px)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 shrink-0">
          <p className="text-white font-bold text-base mb-1">
            Agregar plato — celda {position}
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plato..."
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-white/30 text-sm">
              Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-white/30 text-sm">
              Sin platos disponibles
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                disabled={!!assigning}
                onClick={() => handleSelect(item.id)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 text-left transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: assigning === item.id ? 'rgba(245,200,66,0.15)' : 'rgba(255,255,255,0.05)' }}
              >
                {/* Thumbnail */}
                <div
                  className="shrink-0 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center"
                  style={{ width: 40, height: 40 }}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-lg">{CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'}</span>
                  )}
                </div>

                {/* Name + price */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold leading-tight truncate">{item.name}</p>
                  {item.categories?.name && (
                    <p className="text-white/40 text-xs leading-tight truncate">{item.categories.name}</p>
                  )}
                </div>
                <p className="shrink-0 text-[#F5C842] text-sm font-bold tabular-nums">
                  {formatPrice(item.price)}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Cancel button */}
        <div className="px-3 pb-4 pt-1 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 font-bold text-white/70 transition-all active:scale-95"
            style={{ background: '#3f3f46', fontSize: '0.9rem' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
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

// ─── Dish Card ────────────────────────────────────────────────────────────────

interface DishCardProps {
  item: MenuItem
  locale: Locale
}

function DishCard({ item, locale }: DishCardProps) {
  const isUnavailable = item.available === 0
  const name = getItemName(item, locale)
  const emoji = CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'

  const [modalStep, setModalStep] = useState<ModalStep | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [uploading, setUploading] = useState(false)

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

  const handleClick = () => {
    if (!modalStep) setModalStep('menu')
  }

  return (
    <article
      data-item-id={item.id}
      className={cn(
        'relative w-full h-full rounded-lg overflow-hidden cursor-pointer',
        'transition-all duration-300',
        isUnavailable && !deleted && 'opacity-50',
        deleted && 'opacity-0 scale-95 pointer-events-none',
      )}
      onClick={handleClick}
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
            isUnavailable && 'line-through opacity-70'
          )}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {name}
        </p>
        <p
          className={cn(
            'font-bold tabular-nums leading-tight',
            'text-[clamp(0.8rem,1.4vw,1.1rem)]',
            isUnavailable ? 'text-gray-300 line-through' : 'text-[#F5C842]'
          )}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {formatPrice(item.price)}
        </p>
      </div>

      {/* Agotado badge */}
      {isUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="px-2 py-0.5 rounded-full bg-gray-700/80 text-white text-[0.6rem] font-bold tracking-widest uppercase border border-white/20">
            Agotado
          </span>
        </div>
      )}

      {/* Action modal */}
      {modalStep && (
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
  const [assigningPosition, setAssigningPosition] = useState<number | null>(null)
  const time = useClock()
  useWakeLock()
  useCursorHide()

  const handleEmptyCellClick = (position: number) => {
    setAssigningPosition(position)
  }

  const handleAssign = async (itemId: string) => {
    if (assigningPosition === null) return
    await fetch('/api/menu-display/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ id: itemId, display_order: assigningPosition }] }),
    })
    setAssigningPosition(null)
    refetch()
  }

  const handleAssignClose = () => {
    setAssigningPosition(null)
  }

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

  const tabLabel = (tab: (typeof DISPLAY_TABS)[number]) =>
    tab.label[locale as keyof typeof tab.label] ?? tab.label.es

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

        {/* Right: language switcher + clock */}
        <div className="flex items-center gap-2 shrink-0">
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
            {Array.from({ length: MAX_VISIBLE }).map((_, gridIndex) => {
              const position = gridIndex + 1 // positions 1-24
              const item = filteredItems.find((i) => i.display_order === position)
              if (item) {
                return (
                  <DishCard
                    key={item.id}
                    item={item}
                    locale={locale}
                  />
                )
              }
              return (
                <button
                  key={`empty-${gridIndex}`}
                  onClick={() => handleEmptyCellClick(position)}
                  className="w-full h-full rounded-lg bg-black/20 transition-all duration-150 hover:bg-white/5 active:bg-white/10 flex items-center justify-center group"
                  aria-label={`Agregar plato en celda ${position}`}
                >
                  <span className="text-white/10 text-2xl group-hover:text-white/25 transition-colors duration-150 select-none">+</span>
                </button>
              )
            })}
          </>
        )}
      </main>

      {/* ── Assign dish modal (portal-like fixed overlay) ── */}
      {assigningPosition !== null && (
        <AssignModal
          position={assigningPosition}
          onAssign={handleAssign}
          onClose={handleAssignClose}
        />
      )}
    </div>
  )
}
