'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  Star,
  AlertTriangle,
  DollarSign,
  Percent,
} from 'lucide-react'
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'year'

interface PlateItem {
  id: string
  name: string
  category: string
  price: number
  cost: number | null
  salesCount: number
  revenue: number
  totalCost: number | null
  profit: number | null
  margin: number | null
  trend?: 'up' | 'down' | 'neutral'
}

interface ProfitabilityData {
  period: string
  netProfit: number
  avgMargin: number
  mostProfitable: { name: string; margin: number } | null
  leastProfitable: { name: string; margin: number } | null
  items: PlateItem[]
}

type SortKey = 'name' | 'margin' | 'profit' | 'revenue' | 'salesCount' | 'cost'
type SortDir = 'asc' | 'desc'

// ─── Constants ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Año', value: 'year' },
]

function marginBg(margin: number | null) {
  if (margin === null) return 'bg-gray-50 text-gray-400'
  if (margin >= 50) return 'bg-emerald-50 text-emerald-700'
  if (margin >= 30) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-600'
}

function marginBarColor(margin: number | null) {
  if (margin === null) return '#9ca3af'
  if (margin >= 50) return '#10b981'
  if (margin >= 30) return '#f59e0b'
  return '#ef4444'
}

function quadrantLabel(sales: number, margin: number, avgSales: number, avgMargin: number) {
  if (margin >= avgMargin && sales >= avgSales) return 'Estrellas'
  if (margin >= avgMargin && sales < avgSales) return 'Interrogantes'
  if (margin < avgMargin && sales >= avgSales) return 'Vacas'
  return 'Perros'
}

