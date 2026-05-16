'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users,
  MoreHorizontal, Plus, Pencil, Trash2, AlertTriangle, CheckCircle,
  RefreshCw, X, Save, Tag,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'gastos' | 'categorias'
type Period = 'current_month' | 'prev_month' | 'last_3_months' | 'year'

interface ExpenseCategory {
  id: string
  name: string
  created_at: string
}

interface Expense {
  id: string
  category_id: string | null
  subcategory: string | null
  amount: number
  date: string
  description: string | null
  is_recurring: boolean
  receipt_number: string | null
  created_at: string
  expense_categories: { id: string; name: string } | null
}

interface KPIs {
  totalIngresos: number
  totalGastos: number
  totalMercaderia: number
  totalSueldos: number
  totalGastosManuales: number
  gananciaNeta: number
  margenGanancia: number
}

interface BreakdownRow {
  category: string
  amount: number
}

interface MonthlyRow {
  mes: string
  ingresos: number
  gastos: number
  ganancia: number
}

interface SummaryData {
  period: string
  kpis: KPIs
  breakdown: BreakdownRow[]
  monthly: MonthlyRow[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Mes actual', value: 'current_month' },
  { label: 'Mes anterior', value: 'prev_month' },
  { label: 'Últimos 3 meses', value: 'last_3_months' },
  { label: 'Año', value: 'year' },
]

const SUBCATEGORY_SUGGESTIONS: Record<string, string[]> = {
  Servicios: ['Luz', 'Gas', 'Agua', 'Internet', 'Teléfono'],
  Impuestos: ['IVA', 'Ingresos Brutos', 'Ganancias', 'Municipal'],
  Mantenimiento: ['Reparación', 'Limpieza', 'Plomería', 'Electricidad'],
  Sueldos: ['Sueldo base', 'Horas extra', 'Aguinaldo'],
  Mercadería: ['Alimentos', 'Bebidas', 'Insumos'],
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color, highlight,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  highlight?: 'positive' | 'negative' | null
}) {
  return (
    <div className={cn(
      'bg-white rounded-2xl shadow-sm border p-5 flex items-start gap-4',
      highlight === 'positive' ? 'border-emerald-200 bg-emerald-50' :
      highlight === 'negative' ? 'border-red-200 bg-red-50' :
      'border-gray-100'
    )}>
      <div className={cn('p-2.5 rounded-xl flex-shrink-0', color)}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className={cn(
          'text-xl font-bold mt-0.5',
          highlight === 'positive' ? 'text-emerald-700' :
          highlight === 'negative' ? 'text-red-600' :
          'text-gray-900'
        )}>{value}</p>
      </div>
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ period, onPeriodChange }: { period: Period; onPeriodChange: (p: Period) => void }) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/finanzas/summary?period=${period}`)
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Error al cargar datos')
        return
      }
      setData(await res.json())
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const totalGastos = data?.kpis.totalGastos ?? 0

  return (
    <div>
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {PERIODS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => onPeriodChange(value)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
              period === value
                ? 'bg-sumak-brown text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >{label}</button>
        ))}
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="ml-auto p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-all"
          title="Actualizar"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8 animate-pulse">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl h-24" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard
              label="Ingresos totales"
              value={formatPrice(data.kpis.totalIngresos)}
              icon={TrendingUp}
              color="bg-indigo-500"
            />
            <KpiCard
              label="Gastos totales"
              value={formatPrice(data.kpis.totalGastos)}
              icon={TrendingDown}
              color="bg-orange-500"
            />
            <KpiCard
              label="Costo mercadería"
              value={formatPrice(data.kpis.totalMercaderia)}
              icon={ShoppingCart}
              color="bg-amber-500"
            />
            <KpiCard
              label="Sueldos"
              value={formatPrice(data.kpis.totalSueldos)}
              icon={Users}
              color="bg-sky-500"
            />
            <KpiCard
              label="Otros gastos"
              value={formatPrice(data.kpis.totalGastosManuales)}
              icon={MoreHorizontal}
              color="bg-violet-500"
            />
            <KpiCard
              label="Ganancia neta"
              value={formatPrice(data.kpis.gananciaNeta)}
              icon={data.kpis.gananciaNeta >= 0 ? TrendingUp : TrendingDown}
              color={data.kpis.gananciaNeta >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
              highlight={data.kpis.gananciaNeta >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Margen de ganancia"
              value={`${data.kpis.margenGanancia.toFixed(1)}%`}
              icon={DollarSign}
              color={data.kpis.margenGanancia >= 0 ? 'bg-emerald-600' : 'bg-red-500'}
              highlight={data.kpis.margenGanancia >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
            <h3 className="font-semibold text-gray-800 mb-5">Ingresos vs Gastos por mes</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => formatPrice(Number(value))}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ganancia" name="Ganancia" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-5">Desglose de gastos por categoría</h3>
            {data.breakdown.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Sin gastos registrados en este período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Categoría', 'Monto', '% del total'].map((h) => (
                        <th key={h} className="text-left py-3 px-3 text-gray-400 font-medium text-xs uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-gray-800">{row.category}</td>
                        <td className="py-2.5 px-3 text-gray-700">{formatPrice(row.amount)}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[100px]">
                              <div
                                className="bg-orange-400 h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, totalGastos > 0 ? (row.amount / totalGastos) * 100 : 0)}%` }}
                              />
                            </div>
                            <span className="text-gray-500 text-xs whitespace-nowrap">
                              {totalGastos > 0 ? ((row.amount / totalGastos) * 100).toFixed(1) : '0'}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !data && !error && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <div className="w-16 h-16 bg-sumak-gold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp size={28} className="text-sumak-brown" />
          </div>
          <h3 className="font-semibold text-gray-700 mb-1">Cargando datos financieros</h3>
          <p className="text-sm text-gray-400">Por favor espera un momento</p>
        </div>
      )}
    </div>
  )
}

