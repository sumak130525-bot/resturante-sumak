'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import {
  Package,
  AlertTriangle,
  X,
  Save,
  ChevronRight,
  ShoppingCart,
  SlidersHorizontal,
  History,
  ArrowLeft,
  Tag,
  Pencil,
  Trash2,
  Plus,
  Check,
} from 'lucide-react'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface IngredientCategory {
  id: string
  name: string
  created_at: string
}

interface MenuItem {
  id: string
  name: string
}

interface InventoryItem {
  ingredient_id: string
  name: string
  unit: string
  stock: number
  min_stock: number
  status: 'ok' | 'low' | 'critical'
  alert: boolean
  last_purchase_date: string | null
  last_purchase_qty: number | null
  last_purchase_price: number | null
  updated_at: string | null
  last_movement: {
    type: string
    quantity: number
    created_at: string
  } | null
  inventory_id: string | null
  category_id?: string | null
  ingredient_categories?: { id: string; name: string } | null
  linked_menu_item_id?: string | null
}

interface Movement {
  id: string
  ingredient_id: string
  type: 'purchase' | 'consumption' | 'adjustment'
  quantity: number
  notes: string | null
  created_at: string
  ingredients: { name: string; unit: string } | null
}

type FilterType = 'all' | 'low' | 'critical'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function statusBadge(status: InventoryItem['status']) {
  if (status === 'ok') return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  if (status === 'low') return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-red-100 text-red-700 border border-red-200'
}

function statusLabel(status: InventoryItem['status']) {
  if (status === 'ok') return 'OK'
  if (status === 'low') return 'Bajo'
  return 'Critico'
}

