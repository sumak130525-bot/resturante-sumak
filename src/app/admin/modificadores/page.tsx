'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { RefreshCw, Check, Sliders } from 'lucide-react'

type ModifierOption = {
  id: string
  name: string
  price: number
}

type Modifier = {
  id: string
  name: string
  options: ModifierOption[]
}

type LoyverseItem = {
  id: string
  item_name: string
}

function formatARS(price: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

export default function AdminModificadoresPage() {
  const [items, setItems] = useState<LoyverseItem[]>([])
  const [modifiers, setModifiers] = useState<Modifier[]>([])
  const [mappings, setMappings] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<LoyverseItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedItemId, setSavedItemId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, modifiersRes, mappingsRes] = await Promise.all([
        fetch('/api/loyverse/items'),
        fetch('/api/pos/modifiers'),
        fetch('/api/admin/item-modifiers'),
      ])
      if (itemsRes.ok) {
        const d = await itemsRes.json()
        setItems(d.items ?? [])
      }
      if (modifiersRes.ok) {
        const d = await modifiersRes.json()
        setModifiers(d.modifiers ?? [])
      }
      if (mappingsRes.ok) {
        const d = await mappingsRes.json()
        setMappings(d.mappings ?? {})
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggleModifier = (modifierId: string) => {
    if (!selectedItem) return
    setMappings((prev) => {
      const current = prev[selectedItem.id] ?? []
      const has = current.includes(modifierId)
      const updated = has
        ? current.filter((id) => id !== modifierId)
        : [...current, modifierId]
      return { ...prev, [selectedItem.id]: updated }
    })
  }

  const handleSave = async () => {
    if (!selectedItem) return
    setSaving(true)
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
      setSaving(false)
    }
  }

  const selectedModifierIds = selectedItem ? (mappings[selectedItem.id] ?? []) : []

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
                Asigná modificadores de Loyverse a los items del POS
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

        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Items list */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Items de Loyverse</h2>
                <p className="text-xs text-gray-400 mt-0.5">Seleccioná un item para asignarle modificadores</p>
              </div>
              <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
                {items.map((item) => {
                  const hasModifiers = (mappings[item.id] ?? []).length > 0
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
                          {item.item_name}
                        </span>
                        {hasModifiers && (
                          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            {(mappings[item.id] ?? []).length} mod.
                          </span>
                        )}
                        {savedItemId === item.id && (
                          <Check size={14} className="text-green-500 shrink-0" />
                        )}
                      </button>
                    </li>
                  )
                })}
                {items.length === 0 && (
                  <li className="px-5 py-8 text-center text-gray-400 text-sm">
                    No se encontraron items en Loyverse
                  </li>
                )}
              </ul>
            </div>

            {/* Right: Modifiers panel */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
              {selectedItem ? (
                <>
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Modificadores para:{' '}
                      <span className="text-sumak-brown">{selectedItem.item_name}</span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Marcá los modificadores que aplican a este item
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[440px]">
                    {modifiers.length === 0 ? (
                      <div className="px-5 py-8 text-center text-gray-400 text-sm">
                        No hay modificadores en Loyverse
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {modifiers.map((mod) => {
                          const checked = selectedModifierIds.includes(mod.id)
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
                                  <p className="text-sm font-semibold text-gray-900">{mod.name}</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {mod.options.map((opt) => (
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
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-sumak-brown text-white font-semibold text-sm rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors active:scale-95"
                    >
                      {saving ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : savedItemId === selectedItem.id ? (
                        <Check size={15} />
                      ) : null}
                      {saving ? 'Guardando...' : 'Guardar asignación'}
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
