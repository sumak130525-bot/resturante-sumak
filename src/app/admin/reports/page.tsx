'use client'

import React, { useState, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import { FileText, Download, FileSpreadsheet, FileDown, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = 'sales' | 'profitability'
type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

interface SalesRow {
  numero: number
  fecha: string
  hora: string
  pedido: string
  items: string
  total: number
  metodoPago: string
  modalidad: string
  canal: string
}

interface ProfitRow {
  plato: string
  vendidos: number
  ingresos: number
  costo: number | null
  ganancia: number | null
  margen: number | null
}

interface InventoryRow {
  ingrediente: string
  stockActual: number | null
  unidad: string
  precio: number | null
  ultimoUso: string
  alertaBajoStock: boolean
}

interface SalesTotals {
  totalVentas: number
  totalPedidos: number
  ticketPromedio: number
}

interface ProfitTotals {
  totalIngresos: number
  totalGanancia: number
  avgMargen: number
  totalPlatos: number
}

interface InventoryTotals {
  totalIngredientes: number
  totalValor: number
  alertasBajoStock: number
}

interface ReportData {
  type: ReportType
  period: string
  from: string | null
  to: string | null
  rows: (SalesRow | ProfitRow | InventoryRow)[]
  totals: SalesTotals | ProfitTotals | InventoryTotals
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORT_TYPES: { label: string; value: ReportType; desc: string }[] = [
  { label: 'Ventas', value: 'sales', desc: 'Pedidos con totales, método de pago y canal' },
  { label: 'Rentabilidad', value: 'profitability', desc: 'Margen y ganancia por plato' },
]

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Hoy', value: 'today' },
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Año', value: 'year' },
  { label: 'Rango', value: 'custom' },
]

// ─── Export Utilities ─────────────────────────────────────────────────────────

function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))]
  return lines.join('\r\n')
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function getSalesExportData(rows: SalesRow[]) {
  const headers = ['#', 'Fecha', 'Hora', 'Pedido', 'Items', 'Total', 'Método Pago', 'Modalidad', 'Canal']
  const data = rows.map((r) => [r.numero, r.fecha, r.hora, r.pedido, r.items, r.total, r.metodoPago, r.modalidad, r.canal])
  return { headers, data }
}

function getProfitExportData(rows: ProfitRow[]) {
  const headers = ['Plato', 'Vendidos', 'Ingresos', 'Costo Unit.', 'Ganancia', 'Margen %']
  const data = rows.map((r) => [r.plato, r.vendidos, r.ingresos, r.costo, r.ganancia, r.margen !== null ? +r.margen.toFixed(2) : null])
  return { headers, data }
}

function getInventoryExportData(rows: InventoryRow[]) {
  const headers = ['Ingrediente', 'Stock Actual', 'Unidad', 'Precio Unit.', 'Último Uso', 'Alerta Bajo Stock']
  const data = rows.map((r) => [r.ingrediente, r.stockActual, r.unidad, r.precio, r.ultimoUso, r.alertaBajoStock ? 'Sí' : 'No'])
  return { headers, data }
}

function getExportData(data: ReportData) {
  if (data.type === 'sales') return getSalesExportData(data.rows as SalesRow[])
  if (data.type === 'profitability') return getProfitExportData(data.rows as ProfitRow[])
  return getInventoryExportData(data.rows as InventoryRow[])
}

function getReportLabel(type: ReportType) {
  return REPORT_TYPES.find((t) => t.value === type)?.label ?? type
}

