'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { MenuItemForm } from '@/components/admin/MenuItemForm'
import { QuantityEditor } from '@/components/admin/QuantityEditor'
import { formatPrice, cn } from '@/lib/utils'
import type { MenuItem, Category } from '@/lib/types'
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'

export default function AdminMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [itemsRes, catsRes] = await Promise.all([
      supabase.from('menu_items').select('*, categories(*)').order('name'),
      supabase.from('categories').select('*').order('order_pos'),
    ])
    if (itemsRes.data) setItems(itemsRes.data as MenuItem[])
    if (catsRes.data) setCategories(catsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async (data: Partial<MenuItem>) => {
    const method = data.id ? 'PUT' : 'POST'
    const res = await fetch('/api/admin/menu', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error)
    }
    await fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Desactivar este plato del menú?')) return
    await fetch('/api/admin/menu', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchData()
  }

  const handleQuantityUpdate = async (id: string, available: number) => {
    await fetch('/api/admin/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, available }),
    })
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, available } : i))
    )
  }

  const filteredItems = items.filter((i) => {
    if (filterActive === 'active') return i.active
    if (filterActive === 'inactive') return !i.active
    return true
  })

  return (
    <AdminLayoutClient active="menu">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="font-serif text-3xl font-bold text-sumak-brown">Gestión del Menú</h1>
          <div className="flex gap-3">
            <button
              onClick={fetchData}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
            >
              <RefreshCw size={15} />
              Actualizar
            </button>
            <button
              onClick={() => setEditItem({ id: '', category_id: categories[0]?.id ?? '', name: '', description: null, name_en: null, name_qu: null, description_es: null, description_en: null, description_qu: null, price: 0, image_url: null, available: 0, active: true, created_at: '' })}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus size={16} />
              Nuevo plato
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-6">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                filterActive === f
                  ? 'bg-sumak-brown text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-sumak-brown'
              )}
            >
              {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando menú...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left p-4 font-semibold text-gray-600">Plato</th>
                    <th className="text-left p-4 font-semibold text-gray-600 hidden md:table-cell">Categoría</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Precio</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Disponibles</th>
                    <th className="text-center p-4 font-semibold text-gray-600 hidden sm:table-cell">Estado</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredItems.map((item) => {
                    const cat = categories.find((c) => c.id === item.category_id)
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                          <p className="font-semibold text-sumak-brown">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                              {item.description}
                            </p>
                          )}
                        </td>
                        <td className="p-4 text-gray-500 hidden md:table-cell">
                          {cat?.name ?? '—'}
                        </td>
                        <td className="p-4 text-right font-bold text-sumak-red">
                          {formatPrice(item.price)}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-center">
                            <QuantityEditor
                              itemId={item.id}
                              current={item.available}
                              onUpdate={handleQuantityUpdate}
                            />
                          </div>
                        </td>
                        <td className="p-4 text-center hidden sm:table-cell">
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-1 rounded-full',
                              item.active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            )}
                          >
                            {item.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditItem(item)}
                              className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-2 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                              title="Desactivar"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredItems.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                No hay platos en esta categoría de filtro.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de edición */}
      {editItem && (
        <MenuItemForm
          item={editItem.id ? editItem : null}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditItem(null)}
        />
      )}
    </AdminLayoutClient>
  )
}
