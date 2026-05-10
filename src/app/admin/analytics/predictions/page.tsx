'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Clock,
  DollarSign,
  Users,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  UtensilsCrossed,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeakHour {
  hour: number
  label: string
  avgOrders: number
}

interface PeakDay {
  dow: number
  label: string
  avgSales: number
}

interface WeekData {
  label: string
  total: number
}

interface ProductGrowth {
  name: string
  week1: number
  week2: number
  pct: number
}

interface CustomerPatterns {
  avgPersons: number
  favoriteDining: string
  favoritePayment: string
}

interface Recommendation {
  type: 'info' | 'warning' | 'success'
  text: string
}

interface PredictionsData {
  peakHours: PeakHour[]
  peakDays: PeakDay[]
  dailyAverage: number
  weeklyTrend: 'subiendo' | 'bajando' | 'estable'
  weeksData: WeekData[]
  monthlyProjection: number
  topGrowingProducts: ProductGrowth[]
  decliningProducts: ProductGrowth[]
  estimatedMonthlyProfit: number | null
  customerPatterns: CustomerPatterns
  bestHour: PeakHour
  bestDay: PeakDay
  recommendations: Recommendation[]
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-3/4" />
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

// ─── Tooltips ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HourTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
      <p className="font-semibold">{label}</p>
      <p className="text-indigo-300">{payload[0]?.value} pedidos prom.</p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
      <p className="font-semibold">{label}</p>
      <p className="text-amber-300">{formatPrice(payload[0]?.value)} prom.</p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WeekTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
      <p className="font-semibold">{label}</p>
      <p className="text-indigo-300">{formatPrice(payload[0]?.value)}</p>
    </div>
  )
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const styles = {
    info: { border: 'border-blue-200', bg: 'bg-blue-50', icon: 'text-blue-500', text: 'text-blue-800' },
    warning: { border: 'border-amber-200', bg: 'bg-amber-50', icon: 'text-amber-500', text: 'text-amber-800' },
    success: { border: 'border-emerald-200', bg: 'bg-emerald-50', icon: 'text-emerald-500', text: 'text-emerald-800' },
  }[rec.type]

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles.border} ${styles.bg}`}>
      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${styles.bg} ${styles.icon} border ${styles.border}`}>
        {index + 1}
      </span>
      <p className={`text-sm ${styles.text}`}>{rec.text}</p>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [data, setData] = useState<PredictionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/analytics/predictions')
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Error al cargar datos')
        return
      }
      setData(await res.json())
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived values ──────────────────────────────────────────────────────────
  const maxHourOrders = data ? Math.max(...data.peakHours.map((h) => h.avgOrders), 0.1) : 1
  const maxDaySales = data ? Math.max(...data.peakDays.map((d) => d.avgSales), 0.1) : 1

  const trendConfig = {
    subiendo: { label: 'Subiendo', Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    bajando: { label: 'Bajando', Icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    estable: { label: 'Estable', Icon: Minus, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
  }

  const trend = data ? trendConfig[data.weeklyTrend] : null

  return (
    <AdminLayoutClient active="predictions">
      <div className="max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin/analytics" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Analytics</a>
              <span className="text-gray-300">/</span>
              <span className="text-sm text-gray-700 font-medium">Predicciones</span>
            </div>
            <h1 className="font-serif text-3xl font-bold text-gray-900">Predicciones & Estadísticas</h1>
            <p className="text-gray-500 text-sm mt-1">Basado en los últimos 90 días de operación</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="self-start px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm">{error}</div>
        )}

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : data ? (
            <>
              {/* Monthly projection */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-indigo-50 flex-shrink-0">
                  <DollarSign size={20} className="text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Proyección mensual</p>
                  <p className="text-xl font-bold mt-0.5 text-indigo-600 truncate">{formatPrice(data.monthlyProjection)}</p>
                  {data.estimatedMonthlyProfit !== null && (
                    <p className="text-xs text-gray-400 mt-0.5">Ganancia: {formatPrice(data.estimatedMonthlyProfit)}</p>
                  )}
                </div>
              </div>

              {/* Weekly trend */}
              {trend && (
                <div className={`bg-white rounded-2xl shadow-sm border ${trend.border} p-5 flex items-start gap-4`}>
                  <div className={`p-3 rounded-xl ${trend.bg} flex-shrink-0`}>
                    <trend.Icon size={20} className={trend.color} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Tendencia semanal</p>
                    <p className={`text-xl font-bold mt-0.5 ${trend.color}`}>{trend.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Prom. diario: {formatPrice(data.dailyAverage)}</p>
                  </div>
                </div>
              )}

              {/* Best day */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-amber-50 flex-shrink-0">
                  <Calendar size={20} className="text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Mejor día</p>
                  <p className="text-xl font-bold mt-0.5 text-amber-600">{data.bestDay?.label ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatPrice(data.bestDay?.avgSales ?? 0)} promedio</p>
                </div>
              </div>

              {/* Best hour */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-violet-50 flex-shrink-0">
                  <Clock size={20} className="text-violet-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Mejor hora</p>
                  <p className="text-xl font-bold mt-0.5 text-violet-600">{data.bestHour?.label ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{data.bestHour?.avgOrders ?? 0} pedidos prom.</p>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ── Charts Row 1: Peak hours + Peak days ────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

          {/* Peak hours bar chart */}
          {loading ? <SkeletonChart /> : data ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-800 mb-1">Ventas promedio por hora</h2>
              <p className="text-xs text-gray-400 mb-4">Pedidos promedio · Horarios pico resaltados</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.peakHours} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                    interval={2}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip content={<HourTooltip />} />
                  <Bar dataKey="avgOrders" radius={[3, 3, 0, 0]}>
                    {data.peakHours.map((h) => {
                      const isPeak = h.avgOrders >= maxHourOrders * 0.7
                      return (
                        <Cell
                          key={h.hour}
                          fill={isPeak ? '#6366f1' : '#c7d2fe'}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded bg-indigo-500" /> Horario pico
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded bg-indigo-200" /> Normal
                </div>
              </div>
            </div>
          ) : null}

          {/* Peak days bar chart */}
          {loading ? <SkeletonChart /> : data ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-800 mb-1">Ventas promedio por día</h2>
              <p className="text-xs text-gray-400 mb-4">Promedio histórico · Mejor día resaltado</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.peakDays} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<DayTooltip />} />
                  <Bar dataKey="avgSales" radius={[4, 4, 0, 0]}>
                    {data.peakDays.map((d) => {
                      const isBest = d.avgSales >= maxDaySales * 0.85
                      return (
                        <Cell
                          key={d.dow}
                          fill={isBest ? '#f59e0b' : '#fde68a'}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded bg-amber-400" /> Mejor día
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-3 h-3 rounded bg-amber-200" /> Normal
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Chart Row 2: Weekly trend with projection ────────────────────── */}
        {loading ? (
          <SkeletonChart />
        ) : data ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="font-semibold text-gray-800 mb-1">Tendencia últimas 4 semanas</h2>
            <p className="text-xs text-gray-400 mb-4">Ventas reales + proyección al final del mes actual</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={[
                  ...data.weeksData,
                  { label: 'Proyección', total: data.monthlyProjection / 4, isProjection: true },
                ]}
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<WeekTooltip />} />
                <ReferenceLine
                  x="Proyección"
                  stroke="#a5b4fc"
                  strokeDasharray="6 3"
                  label={{ value: 'Proyección', position: 'top', fontSize: 10, fill: '#6366f1' }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (props: any) => {
                      const { cx, cy, payload } = props
                      if (payload?.isProjection) {
                        return (
                          <circle
                            key={`dot-proj-${cx}-${cy}`}
                            cx={cx}
                            cy={cy}
                            r={5}
                            fill="white"
                            stroke="#6366f1"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                          />
                        )
                      }
                      return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#6366f1" />
                    }
                  }
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {/* ── Product Growth Cards ──────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

            {/* Growing */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpRight size={18} className="text-emerald-500" />
                <h2 className="font-semibold text-gray-800">Top productos en crecimiento</h2>
              </div>
              {data.topGrowingProducts.length > 0 ? (
                <div className="space-y-3">
                  {data.topGrowingProducts.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Sem ant: {p.week1} · Esta sem: {p.week2}</p>
                      </div>
                      <span className="ml-3 flex items-center gap-1 text-emerald-700 font-bold text-sm flex-shrink-0 bg-emerald-100 px-2.5 py-1 rounded-lg">
                        <ArrowUpRight size={14} />
                        +{p.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos de crecimiento en el período</p>
              )}
            </div>

            {/* Declining */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <ArrowDownRight size={18} className="text-red-500" />
                <h2 className="font-semibold text-gray-800">Top productos en declive</h2>
              </div>
              {data.decliningProducts.length > 0 ? (
                <div className="space-y-3">
                  {data.decliningProducts.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Sem ant: {p.week1} · Esta sem: {p.week2}</p>
                      </div>
                      <span className="ml-3 flex items-center gap-1 text-red-700 font-bold text-sm flex-shrink-0 bg-red-100 px-2.5 py-1 rounded-lg">
                        <ArrowDownRight size={14} />
                        {p.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Sin datos de declive en el período</p>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Customer Patterns Card ────────────────────────────────────────── */}
        {loading ? (
          <SkeletonCard />
        ) : data ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center gap-2 mb-5">
              <Users size={18} className="text-indigo-500" />
              <h2 className="font-semibold text-gray-800">Patrones de cliente</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <Users size={22} className="text-indigo-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Personas promedio</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-0.5">{data.customerPatterns.avgPersons}</p>
                  <p className="text-xs text-indigo-500">por pedido</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <UtensilsCrossed size={22} className="text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Modalidad favorita</p>
                  <p className="text-xl font-bold text-amber-700 mt-0.5 capitalize">{data.customerPatterns.favoriteDining}</p>
                  <p className="text-xs text-amber-500">más frecuente</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <CreditCard size={22} className="text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Pago preferido</p>
                  <p className="text-xl font-bold text-emerald-700 mt-0.5 capitalize">{data.customerPatterns.favoritePayment}</p>
                  <p className="text-xs text-emerald-500">más usado</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Recommendations ───────────────────────────────────────────────── */}
        {loading ? (
          <SkeletonChart />
        ) : data && data.recommendations.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Lightbulb size={18} className="text-amber-500" />
              <h2 className="font-semibold text-gray-800">Recomendaciones automáticas</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {data.recommendations.length} sugerencias
              </span>
            </div>
            <div className="space-y-3">
              {data.recommendations.map((rec, i) => (
                <RecommendationCard key={i} rec={rec} index={i} />
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </AdminLayoutClient>
  )
}
