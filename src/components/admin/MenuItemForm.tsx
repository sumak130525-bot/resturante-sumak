'use client'

import { useState, useRef } from 'react'
import { Loader2, Save, X, ChevronDown, ChevronUp, Upload, Image as ImageIcon } from 'lucide-react'
import type { MenuItem, Category } from '@/lib/types'

interface MenuItemFormProps {
  item?: MenuItem | null
  categories: Category[]
  onSave: (data: Partial<MenuItem>) => Promise<void>
  onClose: () => void
}

export function MenuItemForm({ item, categories, onSave, onClose }: MenuItemFormProps) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item?.price ?? 0,
    available: item?.available ?? 0,
    category_id: item?.category_id ?? categories[0]?.id ?? '',
    image_url: item?.image_url ?? '',
    active: item?.active ?? true,
    name_en: item?.name_en ?? '',
    name_qu: item?.name_qu ?? '',
    description_es: item?.description_es ?? '',
    description_en: item?.description_en ?? '',
    description_qu: item?.description_qu ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [translationsOpen, setTranslationsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.price || !form.category_id) {
      setError('Nombre, precio y categoría son requeridos.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onSave({
        ...(item?.id ? { id: item.id } : {}),
        name: form.name,
        description: form.description || null,
        price: Number(form.price),
        available: Number(form.available),
        category_id: form.category_id,
        image_url: form.image_url || null,
        active: form.active,
        name_en: form.name_en || null,
        name_qu: form.name_qu || null,
        description_es: form.description_es || null,
        description_en: form.description_en || null,
        description_qu: form.description_qu || null,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="font-serif font-bold text-xl text-sumak-brown">
            {item ? 'Editar plato' : 'Nuevo plato'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="Ej. Pique Macho"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                value={form.description_es || form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value, description_es: e.target.value })}
                className="input-field resize-none h-20"
                placeholder="Descripción del plato..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio (COP) *</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  className="input-field"
                  min={0}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad disponible</label>
                <input
                  type="number"
                  value={form.available}
                  onChange={(e) => setForm({ ...form, available: Number(e.target.value) })}
                  className="input-field"
                  min={0}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="input-field"
                required
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imagen del plato</label>
              {form.image_url && (
                <div className="mb-2 relative w-full h-32 rounded-lg overflow-hidden bg-gray-100">
                  <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-sumak-brown text-white rounded-lg text-sm hover:bg-sumak-brown/90 transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {uploading ? 'Subiendo...' : 'Subir foto'}
                </button>
                <input
                  type="text"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  className="input-field flex-1 text-sm"
                  placeholder="o pegá una URL..."
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploading(true)
                  setError(null)
                  try {
                    const fd = new FormData()
                    fd.append('image', file)
                    fd.append('id', item?.id || 'new')
                    const res = await fetch('/api/menu-display/update-image', { method: 'POST', body: fd })
                    if (!res.ok) throw new Error('Error al subir imagen')
                    const data = await res.json()
                    setForm({ ...form, image_url: data.image_url })
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Error al subir imagen')
                  } finally {
                    setUploading(false)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4 accent-sumak-red"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700">
                Plato activo (visible en el menú)
              </label>
            </div>
          </div>

          {/* Sección de traducciones colapsable */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setTranslationsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            >
              <span>🌍 Traducciones</span>
              {translationsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {translationsOpen && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-400 mb-2">Todos los campos son opcionales.</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre en inglés</label>
                    <input
                      type="text"
                      value={form.name_en}
                      onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                      className="input-field text-sm"
                      placeholder="Name in English"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre en quechua</label>
                    <input
                      type="text"
                      value={form.name_qu}
                      onChange={(e) => setForm({ ...form, name_qu: e.target.value })}
                      className="input-field text-sm"
                      placeholder="Suti qhichwa simipim"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descripción en español</label>
                  <textarea
                    value={form.description_es}
                    onChange={(e) => setForm({ ...form, description_es: e.target.value })}
                    className="input-field resize-none h-16 text-sm"
                    placeholder="Descripción en español"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descripción en inglés</label>
                  <textarea
                    value={form.description_en}
                    onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                    className="input-field resize-none h-16 text-sm"
                    placeholder="Description in English"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descripción en quechua</label>
                  <textarea
                    value={form.description_qu}
                    onChange={(e) => setForm({ ...form, description_qu: e.target.value })}
                    className="input-field resize-none h-16 text-sm"
                    placeholder="Rimay qhichwa simipim"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-outline flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