// ─── Expense Form Modal ───────────────────────────────────────────────────────

interface ExpenseFormData {
  category_id: string
  subcategory: string
  amount: string
  date: string
  description: string
  is_recurring: boolean
  receipt_number: string
}

const EMPTY_FORM: ExpenseFormData = {
  category_id: '',
  subcategory: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  is_recurring: false,
  receipt_number: '',
}

function ExpenseModal({
  open, expense, categories, onClose, onSaved,
}: {
  open: boolean
  expense: Expense | null
  categories: ExpenseCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ExpenseFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      if (expense) {
        setForm({
          category_id: expense.category_id ?? '',
          subcategory: expense.subcategory ?? '',
          amount: String(expense.amount),
          date: expense.date,
          description: expense.description ?? '',
          is_recurring: expense.is_recurring,
          receipt_number: expense.receipt_number ?? '',
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setError(null)
    }
  }, [open, expense])

  const selectedCat = categories.find((c) => c.id === form.category_id)
  const suggestions = selectedCat ? (SUBCATEGORY_SUGGESTIONS[selectedCat.name] ?? []) : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.amount || !form.date) {
      setError('Monto y fecha son requeridos')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const method = expense ? 'PUT' : 'POST'
      const body = expense ? { id: expense.id, ...form } : form
      const res = await fetch('/api/admin/expenses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Error al guardar')
        return
      }
      onSaved()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-lg">
            {expense ? 'Editar gasto' : 'Nuevo gasto'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm flex items-center gap-2">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Fecha *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                required
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Categoría</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value, subcategory: '' }))}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Subcategoría</label>
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
              placeholder="Ej: Luz, Gas, Agua..."
              list="subcategory-suggestions"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
            />
            {suggestions.length > 0 && (
              <datalist id="subcategory-suggestions">
                {suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, subcategory: s }))}
                    className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-sumak-gold/20 hover:text-sumak-brown transition-colors"
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Descripción / nota</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Opcional..."
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">N° comprobante / factura</label>
            <input
              type="text"
              value={form.receipt_number}
              onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))}
              placeholder="Opcional"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_recurring: !f.is_recurring }))}
              className={cn(
                'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
                form.is_recurring ? 'bg-sumak-brown' : 'bg-gray-200'
              )}
            >
              <span className={cn(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                form.is_recurring ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </button>
            <span className="text-sm text-gray-600">Gasto recurrente (mensual fijo)</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >Cancelar</button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sumak-brown hover:bg-sumak-brown/90 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all"
            >
              <Save size={15} />
              {saving ? 'Guardando…' : (expense ? 'Actualizar' : 'Guardar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Gastos Tab ───────────────────────────────────────────────────────────────

function GastosTab({ categories }: { categories: ExpenseCategory[] }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = '/api/admin/expenses'
      const params = new URLSearchParams()
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (params.toString()) url += '?' + params.toString()
      const res = await fetch(url)
      if (!res.ok) {
        setError('Error al cargar gastos')
        return
      }
      setExpenses(await res.json())
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [filterFrom, filterTo])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    setDeleting(id)
    try {
      await fetch('/api/admin/expenses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setExpenses((prev) => prev.filter((e) => e.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">Desde</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">Hasta</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
            />
          </div>
          {(filterFrom || filterTo) && (
            <button
              onClick={() => { setFilterFrom(''); setFilterTo('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2"
            ><X size={14} /></button>
          )}
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true) }}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-sumak-brown hover:bg-sumak-brown/90 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
        >
          <Plus size={16} />
          Nuevo gasto
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded mb-1" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Fecha', 'Categoría', 'Subcategoría', 'Descripción', 'Monto', 'Recurrente', 'Comprobante', ''].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                    <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{expense.date}</td>
                    <td className="py-2.5 px-4">
                      {expense.expense_categories ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <Tag size={10} />
                          {expense.expense_categories.name}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">{expense.subcategory || <span className="text-gray-300">—</span>}</td>
                    <td className="py-2.5 px-4 text-gray-500 max-w-[180px] truncate">{expense.description || <span className="text-gray-300">—</span>}</td>
                    <td className="py-2.5 px-4 font-semibold text-gray-800 whitespace-nowrap">{formatPrice(expense.amount)}</td>
                    <td className="py-2.5 px-4">
                      {expense.is_recurring ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                          <CheckCircle size={12} />Sí
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">No</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 text-xs font-mono">{expense.receipt_number || <span className="text-gray-300">—</span>}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditing(expense); setModalOpen(true) }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          disabled={deleting === expense.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">
                      Sin gastos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {expenses.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <span className="text-sm text-gray-500">
                Total: <strong className="text-gray-900">{formatPrice(totalExpenses)}</strong>
                <span className="ml-2 text-gray-400">({expenses.length} registro{expenses.length !== 1 ? 's' : ''})</span>
              </span>
            </div>
          )}
        </div>
      )}

      <ExpenseModal
        open={modalOpen}
        expense={editing}
        categories={categories}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSaved={() => { setModalOpen(false); setEditing(null); fetchExpenses() }}
      />
    </div>
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriasTab({
  categories, onRefresh,
}: {
  categories: ExpenseCategory[]
  onRefresh: () => void
}) {
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Error al crear')
        return
      }
      setNewName('')
      onRefresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/expense-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName.trim() }),
      })
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Error al actualizar')
        return
      }
      setEditId(null)
      onRefresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría? Los gastos quedarán sin categoría.')) return
    setDeleting(id)
    try {
      await fetch('/api/admin/expense-categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      onRefresh()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4">Nueva categoría</h3>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-600 text-sm flex items-center gap-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Nombre de la categoría"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
          />
          <button
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-sumak-brown hover:bg-sumak-brown/90 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all"
          >
            <Plus size={15} />
            Agregar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            Sin categorías. Agrega la primera arriba.
          </div>
        ) : (
          <div>
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/70 transition-colors">
                <Tag size={15} className="text-sumak-gold flex-shrink-0" />
                {editId === cat.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdate(cat.id)
                        if (e.key === 'Escape') setEditId(null)
                      }}
                      className="flex-1 text-sm border border-sumak-brown/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                    />
                    <button
                      onClick={() => handleUpdate(cat.id)}
                      disabled={saving}
                      className="p-1.5 rounded-lg bg-sumak-brown text-white hover:bg-sumak-brown/90 transition-colors disabled:opacity-50"
                    >
                      <Save size={13} />
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-800">{cat.name}</span>
                    <button
                      onClick={() => { setEditId(cat.id); setEditName(cat.name) }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      disabled={deleting === cat.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
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
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FinanzasPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [period, setPeriod] = useState<Period>('current_month')
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [catLoading, setCatLoading] = useState(true)

  const fetchCategories = useCallback(async () => {
    setCatLoading(true)
    try {
      const res = await fetch('/api/admin/expense-categories')
      if (res.ok) setCategories(await res.json())
    } finally {
      setCatLoading(false)
    }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const TABS: { label: string; value: Tab }[] = [
    { label: 'Dashboard', value: 'dashboard' },
    { label: 'Gastos', value: 'gastos' },
    { label: 'Categorías', value: 'categorias' },
  ]

  return (
    <AdminLayoutClient active="finanzas">
      <div className="max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-gray-900">Finanzas</h1>
          <p className="text-gray-500 text-sm mt-1">Control de gastos y rentabilidad del negocio</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit mb-8">
          {TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
                tab === value
                  ? 'bg-white text-sumak-brown shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >{label}</button>
          ))}
        </div>

        {tab === 'dashboard' && (
          <DashboardTab period={period} onPeriodChange={setPeriod} />
        )}

        {tab === 'gastos' && !catLoading && (
          <GastosTab categories={categories} />
        )}

        {tab === 'categorias' && (
          <CategoriasTab categories={categories} onRefresh={fetchCategories} />
        )}
      </div>
    </AdminLayoutClient>
  )
}
