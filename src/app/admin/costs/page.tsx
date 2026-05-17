'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  ChevronRight,
  PackageOpen,
  Utensils,
} from 'lucide-react'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface Ingredient {
  id: string
  name: string
  unit: string
  price_per_unit: number
  supplier: string | null
}

interface CostRow {
  id: string
  name: string
  price: number
  ingredientCost: number
  packaging: number
  labor: number
  indirect: number
  totalCost: number
  profit: number
  margin: number
  suggestedPrice: number
  notes: string
}

interface RecipeRow {
  ingredient_id: string
  quantity: number
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function marginColor(margin: number) {
  if (margin >= 60) return 'text-emerald-600 bg-emerald-50'
  if (margin >= 40) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

function marginDot(margin: number) {
  if (margin >= 60) return 'bg-emerald-500'
  if (margin >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

// ──────────────────────────────────────────────
// Ingredient Form (inline modal)
// ──────────────────────────────────────────────
function IngredientModal({
  ingredient,
  onSave,
  onClose,
}: {
  ingredient: Partial<Ingredient> | null
  onSave: (data: Partial<Ingredient>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<Partial<Ingredient>>(
    ingredient ?? { name: '', unit: 'kg', price_per_unit: 0, supplier: '' }
  )
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{ingredient?.id ? 'Editar ingrediente' : 'Nuevo ingrediente'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unidad</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.unit ?? 'kg'}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              >
                <option value="kg">kg</option>
                <option value="lt">lt</option>
                <option value="unidad">unidad</option>
                <option value="gr">gr</option>
                <option value="ml">ml</option>
                <option value="docena">docena</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Precio / unidad</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={form.price_per_unit ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, price_per_unit: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form.supplier ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Plate Cost Modal
// ──────────────────────────────────────────────
function PlateCostModal({
  plate,
  ingredients,
  recipeInit,
  plateCostInit,
  onSave,
  onClose,
}: {
  plate: CostRow
  ingredients: Ingredient[]
  recipeInit: RecipeRow[]
  plateCostInit: { packaging: number; labor: number; indirect: number; notes: string }
  onSave: (data: {
    menu_item_id: string
    packaging: number
    labor: number
    indirect: number
    notes: string
    recipe: RecipeRow[]
  }) => Promise<void>
  onClose: () => void
}) {
  const [recipe, setRecipe] = useState<RecipeRow[]>(recipeInit.length > 0 ? recipeInit : [])
  const [packaging, setPackaging] = useState(plateCostInit.packaging)
  const [labor, setLabor] = useState(plateCostInit.labor)
  const [indirect, setIndirect] = useState(plateCostInit.indirect)
  const [notes, setNotes] = useState(plateCostInit.notes)
  const [saving, setSaving] = useState(false)

  const addRecipeRow = () => {
    setRecipe((r) => [...r, { ingredient_id: '', quantity: 0 }])
  }

  const removeRecipeRow = (idx: number) => {
    setRecipe((r) => r.filter((_, i) => i !== idx))
  }

  const updateRecipeRow = (idx: number, field: keyof RecipeRow, value: string | number) => {
    setRecipe((r) => r.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  // Calculated totals
  const ingredientCost = recipe.reduce((sum, ri) => {
    const ing = ingredients.find((i) => i.id === ri.ingredient_id)
    return sum + (ing ? ing.price_per_unit * Number(ri.quantity) : 0)
  }, 0)
  const totalCost = ingredientCost + packaging + labor + indirect
  const profit = plate.price - totalCost
  const margin = plate.price > 0 ? (profit / plate.price) * 100 : 0
  const suggestedPrice = totalCost * 3

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ menu_item_id: plate.id, packaging, labor, indirect, notes, recipe })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{plate.name}</h2>
            <p className="text-sm text-gray-400 mt-0.5">Precio de venta: <span className="font-semibold text-indigo-600">{formatPrice(plate.price)}</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Ingredients section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Ingredientes</h3>
              <button
                onClick={addRecipeRow}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                <Plus size={13} /> Agregar
              </button>
            </div>
            {recipe.length === 0 && (
              <p className="text-sm text-gray-400 py-3">Sin ingredientes definidos.</p>
            )}
            {recipe.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_100px_80px_32px] gap-2 text-xs text-gray-400 font-medium uppercase tracking-wide px-1">
                  <span>Ingrediente</span>
                  <span>Cantidad</span>
                  <span className="text-right">Subtotal</span>
                  <span />
                </div>
                {recipe.map((row, idx) => {
                  const ing = ingredients.find((i) => i.id === row.ingredient_id)
                  const subtotal = ing ? ing.price_per_unit * Number(row.quantity) : 0
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_100px_80px_32px] gap-2 items-center">
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={row.ingredient_id}
                        onChange={(e) => updateRecipeRow(idx, 'ingredient_id', e.target.value)}
                      >
                        <option value="">Seleccionar...</option>
                        {ingredients.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={row.quantity}
                        onChange={(e) => updateRecipeRow(idx, 'quantity', e.target.value)}
                      />
                      <p className="text-right text-sm font-medium text-gray-700">{formatPrice(subtotal)}</p>
                      <button
                        onClick={() => removeRecipeRow(idx)}
                        className="p-1 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors text-gray-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
                <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                  <span className="text-gray-500">Total ingredientes</span>
                  <span className="font-semibold text-gray-800">{formatPrice(ingredientCost)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Indirect costs */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Costos indirectos</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Packaging', value: packaging, set: setPackaging },
                { label: 'Mano de obra', value: labor, set: setLabor },
                { label: 'Indirectos', value: indirect, set: setIndirect },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="block text-xs text-gray-400 font-medium mb-1">{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-400 font-medium mb-1">Notas</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional..."
              />
            </div>
          </section>

          {/* Summary */}
          <section className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Resumen</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Costo ingredientes</span>
                <span className="font-medium text-gray-800">{formatPrice(ingredientCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Packaging + mano de obra + indirectos</span>
                <span className="font-medium text-gray-800">{formatPrice(packaging + labor + indirect)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5">
                <span className="font-semibold text-gray-700">Costo total</span>
                <span className="font-bold text-gray-900">{formatPrice(totalCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Precio de venta</span>
                <span className="font-medium text-indigo-600">{formatPrice(plate.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ganancia</span>
                <span className={`font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatPrice(profit)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Margen %</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${marginColor(margin)}`}>
                  {margin.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Precio sugerido (costo × 3)</span>
                <span className="font-medium text-gray-700">{formatPrice(suggestedPrice)}</span>
              </div>
            </div>

            {/* Visual margin indicator */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${marginDot(margin)}`} />
              <span className="text-xs text-gray-500">
                {margin >= 60 ? 'Margen saludable (> 60%)' : margin >= 40 ? 'Margen aceptable (40–60%)' : 'Margen bajo (< 40%)'}
              </span>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex-shrink-0">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function CostsPage() {
  const [tab, setTab] = useState<'ingredients' | 'costs'>('costs')

  // Ingredients state
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ingredientsLoading, setIngredientsLoading] = useState(true)
  const [editIngredient, setEditIngredient] = useState<Partial<Ingredient> | null | undefined>(undefined) // undefined = closed

  // Inline price edit state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState<string>('')
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const [savedPriceId, setSavedPriceId] = useState<string | null>(null)

  // Costs state
  const [costs, setCosts] = useState<CostRow[]>([])
  const [costsLoading, setCostsLoading] = useState(true)
  const [editPlate, setEditPlate] = useState<CostRow | null>(null)
  const [plateRecipe, setPlateRecipe] = useState<RecipeRow[]>([])
  const [plateCostInit, setPlateCostInit] = useState({ packaging: 0, labor: 0, indirect: 0, notes: '' })
  const [plateModalLoading, setPlateModalLoading] = useState(false)

  const fetchIngredients = useCallback(async () => {
    setIngredientsLoading(true)
    const res = await fetch('/api/admin/ingredients')
    if (res.ok) setIngredients(await res.json())
    setIngredientsLoading(false)
  }, [])

  const fetchCosts = useCallback(async () => {
    setCostsLoading(true)
    const res = await fetch('/api/admin/costs')
    if (res.ok) setCosts(await res.json())
    setCostsLoading(false)
  }, [])

  useEffect(() => {
    fetchIngredients()
    fetchCosts()
  }, [fetchIngredients, fetchCosts])

  // Ingredient CRUD
  const handleSaveIngredient = async (data: Partial<Ingredient>) => {
    const method = data.id ? 'PUT' : 'POST'
    const res = await fetch('/api/admin/ingredients', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error)
      return
    }
    await fetchIngredients()
    setEditIngredient(undefined)
  }

  const handleDeleteIngredient = async (id: string) => {
    if (!confirm('¿Eliminar este ingrediente?')) return
    await fetch('/api/admin/ingredients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchIngredients()
  }

  // Inline price save
  const savePriceInline = async (ing: Ingredient, rawValue: string) => {
    const newPrice = parseFloat(rawValue)
    if (isNaN(newPrice) || newPrice === ing.price_per_unit) {
      setEditingPriceId(null)
      return
    }
    setSavingPriceId(ing.id)
    setEditingPriceId(null)
    try {
      const res = await fetch('/api/admin/ingredients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ing.id, price_per_unit: newPrice }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error)
        return
      }
      // Optimistic update
      setIngredients((prev) =>
        prev.map((i) => (i.id === ing.id ? { ...i, price_per_unit: newPrice } : i))
      )
      setSavedPriceId(ing.id)
      setTimeout(() => setSavedPriceId(null), 1500)
      // Refresh costs tab since price affects dish margins
      fetchCosts()
    } finally {
      setSavingPriceId(null)
    }
  }

  // Open plate cost modal: fetch current recipe
  const openPlateModal = async (plate: CostRow) => {
    setPlateModalLoading(true)
    setEditPlate(plate)
    try {
      // Fetch recipe_items for this plate
      const [recipeRes, plateCostRes] = await Promise.all([
        fetch(`/api/admin/costs/recipe?menu_item_id=${plate.id}`),
        Promise.resolve(null), // plate_costs already in `plate`
      ])
      void plateCostRes

      let recipe: RecipeRow[] = []
      if (recipeRes.ok) {
        recipe = await recipeRes.json()
      }
      setPlateRecipe(recipe)
      setPlateCostInit({
        packaging: plate.packaging,
        labor: plate.labor,
        indirect: plate.indirect,
        notes: plate.notes,
      })
    } finally {
      setPlateModalLoading(false)
    }
  }

  const handleSavePlateCost = async (data: {
    menu_item_id: string
    packaging: number
    labor: number
    indirect: number
    notes: string
    recipe: RecipeRow[]
  }) => {
    const res = await fetch('/api/admin/costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error)
      return
    }
    await fetchCosts()
    setEditPlate(null)
  }

  return (
    <AdminLayoutClient active="costs">
      <div className="max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-gray-900">Control de Costos</h1>
            <p className="text-gray-500 text-sm mt-1">Gestión de ingredientes y márgenes por plato</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
          {[
            { label: 'Costos por plato', value: 'costs' as const, icon: Utensils },
            { label: 'Ingredientes', value: 'ingredients' as const, icon: PackageOpen },
          ].map(({ label, value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: INGREDIENTS ── */}
        {tab === 'ingredients' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{ingredients.length} ingredientes registrados</p>
              <button
                onClick={() => setEditIngredient({ name: '', unit: 'kg', price_per_unit: 0, supplier: '' })}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Plus size={15} />
                Nuevo ingrediente
              </button>
            </div>

            {ingredientsLoading ? (
              <div className="text-center py-12 text-gray-400">Cargando ingredientes...</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {ingredients.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <PackageOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p>Sin ingredientes todavía.</p>
                    <p className="text-xs mt-1">Agrega el primero para empezar a calcular costos.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                          <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                          <th className="text-right p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio / unidad</th>
                          <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Proveedor</th>
                          <th className="text-right p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {ingredients.map((ing) => (
                          <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-medium text-gray-800">{ing.name}</td>
                            <td className="p-4 text-gray-500">
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">{ing.unit}</span>
                            </td>
                            <td className="p-4 text-right">
                              {editingPriceId === ing.id ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  autoFocus
                                  className="border border-indigo-400 rounded-lg px-2 py-0.5 text-sm text-right w-24 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  value={editingPriceValue}
                                  onChange={(e) => setEditingPriceValue(e.target.value)}
                                  onBlur={() => savePriceInline(ing, editingPriceValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur()
                                    if (e.key === 'Escape') { setEditingPriceId(null) }
                                  }}
                                />
                              ) : (
                                <button
                                  onClick={() => { setEditingPriceId(ing.id); setEditingPriceValue(String(ing.price_per_unit)) }}
                                  className={`font-semibold transition-colors ${
                                    savedPriceId === ing.id
                                      ? 'text-emerald-600'
                                      : savingPriceId === ing.id
                                        ? 'text-gray-400'
                                        : 'text-indigo-600 hover:text-indigo-800'
                                  }`}
                                  title="Click para editar precio"
                                >
                                  {savingPriceId === ing.id ? '...' : formatPrice(ing.price_per_unit)}
                                </button>
                              )}
                            </td>
                            <td className="p-4 text-gray-400 text-sm hidden md:table-cell">{ing.supplier ?? '—'}</td>
                            <td className="p-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setEditIngredient(ing)}
                                  className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors text-gray-400"
                                  title="Editar"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteIngredient(ing.id)}
                                  className="p-2 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors text-gray-400"
                                  title="Eliminar"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: COSTS PER PLATE ── */}
        {tab === 'costs' && (
          <div>
            {costsLoading ? (
              <div className="text-center py-12 text-gray-400">Cargando platos...</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {costs.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Utensils size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No hay platos activos en el menú.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plato</th>
                          <th className="text-right p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Costo</th>
                          <th className="text-right p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio venta</th>
                          <th className="text-right p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Ganancia</th>
                          <th className="text-right p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Margen</th>
                          <th className="p-4 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {costs.map((row) => (
                          <tr
                            key={row.id}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => openPlateModal(row)}
                          >
                            <td className="p-4">
                              <p className="font-semibold text-gray-800">{row.name}</p>
                              {row.notes && <p className="text-xs text-gray-400 mt-0.5">{row.notes}</p>}
                            </td>
                            <td className="p-4 text-right text-gray-600 hidden sm:table-cell">
                              {row.totalCost > 0 ? formatPrice(row.totalCost) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="p-4 text-right font-bold text-indigo-600">{formatPrice(row.price)}</td>
                            <td className="p-4 text-right hidden md:table-cell">
                              {row.totalCost > 0 ? (
                                <span className={row.profit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                                  {formatPrice(row.profit)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              {row.totalCost > 0 ? (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${marginColor(row.margin)}`}>
                                  {row.margin.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300 px-2 py-0.5">—</span>
                              )}
                            </td>
                            <td className="p-4 text-gray-400">
                              <ChevronRight size={16} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ingredient Modal */}
      {editIngredient !== undefined && (
        <IngredientModal
          ingredient={editIngredient}
          onSave={handleSaveIngredient}
          onClose={() => setEditIngredient(undefined)}
        />
      )}

      {/* Plate Cost Modal */}
      {editPlate && !plateModalLoading && (
        <PlateCostModal
          plate={editPlate}
          ingredients={ingredients}
          recipeInit={plateRecipe}
          plateCostInit={plateCostInit}
          onSave={handleSavePlateCost}
          onClose={() => setEditPlate(null)}
        />
      )}
      {editPlate && plateModalLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-8 text-gray-500 text-sm">Cargando...</div>
        </div>
      )}
    </AdminLayoutClient>
  )
}
