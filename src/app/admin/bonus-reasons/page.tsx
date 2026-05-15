'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Star, Plus, Pencil, Trash2, Check, X } from 'lucide-react'

type BonusReason = {
  id: string
  name: string
  active: boolean
  created_at: string
}

const DEFAULT_EXAMPLES = [
  'Promo del día',
  'Cortesía',
  'Combo almuerzo',
  'Cumpleaños',
  'Error de cocina',
  'Cliente frecuente',
]

export default function BonusReasonsPage() {
  const [reasons, setReasons] = useState<BonusReason[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Add form
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const fetchReasons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bonus-reasons')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar')
      setReasons(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchReasons() }, [fetchReasons])

  const handleAdd = async (name?: string) => {
    const nameToAdd = (name ?? addName).trim()
    if (!nameToAdd) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bonus-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameToAdd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear')
      setReasons((prev) => [...prev, data])
      setAddName('')
      showSuccess(`Motivo "${nameToAdd}" creado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    }
    setAdding(false)
  }

  const handleToggleActive = async (reason: BonusReason) => {
    try {
      const res = await fetch('/api/admin/bonus-reasons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reason.id, active: !reason.active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar')
      setReasons((prev) => prev.map((r) => r.id === reason.id ? { ...r, active: !reason.active } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  const handleStartEdit = (reason: BonusReason) => {
    setEditId(reason.id)
    setEditName(reason.name)
  }

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/bonus-reasons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name: editName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setReasons((prev) => prev.map((r) => r.id === editId ? { ...r, name: editName.trim() } : r))
      setEditId(null)
      setEditName('')
      showSuccess('Motivo actualizado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el motivo "${name}"?`)) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/bonus-reasons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar')
      setReasons((prev) => prev.filter((r) => r.id !== id))
      showSuccess(`Motivo "${name}" eliminado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
    setDeletingId(null)
  }

  const unusedExamples = DEFAULT_EXAMPLES.filter(
    (ex) => !reasons.some((r) => r.name.toLowerCase() === ex.toLowerCase())
  )

  return (
    <AdminLayoutClient active="bonus-reasons">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
            <Star size={20} className="text-yellow-600" />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Motivos de bonificación</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configurá los motivos disponibles para bonificar items en el POS</p>
          </div>
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

        {/* Add new reason */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Agregar motivo</h2>
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                placeholder="Nombre del motivo (ej: Cortesía)"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              />
              <button
                onClick={() => handleAdd()}
                disabled={adding || !addName.trim()}
                className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors"
              >
                <Plus size={15} />
                {adding ? 'Agregando...' : 'Agregar'}
              </button>
            </div>

            {/* Quick-add examples */}
            {unusedExamples.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Ejemplos rápidos:</p>
                <div className="flex flex-wrap gap-2">
                  {unusedExamples.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => handleAdd(ex)}
                      disabled={adding}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-sumak-brown hover:text-sumak-brown transition-colors disabled:opacity-50"
                    >
                      + {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Reasons list */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Motivos configurados
            {reasons.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({reasons.filter((r) => r.active).length} activos de {reasons.length})
              </span>
            )}
          </h2>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : reasons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
                <Star size={32} className="opacity-30" />
                <p className="text-sm font-medium">Sin motivos configurados</p>
                <p className="text-xs">Agregá el primer motivo arriba</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reasons.map((reason) => (
                    <tr key={reason.id} className={`transition-colors ${reason.active ? '' : 'opacity-50'}`}>
                      <td className="px-5 py-3">
                        {editId === reason.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') { setEditId(null); setEditName('') }
                              }}
                              autoFocus
                              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                            />
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                              title="Guardar"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => { setEditId(null); setEditName('') }}
                              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Star size={14} className="text-yellow-500 shrink-0" />
                            <span className="text-sm font-medium text-gray-900">{reason.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(reason)}
                          aria-pressed={reason.active}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            reason.active ? 'bg-green-500' : 'bg-gray-200'
                          }`}
                          title={reason.active ? 'Desactivar' : 'Activar'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                              reason.active ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {editId !== reason.id && (
                            <button
                              onClick={() => handleStartEdit(reason)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title="Editar nombre"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(reason.id, reason.name)}
                            disabled={deletingId === reason.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
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
            )}
          </div>
        </section>

        {/* Info card */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-yellow-800 mb-1">¿Cómo funciona la bonificación?</p>
          <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
            <li>Desde el POS, tocá ★ en cualquier item del ticket para bonificarlo</li>
            <li>Seleccioná el motivo de esta lista (solo se muestran los activos)</li>
            <li>El item aparece con ★ GRATIS en el ticket y en la pantalla de cocina</li>
            <li>El total del pedido se recalcula automáticamente</li>
          </ul>
        </div>

        {/* DB migration note */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">SQL para migración (ejecutar en Supabase):</p>
          <pre className="text-xs text-gray-500 font-mono whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto">{`CREATE TABLE IF NOT EXISTS bonus_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_bonus boolean DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bonus_reason text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price numeric;`}</pre>
        </div>
      </div>
    </AdminLayoutClient>
  )
}
