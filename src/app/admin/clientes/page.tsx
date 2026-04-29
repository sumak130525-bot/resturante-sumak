'use client'

import { useState, useCallback, useEffect } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Plus, Pencil, Check, X, Trash2, RefreshCw, Users } from 'lucide-react'

interface FrequentCustomer {
  id: string
  name: string
  phone: string | null
  created_at: string
}

export default function AdminClientesPage() {
  const [customers, setCustomers] = useState<FrequentCustomer[]>([])
  const [loading, setLoading] = useState(true)

  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Formulario nuevo cliente
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    if (res.ok) setCustomers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // ── Agregar cliente ────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    const res = await fetch('/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || null }),
    })
    if (res.ok) {
      setNewName('')
      setNewPhone('')
      setShowForm(false)
      await fetchCustomers()
    }
    setAdding(false)
  }

  // ── Editar cliente ─────────────────────────────────────────────────────────
  const startEdit = (c: FrequentCustomer) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditPhone(c.phone ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditPhone('')
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return
    const res = await fetch('/api/admin/customers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editName.trim(), phone: editPhone.trim() || null }),
    })
    if (res.ok) {
      await fetchCustomers()
      cancelEdit()
    }
  }

  // ── Eliminar cliente ───────────────────────────────────────────────────────
  const handleDelete = async (c: FrequentCustomer) => {
    if (!confirm(`¿Eliminar a "${c.name}"?`)) return
    await fetch('/api/admin/customers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id }),
    })
    await fetchCustomers()
  }

  return (
    <AdminLayoutClient active="clientes">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sumak-brown/10 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-sumak-brown" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Clientes frecuentes</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchCustomers}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-sumak-red transition-colors border border-gray-200 rounded-lg px-3 py-2"
            >
              <RefreshCw size={15} />
              Actualizar
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-sumak-brown/90 transition-colors"
            >
              <Plus size={15} />
              Agregar cliente
            </button>
          </div>
        </div>

        {/* Formulario nuevo cliente */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-sumak-brown/10">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Nuevo cliente</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                  placeholder="Ej: Juan Pérez"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Teléfono (opcional)</label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                  placeholder="Ej: 1122334455"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={handleAdd}
                  disabled={adding || !newName.trim()}
                  className="flex items-center gap-1.5 bg-sumak-brown text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-sumak-brown/90 disabled:opacity-40 transition-colors"
                >
                  <Plus size={15} />
                  Guardar
                </button>
                <button
                  onClick={() => { setShowForm(false); setNewName(''); setNewPhone('') }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {customers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay clientes frecuentes todavía.</p>
                <p className="text-xs mt-1">Usá el botón "Agregar cliente" para empezar.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {customers.map((c) => {
                  const isEditing = editingId === c.id
                  return (
                    <li key={c.id} className="flex items-center gap-3 p-4">
                      {isEditing ? (
                        <>
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(c.id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            placeholder="Nombre"
                            className="flex-1 border border-sumak-brown/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                          />
                          <input
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(c.id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            placeholder="Teléfono"
                            className="w-40 border border-sumak-brown/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveEdit(c.id)}
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
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sumak-brown leading-tight">{c.name}</p>
                            {c.phone && (
                              <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(c)}
                              className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(c)}
                              className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </AdminLayoutClient>
  )
}
