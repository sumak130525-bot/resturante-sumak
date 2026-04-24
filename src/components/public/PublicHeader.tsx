'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ShoppingBag, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation, type Locale } from '@/lib/i18n'

interface PublicHeaderProps {
  cartCount: number
  onCartOpen: () => void
  isLive: boolean
}

const LOCALES: { code: Locale; flag: string; label: string }[] = [
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'qu', flag: '🏔️', label: 'QU' },
]

export function PublicHeader({ cartCount, onCartOpen, isLive }: PublicHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [prevCount, setPrevCount] = useState(cartCount)
  const [badgePop, setBadgePop] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  const { locale, setLocale, t } = useTranslation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Animate badge when count increases
  useEffect(() => {
    if (cartCount > prevCount) {
      setBadgePop(true)
      const ti = setTimeout(() => setBadgePop(false), 500)
      setPrevCount(cartCount)
      return () => clearTimeout(ti)
    }
    setPrevCount(cartCount)
  }, [cartCount, prevCount])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentLocale = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-500',
        scrolled
          ? 'glass-dark shadow-premium border-b border-sumak-gold/10'
          : 'bg-sumak-brown'
      )}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="h-16 md:h-20 flex items-center justify-between">

          {/* ── Logo ── */}
          <a href="/" className="flex items-center group">
            <Image
              src="/logo-sumak.png"
              alt="Restaurante Sumak"
              width={160}
              height={50}
              className="h-10 md:h-12 w-auto object-contain transition-opacity duration-300 group-hover:opacity-85"
              priority
            />
          </a>

          {/* ── Right controls ── */}
          <div className="flex items-center gap-3">
            {/* Live dot */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/60 font-medium">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  isLive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                )}
              />
              <span>{isLive ? t('menuLive') : t('menuConnecting')}</span>
            </div>

            {/* ── Language selector ── */}
            <div ref={langRef} className="relative">
              <button
                onClick={() => setLangOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-semibold',
                  'text-white/80 hover:text-white',
                  'bg-white/10 hover:bg-white/20',
                  'px-2.5 py-1.5 rounded-lg',
                  'transition-all duration-200'
                )}
                aria-label="Change language"
              >
                <span>{currentLocale.flag}</span>
                <span>{currentLocale.label}</span>
                <ChevronDown
                  size={11}
                  className={cn('transition-transform duration-200', langOpen && 'rotate-180')}
                />
              </button>

              {/* Dropdown */}
              {langOpen && (
                <div className="absolute right-0 mt-1.5 w-32 rounded-xl overflow-hidden shadow-premium bg-sumak-brown border border-sumak-gold/20 animate-fade-up z-50">
                  {LOCALES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLocale(l.code); setLangOpen(false) }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-left',
                        'transition-colors duration-150',
                        locale === l.code
                          ? 'bg-sumak-gold/20 text-sumak-gold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <span className="text-base leading-none">{l.flag}</span>
                      <span>
                        {l.code === 'es' ? 'Español' : l.code === 'en' ? 'English' : 'Runasimi'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart button */}
            <button
              onClick={onCartOpen}
              className={cn(
                'relative flex items-center gap-2.5 font-semibold text-sm',
                'bg-sumak-red hover:bg-sumak-red-dark text-white',
                'px-4 py-2.5 rounded-pill',
                'transition-all duration-300 ease-smooth',
                'hover:scale-105 hover:shadow-red-glow active:scale-95',
                cartCount > 0 && 'pr-5'
              )}
              aria-label={`${t('myOrder')}, ${cartCount}`}
            >
              <ShoppingBag size={17} className="shrink-0" />
              <span className="hidden sm:inline">{t('myOrder')}</span>

              {/* Count badge */}
              {cartCount > 0 && (
                <span
                  className={cn(
                    'absolute -top-2 -right-2',
                    'w-5 h-5 rounded-full',
                    'bg-sumak-gold text-sumak-brown text-[10px] font-black',
                    'flex items-center justify-center',
                    'animate-pulse-ring shadow-gold-glow/60',
                    badgePop && 'animate-badge-pop'
                  )}
                >
                  {cartCount}
                </span>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Andean accent line at bottom */}
      <div className="andean-border-thin opacity-60" />
    </header>
  )
}
