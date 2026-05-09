'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { useLanguagesEnabled } from '@/hooks/useLanguagesEnabled'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MenuItem } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CURSOR_HIDE_MS      = 5_000
const FALLBACK_REFRESH_MS = 15 * 1_000  // Refresh every 15s to pick up admin changes
const MAX_VISIBLE         = 96   // 6 × 16 grid — scrollable

// ─── Category Icons ───────────────────────────────────────────────────────────

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
  currentQty: number | null
  onChangeImage: () => void
  onDeleteRequest: () => void
  onConfirmDelete: () => void
  onCancel: () => void
  onSetStock: (qty: number | null) => Promise<void>
  deleting: boolean
  uploading: boolean
}

const STOCK_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Agotado', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: 'Sin límite', value: null },
]

function CardModal({
  itemName,
  step,
  currentQty,
  onChangeImage,
  onDeleteRequest,
  onConfirmDelete,
  onCancel,
  onSetStock,
  deleting,
  uploading,
}: CardModalProps) {
  const [savingStock, setSavingStock] = useState<number | 'null' | null>(null)

  const handleStock = async (value: number | null) => {
    const key = value === null ? 'null' : value
    setSavingStock(key)
    try {
      await onSetStock(value)
    } finally {
      setSavingStock(null)
    }
  }

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
            {/* Stock selector */}
            <div className="w-full">
              <p
                className="text-white/50 text-center mb-1.5"
                style={{ fontSize: 'clamp(0.55rem, 0.9vw, 0.75rem)' }}
              >
                Stock disponible
              </p>
              <div className="flex gap-1 w-full">
                {STOCK_OPTIONS.map((opt) => {
                  const isActive = currentQty === opt.value
                  const key = opt.value === null ? 'null' : opt.value
                  const isSaving = savingStock === key
                  const isAgotado = opt.value === 0
                  return (
                    <button
                      key={key}
                      onClick={() => handleStock(opt.value)}
                      disabled={!!savingStock}
                      className="flex-1 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-60"
                      style={{
                        background: isActive
                          ? isAgotado
                            ? '#b91c1c'
                            : opt.value === null
                            ? '#16a34a'
                            : '#d97706'
                          : isAgotado
                          ? 'rgba(185,28,28,0.35)'
                          : 'rgba(255,255,255,0.1)',
                        color: isActive ? '#fff' : isAgotado ? 'rgba(255,180,180,0.9)' : 'rgba(255,255,255,0.6)',
                        fontSize: 'clamp(0.5rem, 0.8vw, 0.7rem)',
                        padding: '7px 3px',
                        outline: isActive ? '2px solid rgba(255,255,255,0.35)' : 'none',
                      }}
                    >
                      {isSaving ? '…' : opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Remove from grid button */}
            <button
              onClick={onDeleteRequest}
              className="w-full rounded-lg font-bold text-white transition-all active:scale-95"
              style={{
                background: '#dc2626',
                fontSize: 'clamp(0.65rem, 1.1vw, 0.85rem)',
                padding: '8px 6px',
              }}
            >
              🗑️ Quitar de grilla
            </button>

            {/* Cancel */}
            <button
              onClick={onCancel}
              className="w-full rounded-lg font-bold text-white/70 transition-all active:scale-95"
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
              ¿Quitar de la grilla?
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
  const isUnavailable = item.available === 0 || item.available_qty === 0
  const name = getItemName(item, locale)
  const emoji = CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'

  const [modalStep, setModalStep] = useState<ModalStep | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Local optimistic stock state so highlight updates immediately
  const [localQty, setLocalQty] = useState<number | null>(item.available_qty ?? null)

  const handleCancel = () => {
    setModalStep(null)
  }

  const handleDeleteRequest = () => {
    setModalStep('confirm-delete')
  }

  const handleSetStock = async (qty: number | null) => {
    setLocalQty(qty)
    try {
      await fetch('/api/menu-display/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, available_qty: qty }),
      })
    } catch {
      // silent fail — optimistic update already applied
    }
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/menu-display/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id: item.id, display_order: 0 }] }),
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
          <span className="px-3 py-1 rounded-full bg-red-600/90 text-white text-sm font-bold tracking-wide uppercase border-2 border-white/40 shadow-lg">
            AGOTADO
          </span>
        </div>
      )}

      {/* Últimos X disponibles badge */}
      {!isUnavailable && localQty !== null && localQty > 0 && (
        <div className="absolute top-1 right-1">
          <span className="px-2 py-1 rounded-lg bg-orange-500/90 text-white text-xs font-bold shadow-lg border border-orange-300/50">
            Últimos {localQty}
          </span>
        </div>
      )}

      {/* Action modal */}
      {modalStep && (
        <CardModal
          itemName={name}
          step={modalStep}
          currentQty={localQty}
          onChangeImage={handleChangeImage}
          onDeleteRequest={handleDeleteRequest}
          onConfirmDelete={handleConfirmDelete}
          onCancel={handleCancel}
          onSetStock={handleSetStock}
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
  const { languagesEnabled } = useLanguagesEnabled()
  const [activeTab, setActiveTab]   = useState<string>('all')
  const [visible, setVisible]       = useState(true)
  const [assigningPosition, setAssigningPosition] = useState<number | null>(null)
  const time = useClock()
  useWakeLock()
  useCursorHide()

  // Force locale to 'es' when languages are disabled
  useEffect(() => {
    if (!languagesEnabled && locale !== 'es') setLocale('es')
  }, [languagesEnabled, locale, setLocale])

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

  // Filter items for current tab — show only positioned items (display_order > 0), cap at MAX_VISIBLE
  const filteredItems = (() => {
    const positioned = menuItems.filter((i) => (i.display_order ?? 0) > 0)
    if (activeTab === 'all') return positioned.slice(0, MAX_VISIBLE)
    const cat = categories.find((c) => c.slug === activeTab)
    if (!cat) return []
    return positioned.filter((i) => i.category_id === cat.id).slice(0, MAX_VISIBLE)
  })()

  // Tab switch with fade transition
  const switchTab = useCallback((key: string) => {
    setVisible(false)
    setTimeout(() => {
      setActiveTab(key)
      setVisible(true)
    }, 200)
  }, [])

  // Fallback refresh every 15s (Supabase Realtime fallback)
  useEffect(() => {
    const id = setInterval(refetch, FALLBACK_REFRESH_MS)
    return () => clearInterval(id)
  }, [refetch])

  // Helper: get category display name per locale
  const getCatLabel = (cat: { name: string; name_en?: string | null; name_qu?: string | null }) => {
    if (locale === 'en' && cat.name_en) return cat.name_en
    if (locale === 'qu' && cat.name_qu) return cat.name_qu
    return cat.name
  }

  const todosLabel = locale === 'en' ? 'All' : locale === 'qu' ? 'Llipin' : 'Todos'

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
          {/* Todos tab */}
          <button
            onClick={() => switchTab('all')}
            className={`flex items-center gap-1 whitespace-nowrap px-3 py-1 rounded-pill text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'all'
                ? 'bg-sumak-gold text-sumak-brown'
                : 'bg-white/20 text-sumak-gold/80 hover:bg-white/30'
            }`}
          >
            {todosLabel}
          </button>
          {/* Dynamic category tabs from DB */}
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => switchTab(cat.slug)}
              className={`flex items-center gap-1 whitespace-nowrap px-3 py-1 rounded-pill text-xs font-semibold transition-all shrink-0 ${
                activeTab === cat.slug
                  ? 'bg-sumak-gold text-sumak-brown'
                  : 'bg-white/20 text-sumak-gold/80 hover:bg-white/30'
              }`}
            >
              <span className="text-sm leading-none">{CATEGORY_EMOJI[cat.slug] ?? '🍴'}</span>
              {getCatLabel(cat)}
            </button>
          ))}
        </nav>

        {/* Right: language switcher + clock */}
        <div className="flex items-center gap-2 shrink-0">
          {languagesEnabled && (
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
          )}
          <div className="font-mono text-lg font-bold text-white/80 tabular-nums tracking-tight min-w-[4.5ch] text-right">
            {time}
          </div>
        </div>
      </header>

      {/* ── 6 × 16 grid — scrollable ── */}
      <main
        className={cn(
          'flex-1 min-h-0 p-1 transition-opacity duration-200 overflow-y-auto',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gridTemplateRows: 'repeat(4, calc(25% - 5px))',
          gridAutoRows: 'calc(25% - 5px)',
          gap: '4px',
        }}
      >
        {loading ? (
          <SkeletonGrid />
        ) : (
          <>
            {Array.from({ length: MAX_VISIBLE }).map((_, gridIndex) => {
              const position = gridIndex + 1 // positions 1-96
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
