'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Minus, ShoppingBag, Share2, X } from 'lucide-react'
import { cn, formatPrice, getAvailabilityColor } from '@/lib/utils'
import { useTranslation, getItemName, getItemDescription } from '@/lib/i18n'
import type { MenuItem, CartItem } from '@/lib/types'

const CATEGORY_EMOJI: Record<string, string> = {
  sopas: '🍲',
  'platos-principales': '🍽️',
  empanadas: '🥟',
  acompanamientos: '🥗',
  bebidas: '🥤',
}

const BASE_URL = 'https://restaurante-sumak.vercel.app'

interface MenuCardProps {
  item: MenuItem
  cartItem?: CartItem
  onAdd: (item: MenuItem) => void
  onRemove: (itemId: string) => void
  categorySlug?: string
  index?: number
}

export function MenuCard({
  item,
  cartItem,
  onAdd,
  onRemove,
  categorySlug,
  index = 0,
}: MenuCardProps) {
  const { t, locale } = useTranslation()
  const quantity = cartItem?.quantity ?? 0
  const isUnavailable = item.available === 0
  const emoji = categorySlug ? (CATEGORY_EMOJI[categorySlug] ?? '🍴') : '🍴'
  const displayName = getItemName(item, locale)
  const displayDescription = getItemDescription(item, locale)

  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  // Close share menu when clicking outside
  useEffect(() => {
    if (!shareOpen) return
    function handleClick(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [shareOpen])

  function availabilityLabel(available: number): string {
    if (available === 0) return t('soldOut')
    if (available === 1) return t('oneAvailable')
    return t('available', { n: available })
  }

  const plateUrl = `${BASE_URL}?plato=${item.id}`
  const shareText = `Mirá este plato de Restaurante Sumak: ${displayName} — ${formatPrice(item.price)} 🍽️ ${plateUrl}`

  async function handleShareClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Restaurante Sumak — ${displayName}`,
          text: `${displayName} — ${formatPrice(item.price)}`,
          url: plateUrl,
        })
      } catch {
        // user cancelled or not supported — fall through to menu
        setShareOpen(true)
      }
    } else {
      setShareOpen((prev) => !prev)
    }
  }

  async function handleCopyLink(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(plateUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  function whatsappUrl() {
    return `https://wa.me/?text=${encodeURIComponent(shareText)}`
  }

  function facebookUrl() {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(plateUrl)}`
  }

  function twitterUrl() {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
  }

  return (
    <article
      className={cn(
        'card-menu flex flex-col group animate-fade-up',
        isUnavailable && 'opacity-60 grayscale-[0.4]'
      )}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      {/* ── Image area ── */}
      <div className="relative w-full h-52 bg-sumak-cream-dark overflow-hidden">
        {item.image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image_url}
              alt={displayName}
              className="menu-card-image absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            {/* Gradient overlay (revealed on hover via CSS) */}
            <div className="menu-card-overlay" />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-sumak-cream to-sumak-cream-dark">
            <span className="text-5xl animate-float">{emoji}</span>
            <span className="text-xs font-medium text-sumak-brown-light tracking-wider uppercase opacity-60">
              {t('photoSoon')}
            </span>
          </div>
        )}

        {/* ── Availability badge ── */}
        <div className="absolute top-3 right-3">
          <span
            className={cn(
              'badge-available backdrop-blur-sm border border-white/20',
              getAvailabilityColor(item.available)
            )}
          >
            {availabilityLabel(item.available)}
          </span>
        </div>

        {/* ── In-cart indicator ── */}
        {quantity > 0 && (
          <div className="absolute top-3 left-3">
            <span className="badge bg-sumak-brown text-sumak-gold border border-sumak-gold/30 backdrop-blur-sm shadow-sm">
              {t('inOrder')}: {quantity}
            </span>
          </div>
        )}

        {/* ── Share button ── */}
        <div ref={shareRef} className="absolute bottom-3 right-3">
          <button
            onClick={handleShareClick}
            aria-label="Compartir plato"
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full',
              'bg-black/40 backdrop-blur-sm text-white border border-white/20',
              'transition-all duration-200 hover:bg-black/60 hover:scale-110 active:scale-95',
              'opacity-0 group-hover:opacity-100 focus:opacity-100'
            )}
          >
            <Share2 size={14} />
          </button>

          {/* Share dropdown */}
          {shareOpen && (
            <div className="absolute bottom-10 right-0 z-50 min-w-[180px] rounded-xl bg-white shadow-xl border border-gray-100 overflow-hidden animate-fade-up">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-sumak-brown">Compartir</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setShareOpen(false) }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* WhatsApp */}
              <a
                href={whatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShareOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="text-sm text-gray-700">WhatsApp</span>
              </a>

              {/* Facebook */}
              <a
                href={facebookUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShareOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#1877F2]" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span className="text-sm text-gray-700">Facebook</span>
              </a>

              {/* Twitter/X */}
              <a
                href={twitterUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShareOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-black" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="text-sm text-gray-700">Twitter / X</span>
              </a>

              {/* Copy link */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors w-full border-t border-gray-100"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-gray-500 fill-none" strokeWidth={2} aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span className="text-sm text-gray-700">
                  {copied ? '¡Copiado!' : 'Copiar link'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Name */}
        <h3 className="font-serif font-semibold text-[1.05rem] text-sumak-brown leading-snug tracking-tight">
          {displayName}
        </h3>

        {/* Description */}
        {displayDescription && (
          <p className="text-sm text-sumak-brown-light leading-relaxed flex-1 line-clamp-2">
            {displayDescription}
          </p>
        )}

        {/* ── Price + Controls ── */}
        <div className="flex items-center justify-between mt-auto pt-1">
          {/* Price */}
          <div>
            <span className="font-bold text-sumak-red text-lg tracking-tight">
              {formatPrice(item.price)}
            </span>
          </div>

          {/* Controls */}
          {isUnavailable ? (
            <span className="text-xs font-semibold text-sumak-brown-light/70 bg-gray-100 px-3 py-1.5 rounded-pill">
              {t('soldOut')}
            </span>
          ) : quantity === 0 ? (
            <button
              onClick={() => onAdd(item)}
              className={cn(
                'flex items-center gap-1.5 text-sm font-semibold',
                'bg-sumak-red text-white',
                'px-4 py-2 rounded-pill',
                'transition-all duration-300 ease-smooth',
                'hover:bg-sumak-red-dark hover:shadow-red-glow hover:scale-105',
                'active:scale-95'
              )}
            >
              <ShoppingBag size={14} />
              {t('addToCart')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRemove(item.id)}
                className="qty-btn border-2 border-sumak-red/30 text-sumak-red hover:bg-sumak-red hover:text-white hover:border-sumak-red hover:shadow-red-glow/30"
              >
                <Minus size={13} strokeWidth={2.5} />
              </button>

              <span className="w-7 text-center text-base font-black text-sumak-brown tabular-nums">
                {quantity}
              </span>

              <button
                onClick={() => onAdd(item)}
                disabled={quantity >= item.available}
                className="qty-btn bg-sumak-red text-white hover:bg-sumak-red-dark hover:shadow-red-glow/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={13} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom accent line — visible only when in cart */}
      {quantity > 0 && (
        <div className="h-[3px] bg-gradient-to-r from-sumak-gold via-sumak-gold-light to-sumak-gold animate-fade-in" />
      )}
    </article>
  )
}
