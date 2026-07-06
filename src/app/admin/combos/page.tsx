'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { PackagePlus, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

type Category = {
  id: string
  name: string
}

type ComboSlot = {
  category_id: string
  label: string
  qty: number
}

type Combo = {
  id: string
  name: string
  price: number
  slots: ComboSlot[]
  positions: number[]
  image_urls: string[]
  active: boolean
  created_at: string
}

const EMPTY_SLOT: ComboSlot = { category_id: '', label: '', qty: 1 }

function SlotEditor({
  slots,
  categories,
  onChange,
}: {
  slots: ComboSlot[]
  categories: Category[]
  onChange: (slots: ComboSlot[]) => void
}) {
  const updateSlot = (i: number, field: keyof ComboSlot, value: string | number) => {
    const next = slots.map((s, idx) => (idx === i ? { ...s, [field]: value } : s))
    onChange(next)
  }
  const addSlot = () => onChange([...slots, { ...EMPTY_SLOT }])
  const removeSlot = (i: number) => onChange(slots.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {slots.map((slot, i) => (
        <div key={i} className="flex gap-2 items-start bg-gray-50 rounded-xl p-3">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <select
              value={slot.category_id}
              onChange={(e) => updateSlot(i, 'category_id', e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 col-span-1"
            >
              <option value="">Categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={slot.label}
              onChange={(e) => updateSlot(i, 'label', e.target.value)}
              placeholder="Etiqueta (ej: Plato principal)"
              className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 col-span-1"
            />
            <input
              type="number"
              min={1}
              value={slot.qty}
              onChange={(e) => updateSlot(i, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
              placeholder="Qty"
              className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 col-span-1"
            />
          </div>
          <button
            onClick={() => removeSlot(i)}
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors mt-0.5"
            title="Eliminar slot"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={addSlot}
        className="flex items-center gap-1.5 text-xs text-sumak-brown hover:underline font-medium"
      >
        <Plus size={13} /> Agregar slot
      </button>
    </div>
  )
}

function ComboForm({
  categories,
  initial,
  onSave,
  onCancel,
  saving,
}: {
  categories: Category[]
  initial?: Partial<Combo>
  onSave: (data: Omit<Combo, 'id' | 'created_at' | 'active'>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(String(initial?.price ?? ''))
  const [positions, setPositions] = useState(
    initial?.positions ? initial.positions.join(', ') : ''
  )
  const [slots, setSlots] = useState<ComboSlot[]>(
    initial?.slots?.length ? initial.slots : [{ ...EMPTY_SLOT }]
  )

  const handleSubmit = () => {
    const parsedPositions = positions
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n))

    onSave({
      name: name.trim(),
      price: parseInt(price) || 0,
      slots,
      positions: parsedPositions,
      image_urls: initial?.image_urls ?? [],
    })
  }

  const valid =
    name.trim().length > 0 &&
    parseInt(price) >= 0 &&
    slots.length > 0 &&
    slots.every((s) => s.category_id && s.label.trim())

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nombre del combo</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Almuerzo ejecutivo"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Precio (centavos)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ej: 1200"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Posiciones en grilla (separadas por coma)
        </label>
        <input
          type="text"
          value={positions}
          onChange={(e) => setPositions(e.target.value)}
          placeholder="Ej: 1, 2, 3"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
        />
        <p className="text-xs text-gray-400 mt-1">
          Números de posición en la grilla del POS donde aparece este combo
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          Slots del combo
          <span className="ml-1 text-gray-400 font-normal">(categoría · etiqueta · cantidad)</span>
        </label>
        <SlotEditor slots={slots} categories={categories} onChange={setSlots} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !valid}
          className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
        >
          <Check size={15} />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [adding, setAdding] = useState(false)

  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const fetchCombos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/combos')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar')
      setCombos(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
    setLoading(false)
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(Array.isArray(data) ? data.map((c: Category) => ({ id: c.id, name: c.name })) : [])
      }
    } catch {
      // categories are optional context; ignore failure
    }
  }, [])

  useEffect(() => {
    fetchCombos()
    fetchCategories()
  }, [fetchCombos, fetchCategories])

  const handleAdd = async (data: Omit<Combo, 'id' | 'created_at' | 'active'>) => {
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'Error al crear')
      setCombos((prev) => [...prev, result])
      setShowAddForm(false)
      showSuccess(`Combo "${data.name}" creado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    }
    setAdding(false)
  }

  const handleEdit = async (data: Omit<Combo, 'id' | 'created_at' | 'active'>) => {
    if (!editId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/combos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, ...data }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'Error al guardar')
      setCombos((prev) => prev.map((c) => (c.id === editId ? { ...c, ...result } : c)))
      setEditId(null)
      showSuccess('Combo actualizado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    }
    setSaving(false)
  }

  const handleToggleActive = async (combo: Combo) => {
    try {
      const res = await fetch('/api/admin/combos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: combo.id, active: !combo.active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar')
      setCombos((prev) =>
        prev.map((c) => (c.id === combo.id ? { ...c, active: !combo.active } : c))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el combo "${name}"?`)) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/combos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar')
      setCombos((prev) => prev.filter((c) => c.id !== id))
      showSuccess(`Combo "${name}" eliminado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
    setDeletingId(null)
  }

  const getCategoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id

  return (
    <AdminLayoutClient active="combos">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <PackagePlus size={20} className="text-orange-600" />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-bold text-sumak-brown">Combos</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Configurá los combos disponibles en el POS
              </p>
            </div>
          </div>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 transition-colors"
            >
              <Plus size={15} />
              Nuevo combo
            </button>
          )}
        </div>

        {/* Feedback */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
            {success}
          </div>
        )}

        {/* Add form */}
        {showAddForm && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Nuevo combo</h2>
            <ComboForm
              categories={categories}
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              saving={adding}
            />
          </section>
        )}

        {/* Combos list */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Combos configurados
            {combos.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({combos.filter((c) => c.active).length} activos de {combos.length})
              </span>
            )}
          </h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : combos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                <PackagePlus size={32} className="opacity-30" />
                <p className="text-sm font-medium">Sin combos configurados</p>
                <p className="text-xs">Hacé clic en &ldquo;Nuevo combo&rdquo; para agregar el primero</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {combos.map((combo) => (
                  <div key={combo.id} className={combo.active ? '' : 'opacity-60'}>
                    {editId === combo.id ? (
                      <div className="p-4">
                        <ComboForm
                          categories={categories}
                          initial={combo}
                          onSave={handleEdit}
                          onCancel={() => setEditId(null)}
                          saving={saving}
                        />
                      </div>
                    ) : (
                      <div className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          {/* Name + price */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{combo.name}</span>
                              <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                                ${(combo.price / 100).toFixed(2)}
                              </span>
                              {combo.positions.length > 0 && (
                                <span className="text-xs text-gray-400">
                                  pos: {combo.positions.join(', ')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {combo.slots.length} slot{combo.slots.length !== 1 ? 's' : ''}
                              {combo.slots.length > 0 && (
                                <> &mdash; {combo.slots.map((s) => s.label || getCategoryName(s.category_id)).join(' · ')}</>
                              )}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Expand/collapse slots */}
                            <button
                              onClick={() =>
                                setExpandedId(expandedId === combo.id ? null : combo.id)
                              }
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title="Ver slots"
                            >
                              {expandedId === combo.id ? (
                                <ChevronUp size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              )}
                            </button>

                            {/* Toggle active */}
                            <button
                              onClick={() => handleToggleActive(combo)}
                              aria-pressed={combo.active}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                combo.active ? 'bg-green-500' : 'bg-gray-200'
                              }`}
                              title={combo.active ? 'Desactivar' : 'Activar'}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                                  combo.active ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>

                            <button
                              onClick={() => setEditId(combo.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(combo.id, combo.name)}
                              disabled={deletingId === combo.id}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded slots detail */}
                        {expandedId === combo.id && combo.slots.length > 0 && (
                          <div className="mt-3 bg-gray-50 rounded-xl p-3 space-y-1.5">
                            {combo.slots.map((slot, i) => (
                              <div key={i} className="flex items-center gap-3 text-xs text-gray-600">
                                <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">
                                  {i + 1}
                                </span>
                                <span className="font-medium">{slot.label || '(sin etiqueta)'}</span>
                                <span className="text-gray-400">&rarr;</span>
                                <span>{getCategoryName(slot.category_id)}</span>
                                <span className="ml-auto text-gray-400">x{slot.qty}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Info card */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-orange-800 mb-1">¿Cómo funcionan los combos?</p>
          <ul className="text-xs text-orange-700 space-y-1 list-disc list-inside">
            <li>Cada combo tiene slots que determinan qué categorías puede elegir el cliente</li>
            <li>Las posiciones en grilla determinan dónde aparece el combo en el POS</li>
            <li>Al agregar un combo al ticket, el cliente elige un ítem por cada slot</li>
            <li>Solo los combos activos aparecen en el POS</li>
          </ul>
        </div>

        {/* SQL migration note */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">SQL para migración (ejecutar en Supabase):</p>
          <pre className="text-xs text-gray-500 font-mono whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto">{`create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Almuerzo',
  price integer not null,
  slots jsonb not null,
  positions integer[] not null,
  image_urls text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table combos enable row level security;
create policy combos_select_anon on combos for select using (true);`}</pre>
        </div>
      </div>
    </AdminLayoutClient>
  )
}
