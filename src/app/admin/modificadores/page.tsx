'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { createClient } from '@/lib/supabase/client'
import { Sliders, RefreshCw, Plus, Trash2, Check, ChevronDown, ChevronUp, Pencil, X, Hash, List } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModifierOption = {
  id: string
  name: string
  price: number
}

type ModifierGroup = {
  id: string
  name: string
  type?: 'options' | 'quantity'
  // quantity-type fields
  unit_price?: number
  min_qty?: number
  max_qty?: number
  label?: string
  // options-type field
  options: ModifierOption[]
}

type MenuItem = {
  id: string
  name: string
}

function formatARS(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

// ─── Blank helpers ────────────────────────────────────────────────────────────

function newOption(): ModifierOption {
  return { id: crypto.randomUUID(), name: '', price: 0 }
}

function newGroup(): ModifierGroup {
  return { id: crypto.randomUUID(), name: '', type: 'options', options: [newOption()] }
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'groups' | 'assign'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminModificadoresPage() {
  const [tab, setTab] = useState<Tab>('groups')

  // ── Data state ──────────────────────────────────────────────────────────────
  const [modifiers, setModifiers] = useState<ModifierGroup[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [mappings, setMappings] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  // ── Modifier group CRUD state ────────────────────────────────────────────
  // null = no form; 'new' = creating; string id = editing
  const [editingGroupId, setEditingGroupId] = useState<string | 'new' | null>(null)
  const [draftGroup, setDraftGroup] = useState<ModifierGroup | null>(null)
  const [savingGroup, setSavingGroup] = useState(false)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  // ── Assign state ─────────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [savingMap, setSavingMap] = useState(false)
  const [savedItemId, setSavedItemId] = useState<string | null>(null)

  // ── Load all data ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [modRes, mapRes, itemsRes] = await Promise.all([
        fetch('/api/admin/modifiers'),
        fetch('/api/admin/item-modifiers'),
        createClient()
          .from('menu_items')
          .select('id, name')
          .eq('active', true)
          .order('name'),
      ])
      if (modRes.ok) {
        const d = await modRes.json()
        setModifiers(d.modifiers ?? [])
      }
      if (mapRes.ok) {
        const d = await mapRes.json()
        setMappings(d.mappings ?? {})
      }
      if (itemsRes.data) {
        setMenuItems(itemsRes.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Save full modifiers array ─────────────────────────────────────────────
  const saveModifiers = async (updated: ModifierGroup[]) => {
    const res = await fetch('/api/admin/modifiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifiers: updated }),
    })
    if (!res.ok) throw new Error('Error al guardar')
    setModifiers(updated)
  }

  // ── Group CRUD handlers ──────────────────────────────────────────────────

  const handleNewGroup = () => {
    const g = newGroup()
    setDraftGroup(g)
    setEditingGroupId('new')
    setExpandedGroupId(null)
  }

  const handleEditGroup = (group: ModifierGroup) => {
    setDraftGroup(JSON.parse(JSON.stringify(group))) // deep clone
    setEditingGroupId(group.id)
    setExpandedGroupId(null)
  }

  const handleCancelEdit = () => {
    setEditingGroupId(null)
    setDraftGroup(null)
  }

  const handleSaveGroup = async () => {
    if (!draftGroup) return
    if (!draftGroup.name.trim()) return

    setSavingGroup(true)
    try {
      let updated: ModifierGroup[]
      if (editingGroupId === 'new') {
        updated = [...modifiers, draftGroup]
      } else {
        updated = modifiers.map((g) => (g.id === draftGroup.id ? draftGroup : g))
      }
      await saveModifiers(updated)
      setEditingGroupId(null)
      setDraftGroup(null)
    } finally {
      setSavingGroup(false)
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('¿Eliminar este modificador?')) return
    const updated = modifiers.filter((g) => g.id !== groupId)
    await saveModifiers(updated)
    // Also clean mappings that referenced this group
    const newMappings = { ...mappings }
    let changed = false
    for (const [itemId, ids] of Object.entries(newMappings)) {
      const filtered = ids.filter((id) => id !== groupId)
      if (filtered.length !== ids.length) {
        newMappings[itemId] = filtered
        changed = true
      }
    }
    if (changed) {
      // persist cleaned mappings for all affected items
      for (const [itemId, ids] of Object.entries(newMappings)) {
        await fetch('/api/admin/item-modifiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: itemId, modifier_ids: ids }),
        })
      }
      setMappings(newMappings)
    }
  }

  // ── Draft field helpers ──────────────────────────────────────────────────

  const draftSetName = (name: string) => {
    setDraftGroup((prev) => prev ? { ...prev, name } : prev)
  }

  const draftSetType = (type: 'options' | 'quantity') => {
    setDraftGroup((prev) => {
      if (!prev) return prev
      if (type === 'quantity') {
        return { ...prev, type, unit_price: 0, min_qty: 1, max_qty: 12, options: [] }
      }
      return { ...prev, type, unit_price: undefined, min_qty: undefined, max_qty: undefined, label: undefined, options: prev.options.length ? prev.options : [newOption()] }
    })
  }

  const draftSetQuantityField = (field: 'unit_price' | 'min_qty' | 'max_qty' | 'label', value: string) => {
    setDraftGroup((prev) => {
      if (!prev) return prev
      if (field === 'label') return { ...prev, label: value }
      return { ...prev, [field]: Number(value) || 0 }
    })
  }

  const draftAddOption = () => {
    setDraftGroup((prev) =>
      prev ? { ...prev, options: [...(prev.options ?? []), newOption()] } : prev
    )
  }

  const draftUpdateOption = (idx: number, field: 'name' | 'price', value: string) => {
    setDraftGroup((prev) => {
      if (!prev) return prev
      const options = (prev.options ?? []).map((o, i) =>
        i === idx
          ? { ...o, [field]: field === 'price' ? Number(value) || 0 : value }
          : o
      )
      return { ...prev, options }
    })
  }

  const draftRemoveOption = (idx: number) => {
    setDraftGroup((prev) => {
      if (!prev) return prev
      const options = (prev.options ?? []).filter((_, i) => i !== idx)
      return { ...prev, options: options.length ? options : [newOption()] }
    })
  }

  // ── Assign / mapping handlers ────────────────────────────────────────────

  const toggleModifier = (modifierId: string) => {
    if (!selectedItem) return
    setMappings((prev) => {
      const current = prev[selectedItem.id] ?? []
      const updated = current.includes(modifierId)
        ? current.filter((id) => id !== modifierId)
        : [...current, modifierId]
      return { ...prev, [selectedItem.id]: updated }
    })
  }

  const handleSaveMapping = async () => {
    if (!selectedItem) return
    setSavingMap(true)
    try {
      const res = await fetch('/api/admin/item-modifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: selectedItem.id,
          modifier_ids: mappings[selectedItem.id] ?? [],
        }),
      })
      if (res.ok) {
        setSavedItemId(selectedItem.id)
        setTimeout(() => setSavedItemId(null), 2000)
      }
    } finally {
      setSavingMap(false)
    }
  }

  const selectedModifierIds = selectedItem ? (mappings[selectedItem.id] ?? []) : []

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayoutClient active="modificadores">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sumak-brown/10 rounded-xl flex items-center justify-center">
              <Sliders size={20} className="text-sumak-brown" />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-bold text-sumak-brown">Modificadores</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Creá grupos de opciones y asignalos a los items del menú
              </p>
            </div>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab('groups')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'groups'
                ? 'bg-white shadow-sm text-sumak-brown'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Grupos de modificadores
          </button>
          <button
            onClick={() => setTab('assign')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'assign'
                ? 'bg-white shadow-sm text-sumak-brown'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Asignar a items
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : tab === 'groups' ? (

          /* ══════════════════════════════════════════════════════
             SECTION 1: Modifier Groups CRUD
          ══════════════════════════════════════════════════════ */

          <div className="space-y-4">

            {/* Existing groups */}
            {modifiers.length === 0 && editingGroupId !== 'new' && (
              <div className="bg-white rounded-2xl shadow-sm px-6 py-10 text-center text-gray-400 text-sm">
                No hay grupos de modificadores. Creá uno con el botón de abajo.
              </div>
            )}

            {modifiers.map((group) => {
              const isEditing = editingGroupId === group.id
              const isExpanded = expandedGroupId === group.id
              const isQuantity = group.type === 'quantity'

              return (
                <div key={group.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {isEditing && draftGroup ? (
                    /* Edit form */
                    <GroupEditForm
                      draft={draftGroup}
                      saving={savingGroup}
                      onNameChange={draftSetName}
                      onTypeChange={draftSetType}
                      onQuantityFieldChange={draftSetQuantityField}
                      onAddOption={draftAddOption}
                      onUpdateOption={draftUpdateOption}
                      onRemoveOption={draftRemoveOption}
                      onSave={handleSaveGroup}
                      onCancel={handleCancelEdit}
                    />
                  ) : (
                    /* Display row */
                    <>
                      <div className="flex items-center gap-3 px-5 py-4">
                        <button
                          onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                          className="flex-1 flex items-center gap-2 text-left"
                        >
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-gray-400 shrink-0" />
                          ) : (
                            <ChevronDown size={16} className="text-gray-400 shrink-0" />
                          )}
                          <span className="font-semibold text-gray-900">{group.name}</span>
                          {isQuantity ? (
                            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold ml-1">
                              Cantidad · {formatARS(group.unit_price ?? 0)}/un · {group.min_qty ?? 1}–{group.max_qty ?? 12}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 ml-1">
                              {(group.options ?? []).length} opción{(group.options ?? []).length !== 1 ? 'es' : ''}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => handleEditGroup(group)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-sumak-brown/5 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-gray-50 px-5 pb-4 pt-2">
                          {isQuantity ? (
                            <div className="text-sm text-gray-600 space-y-0.5">
                              <p>Precio unitario: <span className="font-semibold text-teal-600">{formatARS(group.unit_price ?? 0)}</span></p>
                              <p>Rango: <span className="font-semibold">{group.min_qty ?? 1} – {group.max_qty ?? 12} unidades</span></p>
                              {group.label && <p>Etiqueta: <span className="font-semibold">{group.label}</span></p>}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(group.options ?? []).map((opt) => (
                                <span
                                  key={opt.id}
                                  className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
                                >
                                  {opt.name}
                                  {opt.price > 0 && (
                                    <span className="ml-1 text-teal-600 font-semibold">
                                      +{formatARS(opt.price)}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* New group form */}
            {editingGroupId === 'new' && draftGroup && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <GroupEditForm
                  draft={draftGroup}
                  saving={savingGroup}
                  onNameChange={draftSetName}
                  onTypeChange={draftSetType}
                  onQuantityFieldChange={draftSetQuantityField}
                  onAddOption={draftAddOption}
                  onUpdateOption={draftUpdateOption}
                  onRemoveOption={draftRemoveOption}
                  onSave={handleSaveGroup}
                  onCancel={handleCancelEdit}
                />
              </div>
            )}

            {/* Add button */}
            {editingGroupId === null && (
              <button
                onClick={handleNewGroup}
                className="flex items-center gap-2 px-5 py-3 bg-sumak-brown text-white text-sm font-semibold rounded-xl hover:bg-sumak-brown/90 transition-colors active:scale-95 shadow-sm"
              >
                <Plus size={16} />
                Nuevo modificador
              </button>
            )}
          </div>

        ) : (

          /* ══════════════════════════════════════════════════════
             SECTION 2: Assign modifiers to menu items
          ══════════════════════════════════════════════════════ */

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Menu items list */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Items del menú</h2>
                <p className="text-xs text-gray-400 mt-0.5">Seleccioná un item para asignarle modificadores</p>
              </div>
              <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
                {menuItems.map((item) => {
                  const count = (mappings[item.id] ?? []).length
                  const isSelected = selectedItem?.id === item.id
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setSelectedItem(item)}
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-sumak-brown/5 border-l-4 border-sumak-brown'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                          {item.name}
                        </span>
                        {count > 0 && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            {count} mod.
                          </span>
                        )}
                        {savedItemId === item.id && (
                          <Check size={14} className="text-green-500 shrink-0" />
                        )}
                      </button>
                    </li>
                  )
                })}
                {menuItems.length === 0 && (
                  <li className="px-5 py-8 text-center text-gray-400 text-sm">
                    No se encontraron items en el menú
                  </li>
                )}
              </ul>
            </div>

            {/* Right: Modifier checkboxes */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
              {selectedItem ? (
                <>
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Modificadores para:{' '}
                      <span className="text-sumak-brown">{selectedItem.name}</span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Marcá los modificadores que aplican a este item
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[440px]">
                    {modifiers.length === 0 ? (
                      <div className="px-5 py-8 text-center text-gray-400 text-sm">
                        No hay modificadores. Creá uno en la pestaña anterior.
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {modifiers.map((mod) => {
                          const checked = selectedModifierIds.includes(mod.id)
                          const isQuantity = mod.type === 'quantity'
                          return (
                            <li key={mod.id} className="px-5 py-3">
                              <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleModifier(mod.id)}
                                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-sumak-brown focus:ring-sumak-brown/30 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-900">{mod.name}</p>
                                    {isQuantity && (
                                      <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                                        Cantidad
                                      </span>
                                    )}
                                  </div>
                                  {isQuantity ? (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {formatARS(mod.unit_price ?? 0)}/un · {mod.min_qty ?? 1}–{mod.max_qty ?? 12} unidades
                                    </p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(mod.options ?? []).map((opt) => (
                                        <span
                                          key={opt.id}
                                          className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                                        >
                                          {opt.name}
                                          {opt.price > 0 && (
                                            <span className="ml-1 text-teal-600 font-medium">
                                              +{formatARS(opt.price)}
                                            </span>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                    <button
                      onClick={handleSaveMapping}
                      disabled={savingMap}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-sumak-brown text-white font-semibold text-sm rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors active:scale-95"
                    >
                      {savingMap ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : savedItemId === selectedItem.id ? (
                        <Check size={15} />
                      ) : null}
                      {savingMap ? 'Guardando...' : 'Guardar asignación'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                  <Sliders size={32} className="opacity-30" />
                  <p className="text-sm font-medium">Seleccioná un item de la lista</p>
                  <p className="text-xs text-center max-w-48">
                    Hacé clic en un item para ver y asignar sus modificadores
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayoutClient>
  )
}

// ─── Group Edit Form (sub-component) ─────────────────────────────────────────

function GroupEditForm({
  draft,
  saving,
  onNameChange,
  onTypeChange,
  onQuantityFieldChange,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onSave,
  onCancel,
}: {
  draft: ModifierGroup
  saving: boolean
  onNameChange: (name: string) => void
  onTypeChange: (type: 'options' | 'quantity') => void
  onQuantityFieldChange: (field: 'unit_price' | 'min_qty' | 'max_qty' | 'label', value: string) => void
  onAddOption: () => void
  onUpdateOption: (idx: number, field: 'name' | 'price', value: string) => void
  onRemoveOption: (idx: number) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isQuantity = draft.type === 'quantity'

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Group name */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1">
          Nombre del grupo <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ej: Empanadas, Punto de cocción…"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
          autoFocus
        />
      </div>

      {/* Type selector */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-2">Tipo</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onTypeChange('options')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
              !isQuantity
                ? 'border-sumak-brown bg-sumak-brown/5 text-sumak-brown'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            }`}
          >
            <List size={14} />
            Opciones
          </button>
          <button
            type="button"
            onClick={() => onTypeChange('quantity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
              isQuantity
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Hash size={14} />
            Cantidad
          </button>
        </div>
      </div>

      {isQuantity ? (
        /* ── Quantity fields ── */
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Precio unitario ($)
            </label>
            <input
              type="number"
              value={draft.unit_price === 0 ? '' : draft.unit_price}
              onChange={(e) => onQuantityFieldChange('unit_price', e.target.value)}
              placeholder="Ej: 1300"
              min={0}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400/40 tabular-nums"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">Mínimo</label>
              <input
                type="number"
                value={draft.min_qty ?? 1}
                onChange={(e) => onQuantityFieldChange('min_qty', e.target.value)}
                min={1}
                max={99}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400/40 tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">Máximo</label>
              <input
                type="number"
                value={draft.max_qty ?? 12}
                onChange={(e) => onQuantityFieldChange('max_qty', e.target.value)}
                min={1}
                max={99}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400/40 tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">
              Etiqueta (opcional)
            </label>
            <input
              type="text"
              value={draft.label ?? ''}
              onChange={(e) => onQuantityFieldChange('label', e.target.value)}
              placeholder="Ej: Empanadas"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
            />
          </div>
          {/* Preview */}
          {(draft.unit_price ?? 0) > 0 && (
            <div className="bg-teal-50 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-teal-700 mb-2">Vista previa del scroller</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(
                  { length: Math.min((draft.max_qty ?? 12) - (draft.min_qty ?? 1) + 1, 12) },
                  (_, i) => (draft.min_qty ?? 1) + i
                ).map((qty) => (
                  <div
                    key={qty}
                    className="flex flex-col items-center justify-center w-12 h-12 rounded-xl border-2 border-teal-200 bg-white text-gray-700"
                  >
                    <span className="text-base font-black leading-none">{qty}</span>
                    <span className="text-[9px] font-bold text-teal-600 leading-none mt-0.5">
                      {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format((draft.unit_price ?? 0) * qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Options editor ── */
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">Opciones</label>
          <div className="space-y-2">
            {(draft.options ?? []).map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt.name}
                  onChange={(e) => onUpdateOption(idx, 'name', e.target.value)}
                  placeholder="Nombre de opción"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                />
                <input
                  type="number"
                  value={opt.price === 0 ? '' : opt.price}
                  onChange={(e) => onUpdateOption(idx, 'price', e.target.value)}
                  placeholder="$ extra"
                  min={0}
                  className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => onRemoveOption(idx)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Quitar opción"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onAddOption}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-sumak-brown hover:text-sumak-brown/80 transition-colors"
          >
            <Plus size={13} />
            Agregar opción
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.name.trim()}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-sumak-brown hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors active:scale-95"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
