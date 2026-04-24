'use client'

import { MenuCard } from './MenuCard'
import { useTranslation } from '@/lib/i18n'
import type { MenuItem, Category, CartItem } from '@/lib/types'

interface MenuGridProps {
  items: MenuItem[]
  categories: Category[]
  activeCategory: string
  cart: CartItem[]
  onAdd: (item: MenuItem) => void
  onRemove: (itemId: string) => void
}

export function MenuGrid({
  items,
  categories,
  activeCategory,
  cart,
  onAdd,
  onRemove,
}: MenuGridProps) {
  const { t } = useTranslation()
  const filteredItems =
    activeCategory === 'all'
      ? items
      : items.filter((item) => {
          const cat = categories.find((c) => c.id === item.category_id)
          return cat?.slug === activeCategory
        })

  const groupedByCategory =
    activeCategory === 'all'
      ? categories
          .map((cat) => ({
            category: cat,
            items: filteredItems.filter((i) => i.category_id === cat.id),
          }))
          .filter((g) => g.items.length > 0)
      : [
          {
            category:
              categories.find((c) => c.slug === activeCategory) ?? categories[0],
            items: filteredItems,
          },
        ]

  if (filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-sumak-brown-light animate-fade-in">
        <span className="text-7xl opacity-40">🍽️</span>
        <p className="text-lg font-medium opacity-60">No hay platos disponibles aquí.</p>
      </div>
    )
  }

  let globalIndex = 0

  return (
    <div className="space-y-14">
      {groupedByCategory.map(({ category, items: catItems }) => (
        <section key={category.id} id={`cat-${category.slug}`} className="scroll-mt-40">
          {/* Section heading */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex flex-col">
              <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-sumak-gold mb-1">
                {t('menuSection')}
              </p>
              <h2 className="section-title leading-tight">{category.name}</h2>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-sumak-cream-dark via-sumak-gold/30 to-transparent mt-auto mb-1" />
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {catItems.map((item) => {
              const idx = globalIndex++
              return (
                <MenuCard
                  key={item.id}
                  item={item}
                  cartItem={cart.find((c) => c.menu_item.id === item.id)}
                  onAdd={onAdd}
                  onRemove={onRemove}
                  categorySlug={category.slug}
                  index={idx}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
