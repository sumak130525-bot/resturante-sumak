'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShoppingCart, Trash2, Printer, CheckCircle2, Loader2, Plus, MessageCircle } from 'lucide-react'
import AdminLayoutClient from '@/components/admin/AdminLayoutClient'

interface ShoppingList {
  id: string
  items: string[]
  source: string
  sender: string | null
  status: string
  created_at: string
}

export default function ShoppingListPage() {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [loading, setLoading] = useState(true)
  const [newItems, setNewItems] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchLists = useCallback(async () => {
    const res = await fetch('/api/admin/shopping-list')
    if (res.ok) {
      const data = await res.json()
      setLists(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  const handleAdd = async () => {
    const items = newItems.split(/[,\n]+/).map((s) => s.trim()).filter((s) => s.length > 0)
    if (items.length === 0) return
    setAdding(true)
    await fetch('/api/admin/shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, source: 'manual' }),
    })
    setNewItems('')
    setAdding(false)
    await fetchLists()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Borrar esta lista?')) return
    await fetch('/api/admin/shopping-list', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchLists()
  }

  const handleDone = async (id: string) => {
    await fetch('/api/admin/shopping-list', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    })
    await fetchLists()
  }

  const handlePrint = (list: ShoppingList) => {
    const date = new Date(list.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = new Date(list.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    const content = `
      <html>
      <head>
        <title>Lista de Compras</title>
        <style>
          @page { margin: 2mm; }
          body { font-family: monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 4mm; }
          h2 { text-align: center; margin: 0 0 4px; font-size: 14px; }
          .date { text-align: center; font-size: 10px; color: #666; margin-bottom: 8px; }
          .source { text-align: center; font-size: 10px; margin-bottom: 8px; }
          ul { list-style: none; padding: 0; margin: 0; }
          li { padding: 3px 0; border-bottom: 1px dashed #ccc; font-size: 13px; }
          li::before { content: "☐ "; }
          .footer { text-align: center; margin-top: 10px; font-size: 9px; color: #999; }
        </style>
      </head>
      <body>
        <h2>LISTA DE COMPRAS</h2>
        <div class="date">${date} ${time}</div>
        ${list.source === 'whatsapp' ? '<div class="source">📱 Recibida por WhatsApp</div>' : ''}
        <ul>
          ${list.items.map((item) => `<li>${item}</li>`).join('')}
        </ul>
        <div class="footer">Restaurante Sumak</div>
      </body>
      </html>
    `
    const printWindow = window.open('', '_blank', 'width=350,height=500')
    if (printWindow) {
      printWindow.document.write(content)
      printWindow.document.close()
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  return (
    <AdminLayoutClient active="shopping-list">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-green-100 rounded-xl">
            <ShoppingCart size={22} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-800">Lista de Compras</h1>
            <p className="text-xs text-gray-400">Recibidas por WhatsApp o creadas manualmente</p>
          </div>
        </div>

        {/* Add manual list */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <Plus size={14} /> Nueva lista
          </h3>
          <textarea
            value={newItems}
            onChange={(e) => setNewItems(e.target.value)}
            placeholder="Escribí los items separados por coma o uno por línea:&#10;5kg tomate, 2kg cebolla, 3 aceite..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            rows={3}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newItems.trim()}
            className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors"
          >
            {adding ? 'Guardando...' : 'Agregar lista'}
          </button>
        </div>

        {/* Lists */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="animate-spin mx-auto text-gray-300" size={30} />
          </div>
        ) : lists.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay listas de compras.</p>
            <p className="text-xs mt-1">Mandá &quot;compras: tomate, cebolla&quot; por WhatsApp</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lists.map((list) => (
              <div
                key={list.id}
                className={`bg-white rounded-2xl shadow-sm border p-4 ${
                  list.status === 'done' ? 'border-green-200 opacity-60' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs text-gray-400">
                      {new Date(list.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {list.source === 'whatsapp' && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
                        <MessageCircle size={10} /> WhatsApp
                      </span>
                    )}
                    {list.status === 'done' && (
                      <span className="ml-2 text-xs text-green-600 font-bold">✓ Completada</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handlePrint(list)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Imprimir">
                      <Printer size={16} />
                    </button>
                    {list.status !== 'done' && (
                      <button onClick={() => handleDone(list.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Marcar como hecha">
                        <CheckCircle2 size={16} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(list.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Borrar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {list.items.map((item, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-xs text-gray-400 shrink-0">
                        {i + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayoutClient>
  )
}
