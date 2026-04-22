'use client'

import { useState, useEffect } from 'react'
import { ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PublicHeaderProps {
  cartCount: number
  onCartOpen: () => void
  isLive: boolean
}

export function PublicHeader({ cartCount, onCartOpen, isLive }: PublicHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [prevCount, setPrevCount] = useState(cartCount)
  const [badgePop, setBadgePop] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Animate badge when count increases
  useEffect(() => {
    if (cartCount > prevCount) {
      setBadgePop(true)
      const t = setTimeout(() => setBadgePop(false), 500)
      setPrevCount(cartCount)
      return () => clearTimeout(t)
    }
    setPrevCount(cartCount)
  }, [cartCount, prevCount])

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
          <a href="/" className="flex items-center gap-3 group">
            {/* Monogram badge */}
            <div className="relative w-10 h-10 shrink-0">
              <div className="absolute inset-0 rounded-xl bg-sumak-gold-gradient rotate-12 opacity-20 group-hover:rotate-0 transition-transform duration-500" />
              <div className="relative w-full h-full rounded-xl bg-gold-gradient flex items-center justify-center shadow-gold-glow/50">
                <span className="font-serif font-bold text-sumak-brown text-lg leading-none">S</span>
              </div>
            </div>

            <div className="leading-none">
              <p className="font-serif font-bold text-xl text-white tracking-wide group-hover:text-sumak-gold transition-colors duration-300">
                Sumak
              </p>
              <p className="text-[10px] font-medium tracking-[0.18em] uppercase text-sumak-gold-light/80">
                Restaurante Boliviano
              </p>
            </div>
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
              <span>{isLive ? 'Menú en vivo' : 'Conectando…'}</span>
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
              aria-label={`Ver pedido, ${cartCount} ítems`}
            >
              <ShoppingBag size={17} className="shrink-0" />
              <span className="hidden sm:inline">Mi pedido</span>

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
