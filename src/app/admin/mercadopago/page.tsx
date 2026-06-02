'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import {
  CreditCard, Download, Check, X, Tag, Package, RefreshCw, ChevronDown,
} from 'lucide-react'

interface MPPayment {
  id: number
  date: string
  description: string
  amount: number
  status: string
  type: string
  payment_type: string
}

interface ExpenseCategory {
  id: string
  name: string
}

interface Ingredient {
  id: string
  name: string
  unit: string
}

export default function MercadoPagoExpensesPage() {
  const [payments, setPayments] = useState<MPPayment[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState<number | null>(null)
  const [imported, setImported] = useState<Set<number>>(new Set())
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  // Modal state for categorization
  const [modalPayment, setModalPayment] = useState<MPPayment | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [showItems, setShowItems] = useState(false)
  const [items, setItems] = useState<Array<{ ingredient_id: string; quantity: number; unit_price: number }>>([])

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/mercadopago-expenses?from=${dateFrom}&to=${dateTo}`)
      const data = await res.json()
      if (data.payments) setPayments(data.payments)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [dateFrom, dateTo])

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/admin/expense-categories')
    const data = await res.json()
    if (Array.isArray(data)) setCategories(data)
  }, [])

  const fetchIngredients = useCallback(async () => {
    const res = await fetch('/api/admin/ingredients')
    const data = await res.json()
    if (Array.isArray(data)) setIngredients(data)
  }, [])

  useEffect(() => { fetchPayments() }, [fetchPayments])
  useEffect(() => { fetchCategories(); fetchIngredients() }, [fetchCategories, fetchIngredients])

  const openImportModal = (payment: MPPayment) => {
    setModalPayment(payment)
    setSelectedCategory('')
    setCustomDesc(payment.description)
    setShowItems(false)
    setItems([])
  }

  const handleImport = async () => {
    if (!modalPayment) return
    setImporting(modalPayment.id)
    try {
      const res = await fetch('/api/admin/mercadopago-expenses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mp_payment_id: modalPayment.id,
          category_id: selectedCategory || null,
          description: customDesc,
          amount: modalPayment.amount,
          date: modalPayment.date,
          items: showItems ? items.filter(i => i.ingredient_id) : [],
        }),
      })
      if (res.ok) {
        setImported(prev => { const next = new Set(prev); next.add(modalPayment.id); return next })
        setModalPayment(null)
      }
    } catch (err) {
      console.error(err)
    }
    setImporting(null)
  }

  const addItem = () => setItems([...items, { ingredient_id: '', quantity: 1, unit_price: 0 }])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <AdminLayoutClient active="mercadopago">
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-800">Gastos MercadoPago</h1>
          </div>
          <button onClick={fetchPayments} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Date filters */}
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="block border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="block border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={fetchPayments}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Buscar
          </button>
        </div>

        {/* Payments list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando movimientos...</div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No se encontraron pagos en este período</div>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border ${
                imported.has(p.id) ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
              }`}>
                <div className="flex-1">
                  <p className="font-medium text-gray-800 text-sm">{p.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(p.date)} • {p.type}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-600">{formatPrice(p.amount)}</span>
                  {imported.has(p.id) ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <Check className="w-4 h-4" /> Importado
                    </span>
                  ) : (
                    <button onClick={() => openImportModal(p)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                      <Download className="w-3.5 h-3.5" /> Importar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Import Modal */}
        {modalPayment && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">Importar gasto</h2>
                <button onClick={() => setModalPayment(null)} className="p-1 rounded hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Payment info */}
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium">{modalPayment.description}</p>
                <p className="text-sm text-gray-500">{formatDate(modalPayment.date)}</p>
                <p className="text-lg font-bold text-red-600 mt-1">{formatPrice(modalPayment.amount)}</p>
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Tag className="w-4 h-4" /> Categoría
                </label>
                <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700">Descripción</label>
                <input type="text" value={customDesc} onChange={e => setCustomDesc(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>

              {/* Items toggle */}
              <div>
                <button onClick={() => { setShowItems(!showItems); if (!showItems && items.length === 0) addItem() }}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
                  <Package className="w-4 h-4" />
                  {showItems ? 'Ocultar detalle productos' : 'Detallar productos (inventario)'}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showItems ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Items list */}
              {showItems && (
                <div className="space-y-2 border rounded-xl p-3 bg-gray-50">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select value={item.ingredient_id}
                        onChange={e => {
                          const next = [...items]
                          next[idx].ingredient_id = e.target.value
                          setItems(next)
                        }}
                        className="flex-1 border rounded px-2 py-1.5 text-sm">
                        <option value="">Seleccionar producto</option>
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                        ))}
                      </select>
                      <input type="number" placeholder="Cant" value={item.quantity || ''}
                        onChange={e => {
                          const next = [...items]
                          next[idx].quantity = parseFloat(e.target.value) || 0
                          setItems(next)
                        }}
                        className="w-16 border rounded px-2 py-1.5 text-sm" />
                      <input type="number" placeholder="$/u" value={item.unit_price || ''}
                        onChange={e => {
                          const next = [...items]
                          next[idx].unit_price = parseFloat(e.target.value) || 0
                          setItems(next)
                        }}
                        className="w-20 border rounded px-2 py-1.5 text-sm" />
                      <button onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addItem}
                    className="text-xs text-blue-600 font-medium hover:underline">
                    + Agregar producto
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setModalPayment(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancelar
                </button>
                <button onClick={handleImport} disabled={importing === modalPayment.id}
                  className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {importing === modalPayment.id ? 'Importando...' : 'Importar a finanzas'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutClient>
  )
}