function movementTypeLabel(type: string) {
  if (type === 'purchase') return { label: 'Compra', cls: 'bg-blue-100 text-blue-700' }
  if (type === 'consumption') return { label: 'Consumo', cls: 'bg-orange-100 text-orange-700' }
  return { label: 'Ajuste', cls: 'bg-purple-100 text-purple-700' }
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function stockPercent(stock: number, min_stock: number) {
  if (min_stock <= 0) return stock > 0 ? 100 : 0
  const pct = (stock / (min_stock * 2)) * 100
  return Math.min(100, Math.max(0, pct))
}

function progressColor(status: InventoryItem['status']) {
  if (status === 'ok') return 'bg-emerald-500'
  if (status === 'low') return 'bg-amber-400'
  return 'bg-red-500'
}

// ──────────────────────────────────────────────
// Manual Purchase Modal (no invoice)
// ──────────────────────────────────────────────
function ManualPurchaseModal({
  items,
  categories,
  menuItems,
  onClose,
  onSaved,
}: {
  items: InventoryItem[]
  categories: IngredientCategory[]
  menuItems: MenuItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  // existing
  const [ingredientId, setIngredientId] = useState('')
  // new ingredient fields
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('')
  // common fields
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [supplier, setSupplier] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [menuItemId, setMenuItemId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'existing' && !ingredientId) { setError('Selecciona un ingrediente'); return }
    if (mode === 'new' && !newName.trim()) { setError('Ingresa el nombre del ingrediente'); return }
    if (mode === 'new' && !newUnit.trim()) { setError('Ingresa la unidad (ej: kg, L, u)'); return }
    if (!quantity || Number(quantity) <= 0) { setError('Ingresa una cantidad válida'); return }

    setSaving(true)
    setError(null)

    try {
      let finalIngredientId = ingredientId

      // 1. Create ingredient if new
      if (mode === 'new') {
        const createBody: Record<string, unknown> = {
          name: newName.trim(),
          unit: newUnit.trim(),
        }
        if (unitPrice) createBody.price_per_unit = Number(unitPrice)
        if (supplier) createBody.supplier = supplier.trim()
        if (categoryId) createBody.category_id = categoryId
        if (menuItemId) createBody.menu_item_id = menuItemId

        const createRes = await fetch('/api/admin/ingredients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        })
        if (!createRes.ok) {
          const d = await createRes.json()
          setError(d.error ?? 'Error al crear el ingrediente')
          return
        }
        const created = await createRes.json()
        finalIngredientId = created.id
      } else {
        // 2. Update price_per_unit on existing ingredient if provided
        const updateBody: Record<string, unknown> = { id: finalIngredientId }
        if (unitPrice) updateBody.price_per_unit = Number(unitPrice)
        if (supplier) updateBody.supplier = supplier.trim()
        if (categoryId) updateBody.category_id = categoryId
        if (menuItemId) updateBody.menu_item_id = menuItemId

        if (unitPrice || supplier || categoryId || menuItemId) {
          const updateRes = await fetch('/api/admin/ingredients', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateBody),
          })
          if (!updateRes.ok) {
            const d = await updateRes.json()
            setError(d.error ?? 'Error al actualizar el ingrediente')
            return
          }
        }
      }

      // 3. Create inventory movement (purchase) — also updates stock
      const movRes = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: finalIngredientId,
          type: 'purchase',
          quantity: Number(quantity),
          price: unitPrice ? Number(unitPrice) * Number(quantity) : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      if (!movRes.ok) {
        const d = await movRes.json()
        setError(d.error ?? 'Error al registrar el movimiento')
        return
      }

      setSuccess(true)
      onSaved()
      setTimeout(() => {
        setSuccess(false)
        // Reset form
        setMode('existing')
        setIngredientId('')
        setNewName('')
        setNewUnit('')
        setQuantity('')
        setUnitPrice('')
        setSupplier('')
        setCategoryId('')
        setMenuItemId('')
        setNotes('')
      }, 1200)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Plus size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Agregar compra</h2>
              <p className="text-xs text-gray-400">Ingreso manual sin factura</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          <form id="manual-purchase-form" onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-100">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 text-emerald-700 text-sm px-3 py-2 rounded-lg border border-emerald-100 flex items-center gap-2">
                <Check size={14} />
                Compra registrada exitosamente
              </div>
            )}

            {/* Ingredient toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Ingrediente *</label>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-3 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Existente
                </button>
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Nuevo ingrediente
                </button>
              </div>

              {mode === 'existing' ? (
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={ingredientId}
                  onChange={(e) => setIngredientId(e.target.value)}
                  required
                >
                  <option value="">Seleccionar ingrediente...</option>
                  {items.map((i) => (
                    <option key={i.ingredient_id} value={i.ingredient_id}>
                      {i.name} ({i.unit}) — Stock: {i.stock}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      placeholder="Nombre del ingrediente *"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required={mode === 'new'}
                    />
                  </div>
                  <div>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      placeholder="Unidad (kg, L, u...) *"
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      required={mode === 'new'}
                    />
                  </div>
                  <div>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                    >
                      <option value="">Sin categoría</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Vincular a producto del menú */}
            {menuItems.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Vincular a producto del menú (opcional)</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={menuItemId}
                  onChange={(e) => setMenuItemId(e.target.value)}
                >
                  <option value="">— Sin vincular —</option>
                  {menuItems.map((mi) => (
                    <option key={mi.id} value={mi.id}>{mi.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity + Unit price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad comprada *</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Precio unitario (opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Supplier */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor (opcional)</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej: verdulero del barrio, mercado central..."
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>

            {/* Category for existing ingredient */}
            {mode === 'existing' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Categoría (opcional — actualiza el ingrediente)</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Sin cambios</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nota (opcional)</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej: compra en efectivo al verdulero"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Total preview */}
            {quantity && unitPrice && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center justify-between">
                <span>Total estimado</span>
                <span className="font-bold">
                  ${(Number(quantity) * Number(unitPrice)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="manual-purchase-form"
            disabled={saving || success}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? (
              <span>Guardando...</span>
            ) : success ? (
              <><Check size={14} /> Guardado</>
            ) : (
              <><Save size={14} /> Guardar compra</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Purchase / Adjustment Modal
// ──────────────────────────────────────────────
function StockModal({
  mode,
  items,
  selectedId,
  onClose,
  onSaved,
}: {
  mode: 'purchase' | 'adjustment'
  items: InventoryItem[]
  selectedId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [ingredientId, setIngredientId] = useState(selectedId ?? '')
  const [quantity, setQuantity] = useState<string>('')
  const [price, setPrice] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ingredientId) { setError('Selecciona un ingrediente'); return }
    if (quantity === '') { setError('Ingresa una cantidad'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: ingredientId,
          type: mode,
          quantity: Number(quantity),
          price: price ? Number(price) : undefined,
          notes: notes || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al guardar')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {mode === 'purchase' ? (
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <ShoppingCart size={16} className="text-blue-600" />
              </div>
            ) : (
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <SlidersHorizontal size={16} className="text-purple-600" />
              </div>
            )}
            <h2 className="font-semibold text-gray-900">
              {mode === 'purchase' ? 'Registrar Compra' : 'Ajuste de Stock'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-100">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ingrediente *</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              required
            >
              <option value="">Seleccionar ingrediente...</option>
              {items.map((i) => (
                <option key={i.ingredient_id} value={i.ingredient_id}>
                  {i.name} ({i.unit}) — Stock: {i.stock}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {mode === 'purchase' ? 'Cantidad comprada *' : 'Nuevo stock *'}
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            {mode === 'purchase' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Precio total (opcional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas (opcional)</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Ej: Proveedor X, lote 001..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {mode === 'adjustment' && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              El ajuste reemplaza el stock actual con el valor ingresado.
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'purchase'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
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
// Historial Modal
// ──────────────────────────────────────────────
function HistoryPanel({
  item,
  onClose,
}: {
  item: InventoryItem
  onClose: () => void
}) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/inventory/movements?ingredient_id=${item.ingredient_id}&limit=100`)
      .then((r) => r.json())
      .then((d) => setMovements(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [item.ingredient_id])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{item.name}</h2>
              <p className="text-xs text-gray-400">Historial de movimientos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs text-gray-400">Stock actual</p>
              <p className="font-bold text-gray-900">{item.stock} {item.unit}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <History size={32} className="mx-auto mb-2 opacity-30" />
              <p>Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {movements.map((mov) => {
                const { label, cls } = movementTypeLabel(mov.type)
                const sign = mov.type === 'consumption' ? '-' : mov.type === 'purchase' ? '+' : '='
                const signColor = mov.type === 'consumption' ? 'text-red-500' : mov.type === 'purchase' ? 'text-emerald-600' : 'text-purple-600'
                return (
                  <div key={mov.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
                        {mov.notes && (
                          <span className="text-xs text-gray-400 truncate">{mov.notes}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(mov.created_at)}</p>
                    </div>
                    <p className={`text-sm font-bold flex-shrink-0 ${signColor}`}>
                      {sign}{mov.quantity} {item.unit}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Manage Categories Modal
// ──────────────────────────────────────────────
function ManageCategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: IngredientCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  const [list, setList] = useState<IngredientCategory[]>(categories)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ingredient-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al crear')
        return
      }
      const created = await res.json()
      setList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'es')))
      setNewName('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (id: string) => {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ingredient-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al actualizar')
        return
      }
      const updated = await res.json()
      setList((prev) => prev.map((c) => c.id === id ? updated : c).sort((a, b) => a.name.localeCompare(b.name, 'es')))
      setEditId(null)
      setEditName('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la categoría "${name}"? Los ingredientes quedarán sin categoría.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ingredient-categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al eliminar')
        return
      }
      setList((prev) => prev.filter((c) => c.id !== id))
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Tag size={15} className="text-indigo-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Categorías de Ingredientes</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          {/* Create new */}
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Nueva categoría..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={14} />
              Crear
            </button>
          </form>

          {/* List */}
          {list.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin categorías aún</p>
          ) : (
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
              {list.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 p-3 hover:bg-gray-50 transition-colors">
                  {editId === cat.id ? (
                    <>
                      <input
                        className="flex-1 border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEdit(cat.id) } if (e.key === 'Escape') { setEditId(null) } }}
                      />
                      <button
                        onClick={() => handleEdit(cat.id)}
                        disabled={saving}
                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Save size={13} />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                      <button
                        onClick={() => { setEditId(cat.id); setEditName(cat.name) }}
                        className="p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id, cat.name)}
                        disabled={saving}
                        className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Category Min Stock Modal
// ──────────────────────────────────────────────
function CategoryMinStockModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: IngredientCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/settings?prefix=min_stock_category_')
        if (res.ok) {
          const data: { key: string; value: string }[] = await res.json()
          const map: Record<string, string> = {}
          for (const row of data) {
            const catId = row.key.replace('min_stock_category_', '')
            map[catId] = row.value
          }
          setValues(map)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async (categoryId: string) => {
    const raw = values[categoryId] ?? ''
    const num = parseFloat(raw)
    if (raw === '' || isNaN(num) || num < 0) {
      setError(`Valor inválido para la categoría`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `min_stock_category_${categoryId}`, value: String(num) }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al guardar')
        return
      }
      setSavedKeys((prev) => { const s = new Set(prev); s.add(categoryId); return s })
      setTimeout(() => setSavedKeys((prev) => { const s = new Set(prev); s.delete(categoryId); return s }), 1500)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (categoryId: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `min_stock_category_${categoryId}` }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al eliminar')
        return
      }
      setValues((prev) => { const next = { ...prev }; delete next[categoryId]; return next })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <AlertTriangle size={15} className="text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Stock mínimo por categoría</h2>
              <p className="text-xs text-gray-400">Sobrescribe el default de cada ingrediente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No hay categorías creadas todavía.</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Dejá el campo vacío para usar el min_stock individual de cada ingrediente (default: 5).
              </p>
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {categories.map((cat) => {
                  const val = values[cat.id] ?? ''
                  const isSaved = savedKeys.has(cat.id)
                  const hasValue = val !== ''
                  return (
                    <div key={cat.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                      <span className="flex-1 text-sm text-gray-800 font-medium">{cat.name}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="— "
                          value={val}
                          onChange={(e) => setValues((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(cat.id) } }}
                        />
                        <button
                          onClick={() => handleSave(cat.id)}
                          disabled={saving || val === ''}
                          className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-40"
                          title="Guardar"
                        >
                          {isSaved ? <Check size={13} /> : <Save size={13} />}
                        </button>
                        {hasValue && (
                          <button
                            onClick={() => handleDelete(cat.id)}
                            disabled={saving}
                            className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                            title="Quitar configuración"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [modal, setModal] = useState<'purchase' | 'adjustment' | null>(null)
  const [modalSelectedId, setModalSelectedId] = useState<string | undefined>()
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [showManualPurchase, setShowManualPurchase] = useState(false)
  const [showCategoryMinStock, setShowCategoryMinStock] = useState(false)

  // Ingredient categories
  const [categories, setCategories] = useState<IngredientCategory[]>([])

  // Menu items for manual purchase modal
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  // Category inline edit state
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null)
  const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null)

  // Menu item inline link state
  const [savingMenuItemId, setSavingMenuItemId] = useState<string | null>(null)
  const [savedMenuItemId, setSavedMenuItemId] = useState<string | null>(null)

  // Stock inline edit state
  const [editingStockId, setEditingStockId] = useState<string | null>(null)
  const [editingStockValue, setEditingStockValue] = useState<string>('')
  const [savingStockId, setSavingStockId] = useState<string | null>(null)
  const [savedStockId, setSavedStockId] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/admin/ingredient-categories')
    if (res.ok) setCategories(await res.json())
  }, [])

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/menu')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const sorted = (data as (MenuItem & { active?: boolean })[])
            .filter((m) => m && m.id && m.name && m.active !== false)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
          setMenuItems(sorted)
        }
      }
    } catch {/* non-critical */}
  }, [])

  const fetchInventory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/inventory')
      if (res.ok) setItems(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInventory()
    fetchCategories()
    fetchMenuItems()
  }, [fetchInventory, fetchCategories, fetchMenuItems])

  const criticalItems = items.filter((i) => i.status === 'critical')
  const lowItems = items.filter((i) => i.status === 'low')

  const filtered = items.filter((i) => {
    const statusOk =
      filter === 'all' ? true :
      filter === 'low' ? i.status === 'low' :
      filter === 'critical' ? i.status === 'critical' :
      true

    const catOk =
      categoryFilter === 'all' ? true :
      categoryFilter === 'none' ? !i.category_id :
      i.category_id === categoryFilter

    return statusOk && catOk
  })

  const getCategoryName = (item: InventoryItem) => {
    if (item.ingredient_categories?.name) return item.ingredient_categories.name
    if (item.category_id) {
      const cat = categories.find((c) => c.id === item.category_id)
      return cat?.name ?? 'Sin categoría'
    }
    return 'Sin categoría'
  }

  const handleCategoryChange = async (item: InventoryItem, newCategoryId: string) => {
    const prevCategoryId = item.category_id ?? null
    const prevCategoryName = item.ingredient_categories ?? null

    // Optimistically update local state
    setItems((prev) =>
      prev.map((i) =>
        i.ingredient_id === item.ingredient_id
          ? {
              ...i,
              category_id: newCategoryId || null,
              ingredient_categories: newCategoryId
                ? (categories.find((c) => c.id === newCategoryId) ?? null)
                : null,
            }
          : i
      )
    )

    setSavingCategoryId(item.ingredient_id)
    try {
      const res = await fetch('/api/admin/ingredients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.ingredient_id,
          category_id: newCategoryId || null,
        }),
      })
      if (!res.ok) {
        // Revert on failure
        setItems((prev) =>
          prev.map((i) =>
            i.ingredient_id === item.ingredient_id
              ? { ...i, category_id: prevCategoryId, ingredient_categories: prevCategoryName }
              : i
          )
        )
      } else {
        setSavedCategoryId(item.ingredient_id)
        setTimeout(() => setSavedCategoryId(null), 1500)
      }
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((i) =>
          i.ingredient_id === item.ingredient_id
            ? { ...i, category_id: prevCategoryId, ingredient_categories: prevCategoryName }
            : i
        )
      )
    } finally {
      setSavingCategoryId(null)
    }
  }

  const handleMenuItemChange = async (item: InventoryItem, newMenuItemId: string) => {
    const prevLinked = item.linked_menu_item_id ?? null

    // Optimistically update local state
    setItems((prev) =>
      prev.map((i) =>
        i.ingredient_id === item.ingredient_id
          ? { ...i, linked_menu_item_id: newMenuItemId || null }
          : i
      )
    )

    setSavingMenuItemId(item.ingredient_id)
    try {
      const res = await fetch('/api/admin/ingredients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.ingredient_id,
          menu_item_id: newMenuItemId || null,
        }),
      })
      if (!res.ok) {
        // Revert on failure
        setItems((prev) =>
          prev.map((i) =>
            i.ingredient_id === item.ingredient_id
              ? { ...i, linked_menu_item_id: prevLinked }
              : i
          )
        )
      } else {
        setSavedMenuItemId(item.ingredient_id)
        setTimeout(() => setSavedMenuItemId(null), 1500)
      }
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((i) =>
          i.ingredient_id === item.ingredient_id
            ? { ...i, linked_menu_item_id: prevLinked }
            : i
        )
      )
    } finally {
      setSavingMenuItemId(null)
    }
  }

  const handleStockSave = async (item: InventoryItem, rawValue: string) => {
    const newStock = parseFloat(rawValue)
    if (isNaN(newStock) || newStock < 0) {
      setEditingStockId(null)
      return
    }
    if (newStock === item.stock) {
      setEditingStockId(null)
      return
    }
    setEditingStockId(null)
    setSavingStockId(item.ingredient_id)
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: item.ingredient_id,
          type: 'adjustment',
          quantity: newStock,
          notes: 'Ajuste manual de stock',
        }),
      })
      if (res.ok) {
        setSavedStockId(item.ingredient_id)
        setTimeout(() => setSavedStockId(null), 1500)
        await fetchInventory()
      }
    } finally {
      setSavingStockId(null)
    }
  }

  const handleDeleteIngredient = async (item: InventoryItem) => {
    if (!confirm(`¿Borrar ${item.name}? Se eliminará el ingrediente y todo su historial de movimientos.`)) return
    const res = await fetch(`/api/admin/ingredients?id=${item.ingredient_id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      alert(d.error ?? 'Error al borrar el ingrediente')
      return
    }
    fetchInventory()
  }

  return (
    <AdminLayoutClient active="inventory">
      <div className="max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-gray-900">Inventario</h1>
            <p className="text-gray-500 text-sm mt-1">Control de stock de ingredientes en tiempo real</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowManageCategories(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <Tag size={15} />
              Categorías
            </button>
            <button
              onClick={() => setShowCategoryMinStock(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-700 rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <AlertTriangle size={15} />
              Stock mín. categoría
            </button>
            <button
              onClick={() => setShowManualPurchase(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <Plus size={15} />
              Agregar compra
            </button>
            <button
              onClick={() => { setModalSelectedId(undefined); setModal('purchase') }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <ShoppingCart size={15} />
              Registrar Compra
            </button>
            <button
              onClick={() => { setModalSelectedId(undefined); setModal('adjustment') }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <SlidersHorizontal size={15} />
              Ajuste
            </button>
          </div>
        </div>

        {/* Alert cards */}
        {(criticalItems.length > 0 || lowItems.length > 0) && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-red-500" />
              Alertas de stock
            </h2>
            <div className="flex flex-wrap gap-2">
              {criticalItems.map((item) => (
                <button
                  key={item.ingredient_id}
                  onClick={() => { setModalSelectedId(item.ingredient_id); setModal('purchase') }}
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm hover:bg-red-100 transition-colors group"
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
                  <span className="font-medium text-red-800">{item.name}</span>
                  <span className="text-red-500 text-xs">{item.stock} {item.unit}</span>
                  <ShoppingCart size={12} className="text-red-400 group-hover:text-red-600 transition-colors" />
                </button>
              ))}
              {lowItems.map((item) => (
                <button
                  key={item.ingredient_id}
                  onClick={() => { setModalSelectedId(item.ingredient_id); setModal('purchase') }}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm hover:bg-amber-100 transition-colors group"
                >
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="font-medium text-amber-800">{item.name}</span>
                  <span className="text-amber-600 text-xs">{item.stock} {item.unit}</span>
                  <ShoppingCart size={12} className="text-amber-400 group-hover:text-amber-600 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {([
              { key: 'all', label: `Todos (${items.length})` },
              { key: 'low', label: `Bajo (${lowItems.length})` },
              { key: 'critical', label: `Critico (${criticalItems.length})` },
            ] as { key: FilterType; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-gray-400 flex-shrink-0" />
              <select
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Todas las categorías</option>
                <option value="none">Sin categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30 animate-pulse" />
            <p>Cargando inventario...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin ingredientes en esta categoria</p>
            <p className="text-xs mt-1">Registra ingredientes en la sección de Costos primero.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingrediente</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vinculado a</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-48">Nivel</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Min.</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ult. movimiento</th>
                    <th className="p-4 w-28 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((item) => {
                    const pct = stockPercent(item.stock, item.min_stock)
                    return (
                      <tr
                        key={item.ingredient_id}
                        className="hover:bg-gray-50 transition-colors group cursor-pointer"
                        onClick={() => setHistoryItem(item)}
                      >
                        <td className="p-4">
                          <p className="font-semibold text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.unit}</p>
                        </td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <select
                              className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-medium border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer disabled:opacity-60"
                              value={item.category_id ?? ''}
                              disabled={savingCategoryId === item.ingredient_id}
                              onChange={(e) => handleCategoryChange(item, e.target.value)}
                            >
                              <option value="">Sin categoría</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                            {savedCategoryId === item.ingredient_id && (
                              <Check size={13} className="text-emerald-500 flex-shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <select
                              className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-medium border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer disabled:opacity-60"
                              value={item.linked_menu_item_id ?? ''}
                              disabled={savingMenuItemId === item.ingredient_id}
                              onChange={(e) => handleMenuItemChange(item, e.target.value)}
                            >
                              <option value="">— Sin vincular —</option>
                              {menuItems.map((mi) => (
                                <option key={mi.id} value={mi.id}>{mi.name}</option>
                              ))}
                            </select>
                            {savedMenuItemId === item.ingredient_id && (
                              <Check size={13} className="text-emerald-500 flex-shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          {editingStockId === item.ingredient_id ? (
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              autoFocus
                              className={`w-20 text-center font-bold text-base border rounded-lg px-1 py-0.5 focus:outline-none focus:border-emerald-400 bg-transparent ${
                                item.status === 'critical' ? 'text-red-600' :
                                item.status === 'low' ? 'text-amber-600' :
                                'text-gray-900'
                              }`}
                              value={editingStockValue}
                              onChange={(e) => setEditingStockValue(e.target.value)}
                              onBlur={() => handleStockSave(item, editingStockValue)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleStockSave(item, editingStockValue) }
                                if (e.key === 'Escape') { setEditingStockId(null) }
                              }}
                            />
                          ) : (
                            <button
                              className={`font-bold text-base text-left border border-transparent rounded-lg px-1 py-0.5 hover:border-emerald-300 transition-colors ${
                                item.status === 'critical' ? 'text-red-600' :
                                item.status === 'low' ? 'text-amber-600' :
                                'text-gray-900'
                              } ${savingStockId === item.ingredient_id ? 'opacity-50' : ''} ${savedStockId === item.ingredient_id ? 'bg-emerald-50' : ''}`}
                              title="Click para editar stock"
                              onClick={() => { setEditingStockId(item.ingredient_id); setEditingStockValue(String(item.stock)) }}
                            >
                              {item.stock}
                            </button>
                          )}
                          <span className="text-gray-400 text-xs ml-1">{item.unit}</span>
                        </td>
                        <td className="p-4">
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${progressColor(item.status)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% del mín.</p>
                        </td>
                        <td className="p-4 text-gray-500 text-sm">
                          {item.min_stock} {item.unit}
                        </td>
                        <td className="p-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusBadge(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-gray-400">
                          {item.last_movement ? (
                            <div>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${movementTypeLabel(item.last_movement.type).cls}`}>
                                {movementTypeLabel(item.last_movement.type).label}
                              </span>
                              <p className="mt-0.5">{fmtDate(item.last_movement.created_at)}</p>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Registrar compra"
                              onClick={(e) => { e.stopPropagation(); setModalSelectedId(item.ingredient_id); setModal('purchase') }}
                              className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors text-gray-400"
                            >
                              <ShoppingCart size={14} />
                            </button>
                            <button
                              title="Ajustar stock"
                              onClick={(e) => { e.stopPropagation(); setModalSelectedId(item.ingredient_id); setModal('adjustment') }}
                              className="p-2 hover:bg-purple-50 hover:text-purple-600 rounded-lg transition-colors text-gray-400"
                            >
                              <SlidersHorizontal size={14} />
                            </button>
                            <button
                              title="Ver historial"
                              onClick={(e) => { e.stopPropagation(); setHistoryItem(item) }}
                              className="p-2 hover:bg-gray-100 text-gray-300 hover:text-gray-600 rounded-lg transition-colors"
                            >
                              <ChevronRight size={15} />
                            </button>
                            <button
                              title="Borrar ingrediente"
                              onClick={(e) => { e.stopPropagation(); handleDeleteIngredient(item) }}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {filtered.map((item) => {
                const pct = stockPercent(item.stock, item.min_stock)
                return (
                  <div
                    key={item.ingredient_id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                    onClick={() => setHistoryItem(item)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.unit}</p>
                        <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="text-xs px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-medium border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer disabled:opacity-60"
                            value={item.category_id ?? ''}
                            disabled={savingCategoryId === item.ingredient_id}
                            onChange={(e) => handleCategoryChange(item, e.target.value)}
                          >
                            <option value="">Sin categoría</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          {savedCategoryId === item.ingredient_id && (
                            <Check size={12} className="text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="text-xs px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium border border-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer disabled:opacity-60"
                            value={item.linked_menu_item_id ?? ''}
                            disabled={savingMenuItemId === item.ingredient_id}
                            onChange={(e) => handleMenuItemChange(item, e.target.value)}
                          >
                            <option value="">— Sin vincular —</option>
                            {menuItems.map((mi) => (
                              <option key={mi.id} value={mi.id}>{mi.name}</option>
                            ))}
                          </select>
                          {savedMenuItemId === item.ingredient_id && (
                            <Check size={12} className="text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusBadge(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mb-2" onClick={(e) => e.stopPropagation()}>
                      {editingStockId === item.ingredient_id ? (
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          autoFocus
                          className={`w-20 text-center font-bold text-lg border rounded-lg px-1 py-0.5 focus:outline-none focus:border-emerald-400 bg-transparent ${
                            item.status === 'critical' ? 'text-red-600' :
                            item.status === 'low' ? 'text-amber-600' : 'text-gray-900'
                          }`}
                          value={editingStockValue}
                          onChange={(e) => setEditingStockValue(e.target.value)}
                          onBlur={() => handleStockSave(item, editingStockValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleStockSave(item, editingStockValue) }
                            if (e.key === 'Escape') { setEditingStockId(null) }
                          }}
                        />
                      ) : (
                        <button
                          className={`font-bold text-lg border border-transparent rounded-lg px-1 py-0.5 hover:border-emerald-300 transition-colors ${
                            item.status === 'critical' ? 'text-red-600' :
                            item.status === 'low' ? 'text-amber-600' : 'text-gray-900'
                          } ${savingStockId === item.ingredient_id ? 'opacity-50' : ''} ${savedStockId === item.ingredient_id ? 'bg-emerald-50' : ''}`}
                          title="Click para editar stock"
                          onClick={() => { setEditingStockId(item.ingredient_id); setEditingStockValue(String(item.stock)) }}
                        >
                          {item.stock}
                        </button>
                      )}
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${progressColor(item.status)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">min {item.min_stock}</span>
                    </div>
                    <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setModalSelectedId(item.ingredient_id); setModal('purchase') }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                      >
                        <ShoppingCart size={13} /> Compra
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setModalSelectedId(item.ingredient_id); setModal('adjustment') }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 transition-colors"
                      >
                        <SlidersHorizontal size={13} /> Ajuste
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setHistoryItem(item) }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                      >
                        <History size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteIngredient(item) }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Manual Purchase Modal */}
      {showManualPurchase && (
        <ManualPurchaseModal
          items={items}
          categories={categories}
          menuItems={menuItems}
          onClose={() => setShowManualPurchase(false)}
          onSaved={fetchInventory}
        />
      )}

      {/* Purchase / Adjustment Modal */}
      {modal && (
        <StockModal
          mode={modal}
          items={items}
          selectedId={modalSelectedId}
          onClose={() => { setModal(null); setModalSelectedId(undefined) }}
          onSaved={fetchInventory}
        />
      )}

      {/* History panel */}
      {historyItem && (
        <HistoryPanel
          item={historyItem}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* Manage categories modal */}
      {showManageCategories && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setShowManageCategories(false)}
          onChanged={fetchCategories}
        />
      )}

      {/* Category min stock modal */}
      {showCategoryMinStock && (
        <CategoryMinStockModal
          categories={categories}
          onClose={() => setShowCategoryMinStock(false)}
          onSaved={fetchInventory}
        />
      )}
    </AdminLayoutClient>
  )
}
