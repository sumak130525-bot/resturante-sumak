'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { cn } from '@/lib/utils'
import type { MenuItem, Category } from '@/lib/types'
import { RefreshCw, Package } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatARS(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(price)
}

function StockBadge({ qty }: { qty: number | null }) {
  if (qty === null || qty === undefined) return <span className="text-xs text-gray-400">Sin límite</span>
  if (qty === 0) return <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-semibold">Agotado</span>
  if (qty >= 1 && qty <= 3) return (
    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold border border-orange-200">
      Últimos {qty}
    </span>
  )
  return <span className="text-xs text-gray-400">Sin límite</span>
}

// ─── Stock Selector Panel ─────────────────────────────────────────────────────

interface StockSelectorProps {
  item: MenuItem
  onSave: (id: string, qty: number | null) => Promise<void>
  onClose: () => void
}

function StockSelector({ item, onSave, onClose }: StockSelectorProps) {
  const [saving, setSaving] = useState(false)
  const currentQty = item.available_qty

  const options: { label: string; value: number | null; color: string }[] = [
    { label: '1', value: 1, color: 'bg-orange-500 text-white border-orange-500' },
    { label: '2', value: 2, color: 'bg-orange-500 text-white border-orange-500' },
    { label: '3', value: 3, color: 'bg-orange-500 text-white border-orange-500' },
    { label: 'Sin límite', value: null, color: 'bg-green-500 text-white border-green-500' },
  ]

  const handleSelect = async (value: number | null) => {
    setSaving(true)
    try {
      await onSave(item.id, value)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-sumak-brown px-5 py-4">
          <p className="text-white font-bold text-base leading-tight truncate">{item.name}</p>
          <p className="text-amber-300 text-xs mt-0.5">Seleccioná el stock disponible</p>
        </div>

        {/* Current state */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-sm">
          <span className="text-gray-500">Estado actual:</span>
          <StockBadge qty={currentQty} />
        </div>

        {/* Options */}
        <div className="px-5 py-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Cantidad disponible</p>
          <div className="grid grid-cols-4 gap-2">
            {options.map((opt) => {
              const isActive = opt.value === currentQty || (opt.value === null && (currentQty === null || currentQty === undefined))
              return (
                <button
                  key={String(opt.value)}
                  onClick={() => handleSelect(opt.value)}
                  disabled={saving}
                  className={cn(
                    'py-3 rounded-xl border-2 font-bold text-sm transition-all active:scale-95 disabled:opacity-50',
                    isActive
                      ? opt.color
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400'
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Set to Agotado */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => handleSelect(0)}
              disabled={saving}
              className={cn(
                'w-full py-3 rounded-xl border-2 font-bold text-sm transition-all active:scale-95 disabled:opacity-50',
                currentQty === 0
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 hover:border-gray-400'
              )}
            >
              {saving ? 'Guardando...' : 'Marcar como Agotado'}
            </button>
          </div>
        </div>

        {/* Cancel */}
        <div className="px-5 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MenuDisplayStockPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from('menu_items').select('*, categories(*)').eq('active', true).order('name'),
      supabase.from('categories').select('*').order('order_pos'),
    ])
    if (itemsRes.data) setItems(itemsRes.data as MenuItem[])
    if (catsRes.data) setCategories(catsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaveStock = async (id: string, qty: number | null) => {
    const supabase = createClient()
    // Cast needed because Supabase generated types may lag behind actual columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('menu_items') as any)
      .update({ available_qty: qty })
      .eq('id', id)

    if (error) {
      showToast('Error al guardar: ' + error.message, false)
      throw error
    }

    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, available_qty: qty } : i))

    const label = qty === null ? 'Sin límite' : qty === 0 ? 'Agotado' : `Últimos ${qty}`
    showToast(`Stock actualizado: ${label}`, true)
  }

  const filteredItems = filterCategory === 'all'
    ? items
    : items.filter((i) => {
        const cat = categories.find((c) => c.id === i.category_id)
        return cat?.slug === filterCategory || i.category_id === filterCategory
      })

  // Stats
  const agotadoCount = items.filter((i) => i.available_qty === 0).length
  const limitedCount = items.filter((i) => i.available_qty !== null && i.available_qty !== undefined && i.available_qty >= 1 && i.available_qty <= 3).length

  return (
    <AdminLayoutClient active="menu-display">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown flex items-center gap-3">
              <Package size={28} className="text-orange-500" />
              Stock Limitado
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Controlá la disponibilidad de cada plato. Los clientes ven badges en tiempo real.
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-black text-gray-700">{items.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Platos activos</p>
          </div>
          <div className="bg-orange-50 rounded-xl shadow-sm p-4 text-center border border-orange-100">
            <p className="text-2xl font-black text-orange-600">{limitedCount}</p>
            <p className="text-xs text-orange-500 mt-0.5">Con stock limitado</p>
          </div>
          <div className="bg-gray-50 rounded-xl shadow-sm p-4 text-center border border-gray-100">
            <p className="text-2xl font-black text-gray-600">{agotadoCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Agotados</p>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              filterCategory === 'all'
                ? 'bg-sumak-brown text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-sumak-brown'
            )}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.slug)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                filterCategory === cat.slug
                  ? 'bg-sumak-brown text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-sumak-brown'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Item list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando platos...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left p-4 font-semibold text-gray-600">Plato</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden md:table-cell">Categoría</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Stock actual</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Precio</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredItems.map((item) => {
                    const cat = categories.find((c) => c.id === item.category_id)
                    const isAgotado = item.available_qty === 0
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'transition-colors',
                          isAgotado ? 'bg-gray-50/70 opacity-60' : 'hover:bg-gray-50'
                        )}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-10 h-10 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-lg">🍽️</div>
                            )}
                            <p className="font-semibold text-sumak-brown">{item.name}</p>
                          </div>
                        </td>
                        <td className="p-4 text-gray-500 hidden md:table-cell">
                          {cat?.name ?? '—'}
                        </td>
                        <td className="p-4 text-center">
                          <StockBadge qty={item.available_qty} />
                        </td>
                        <td className="p-4 text-right font-bold text-sumak-red">
                          {formatARS(item.price)}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="px-3 py-1.5 rounded-lg bg-sumak-brown/10 hover:bg-sumak-brown/20 text-sumak-brown text-xs font-semibold transition-all active:scale-95"
                          >
                            Cambiar stock
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredItems.length === 0 && (
              <div className="text-center py-10 text-gray-400">No hay platos en esta categoría.</div>
            )}
          </div>
        )}

        {/* Helper note */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">¿Cómo funciona?</p>
          <ul className="space-y-0.5 text-amber-700">
            <li>• <strong>Sin límite</strong>: el plato aparece normal, sin badge de stock</li>
            <li>• <strong>1, 2 o 3</strong>: se muestra un badge naranja &ldquo;Últimos X disponibles&rdquo;</li>
            <li>• <strong>Agotado</strong>: se muestra &ldquo;Agotado&rdquo; y el botón de agregar se desactiva</li>
            <li>• El stock se descuenta automáticamente cuando se confirma un pedido</li>
          </ul>
        </div>
      </div>

      {/* Stock selector modal */}
      {selectedItem && (
        <StockSelector
          item={selectedItem}
          onSave={handleSaveStock}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-white font-semibold text-sm shadow-xl z-50',
            toast.ok ? 'bg-green-600' : 'bg-red-600'
          )}
        >
          {toast.msg}
        </div>
      )}
    </AdminLayoutClient>
  )
}
