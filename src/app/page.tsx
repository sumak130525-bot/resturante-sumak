'use client'

import { useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMenuRealtime } from '@/hooks/useMenuRealtime'
import { MenuGrid } from '@/components/public/MenuGrid'
import { CategoryTabs } from '@/components/public/CategoryTabs'
import { CartDrawer } from '@/components/public/CartDrawer'
import { PublicHeader } from '@/components/public/PublicHeader'
import { WhatsAppFAB } from '@/components/public/WhatsAppFAB'
import { WhatsAppBanner } from '@/components/public/WhatsAppBanner'
import { ChevronDown, Utensils, Wifi } from 'lucide-react'
import type { MenuItem, CartItem } from '@/lib/types'
import { cn } from '@/lib/utils'

function HomeContent() {
  const { menuItems, categories, loading } = useMenuRealtime()
  const [activeCategory, setActiveCategory] = useState('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  const searchParams = useSearchParams()
  const mesa = searchParams.get('mesa')

  const totalItems = cart.reduce((s, c) => s + c.quantity, 0)
  const totalPrice = cart.reduce((s, c) => s + c.menu_item.price * c.quantity, 0)

  const handleAdd = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item.id === item.id)
      if (existing) {
        if (existing.quantity >= item.available) return prev
        return prev.map((c) =>
          c.menu_item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [...prev, { menu_item: item, quantity: 1 }]
    })
  }, [])

  const handleRemove = useCallback((itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item.id === itemId)
      if (!existing) return prev
      if (existing.quantity === 1) return prev.filter((c) => c.menu_item.id !== itemId)
      return prev.map((c) =>
        c.menu_item.id === itemId ? { ...c, quantity: c.quantity - 1 } : c
      )
    })
  }, [])

  const handleClear = useCallback(() => setCart([]), [])

  return (
    <>
      <PublicHeader
        cartCount={totalItems}
        onCartOpen={() => setCartOpen(true)}
        isLive={!loading}
      />

      {/* ════════════════════════════════════════
          WHATSAPP BANNER
          ════════════════════════════════════════ */}
      <WhatsAppBanner />

      {/* ════════════════════════════════════════
          MESA BADGE (si viene con ?mesa=N)
          ════════════════════════════════════════ */}
      {mesa && (
        <div className="bg-sumak-gold/20 border-b border-sumak-gold/30 py-2 px-4 text-center text-sm font-semibold text-sumak-brown">
          🪑 Mesa {mesa} — Tu pedido será enviado a tu mesa
        </div>
      )}

      {/* ════════════════════════════════════════
          HERO SECTION
          ════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-hero-gradient min-h-[480px] md:min-h-[560px] flex flex-col">

        {/* Background texture / noise */}
        <div className="absolute inset-0 bg-noise opacity-60" />

        {/* Radial glow center */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle, #D4A017 0%, transparent 70%)' }}
          />
        </div>

        {/* Decorative rotating ring */}
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full border-2 border-sumak-gold/10 animate-spin-slow pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full border border-sumak-gold/8 animate-spin-slow pointer-events-none" style={{ animationDirection: 'reverse', animationDuration: '14s' }} />

        {/* Content */}
        <div className="relative flex-1 flex flex-col items-center justify-center text-center px-4 md:px-8 py-16 md:py-20">
          {/* Eyebrow label */}
          <div className="flex items-center gap-2 mb-6 animate-fade-up" style={{ animationDelay: '0ms' }}>
            <span className="h-px w-8 bg-sumak-gold/60" />
            <p className="text-[11px] font-bold tracking-[0.35em] uppercase text-sumak-gold">
              Auténtica cocina boliviana
            </p>
            <span className="h-px w-8 bg-sumak-gold/60" />
          </div>

          {/* Main headline */}
          <h1
            className="font-serif font-bold text-white text-balance leading-[1.05] mb-5 animate-fade-up"
            style={{ fontSize: 'clamp(2.6rem, 7vw, 5rem)', animationDelay: '80ms' }}
          >
            Bienvenidos a{' '}
            <span
              className="block"
              style={{
                background: 'linear-gradient(135deg, #F5C842 0%, #D4A017 40%, #F5C842 80%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Sumak
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-white/70 max-w-lg leading-relaxed mb-10 text-[1.05rem] text-balance animate-fade-up"
            style={{ animationDelay: '160ms' }}
          >
            Sabores del altiplano, preparados con tradición. Haz tu pedido en línea
            y disfruta lo mejor de la gastronomía boliviana.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3 animate-fade-up" style={{ animationDelay: '240ms' }}>
            <a
              href="#menu"
              className={cn(
                'flex items-center gap-2.5 px-7 py-3.5 rounded-pill font-semibold text-sm',
                'bg-sumak-gold text-sumak-brown',
                'transition-all duration-300 ease-smooth',
                'hover:shadow-gold-glow hover:scale-105 active:scale-95'
              )}
            >
              <Utensils size={16} />
              Ver el menú
            </a>
            <div className="flex items-center gap-2 text-xs text-white/50 font-medium">
              <Wifi size={12} className="text-emerald-400" />
              Cantidades actualizadas en tiempo real
            </div>
          </div>
        </div>

        {/* Andean stripe bottom */}
        <div className="andean-border shrink-0" />

        {/* Scroll hint */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/30 animate-float pointer-events-none">
          <ChevronDown size={18} />
        </div>
      </section>

      {/* ════════════════════════════════════════
          CATEGORY TABS (sticky)
          ════════════════════════════════════════ */}
      <CategoryTabs
        categories={categories}
        active={activeCategory}
        onChange={setActiveCategory}
      />

      {/* ════════════════════════════════════════
          MENU SECTION
          ════════════════════════════════════════ */}
      <main id="menu" className="container mx-auto px-4 md:px-6 py-12 scroll-mt-16">
        {loading ? (
          /* Shimmer skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-card overflow-hidden shadow-card-rest">
                <div className="skeleton h-52" />
                <div className="bg-white p-5 space-y-3">
                  <div className="skeleton h-4 w-3/4 rounded-lg" />
                  <div className="skeleton h-3 w-full rounded-lg" />
                  <div className="skeleton h-3 w-2/3 rounded-lg" />
                  <div className="flex justify-between items-center pt-2">
                    <div className="skeleton h-5 w-20 rounded-lg" />
                    <div className="skeleton h-8 w-24 rounded-pill" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <MenuGrid
            items={menuItems}
            categories={categories}
            activeCategory={activeCategory}
            cart={cart}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        )}
      </main>

      {/* ════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════ */}
      <footer className="bg-sumak-brown text-white mt-16">
        <div className="andean-border opacity-80" />

        <div className="container mx-auto px-4 md:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Brand */}
            <div className="text-center md:text-left">
              <p
                className="font-serif font-bold text-3xl mb-1"
                style={{
                  background: 'linear-gradient(135deg, #F5C842 0%, #D4A017 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Sumak
              </p>
              <p className="text-sm text-white/50">Restaurante Boliviano</p>
            </div>

            {/* Info */}
            <div className="text-center space-y-1">
              <p className="text-sm text-white/60">Auténticos sabores del altiplano</p>
              <div className="flex items-center justify-center gap-2 text-xs text-white/35">
                <Wifi size={11} className="text-emerald-400" />
                <span>Menú y cantidades en tiempo real</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-white/25">
              © {new Date().getFullYear()} Sumak Restaurante Boliviano. Todos los precios en pesos colombianos (COP).
            </p>
          </div>
        </div>
      </footer>

      {/* Cart drawer */}
      <CartDrawer
        cart={cart}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onClear={handleClear}
        mesa={mesa}
      />

      {/* WhatsApp FAB */}
      <WhatsAppFAB cart={cart} total={totalPrice} mesa={mesa} />
    </>
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}
