'use client'

import { useState, useCallback, useEffect } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Check, X, Trash2, RefreshCw, Tag } from 'lucide-react'
import type { MenuItem, Category } from '@/lib/types'

interface CategoryWithCount extends Category {
  menu_items: { count: number }[]
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .trim()
}

export default function AdminCategoriasPage() {
  const [categories, setCategories] = useState<CategoryWithCount[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)

  // Edición inline de categorías
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Nueva categoría
  const [newCatName, setNewCatName] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  // Actualización de categoría de un plato
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [catsRes, itemsRes] = await Promise.all([
      fetch('/api/admin/categories'),
      fetch('/api/admin/menu'),
    ])
    if (catsRes.ok) setCategories(await catsRes.json())
    if (itemsRes.ok) setItems(await itemsRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Editar nombre de categoría ──────────────────────────────────────────────
  const startEdit = (cat: CategoryWithCount) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const saveEdit = async (id: string) => {
    if (!editingName.trim()) return
    const res = await fetch('/api/admin/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editingName.trim() }),
    })
    if (res.ok) {
      await fetchData()
      setEditingId(null)
    }
  }

  // ── Crear nueva categoría ──────────────────────────────────────────────────
  const handleCreateCat = async () => {
    if (!newCatName.trim()) return
    setAddingNew(true)
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCatName.trim(),
        slug: toSlug(newCatName.trim()),
        order_pos: (categories[categories.length - 1]?.order_pos ?? 0) + 1,
      }),
    })
    if (res.ok) {
      setNewCatName('')
      await fetchData()
    }
    setAddingNew(false)
  }

  // ── Eliminar categoría ─────────────────────────────────────────────────────
  const handleDeleteCat = async (cat: CategoryWithCount) => {
    const count = cat.menu_items?.[0]?.count ?? 0
    if (count > 0) {
      alert(`No se puede eliminar "${cat.name}": tiene ${count} plato(s) asignado(s). Reasigná los platos primero.`)
      return
    }
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return
    await fetch('/api/admin/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cat.id }),
    })
    await fetchData()
  }

  // ── Cambiar categoría de un plato ──────────────────────────────────────────
  const handleItemCategoryChange = async (itemId: string, categoryId: string) => {
    setUpdatingItemId(itemId)
    await fetch('/api/admin/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, category_id: categoryId }),
    })
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, category_id: categoryId } : i))
    )
    setUpdatingItemId(null)
  }

  const activeItems = items.filter((i) => i.active)

  return (
    <AdminLayoutClient active="categorias">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sumak-brown/10 rounded-xl flex items-center justify-center">
              <Tag size={20} className="text-sumak-brown" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Categorías</h1>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : (
          <>
            {/* ── Sección 1: Lista de categorías ── */}
            <section>
              <h2 className="text-base font-semibold text-gray-700 mb-3">Categorías del menú</h2>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <ul className="divide-y divide-gray-50">
                  {categories.map((cat) => {
                    const count = cat.menu_items?.[0]?.count ?? 0
                    const isEditing = editingId === cat.id
                    return (
                      <li key={cat.id} className="flex items-center gap-3 p-4">
                        {/* Nombre / input edición */}
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(cat.id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            className="flex-1 border border-sumak-brown/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                          />
                        ) : (
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sumak-brown">{cat.name}</span>
                            <span className="ml-2 text-xs text-gray-400 font-mono">{cat.slug}</span>
                          </div>
                        )}

                        {/* Badge de platos */}
                        {!isEditing && (
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full',
                              count > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-400'
                            )}
                          >
                            {count} plato{count !== 1 ? 's' : ''}
                          </span>
                        )}

                        {/* Acciones */}
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveEdit(cat.id)}
                              className="p-1.5 hover:bg-green-50 hover:text-green-600 rounded-lg transition-colors"
                              title="Guardar"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 hover:bg-gray-100 text-gray-400 rounded-lg transition-colors"
                              title="Cancelar"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(cat)}
                              className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                              title="Editar nombre"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteCat(cat)}
                              className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                              title="Eliminar categoría"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {/* Fila para agregar nueva categoría */}
                <div className="border-t border-dashed border-gray-200 p-4 flex gap-2">
                  <input
                    placeholder="Nueva categoría..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCat() }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                  />
                  <button
                    onClick={handleCreateCat}
                    disabled={addingNew || !newCatName.trim()}
                    className="flex items-center gap-1.5 bg-sumak-brown text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-sumak-brown/90 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={15} />
                    Agregar
                  </button>
                </div>
              </div>
            </section>

            {/* ── Sección 2: Platos y su categoría ── */}
            <section>
              <h2 className="text-base font-semibold text-gray-700 mb-3">
                Asignar platos a categorías
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  (solo platos activos)
                </span>
              </h2>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left p-4 font-semibold text-gray-600">Plato</th>
                        <th className="text-left p-4 font-semibold text-gray-600">Categoría</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {activeItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4">
                            <p className="font-semibold text-sumak-brown">{item.name}</p>
                          </td>
                          <td className="p-4">
                            <select
                              value={item.category_id ?? ''}
                              disabled={updatingItemId === item.id}
                              onChange={(e) => handleItemCategoryChange(item.id, e.target.value)}
                              className={cn(
                                'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 transition-opacity',
                                updatingItemId === item.id && 'opacity-50'
                              )}
                            >
                              <option value="">Sin categoría</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {activeItems.length === 0 && (
                  <div className="text-center py-10 text-gray-400">
                    No hay platos activos.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayoutClient>
  )
}
