'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import {
  ScanLine,
  Upload,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ImageIcon,
  Building2,
  Calendar,
  Package,
  ChevronRight,
} from 'lucide-react'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface InvoiceItem {
  name: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total: number | null
  units_per_box?: number
}

interface InvoiceData {
  supplier: string | null
  date: string | null
  items: InvoiceItem[]
  total: number | null
}

interface SaveResult {
  name: string
  action: 'created' | 'updated' | 'skipped'
  stock?: number
  linked?: boolean
}

interface MenuItem {
  id: string
  name: string
  category?: string | null
}

interface IngredientCategory {
  id: string
  name: string
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip data URL prefix (data:image/jpeg;base64,)
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fmtCurrency(n: number | null) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)
}

// ──────────────────────────────────────────────
// Editable cell
// ──────────────────────────────────────────────
function EditCell({
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
}: {
  value: string | number | null
  onChange: (v: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type={type}
      className={`w-full bg-transparent border-0 border-b border-transparent hover:border-indigo-300 focus:border-indigo-500 focus:outline-none text-sm py-1 transition-colors ${className ?? ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? '—'}
      step={type === 'number' ? '0.001' : undefined}
      min={type === 'number' ? '0' : undefined}
    />
  )
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function InvoiceScanPage() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResults, setSaveResults] = useState<SaveResult[] | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Menu items for the manual dropdown
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  // Map: row index → selected menu_item_id ('' = no link)
  const [menuLinks, setMenuLinks] = useState<Record<number, string>>({})

  // Ingredient categories for the category dropdown
  const [ingredientCategories, setIngredientCategories] = useState<IngredientCategory[]>([])
  // Map: row index → selected category_id ('' = no category)
  const [categoryLinks, setCategoryLinks] = useState<Record<number, string>>({})

  // Map: row index → units per box (default 1)
  const [unitsPerBox, setUnitsPerBox] = useState<Record<number, number>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch menu_items once on mount
  useEffect(() => {
    fetch('/api/admin/menu')
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const sorted = (data as (MenuItem & { active?: boolean })[])
            .filter((m) => m && m.id && m.name && m.active !== false)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
          setMenuItems(sorted)
        }
      })
      .catch(() => {/* non-critical, silently ignore */})
  }, [])

  // Fetch ingredient categories once on mount
  useEffect(() => {
    fetch('/api/admin/ingredient-categories')
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setIngredientCategories(data as IngredientCategory[])
      })
      .catch(() => {/* non-critical */})
  }, [])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setScanError('Solo se aceptan imágenes (JPG, PNG, WEBP, etc.)')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setInvoiceData(null)
    setSaveResults(null)
    setScanError(null)
    setSaveError(null)
    setMenuLinks({})
    setCategoryLinks({})
    setUnitsPerBox({})
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleScan = async () => {
    if (!imageFile) return
    setScanning(true)
    setScanError(null)
    setInvoiceData(null)
    setSaveResults(null)
    setSaveError(null)
    setMenuLinks({})
    setCategoryLinks({})
    setUnitsPerBox({})

    try {
      const base64 = await fileToBase64(imageFile)
      const res = await fetch('/api/admin/invoice-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: imageFile.type }),
      })

      const data = await res.json()

      if (!res.ok) {
        const rawPreview = data.raw ? `\n\nRespuesta del modelo: ${String(data.raw).slice(0, 300)}` : ''
        setScanError((data.error ?? 'Error al escanear la factura') + rawPreview)
        return
      }

      // Ensure items is always an array
      if (!Array.isArray(data.items)) data.items = []
      // Populate unitsPerBox from OCR if the field was detected
      const initialUpb: Record<number, number> = {}
      ;(data.items as InvoiceItem[]).forEach((item, i) => {
        if (item.units_per_box && item.units_per_box > 1) initialUpb[i] = item.units_per_box
      })
      setUnitsPerBox(initialUpb)
      setInvoiceData(data)
    } catch {
      setScanError('Error de red al conectar con el servidor')
    } finally {
      setScanning(false)
    }
  }

  // Update a specific item field
  const updateItem = (idx: number, field: keyof InvoiceItem, value: string) => {
    if (!invoiceData) return
    const updated = [...invoiceData.items]
    if (field === 'quantity' || field === 'unit_price' || field === 'total') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updated[idx] as any)[field] = value === '' ? null : Number(value)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updated[idx] as any)[field] = value || null
    }
    setInvoiceData({ ...invoiceData, items: updated })
  }

  const removeItem = (idx: number) => {
    if (!invoiceData) return
    setInvoiceData({ ...invoiceData, items: invoiceData.items.filter((_, i) => i !== idx) })
    setMenuLinks((prev) => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k)
        if (ki < idx) next[ki] = v
        else if (ki > idx) next[ki - 1] = v
      })
      return next
    })
    setCategoryLinks((prev) => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k)
        if (ki < idx) next[ki] = v
        else if (ki > idx) next[ki - 1] = v
      })
      return next
    })
    setUnitsPerBox((prev) => {
      const next: Record<number, number> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k)
        if (ki < idx) next[ki] = v
        else if (ki > idx) next[ki - 1] = v
      })
      return next
    })
  }

  const addItem = () => {
    if (!invoiceData) return
    setInvoiceData({
      ...invoiceData,
      items: [...invoiceData.items, { name: '', quantity: null, unit: 'kg', unit_price: null, total: null }],
    })
  }

  const handleSave = async () => {
    if (!invoiceData) return
    setSaving(true)
    setSaveError(null)
    setSaveResults(null)

    const results: SaveResult[] = []

    try {
      // 1. Fetch existing ingredients (now includes linked_menu_item_id via recipe_items)
      const ingRes = await fetch('/api/admin/ingredients')
      const existingIngredients: { id: string; name: string; unit: string; price_per_unit?: number; linked_menu_item_id?: string | null }[] =
        ingRes.ok ? await ingRes.json() : []

      for (let idx = 0; idx < invoiceData.items.length; idx++) {
        const item = invoiceData.items[idx]
        if (!item.name || item.name.trim() === '') continue

        const nameLower = item.name.trim().toLowerCase()
        const unitPrice = item.unit_price ?? (item.total && item.quantity ? item.total / item.quantity : null)
        const selectedMenuItemId = menuLinks[idx] || null
        const selectedCategoryId = categoryLinks[idx] || null

        // Match priority: 1) by linked menu_item_id (user dropdown), 2) by exact name
        const existing =
          (selectedMenuItemId
            ? existingIngredients.find((ing) => ing.linked_menu_item_id === selectedMenuItemId)
            : undefined) ??
          existingIngredients.find((ing) => ing.name.toLowerCase() === nameLower)

        let ingredientId: string

        if (existing) {
          const putBody: Record<string, unknown> = { id: existing.id }
          if (unitPrice !== null) putBody.price_per_unit = unitPrice
          if (selectedMenuItemId) putBody.menu_item_id = selectedMenuItemId
          if (selectedCategoryId) putBody.category_id = selectedCategoryId

          const putRes = await fetch('/api/admin/ingredients', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(putBody),
          })

          let linked = false
          if (putRes.ok) {
            const putData = await putRes.json().catch(() => ({}))
            linked = !!putData.linked_menu_item_id
          } else {
            const errBody = await putRes.json().catch(() => ({}))
            console.error('[invoice-scan] Error en PUT ingrediente:', existing.id, putRes.status, errBody)
          }
          ingredientId = existing.id
          results.push({ name: item.name.trim(), action: 'updated', linked })
        } else {
          // Create new ingredient
          const createBody: Record<string, unknown> = {
            name: item.name.trim(),
            unit: item.unit ?? 'unidad',
            price_per_unit: unitPrice ?? 0,
          }
          if (selectedMenuItemId) createBody.menu_item_id = selectedMenuItemId
          if (selectedCategoryId) createBody.category_id = selectedCategoryId

          const createRes = await fetch('/api/admin/ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createBody),
          })

          if (!createRes.ok) {
            const errBody = await createRes.json().catch(() => ({}))
            console.error('Error creando ingrediente:', item.name, createRes.status, errBody)
            results.push({ name: item.name.trim(), action: 'skipped', linked: false })
            continue
          }

          const created = await createRes.json()
          ingredientId = created.id
          results.push({ name: item.name.trim(), action: 'created', linked: !!created.linked_menu_item_id })
        }

        // 2. Register purchase in inventory
        if (item.quantity !== null && item.quantity > 0) {
          const upb = unitsPerBox[idx] ?? 1
          const stockQty = item.quantity * upb
          await fetch('/api/admin/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ingredient_id: ingredientId,
              type: 'purchase',
              quantity: stockQty,
              price: item.total ?? (unitPrice !== null ? unitPrice * item.quantity : undefined),
              notes: invoiceData.supplier ? `Factura: ${invoiceData.supplier}` : 'Factura escaneada',
              date: invoiceData.date ? new Date(invoiceData.date).toISOString() : undefined,
            }),
          })
        }
      }

      setSaveResults(results)
    } catch {
      setSaveError('Error al guardar los datos')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setImageFile(null)
    setImagePreview(null)
    setInvoiceData(null)
    setSaveResults(null)
    setScanError(null)
    setSaveError(null)
    setMenuLinks({})
    setCategoryLinks({})
    setUnitsPerBox({})
  }

  const created = saveResults?.filter((r) => r.action === 'created').length ?? 0
  const updated = saveResults?.filter((r) => r.action === 'updated').length ?? 0

  return (
    <AdminLayoutClient active="invoice-scan">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <ScanLine size={20} className="text-white" />
              </div>
              <h1 className="font-serif text-3xl font-bold text-gray-900">Escanear Factura</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Subí una foto de tu factura o ticket de compra y Gemini extrae los datos automáticamente
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column: upload + image preview */}
          <div className="lg:col-span-2 space-y-4">
            {/* Drop zone */}
            {!imagePreview ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-all min-h-[260px] ${
                  dragOver
                    ? 'border-indigo-400 bg-indigo-50 scale-[1.01]'
                    : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
                }`}
              >
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center">
                    <ImageIcon size={28} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Arrastrá o hacé clic para subir</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — máx. 10MB</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium bg-indigo-50 px-3 py-1.5 rounded-lg">
                    <Upload size={12} />
                    Seleccionar imagen
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                />
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Factura" className="w-full object-contain max-h-[400px]" />
                <button
                  onClick={handleReset}
                  className="absolute top-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                  title="Quitar imagen"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Scan button */}
            {imageFile && !saveResults && (
              <button
                onClick={handleScan}
                disabled={scanning}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-sm shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {scanning ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Analizando con Gemini...
                  </>
                ) : (
                  <>
                    <ScanLine size={18} />
                    Escanear Factura
                  </>
                )}
              </button>
            )}

            {/* Scan error */}
            {scanError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <p>{scanError}</p>
              </div>
            )}

            {/* Info panel when no data yet */}
            {!invoiceData && !scanning && (
              <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-4 border border-indigo-100">
                <p className="text-xs font-semibold text-indigo-700 mb-2 uppercase tracking-wide">¿Cómo funciona?</p>
                <div className="space-y-2">
                  {[
                    { n: '1', text: 'Subí una foto de la factura o ticket' },
                    { n: '2', text: 'Gemini Vision extrae productos, precios y cantidades' },
                    { n: '3', text: 'Elegí manualmente a qué producto del menú corresponde cada ítem' },
                    { n: '4', text: 'Guardá para actualizar inventario e ingredientes' },
                  ].map(({ n, text }) => (
                    <div key={n} className="flex items-start gap-2">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {n}
                      </span>
                      <p className="text-xs text-gray-600">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: extracted data */}
          <div className="lg:col-span-3">
            {/* Success summary */}
            {saveResults && (
              <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <p className="font-semibold text-emerald-800">¡Guardado exitosamente!</p>
                </div>
                <p className="text-sm text-emerald-700 mb-3">
                  {created > 0 && <span className="font-medium">{created} ingrediente{created !== 1 ? 's' : ''} nuevo{created !== 1 ? 's' : ''}</span>}
                  {created > 0 && updated > 0 && ' · '}
                  {updated > 0 && <span className="font-medium">{updated} precio{updated !== 1 ? 's' : ''} actualizado{updated !== 1 ? 's' : ''}</span>}
                  {' '}guardados en inventario.
                </p>
                <div className="space-y-1.5">
                  {saveResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        r.action === 'created' ? 'bg-emerald-500' :
                        r.action === 'updated' ? 'bg-blue-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-gray-700 font-medium">{r.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        r.action === 'created' ? 'bg-emerald-100 text-emerald-700' :
                        r.action === 'updated' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {r.action === 'created' ? 'Creado' : r.action === 'updated' ? 'Actualizado' : 'Omitido'}
                      </span>
                      {r.linked && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">
                          Vinculado al menú
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleReset}
                  className="mt-4 text-xs text-emerald-700 underline hover:no-underline"
                >
                  Escanear otra factura
                </button>
              </div>
            )}

            {saveError && (
              <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <p>{saveError}</p>
              </div>
            )}

            {invoiceData && !saveResults && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Header info */}
                <div className="p-5 border-b border-gray-50 bg-gradient-to-r from-gray-50 to-white">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Datos de la factura</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                        <Building2 size={11} /> Proveedor
                      </label>
                      <input
                        className="w-full text-sm font-semibold text-gray-800 bg-transparent border-b border-gray-200 focus:border-indigo-500 focus:outline-none py-1"
                        value={invoiceData.supplier ?? ''}
                        onChange={(e) => setInvoiceData({ ...invoiceData, supplier: e.target.value || null })}
                        placeholder="Proveedor..."
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                        <Calendar size={11} /> Fecha
                      </label>
                      <input
                        className="w-full text-sm text-gray-700 bg-transparent border-b border-gray-200 focus:border-indigo-500 focus:outline-none py-1"
                        value={invoiceData.date ?? ''}
                        onChange={(e) => setInvoiceData({ ...invoiceData, date: e.target.value || null })}
                        placeholder="dd/mm/aaaa"
                      />
                    </div>
                  </div>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1400px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[200px]">Producto</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Cant.</th>
                        <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Unid/caja</th>
                        <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">→ Stock</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Unidad</th>
                        <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">P. Unit.</th>
                        <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Total</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto del menú</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                        <th className="p-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invoiceData.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/80 group transition-colors">
                          <td className="p-3">
                            <EditCell
                              value={item.name}
                              onChange={(v) => updateItem(idx, 'name', v)}
                              placeholder="Nombre del producto"
                              className="font-medium"
                            />
                          </td>
                          <td className="p-3">
                            <EditCell
                              value={item.quantity}
                              onChange={(v) => updateItem(idx, 'quantity', v)}
                              type="number"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              className="w-full text-center bg-transparent border-b border-transparent hover:border-indigo-300 focus:border-indigo-500 focus:outline-none text-sm py-1 transition-colors"
                              value={unitsPerBox[idx] ?? 1}
                              onChange={(e) => {
                                const v = Math.max(1, parseInt(e.target.value) || 1)
                                setUnitsPerBox((prev) => ({ ...prev, [idx]: v }))
                              }}
                            />
                          </td>
                          <td className="p-3 text-center">
                            {(() => {
                              const upb = unitsPerBox[idx] ?? 1
                              const stock = item.quantity !== null ? item.quantity * upb : null
                              return stock !== null ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                  {stock % 1 === 0 ? stock : stock.toFixed(2)}
                                </span>
                              ) : <span className="text-gray-300">—</span>
                            })()}
                          </td>
                          <td className="p-3">
                            <select
                              className="w-full text-sm bg-transparent border-b border-transparent hover:border-indigo-300 focus:border-indigo-500 focus:outline-none py-1 transition-colors"
                              value={item.unit ?? 'kg'}
                              onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                            >
                              {['kg', 'lt', 'unidad', 'g', 'ml', 'docena', 'caja', 'bolsa', 'paquete'].map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <EditCell
                              value={item.unit_price}
                              onChange={(v) => updateItem(idx, 'unit_price', v)}
                              type="number"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <EditCell
                              value={item.total}
                              onChange={(v) => updateItem(idx, 'total', v)}
                              type="number"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-3 min-w-[180px]">
                            <select
                              className="w-full text-sm bg-white border border-gray-200 hover:border-indigo-300 focus:border-indigo-500 focus:outline-none rounded-lg px-2 py-1 transition-colors"
                              value={menuLinks[idx] ?? ''}
                              onChange={(e) => setMenuLinks((prev) => ({ ...prev, [idx]: e.target.value }))}
                            >
                              <option value="">— Sin vincular —</option>
                              {menuItems.map((mi) => (
                                <option key={mi.id} value={mi.id}>{mi.name}</option>
                              ))}
                            </select>
                            {menuLinks[idx] && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">
                                Vinculado
                              </span>
                            )}
                          </td>
                          {ingredientCategories.length > 0 && (
                            <td className="p-3 min-w-[150px]">
                              <select
                                className="w-full text-sm bg-white border border-gray-200 hover:border-indigo-300 focus:border-indigo-500 focus:outline-none rounded-lg px-2 py-1 transition-colors"
                                value={categoryLinks[idx] ?? ''}
                                onChange={(e) => setCategoryLinks((prev) => ({ ...prev, [idx]: e.target.value }))}
                              >
                                <option value="">— Sin categoría —</option>
                                {ingredientCategories.map((cat) => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td className="p-3">
                            <button
                              onClick={() => removeItem(idx)}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                              title="Eliminar fila"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add row + Total */}
                <div className="px-3 py-2 border-t border-gray-50">
                  <button
                    onClick={addItem}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    + Agregar fila
                  </button>
                </div>

                {/* Total */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Package size={14} />
                    <span>{invoiceData.items.length} ítem{invoiceData.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Total factura:</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-36 text-right font-bold text-gray-900 text-sm bg-transparent border-b border-gray-200 focus:border-indigo-500 focus:outline-none py-1"
                      value={invoiceData.total ?? ''}
                      onChange={(e) => setInvoiceData({ ...invoiceData, total: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Computed total from items */}
                {invoiceData.items.length > 0 && (
                  <div className="px-4 pb-3 flex justify-end">
                    <p className="text-xs text-gray-400">
                      Suma ítems: {fmtCurrency(
                        invoiceData.items.reduce((acc, it) => acc + (it.total ?? 0), 0)
                      )}
                    </p>
                  </div>
                )}

                {/* Save button */}
                <div className="p-4 border-t border-gray-100">
                  <button
                    onClick={handleSave}
                    disabled={saving || invoiceData.items.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-semibold text-sm shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={17} className="animate-spin" />
                        Guardando en inventario...
                      </>
                    ) : (
                      <>
                        <Save size={17} />
                        Guardar en Inventario
                        <ChevronRight size={15} />
                      </>
                    )}
                  </button>
                  <p className="text-xs text-center text-gray-400 mt-2">
                    Se actualizarán precios de ingredientes existentes y se crearán los nuevos
                  </p>
                </div>
              </div>
            )}

            {/* Empty state while scanning */}
            {scanning && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center min-h-[300px] gap-4">
                <div className="relative">
                  <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center">
                    <ScanLine size={28} className="text-indigo-500" />
                  </div>
                  <div className="absolute -inset-2 border-2 border-indigo-300 rounded-2xl animate-ping opacity-30" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-700">Analizando factura...</p>
                  <p className="text-xs text-gray-400 mt-1">Gemini Vision está extrayendo los datos</p>
                </div>
              </div>
            )}

            {/* Empty state initial */}
            {!invoiceData && !scanning && !saveResults && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center min-h-[300px] gap-3 text-gray-400">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center">
                  <ScanLine size={26} className="opacity-30" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm">Los datos extraídos aparecerán aquí</p>
                  <p className="text-xs mt-1">Subí una imagen y presioná Escanear</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayoutClient>
  )
}