const QUADRANT_COLORS: Record<string, string> = {
  Estrellas: '#6366f1',
  Interrogantes: '#f59e0b',
  Vacas: '#10b981',
  Perros: '#ef4444',
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-7 bg-gray-200 rounded w-3/4" />
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-52 bg-gray-100 rounded-xl" />
    </div>
  )
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as PlateItem & { quadrant: string; margin: number }
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl space-y-0.5 max-w-[180px]">
      <p className="font-semibold truncate">{d.name}</p>
      <p className="text-gray-300">{d.category}</p>
      <p>Ventas: <span className="text-indigo-300 font-medium">{d.salesCount}</span></p>
      <p>Margen: <span className="font-medium" style={{ color: marginBarColor(d.margin) }}>{d.margin.toFixed(1)}%</span></p>
      <p>Ganancia: <span className="text-emerald-300">{d.profit !== null ? formatPrice(d.profit) : '—'}</span></p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
      <p className="font-semibold mb-1 truncate max-w-[140px]">{label}</p>
      <p>Margen: <span className="text-indigo-300">{Number(payload[0]?.value).toFixed(1)}%</span></p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfitabilityPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<ProfitabilityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('margin')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics/profitability?period=${p}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  // Categories list
  const categories = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.items.map((i) => i.category))).sort()
  }, [data])

  // Filtered + sorted items
  const filteredItems = useMemo(() => {
    if (!data) return []
    let items = data.items
    if (categoryFilter !== 'all') items = items.filter((i) => i.category === categoryFilter)
    return [...items].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [data, sortKey, sortDir, categoryFilter])

  // BCG scatter data (only items with margin data)
  const scatterData = useMemo(() => {
    if (!data) return { points: [], avgSales: 0, avgMargin: 0 }
    const withSales = data.items.filter((i) => i.salesCount > 0 && i.margin !== null)
    const avgSales = withSales.length > 0 ? withSales.reduce((s, i) => s + i.salesCount, 0) / withSales.length : 0
    const avgMargin = data.avgMargin
    const points = withSales.map((i) => ({
      ...i,
      margin: i.margin as number,
      quadrant: quadrantLabel(i.salesCount, i.margin as number, avgSales, avgMargin),
    }))
    return { points, avgSales, avgMargin }
  }, [data])

  // Top5 / Bottom5 bar chart (only items with margin data)
  const barData = useMemo(() => {
    if (!data) return { top5: [], bottom5: [] }
    const withSales = data.items.filter((i) => i.salesCount > 0 && i.margin !== null)
    const sorted = [...withSales].sort((a, b) => (b.margin as number) - (a.margin as number))
    const top5 = sorted.slice(0, 5).map((i) => ({ name: i.name.length > 18 ? i.name.slice(0, 16) + '…' : i.name, margin: +((i.margin as number).toFixed(1)), color: marginBarColor(i.margin as number) }))
    const bottom5 = sorted.slice(-5).reverse().map((i) => ({ name: i.name.length > 18 ? i.name.slice(0, 16) + '…' : i.name, margin: +((i.margin as number).toFixed(1)), color: marginBarColor(i.margin as number) }))
    return { top5, bottom5 }
  }, [data])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const kpis: { label: string; value: string | number; sub?: string; icon: React.ElementType; bg: string; text: string }[] = data ? [
    {
      label: 'Ganancia neta',
      value: formatPrice(data.netProfit),
      icon: DollarSign,
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
    },
    {
      label: 'Margen promedio',
      value: `${data.avgMargin.toFixed(1)}%`,
      icon: Percent,
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
    },
    {
      label: 'Más rentable',
      value: data.mostProfitable?.name ?? '—',
      sub: data.mostProfitable ? `${data.mostProfitable.margin.toFixed(1)}% margen` : undefined,
      icon: TrendingUp,
      bg: 'bg-green-50',
      text: 'text-green-600',
    },
    {
      label: 'Menos rentable',
      value: data.leastProfitable?.name ?? '—',
      sub: data.leastProfitable ? `${data.leastProfitable.margin.toFixed(1)}% margen` : undefined,
      icon: TrendingDown,
      bg: 'bg-red-50',
      text: 'text-red-600',
    },
  ] : []

  return (
    <AdminLayoutClient active="profitability">
      <div className="max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <a href="/admin/analytics" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Analytics</a>
              <span className="text-gray-300">/</span>
              <span className="text-sm text-gray-700 font-medium">Rentabilidad</span>
            </div>
            <h1 className="font-serif text-3xl font-bold text-gray-900 mt-1">Análisis de Rentabilidad</h1>
            <p className="text-gray-500 text-sm mt-1">Margen, ganancia y desempeño por plato</p>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {PERIOD_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : kpis.map(({ label, value, sub, icon: Icon, bg, text }) => (
                <div key={label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${bg} flex-shrink-0`}>
                    <Icon size={20} className={text} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                    <p className={`text-lg font-bold mt-0.5 truncate ${text}`}>{value}</p>
                    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
                  </div>
                </div>
              ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

          {/* BCG Scatter */}
          {loading ? <SkeletonChart /> : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="mb-4">
                <h2 className="font-semibold text-gray-800">Matriz BCG — Ventas vs Margen</h2>
                <p className="text-xs text-gray-400 mt-0.5">Tamaño = ganancia. Líneas = promedios del período</p>
              </div>
              {scatterData.points.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="salesCount"
                        type="number"
                        name="Ventas"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        label={{ value: 'Ventas', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: '#9ca3af' }}
                      />
                      <YAxis
                        dataKey="margin"
                        type="number"
                        name="Margen %"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                        label={{ value: 'Margen %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#9ca3af' }}
                      />
                      <Tooltip content={<ScatterTip />} />
                      <ReferenceLine x={scatterData.avgSales} stroke="#d1d5db" strokeDasharray="4 4" />
                      <ReferenceLine y={scatterData.avgMargin} stroke="#d1d5db" strokeDasharray="4 4" />
                      <Scatter data={scatterData.points} isAnimationActive={false}>
                        {scatterData.points.map((entry, i) => (
                          <Cell key={i} fill={QUADRANT_COLORS[entry.quadrant]} fillOpacity={0.8} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {Object.entries(QUADRANT_COLORS).map(([q, c]) => (
                      <div key={q} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
                        {q}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">Sin ventas en este período</div>
              )}
            </div>
          )}

          {/* Top 5 vs Bottom 5 */}
          {loading ? <SkeletonChart /> : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Top 5 vs Bottom 5 por margen</h2>
              {barData.top5.length > 0 ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-2">Mayor margen</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={barData.top5} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={100} />
                        <Tooltip content={<BarTip />} />
                        <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                          {barData.top5.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                          <LabelList dataKey="margin" position="right" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: '#6b7280' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-2">Menor margen</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={barData.bottom5} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={100} />
                        <Tooltip content={<BarTip />} />
                        <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                          {barData.bottom5.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                          <LabelList dataKey="margin" position="right" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: '#6b7280' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">Sin ventas en este período</div>
              )}
            </div>
          )}
        </div>

        {/* Ranking Table */}
        {loading ? <SkeletonChart /> : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            {/* Table header with filter */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <h2 className="font-semibold text-gray-800">Ranking de Rentabilidad</h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Categoría:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="all">Todas</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 pr-3 text-gray-400 font-medium text-xs uppercase tracking-wide w-8">#</th>
                    <th
                      className="text-left py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-gray-600"
                      onClick={() => toggleSort('name')}
                    >Plato <SortIcon k="name" /></th>
                    <th className="text-left py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Categoría</th>
                    <th
                      className="text-right py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-gray-600"
                      onClick={() => toggleSort('salesCount')}
                    >Ventas <SortIcon k="salesCount" /></th>
                    <th
                      className="text-right py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-gray-600 hidden sm:table-cell"
                      onClick={() => toggleSort('revenue')}
                    >Ingresos <SortIcon k="revenue" /></th>
                    <th
                      className="text-right py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-gray-600 hidden sm:table-cell"
                      onClick={() => toggleSort('cost')}
                    >Costo unit. <SortIcon k="cost" /></th>
                    <th
                      className="text-right py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-gray-600"
                      onClick={() => toggleSort('profit')}
                    >Ganancia <SortIcon k="profit" /></th>
                    <th
                      className="text-right py-3 text-gray-400 font-medium text-xs uppercase tracking-wide cursor-pointer hover:text-gray-600"
                      onClick={() => toggleSort('margin')}
                    >Margen <SortIcon k="margin" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, i) => {
                    const isTop3 = i < 3 && sortKey === 'margin' && sortDir === 'desc' && categoryFilter === 'all'
                    const lowMargin = item.margin !== null && item.margin < 30
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors"
                      >
                        <td className="py-3 pr-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            {isTop3 && <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                            {lowMargin && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
                            <span className="font-medium text-gray-800">{item.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-gray-500 text-xs hidden md:table-cell">{item.category}</td>
                        <td className="py-3 pr-4 text-right text-gray-600">{item.salesCount}</td>
                        <td className="py-3 pr-4 text-right text-gray-600 hidden sm:table-cell">{formatPrice(item.revenue)}</td>
                        <td className="py-3 pr-4 text-right text-gray-500 hidden sm:table-cell">
                          {item.cost !== null ? formatPrice(item.cost) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold text-gray-800">
                          {item.profit !== null ? formatPrice(item.profit) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 text-right">
                          {item.margin !== null ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${marginBg(item.margin)}`}>
                              {item.margin.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">Sin datos para los filtros seleccionados</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Star size={11} className="text-amber-400 fill-amber-400" />
                Top 3 más rentables
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <AlertTriangle size={11} className="text-red-400" />
                Margen &lt; 30%
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">≥50%</span>
                Alto
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">30–50%</span>
                Medio
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold">&lt;30%</span>
                Bajo
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayoutClient>
  )
}
