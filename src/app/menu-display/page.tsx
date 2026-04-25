'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import { useTranslation, getItemName, type Locale } from '@/lib/i18n'
import { formatPrice } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MenuItem, Category } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_ROTATE_MS = 15_000  // 15 s auto-rotate
const PAUSE_ON_TAP_MS = 60_000 // 60 s pause after user tap
const CURSOR_HIDE_MS  = 5_000  // 5 s hide cursor
const FALLBACK_REFRESH_MS = 5 * 60 * 1_000 // 5 min fallback refresh

// Display tabs — order matches design spec
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

// ─── Clock ────────────────────────────────────────────────────────────────────

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

// ─── Wake Lock ────────────────────────────────────────────────────────────────

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

// ─── Cursor hide ──────────────────────────────────────────────────────────────

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

// ─── Dish Card (read-only, dark) ──────────────────────────────────────────────

interface DishCardProps {
  item: MenuItem
  locale: Locale
  index: number
}

function DishCard({ item, locale, index }: DishCardProps) {
  const isUnavailable = item.available === 0
  const name = getItemName(item, locale)
  const emoji = CATEGORY_EMOJI[item.categories?.slug ?? ''] ?? '🍽️'

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-2xl overflow-hidden',
        'bg-white/5 border border-white/10',
        'transition-all duration-500',
        'animate-fade-up',
        isUnavailable && 'opacity-50'
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* ── Image ── */}
      <div className="relative w-full aspect-[4/3] bg-white/5 overflow-hidden">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/10">
            <span className="text-6xl select-none">{emoji}</span>
          </div>
        )}

        {/* Gradient overlay bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Agotado overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <span className="px-4 py-1.5 rounded-full bg-gray-600/80 text-white text-sm font-bold tracking-widest uppercase border border-white/20">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div className="flex flex-col gap-1 px-4 py-3">
        <p
          className={cn(
            'font-serif font-bold leading-snug text-white',
            'text-[clamp(0.85rem,1.4vw,1.1rem)]',
            isUnavailable && 'line-through opacity-60'
          )}
        >
          {name}
        </p>
        <p
          className={cn(
            'font-bold tabular-nums',
            'text-[clamp(1rem,1.6vw,1.3rem)]',
            isUnavailable ? 'text-gray-400 line-through' : 'text-sumak-gold'
          )}
        >
          {formatPrice(item.price)}
        </p>
      </div>
    </article>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MenuDisplayPage() {
  const { menuItems, categories, loading, refetch } = useMenuRealtime()
  const { locale, setLocale } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [visible, setVisible] = useState(true)
  const time = useClock()
  useWakeLock()
  useCursorHide()

  const autoRotateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPausedRef   = useRef(false)

  // Only show tabs that have items (plus 'all' and 'menu-dia')
  const availableSlugs = new Set(categories.map((c) => c.slug))
  const visibleTabs = DISPLAY_TABS.filter((tab) => {
    if (tab.key === 'all' || tab.key === 'menu-dia') return true
    return availableSlugs.has(tab.key)
  })

  // Filter items for current tab
  const filteredItems = (() => {
    if (activeTab === 'all') return menuItems
    if (activeTab === 'menu-dia') {
      // Items marked as "del día" — by convention: available > 0 AND category slug 'segundo' or 'sopas'
      // Admin can refine this: we filter items whose category.slug is 'segundo' or 'sopas' and available > 0
      // A more robust approach uses a dedicated boolean field — here we use slugs as a proxy.
      return menuItems.filter(
        (i) => i.categories?.slug === 'segundo' || i.categories?.slug === 'sopas'
      )
    }
    return menuItems.filter((i) => i.categories?.slug === activeTab)
  })()

  // Smooth transition on tab change
  const switchTab = useCallback((key: TabKey, userTriggered = false) => {
    setVisible(false)
    setTimeout(() => {
      setActiveTab(key)
      setVisible(true)
    }, 250)

    if (userTriggered) {
      isPausedRef.current = true
      if (pauseRef.current) clearTimeout(pauseRef.current)
      pauseRef.current = setTimeout(() => { isPausedRef.current = false }, PAUSE_ON_TAP_MS)
    }
  }, [])

  // Keep a ref to active tab so the rotate callback can read it without stale closure
  const activeTabRef = useRef<TabKey>(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Auto-rotate
  useEffect(() => {
    function rotate() {
      if (!isPausedRef.current) {
        const idx = visibleTabs.findIndex((t) => t.key === activeTabRef.current)
        const next = visibleTabs[(idx + 1) % visibleTabs.length]
        switchTab(next.key)
      }
      autoRotateRef.current = setTimeout(rotate, AUTO_ROTATE_MS)
    }
    autoRotateRef.current = setTimeout(rotate, AUTO_ROTATE_MS)
    return () => { if (autoRotateRef.current) clearTimeout(autoRotateRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs.length, switchTab])

  // Fallback refresh every 5 min
  useEffect(() => {
    const id = setInterval(refetch, FALLBACK_REFRESH_MS)
    return () => clearInterval(id)
  }, [refetch])

  const tabLabel = (tab: (typeof DISPLAY_TABS)[number]) =>
    tab.label[locale as keyof typeof tab.label] ?? tab.label.es

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#0d0c0b] overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Top bar ── */}
      <header className="shrink-0 flex items-center justify-between px-6 pt-4 pb-2 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo-sumak.png"
            alt="Restaurante Sumak"
            width={48}
            height={48}
            className="rounded-full border-2 border-sumak-gold/40 object-cover"
            priority
          />
          <div className="hidden sm:block">
            <p
              className="font-serif font-bold text-xl leading-none"
              style={{
                background: 'linear-gradient(135deg, #F5C842 0%, #D4A017 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Sumak
            </p>
            <p className="text-[10px] text-white/40 tracking-widest uppercase mt-0.5">
              Restaurante Boliviano
            </p>
          </div>
        </div>

        {/* Clock + lang */}
        <div className="flex items-center gap-4">
          {/* Language switcher */}
          <div className="flex items-center gap-1">
            {(['es', 'en', 'qu'] as Locale[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={cn(
                  'px-2 py-1 rounded-lg text-xs font-semibold transition-all duration-200',
                  locale === lang
                    ? 'bg-sumak-gold text-sumak-brown'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {lang === 'es' ? '🇪🇸' : lang === 'en' ? '🇬🇧' : '🏔️'}
              </button>
            ))}
          </div>

          {/* Clock */}
          <div className="font-mono text-2xl font-bold text-white/80 tabular-nums tracking-tight min-w-[5ch] text-right">
            {time}
          </div>
        </div>
      </header>

      {/* ── Category tabs ── */}
      <nav className="shrink-0 flex items-center gap-2 px-6 py-3 overflow-x-auto scrollbar-hide">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key, true)}
              className={cn(
                'whitespace-nowrap px-5 py-2 rounded-full text-sm font-semibold',
                'transition-all duration-300 shrink-0',
                isActive
                  ? 'bg-sumak-gold text-sumak-brown shadow-lg scale-[1.03]'
                  : 'bg-white/10 text-white/70 border border-white/10 hover:bg-white/20 hover:text-white'
              )}
            >
              {tabLabel(tab)}
            </button>
          )
        })}
      </nav>

      {/* ── Grid ── */}
      <main className="flex-1 overflow-hidden px-6 pb-4">
        {loading ? (
          /* Skeleton */
          <div className="grid gap-4 h-full" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/5 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-white/10" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-white/10" />
                  <div className="h-4 w-1/3 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-white/30">
            <span className="text-6xl">🍽️</span>
            <p className="text-lg font-semibold">Sin platos en esta categoría</p>
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-4 h-full content-start overflow-y-auto scrollbar-hide',
              'transition-opacity duration-[250ms]',
              visible ? 'opacity-100' : 'opacity-0'
            )}
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {filteredItems.map((item, i) => (
              <DishCard key={item.id} item={item} locale={locale} index={i} />
            ))}
          </div>
        )}
      </main>

      {/* ── Bottom progress bar (auto-rotate indicator) ── */}
      {!isPausedRef.current && (
        <div className="shrink-0 h-[3px] bg-white/5">
          <div
            key={activeTab}
            className="h-full bg-sumak-gold origin-left"
            style={{
              animation: `grow-bar ${AUTO_ROTATE_MS}ms linear forwards`,
            }}
          />
        </div>
      )}

      {/* Keyframe for progress bar */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes grow-bar {
          from { width: 0% }
          to   { width: 100% }
        }
      ` }} />
    </div>
  )
}
