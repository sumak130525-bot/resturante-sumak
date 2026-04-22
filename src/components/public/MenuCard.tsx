'use client'

import { Plus, Minus, ShoppingBag } from 'lucide-react'
import { cn, formatPrice, getAvailabilityColor, getAvailabilityLabel } from '@/lib/utils'
import type { MenuItem, CartItem } from '@/lib/types'

const CATEGORY_EMOJI: Record<string, string> = {
  sopas: '🍲',
  'platos-principales': '🍽️',
  empanadas: '🥟',
  acompanamientos: '🥗',
  bebidas: '🥤',
}

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
  const quantity = cartItem?.quantity ?? 0
  const isUnavailable = item.available === 0
  const emoji = categorySlug ? (CATEGORY_EMOJI[categorySlug] ?? '🍴') : '🍴'

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
              alt={item.name}
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
              Foto próximamente
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
            {getAvailabilityLabel(item.available)}
          </span>
        </div>

        {/* ── In-cart indicator ── */}
        {quantity > 0 && (
          <div className="absolute top-3 left-3">
            <span className="badge bg-sumak-brown text-sumak-gold border border-sumak-gold/30 backdrop-blur-sm shadow-sm">
              En pedido: {quantity}
            </span>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Name */}
        <h3 className="font-serif font-semibold text-[1.05rem] text-sumak-brown leading-snug tracking-tight">
          {item.name}
        </h3>

        {/* Description */}
        {item.description && (
          <p className="text-sm text-sumak-brown-light leading-relaxed flex-1 line-clamp-2">
            {item.description}
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
              Agotado
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
              Agregar
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
