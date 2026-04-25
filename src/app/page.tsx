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
import { PushPrompt } from '@/components/public/PushPrompt'
import { useTranslation } from '@/lib/i18n'
import { ChevronDown, Utensils, Wifi, MapPin, Clock } from 'lucide-react'
import Image from 'next/image'
import type { MenuItem, CartItem } from '@/lib/types'
import { cn } from '@/lib/utils'

function HomeContent() {
  const { menuItems, categories, loading } = useMenuRealtime()
  const [activeCategory, setActiveCategory] = useState('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const { t } = useTranslation()

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
      <PushPrompt />
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
          {t('mesaBadge', { mesa })}
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
              {t('authenticCuisine')}
            </p>
            <span className="h-px w-8 bg-sumak-gold/60" />
          </div>

          {/* Main headline */}
          <h1
            className="font-serif font-bold text-white text-balance leading-[1.05] mb-5 animate-fade-up"
            style={{ fontSize: 'clamp(2.6rem, 7vw, 5rem)', animationDelay: '80ms' }}
          >
            {t('welcomeTo')}{' '}
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
            {t('heroSubtitle')}
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
              {t('viewMenu')}
            </a>
            <div className="flex items-center gap-2 text-xs text-white/50 font-medium">
              <Wifi size={12} className="text-emerald-400" />
              {t('realtimeStock')}
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

        <div className="container mx-auto px-4 md:px-6 py-12">
          {/* Main grid: logo + info + social */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6">

            {/* ── Col 1: Brand ── */}
            <div className="flex flex-col items-center md:items-start gap-3">
              <Image
                src="/logo-sumak.png"
                alt="Restaurante Sumak"
                width={72}
                height={72}
                className="rounded-full border-2 border-sumak-gold/40 object-cover"
              />
              <div>
                <p
                  className="font-serif font-bold text-2xl leading-tight"
                  style={{
                    background: 'linear-gradient(135deg, #F5C842 0%, #D4A017 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Sumak
                </p>
                <p className="text-xs text-white/50 mt-0.5">{t('restaurantSubtitle')}</p>
              </div>
              <p className="text-sm text-sumak-gold font-semibold">
                Pedí online o por WhatsApp
              </p>
            </div>

            {/* ── Col 2: Address & Hours ── */}
            <div className="flex flex-col items-center md:items-start gap-4 text-sm text-white/70">
              <div className="flex items-start gap-2">
                <MapPin size={15} className="text-sumak-red-light mt-0.5 shrink-0" />
                <span className="leading-snug">
                  Juan B Alberdi 247, San José<br />
                  Guaymallén, Mendoza, Argentina<br />
                  <span className="text-sumak-gold text-xs">Frente a la Terminal de Mendoza</span>
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Clock size={15} className="text-sumak-gold mt-0.5 shrink-0" />
                <span className="leading-snug">
                  {/* El dueño completará los horarios */}
                  Horarios: próximamente
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/35 mt-1">
                <Wifi size={11} className="text-emerald-400" />
                <span>{t('footerRealtime')}</span>
              </div>
            </div>

            {/* ── Col 3: Social links ── */}
            <div className="flex flex-col items-center md:items-end gap-4">
              <p className="text-xs font-semibold tracking-widest uppercase text-white/40">
                Encontranos en
              </p>
              <div className="flex flex-wrap justify-center md:justify-end gap-3">

                {/* WhatsApp */}
                <a
                  href="https://wa.me/5492617526242"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp"
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-semibold',
                    'bg-[#25D366]/15 border border-[#25D366]/30 text-[#4ade80]',
                    'hover:bg-[#25D366]/25 hover:border-[#25D366]/60 hover:scale-105',
                    'transition-all duration-200'
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-4 h-4 fill-[#4ade80]">
                    <path d="M16.002 3C9.374 3 4 8.373 4 15.001c0 2.124.556 4.121 1.528 5.856L4 29l8.368-1.51A11.96 11.96 0 0016.002 28C22.629 28 28 22.627 28 16S22.629 3 16.002 3zm0 21.81a9.76 9.76 0 01-5.02-1.387l-.36-.213-3.73.673.686-3.637-.234-.374a9.768 9.768 0 01-1.488-5.16C5.856 9.24 10.375 4.856 16.002 4.856c5.626 0 10.144 4.384 10.144 10.144 0 5.763-4.518 10.81-10.144 10.81zm5.558-7.603c-.304-.152-1.8-.887-2.08-.988-.28-.1-.484-.152-.688.153-.203.305-.79.988-.968 1.19-.178.203-.356.228-.66.076-.304-.152-1.284-.473-2.446-1.509-.904-.806-1.515-1.8-1.692-2.105-.178-.305-.019-.47.134-.621.137-.136.304-.356.456-.533.152-.178.203-.305.305-.508.1-.203.05-.381-.025-.533-.076-.152-.688-1.66-.942-2.273-.248-.598-.5-.517-.689-.527l-.585-.01c-.203 0-.533.076-.812.381-.28.305-1.067 1.043-1.067 2.543 0 1.5 1.092 2.95 1.244 3.152.152.203 2.149 3.278 5.208 4.595.728.314 1.296.502 1.739.643.73.233 1.394.2 1.92.122.586-.087 1.8-.736 2.054-1.447.254-.711.254-1.32.178-1.447-.076-.127-.28-.203-.584-.356z"/>
                  </svg>
                  WhatsApp
                </a>

                {/* Google Maps */}
                <a
                  href="https://www.google.com/maps/place/SUMAK/@-32.8949139,-68.8292403,19.5z/data=!4m6!3m5!1s0x967e09a1dd6eefdd:0x698ad41b5908215c!8m2!3d-32.8949528!4d-68.8286573!16s%2Fg%2F11xgssdlt9"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver en Google Maps"
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-semibold',
                    'bg-red-500/15 border border-red-500/30 text-red-400',
                    'hover:bg-red-500/25 hover:border-red-500/60 hover:scale-105',
                    'transition-all duration-200'
                  )}
                >
                  <MapPin size={14} />
                  Google Maps
                </a>

                {/* Instagram */}
                <span
                  title="Instagram — Próximamente"
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-semibold',
                    'bg-white/5 border border-white/10 text-white/30 cursor-default select-none'
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
                  </svg>
                  <span>Instagram <span className="text-[10px] opacity-60">Próx.</span></span>
                </span>

                {/* Facebook */}
                <a
                  href="https://www.facebook.com/profile.php?id=61576603961881"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Facebook"
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-pill text-sm font-semibold',
                    'bg-[#1877F2]/15 border border-[#1877F2]/30 text-[#60a5fa]',
                    'hover:bg-[#1877F2]/25 hover:border-[#1877F2]/60 hover:scale-105',
                    'transition-all duration-200'
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.093 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.261h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.1 24 12.073z"/>
                  </svg>
                  Facebook
                </a>

              </div>
            </div>
          </div>

          {/* Divider + copyright */}
          <div className="mt-10 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-white/25">
              © 2026 Restaurante Sumak
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
