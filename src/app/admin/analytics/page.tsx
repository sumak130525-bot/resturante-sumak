'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import {
  TrendingUp,
  ShoppingBag,
  Receipt,
  Clock,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

type Period = 'today' | 'week' | 'month' | 'year'

interface AnalyticsData {
  totalSales: number
  orderCount: number
  avgTicket: number
  ordersPerHour: number
  salesByDay: { date: string; total: number }[]
  salesByHour: { hour: string; total: number }[]
  topProducts: { name: string; category: string; quantity: number; revenue: number; percentage: number }[]
  availableCategories: string[]
  paymentMethods: { name: string; value: number }[]
  diningOptions: { name: string; value: number }[]
  salesBySource: { name: string; value: number }[]
}

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: 'Hoy', value: 'today' },
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Año', value: 'year' },
]

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']
const PIE_COLORS_PAYMENT = ['#6366f1', '#f59e0b', '#10b981']
const PIE_COLORS_DINING = ['#10b981', '#f59e0b']
const PIE_COLORS_SOURCE = ['#6366f1', '#ef4444', '#10b981']

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-3/4" />
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-48 bg-gray-100 rounded-xl" />
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p: { name: string; value: number }, i: number) => (
          <p key={i} style={{ color: p.name === 'total' ? '#a5b4fc' : '#fbbf24' }}>
            {formatPrice(p.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(period)
  }, [period, fetchData])

  const kpis = data
    ? [
        {
          label: 'Ventas totales',
          value: formatPrice(data.totalSales),
          icon: TrendingUp,
          color: 'from-indigo-500 to-indigo-600',
          bg: 'bg-indigo-50',
          text: 'text-indigo-600',
        },
        {
          label: 'Pedidos',
          value: data.orderCount,
          icon: ShoppingBag,
          color: 'from-amber-500 to-amber-600',
          bg: 'bg-amber-50',
          text: 'text-amber-600',
        },
        {
          label: 'Ticket promedio',
          value: formatPrice(data.avgTicket),
          icon: Receipt,
          color: 'from-emerald-500 to-emerald-600',
          bg: 'bg-emerald-50',
          text: 'text-emerald-600',
        },
        {
          label: 'Pedidos / hora',
          value: data.ordersPerHour.toFixed(1),
          icon: Clock,
          color: 'from-violet-500 to-violet-600',
          bg: 'bg-violet-50',
          text: 'text-violet-600',
        },
      ]
    : []

  const totalProductRevenue = data?.topProducts.reduce((s, p) => s + p.revenue, 0) ?? 0

  const filteredProducts = data?.topProducts.filter(
    (p) => selectedCategory === 'all' || p.category === selectedCategory
  ) ?? []

  return (
    <AdminLayoutClient active="analytics">
      <div className="max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-500 text-sm mt-1">Resumen de ventas y rendimiento</p>
          </div>

          {/* Period selector */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {PERIOD_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
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
            : kpis.map(({ label, value, icon: Icon, bg, text }) => (
                <div
                  key={label}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4"
                >
                  <div className={`p-3 rounded-xl ${bg}`}>
                    <Icon size={22} className={text} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide truncate">{label}</p>
                    <p className={`text-2xl font-bold mt-0.5 ${text}`}>{value}</p>
                  </div>
                </div>
              ))}
        </div>

        {/* Charts row 1: Line + Bar */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          {/* Sales by day */}
          {loading ? (
            <SkeletonChart />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Ventas por día</h2>
              {data && data.salesByDay.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.salesByDay} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={(v: string) => {
                        const [, m, d] = v.split('-')
                        return `${d}/${m}`
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={{ fill: '#6366f1', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">Sin datos para este período</div>
              )}
            </div>
          )}

          {/* Sales by hour */}
          {loading ? (
            <SkeletonChart />
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Ventas por hora</h2>
              {data && data.salesByHour.some((h) => h.total > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.salesByHour} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">Sin datos para este período</div>
              )}
            </div>
          )}
        </div>

        {/* Charts row 2: 3 Pies */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {loading ? (
            <>
              <SkeletonChart />
              <SkeletonChart />
              <SkeletonChart />
            </>
          ) : (
            <>
              {/* Payment methods */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">Métodos de pago</h2>
                {data && data.paymentMethods.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.paymentMethods}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {data.paymentMethods.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS_PAYMENT[i % PIE_COLORS_PAYMENT.length]} />
                        ))}
                      </Pie>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(v: any) => formatPrice(Number(v))} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">Sin datos</div>
                )}
              </div>

              {/* Dining options */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">Modalidad</h2>
                {data && data.diningOptions.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.diningOptions}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {data.diningOptions.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS_DINING[i % PIE_COLORS_DINING.length]} />
                        ))}
                      </Pie>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(v: any) => formatPrice(Number(v))} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">Sin datos</div>
                )}
              </div>

              {/* Source */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-semibold text-gray-800 mb-4">Canal de venta</h2>
                {data && data.salesBySource.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.salesBySource}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {data.salesBySource.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS_SOURCE[i % PIE_COLORS_SOURCE.length]} />
                        ))}
                      </Pie>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(v: any) => formatPrice(Number(v))} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">Sin datos</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Top products table */}
        {loading ? (
          <SkeletonChart />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="font-semibold text-gray-800">
                Ranking de productos
                {filteredProducts.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h2>
              {data && data.availableCategories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
                >
                  <option value="all">Todas las categorías</option>
                  {data.availableCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>
            {filteredProducts.length > 0 ? (
              <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide w-8">#</th>
                      <th className="text-left py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Producto</th>
                      <th className="text-left py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide hidden sm:table-cell">Categoría</th>
                      <th className="text-right py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Cantidad</th>
                      <th className="text-right py-3 pr-4 text-gray-400 font-medium text-xs uppercase tracking-wide">Revenue</th>
                      <th className="text-right py-3 text-gray-400 font-medium text-xs uppercase tracking-wide">% Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p, i) => (
                      <tr key={p.name} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 pr-4 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-3 pr-4 font-medium text-gray-800">{p.name}</td>
                        <td className="py-3 pr-4 text-gray-500 text-xs hidden sm:table-cell">{p.category}</td>
                        <td className="py-3 pr-4 text-right text-gray-600">{p.quantity}</td>
                        <td className="py-3 pr-4 text-right font-semibold text-gray-800">{formatPrice(p.revenue)}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                              <div
                                className="h-1.5 rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(100, (p.revenue / totalProductRevenue) * 100)}%` }}
                              />
                            </div>
                            <span className="text-gray-500 text-xs w-10 text-right">
                              {((p.revenue / totalProductRevenue) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-gray-400 text-sm">Sin datos para este período</div>
            )}
          </div>
        )}
      </div>
    </AdminLayoutClient>
  )
}
