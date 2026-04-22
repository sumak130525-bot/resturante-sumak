'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/types'

const CATEGORY_ICONS: Record<string, string> = {
  sopas:              '🍲',
  'platos-principales':'🍽️',
  empanadas:          '🥟',
  acompanamientos:    '🥗',
  bebidas:            '🥤',
}

interface CategoryTabsProps {
  categories: Category[]
  active: string
  onChange: (slug: string) => void
}

export function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  const all = { id: 'all', name: 'Todo el menú', slug: 'all', order_pos: 0 }
  const tabs = [all, ...categories]
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll active tab into view
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeEl = container.querySelector('[data-active="true"]') as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [active])

  return (
    <div className="sticky top-16 md:top-20 z-30 bg-sumak-cream/90 backdrop-blur-xl border-b border-sumak-cream-dark/60 shadow-sm">
      <div className="andean-border-thin opacity-40" />

      <div className="container mx-auto px-4 md:px-6">
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide py-3"
        >
          {tabs.map((cat) => {
            const isActive = active === cat.slug
            return (
              <button
                key={cat.slug}
                data-active={isActive}
                onClick={() => onChange(cat.slug)}
                className={cn(
                  'relative flex items-center gap-2 whitespace-nowrap',
                  'px-4 py-2 rounded-pill text-sm font-semibold',
                  'transition-all duration-300 ease-smooth shrink-0',
                  isActive
                    ? 'bg-sumak-brown text-sumak-gold shadow-premium scale-[1.02]'
                    : 'bg-white/80 text-sumak-brown-mid border border-sumak-cream-dark hover:bg-white hover:border-sumak-gold/40 hover:text-sumak-brown hover:scale-[1.02]'
                )}
              >
                {cat.slug !== 'all' && (
                  <span className="text-base leading-none">{CATEGORY_ICONS[cat.slug] ?? '🍴'}</span>
                )}
                {cat.name}

                {/* Active underline dot */}
                {isActive && (
                  <span className="absolute -bottom-[13px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sumak-gold animate-fade-in" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
