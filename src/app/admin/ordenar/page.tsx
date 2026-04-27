'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice, cn } from '@/lib/utils'
import type { MenuItem, Category } from '@/lib/types'
import { ArrowUp, ArrowDown, Save, Shuffle, RefreshCw, Tv2 } from 'lucide-react'

const CATEGORY_COLORS: Record<string, string> = {
  sopas: 'bg-orange-100 text-orange-700',
  segundo: 'bg-blue-100 text-blue-700',
  desayunos: 'bg-yellow-100 text-yellow-700',
  bebidas: 'bg-cyan-100 text-cyan-700',
  postres: 'bg-pink-100 text-pink-700',
  'para-llevar': 'bg-purple-100 text-purple-700',
  empanadas: 'bg-amber-100 text-amber-700',
  'platos-principales': 'bg-green-100 text-green-700',
  acompanamientos: 'bg-lime-100 text-lime-700',
}

function getCategoryColor(slug?: string) {
  if (!slug) return 'bg-gray-100 text-gray-600'
  return CATEGORY_COLORS[slug] ?? 'bg-gray-100 text-gray-600'
}

// ─── Mini TV Grid Preview ─────────────────────────────────────────────────────

function MiniGridPreview({ items }: { items: MenuItem[] }) {
  const cells = Array.from({ length: 24 })
  return (
    <div className="bg-[#0d0c0b] rounded-xl p-3 w-full max-w-xs mx-auto">
      <p className="text-[#F5C842] text-xs font-bold text-center mb-2 flex items-center justify-center gap-1">
        <Tv2 size={12} />
        Vista previa TV (6×4)
      </p>
      <div
        className="w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          gap: '2px',
          aspectRatio: '6/4',
        }}
      >
        {cells.map((_, i) => {
          const item = items[i]
          const color = item ? getCategoryColor(item.categories?.slug) : undefined
          return (
            <div
              key={i}
              className={cn(
                'rounded-sm flex items-center justify-center overflow-hidden',
                item ? 'opacity-100' : 'bg-white/5'
              )}
              title={item?.name}
            >
              {item?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : item ? (
                <div className={cn('w-full h-full', color?.split(' ')[0] ?? 'bg-gray-200')} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Row separator ─────────────────────────────────────────────────────────────

function RowDivider({ row }: { row: number }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 border-t border-dashed border-sumak-brown/20" />
      <span className="text-xs font-semibold text-sumak-brown/50 bg-amber-50 px-2 py-0.5 rounded-full border border-sumak-brown/15">
        Fila {row} de la TV
      </span>
      <div className="flex-1 border-t border-dashed border-sumak-brown/20" />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrdenarMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('menu_items')
      .select('*, categories(*)')
      .eq('active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')
    if (data) {
      // Assign sequential display_order locally for items without one
      const normalized = (data as MenuItem[]).map((item, idx) => ({
        ...item,
        display_order: item.display_order ?? idx + 1,
      }))
      setItems(normalized)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Move item up/down
  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newItems.length) return
    const tmp = newItems[index]
    newItems[index] = newItems[targetIndex]
    newItems[targetIndex] = tmp
    setItems(newItems.map((it, i) => ({ ...it, display_order: i + 1 })))
  }

  // Direct position input
  const setPosition = (index: number, rawValue: string) => {
    const pos = parseInt(rawValue, 10)
    if (isNaN(pos) || pos < 1 || pos > items.length) return
    const newItems = [...items]
    const [moved] = newItems.splice(index, 1)
    newItems.splice(pos - 1, 0, moved)
    setItems(newItems.map((it, i) => ({ ...it, display_order: i + 1 })))
  }

  // Auto-order by category
  const autoOrderByCategory = () => {
    const sorted = [...items].sort((a, b) => {
      const catA = a.categories?.name ?? ''
      const catB = b.categories?.name ?? ''
      if (catA !== catB) return catA.localeCompare(catB)
      return a.name.localeCompare(b.name)
    })
    setItems(sorted.map((it, i) => ({ ...it, display_order: i + 1 })))
  }

  // Save
  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = items.map((it, idx) => ({ id: it.id, display_order: idx + 1 }))
      const res = await fetch('/api/menu-display/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (res.ok) {
        showToast('Orden guardado correctamente', true)
        await fetchItems()
      } else {
        showToast('Error al guardar el orden', false)
      }
    } catch {
      showToast('Error de conexion', false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayoutClient active="ordenar">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Ordenar Menú Display</h1>
            <p className="text-gray-500 text-sm mt-1">
              Organiza el orden de los platos como aparecen en la pantalla de TV
            </p>
          </div>
          <button
            onClick={fetchItems}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando platos...</div>
        ) : (
          <>
            {/* Mini grid preview */}
            <div className="mb-6">
              <MiniGridPreview items={items} />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={autoOrderByCategory}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sumak-brown/30 text-sumak-brown font-semibold text-sm hover:bg-sumak-brown/5 transition-colors"
              >
                <Shuffle size={16} />
                Auto-ordenar por categoría
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sumak-brown text-white font-semibold text-sm hover:bg-sumak-brown/90 transition-colors disabled:opacity-60 ml-auto"
              >
                <Save size={16} />
                {saving ? 'Guardando...' : 'Guardar orden'}
              </button>
            </div>

            {/* Items list */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {items.map((item, index) => {
                const showRowDivider = index > 0 && index % 6 === 0
                const catSlug = item.categories?.slug
                const catName = item.categories?.name ?? '—'
                const isFirst = index === 0
                const isLast = index === items.length - 1

                return (
                  <div key={item.id}>
                    {showRowDivider && (
                      <div className="px-4">
                        <RowDivider row={Math.floor(index / 6) + 1} />
                      </div>
                    )}
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50',
                        index < items.length - 1 && !((index + 1) % 6 === 0) && 'border-b border-gray-50'
                      )}
                    >
                      {/* Position number */}
                      <span className="w-7 text-center text-sm font-bold text-sumak-brown/50 shrink-0 tabular-nums">
                        {index + 1}
                      </span>

                      {/* Thumbnail */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg">
                            🍽️
                          </div>
                        )}
                      </div>

                      {/* Name + category */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sumak-brown text-sm truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full',
                              getCategoryColor(catSlug)
                            )}
                          >
                            {catName}
                          </span>
                          <span className="text-xs text-gray-400 hidden sm:inline">
                            {formatPrice(item.price)}
                          </span>
                        </div>
                      </div>

                      {/* Position input */}
                      <input
                        type="number"
                        min={1}
                        max={items.length}
                        defaultValue={index + 1}
                        key={`pos-${item.id}-${index}`}
                        onBlur={(e) => setPosition(index, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setPosition(index, (e.target as HTMLInputElement).value)
                        }}
                        className="w-14 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-medium text-sumak-brown focus:border-sumak-brown focus:outline-none shrink-0"
                      />

                      {/* Up/Down buttons */}
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() => moveItem(index, 'up')}
                          disabled={isFirst}
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-sumak-brown hover:text-white hover:border-sumak-brown transition-all disabled:opacity-25 disabled:cursor-not-allowed active:scale-95"
                          title="Subir"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          onClick={() => moveItem(index, 'down')}
                          disabled={isLast}
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-sumak-brown hover:text-white hover:border-sumak-brown transition-all disabled:opacity-25 disabled:cursor-not-allowed active:scale-95"
                          title="Bajar"
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {items.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  No hay platos activos.
                </div>
              )}
            </div>

            {/* Bottom save button (sticky on mobile) */}
            <div className="sticky bottom-4 mt-6 flex justify-center">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-sumak-brown text-white font-bold text-base shadow-lg hover:bg-sumak-brown/90 transition-all disabled:opacity-60 active:scale-95"
              >
                <Save size={18} />
                {saving ? 'Guardando...' : 'Guardar orden'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-white font-semibold text-sm shadow-xl z-50 transition-all',
            toast.ok ? 'bg-green-600' : 'bg-red-600'
          )}
        >
          {toast.msg}
        </div>
      )}
    </AdminLayoutClient>
  )
}