async function exportExcel(data: ReportData) {
  const XLSX = await import('xlsx')
  const { headers, data: rows } = getExportData(data)
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, getReportLabel(data.type))
  XLSX.writeFile(wb, `reporte_${data.type}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function exportPDF(data: ReportData) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { headers, data: rows } = getExportData(data)

  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(`Reporte de ${getReportLabel(data.type)}`, 14, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  const periodLabel = data.period === 'custom' && data.from && data.to
    ? `${new Date(data.from).toLocaleDateString('es-EC')} — ${new Date(data.to).toLocaleDateString('es-EC')}`
    : PERIODS.find((p) => p.value === data.period)?.label ?? data.period
  doc.text(`Período: ${periodLabel}    Generado: ${new Date().toLocaleDateString('es-EC')}`, 14, 26)
  doc.setTextColor(0)

  autoTable(doc, {
    head: [headers],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: rows as any,
    startY: 32,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
  })

  doc.save(`reporte_${data.type}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

function exportCSV(data: ReportData) {
  const { headers, data: rows } = getExportData(data)
  const csv = toCSV(headers, rows)
  downloadBlob(csv, `reporte_${data.type}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;')
}

// ─── Table Components ─────────────────────────────────────────────────────────

function SalesTable({ rows, totals }: { rows: SalesRow[]; totals: SalesTotals }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['#', 'Fecha', 'Hora', 'Pedido', 'Items', 'Total', 'Método Pago', 'Modalidad', 'Canal'].map((h) => (
                <th key={h} className="text-left py-3 px-3 text-gray-400 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.numero} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                <td className="py-2.5 px-3 text-gray-400 font-mono text-xs">{r.numero}</td>
                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{r.fecha}</td>
                <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{r.hora}</td>
                <td className="py-2.5 px-3 font-mono text-xs text-indigo-600">{r.pedido}</td>
                <td className="py-2.5 px-3 text-gray-600 max-w-[200px] truncate">{r.items}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatPrice(r.total)}</td>
                <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{r.metodoPago}</td>
                <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{r.modalidad}</td>
                <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{r.canal}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center text-gray-400 text-sm">Sin datos para el período seleccionado</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Totals */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Total Ventas</p>
          <p className="text-xl font-bold text-indigo-700 mt-1">{formatPrice(totals.totalVentas)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4">
          <p className="text-xs text-emerald-400 font-medium uppercase tracking-wide">Total Pedidos</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{totals.totalPedidos}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-xs text-amber-400 font-medium uppercase tracking-wide">Ticket Promedio</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{formatPrice(totals.ticketPromedio)}</p>
        </div>
      </div>
    </div>
  )
}

function marginBg(m: number | null) {
  if (m === null) return 'text-gray-400'
  if (m >= 50) return 'text-emerald-600 font-semibold'
  if (m >= 30) return 'text-amber-600 font-semibold'
  return 'text-red-500 font-semibold'
}

function ProfitTable({ rows, totals }: { rows: ProfitRow[]; totals: ProfitTotals }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Plato', 'Vendidos', 'Ingresos', 'Costo Unit.', 'Ganancia', 'Margen %'].map((h) => (
                <th key={h} className="text-left py-3 px-3 text-gray-400 font-medium text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                <td className="py-2.5 px-3 font-medium text-gray-800">{r.plato}</td>
                <td className="py-2.5 px-3 text-gray-600">{r.vendidos}</td>
                <td className="py-2.5 px-3 text-gray-700">{formatPrice(r.ingresos)}</td>
                <td className="py-2.5 px-3 text-gray-500">{r.costo !== null ? formatPrice(r.costo) : <span className="text-gray-300">—</span>}</td>
                <td className="py-2.5 px-3">
                  {r.ganancia !== null ? (
                    <span className="flex items-center gap-1">
                      {r.ganancia >= 0 ? <TrendingUp size={13} className="text-emerald-500" /> : <TrendingDown size={13} className="text-red-400" />}
                      <span className={r.ganancia >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-500 font-semibold'}>{formatPrice(r.ganancia)}</span>
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`py-2.5 px-3 ${marginBg(r.margen)}`}>
                  {r.margen !== null ? `${r.margen.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">Sin datos</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Ingresos Totales</p>
          <p className="text-xl font-bold text-indigo-700 mt-1">{formatPrice(totals.totalIngresos)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4">
          <p className="text-xs text-emerald-400 font-medium uppercase tracking-wide">Ganancia Total</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{formatPrice(totals.totalGanancia)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-xs text-amber-400 font-medium uppercase tracking-wide">Margen Promedio</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{totals.avgMargen.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Platos</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{totals.totalPlatos}</p>
        </div>
      </div>
    </div>
  )
}

function InventoryTable({ rows, totals }: { rows: InventoryRow[]; totals: InventoryTotals }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Ingrediente', 'Stock Actual', 'Unidad', 'Precio Unit.', 'Último Uso', 'Alerta'].map((h) => (
                <th key={h} className="text-left py-3 px-3 text-gray-400 font-medium text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/70 transition-colors ${r.alertaBajoStock ? 'bg-red-50/40' : ''}`}>
                <td className="py-2.5 px-3 font-medium text-gray-800">{r.ingrediente}</td>
                <td className="py-2.5 px-3 text-gray-700">
                  {r.stockActual !== null ? r.stockActual : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 px-3 text-gray-500">{r.unidad}</td>
                <td className="py-2.5 px-3 text-gray-600">
                  {r.precio !== null ? formatPrice(r.precio) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 px-3 text-gray-500">{r.ultimoUso}</td>
                <td className="py-2.5 px-3">
                  {r.alertaBajoStock ? (
                    <span className="flex items-center gap-1 text-red-500 text-xs font-semibold">
                      <AlertTriangle size={12} />
                      Bajo stock
                    </span>
                  ) : (
                    <span className="text-emerald-500 text-xs font-semibold">OK</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">Sin ingredientes registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Ingredientes</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{totals.totalIngredientes}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide">Valor Inventario</p>
          <p className="text-xl font-bold text-indigo-700 mt-1">{formatPrice(totals.totalValor)}</p>
        </div>
        <div className={`rounded-xl p-4 ${totals.alertasBajoStock > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${totals.alertasBajoStock > 0 ? 'text-red-400' : 'text-emerald-400'}`}>Alertas Bajo Stock</p>
          <p className={`text-xl font-bold mt-1 ${totals.alertasBajoStock > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totals.alertasBajoStock}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('sales')
  const [period, setPeriod] = useState<Period>('month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | 'csv' | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/admin/reports?type=${reportType}&period=${period}`
      if (period === 'custom' && dateFrom && dateTo) {
        url += `&dateFrom=${dateFrom}&dateTo=${dateTo}`
      }
      const res = await fetch(url)
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Error al cargar reporte')
        return
      }
      setData(await res.json())
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [reportType, period, dateFrom, dateTo])

  const handleExport = async (format: 'excel' | 'pdf' | 'csv') => {
    if (!data) return
    setExporting(format)
    try {
      if (format === 'excel') await exportExcel(data)
      else if (format === 'pdf') await exportPDF(data)
      else exportCSV(data)
    } finally {
      setExporting(null)
    }
  }

  const periodLabel = () => {
    if (period === 'custom' && data?.from && data?.to) {
      return `${new Date(data.from).toLocaleDateString('es-EC')} — ${new Date(data.to).toLocaleDateString('es-EC')}`
    }
    return PERIODS.find((p) => p.value === period)?.label ?? period
  }

  return (
    <AdminLayoutClient active="reports">
      <div className="max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-gray-900">Reportes</h1>
            <p className="text-gray-500 text-sm mt-1">Exporta reportes en Excel, PDF o CSV</p>
          </div>
          {data && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting !== null}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
              >
                <FileSpreadsheet size={16} />
                {exporting === 'excel' ? 'Generando…' : 'Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting !== null}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
              >
                <FileDown size={16} />
                {exporting === 'pdf' ? 'Generando…' : 'PDF'}
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting !== null}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
              >
                <Download size={16} />
                {exporting === 'csv' ? 'Generando…' : 'CSV'}
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex flex-col gap-6">

            {/* Report Type */}
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Tipo de Reporte</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {REPORT_TYPES.map(({ label, value, desc }) => (
                  <button
                    key={value}
                    onClick={() => { setReportType(value); setData(null) }}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      reportType === value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg flex-shrink-0 ${reportType === value ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                      <FileText size={16} className={reportType === value ? 'text-indigo-600' : 'text-gray-500'} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${reportType === value ? 'text-indigo-700' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Period */}
            <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Período</p>
                <div className="flex flex-wrap gap-2">
                  {PERIODS.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setPeriod(value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        period === value
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Custom range */}
                {period === 'custom' && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 whitespace-nowrap">Desde</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 whitespace-nowrap">Hasta</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  </div>
                )}
            </div>

            {/* Generate Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={fetchReport}
                disabled={loading || (period === 'custom' && (!dateFrom || !dateTo))}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
              >
                <FileText size={16} />
                {loading ? 'Generando reporte…' : 'Generar Reporte'}
              </button>
              {data && (
                <p className="text-xs text-gray-400">
                  {`Período: ${periodLabel()} · `}
                  {data.rows.length} registros
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-600 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 bg-gray-50 rounded mb-1" />
            ))}
          </div>
        )}

        {/* Report Preview */}
        {!loading && data && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            {/* Report header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5 pb-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">
                  Reporte de {getReportLabel(data.type)}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Período: {periodLabel()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('excel')}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-all"
                >
                  <FileSpreadsheet size={13} />
                  {exporting === 'excel' ? '…' : 'Excel'}
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-all"
                >
                  <FileDown size={13} />
                  {exporting === 'pdf' ? '…' : 'PDF'}
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-all"
                >
                  <Download size={13} />
                  {exporting === 'csv' ? '…' : 'CSV'}
                </button>
              </div>
            </div>

            {data.type === 'sales' && (
              <SalesTable rows={data.rows as SalesRow[]} totals={data.totals as SalesTotals} />
            )}
            {data.type === 'profitability' && (
              <ProfitTable rows={data.rows as ProfitRow[]} totals={data.totals as ProfitTotals} />
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText size={28} className="text-indigo-400" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-1">Genera tu primer reporte</h3>
            <p className="text-sm text-gray-400">Selecciona el tipo y período, luego haz clic en Generar Reporte</p>
          </div>
        )}

      </div>
    </AdminLayoutClient>
  )
}
