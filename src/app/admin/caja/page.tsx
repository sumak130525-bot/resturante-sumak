'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { DollarSign, ChevronDown, ChevronUp, X } from 'lucide-react'

function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Movement = {
  id: string
  type: 'ingreso' | 'egreso' | 'venta_efectivo' | 'venta_transferencia'
  amount: number
  description: string | null
  created_at: string
  shift_id: string
}

type ShiftSummary = {
  total_efectivo: number
  total_transferencia: number
  total_ingresos: number
  total_egresos: number
}

type Shift = {
  id: string
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
  notes: string | null
  status: 'open' | 'closed'
  summary: ShiftSummary
  expected_calculated: number
}

// ─── Close Shift Modal ─────────────────────────────────────────────────────────

function CloseShiftModal({
  shift,
  onClose,
  onClosed,
}: {
  shift: Shift
  onClose: () => void
  onClosed: () => void
}) {
  const [closingAmount, setClosingAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expected = shift.expected_calculated
  const actualAmount = parseFloat(closingAmount.replace(',', '.'))
  const diff = !isNaN(actualAmount) ? actualAmount - expected : null

  const handleClose = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cash-shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closing_amount: !isNaN(actualAmount) ? actualAmount : null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      onClosed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSubmitting(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[95vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-sumak-brown flex items-center justify-between shrink-0">
          <h3 className="text-sumak-gold font-black text-lg">Cerrar caja</h3>
          <button onClick={onClose} className="text-sumak-gold/70 hover:text-sumak-gold">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Apertura</p>
              <p className="font-black text-gray-900 tabular-nums">{formatARS(shift.opening_amount)}</p>
            </div>
            <div className="bg-teal-50 rounded-xl p-3">
              <p className="text-xs text-teal-600 font-semibold mb-1">Ventas efectivo</p>
              <p className="font-black text-teal-700 tabular-nums">{formatARS(shift.summary.total_efectivo)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-blue-600 font-semibold mb-1">Ventas transferencia</p>
              <p className="font-black text-blue-700 tabular-nums">{formatARS(shift.summary.total_transferencia)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-green-600 font-semibold mb-1">Ingresos manuales</p>
              <p className="font-black text-green-700 tabular-nums">{formatARS(shift.summary.total_ingresos)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-red-600 font-semibold mb-1">Egresos manuales</p>
              <p className="font-black text-red-700 tabular-nums">{formatARS(shift.summary.total_egresos)}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
              <p className="text-xs text-amber-700 font-semibold mb-1">Esperado en caja</p>
              <p className="font-black text-amber-800 tabular-nums">{formatARS(expected)}</p>
            </div>
          </div>

          {/* Actual cash count */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-1">Conteo real en caja</p>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              placeholder="$ 0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xl font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
            />
          </div>

          {/* Difference */}
          {diff !== null && (
            <div className={`rounded-xl p-4 text-center ${diff === 0 ? 'bg-green-50' : diff > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-1">Diferencia</p>
              <p className={`text-2xl font-black tabular-nums ${diff === 0 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {diff > 0 ? '+' : ''}{formatARS(diff)}
              </p>
              <p className="text-xs mt-1 font-medium text-gray-500">
                {diff === 0 ? 'Caja exacta' : diff > 0 ? 'Sobra' : 'Falta'}
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-1">Notas (opcional)</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del cierre..."
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            />
          </div>

          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex gap-3 shrink-0 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleClose}
            disabled={submitting}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 text-white ${
              submitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-md'
            }`}
          >
            {submitting ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shift Detail Modal ────────────────────────────────────────────────────────

function ShiftDetailModal({
  shift,
  movements,
  onClose,
}: {
  shift: Shift
  movements: Movement[]
  onClose: () => void
}) {
  const typeLabel: Record<string, string> = {
    venta_efectivo: 'Venta efectivo',
    venta_transferencia: 'Venta transfer',
    ingreso: 'Ingreso manual',
    egreso: 'Egreso manual',
  }
  const typeBg: Record<string, string> = {
    venta_efectivo: 'bg-teal-50',
    venta_transferencia: 'bg-blue-50',
    ingreso: 'bg-green-50',
    egreso: 'bg-red-50',
  }
  const typeTextColor: Record<string, string> = {
    venta_efectivo: 'text-teal-700',
    venta_transferencia: 'text-blue-700',
    ingreso: 'text-green-700',
    egreso: 'text-red-700',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[95vh]">
        <div className="px-6 py-4 bg-sumak-brown flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sumak-gold font-black text-lg">Detalle del turno</h3>
            <p className="text-sumak-gold/70 text-xs">{formatDateTime(shift.opened_at)}</p>
          </div>
          <button onClick={onClose} className="text-sumak-gold/70 hover:text-sumak-gold">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {movements.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin movimientos registrados</p>
          ) : (
            movements.map((m) => (
              <div key={m.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${typeBg[m.type] ?? 'bg-gray-50'}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${typeTextColor[m.type] ?? 'text-gray-700'}`}>{typeLabel[m.type] ?? m.type}</p>
                  {m.description && <p className="text-xs text-gray-500 truncate">{m.description}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(m.created_at)}</p>
                </div>
                <p className={`font-black text-sm tabular-nums shrink-0 ${typeTextColor[m.type] ?? 'text-gray-900'}`}>
                  {m.type === 'egreso' ? '-' : '+'}{formatARS(Number(m.amount))}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminCajaPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Open shift modal state
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [openingAmount, setOpeningAmount] = useState('')
  const [openingSubmitting, setOpeningSubmitting] = useState(false)
  const [openingError, setOpeningError] = useState<string | null>(null)

  // Close shift modal
  const [showCloseModal, setShowCloseModal] = useState(false)

  // Shift detail
  const [detailShift, setDetailShift] = useState<Shift | null>(null)
  const [detailMovements, setDetailMovements] = useState<Movement[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Accordion for shift history
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null)

  const currentShift = shifts.find((s) => s.status === 'open') ?? null
  const closedShifts = shifts.filter((s) => s.status === 'closed')

  const loadShifts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cash-shifts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setShifts(data.shifts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadShifts() }, [loadShifts])

  const handleOpenShift = async () => {
    const parsed = parseFloat(openingAmount.replace(',', '.')) || 0
    setOpeningSubmitting(true)
    setOpeningError(null)
    try {
      const res = await fetch('/api/admin/cash-shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_amount: parsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setShowOpenModal(false)
      setOpeningAmount('')
      loadShifts()
    } catch (err) {
      setOpeningError(err instanceof Error ? err.message : 'Error')
    }
    setOpeningSubmitting(false)
  }

  const loadDetail = async (shift: Shift) => {
    setDetailShift(shift)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/pos/cash-movements?shift_id=${shift.id}`)
      const data = await res.json()
      setDetailMovements(data.movements ?? [])
    } catch (e) {
      void e
      setDetailMovements([])
    }
    setLoadingDetail(false)
  }

  return (
    <AdminLayoutClient active="caja">
      <div className="space-y-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sumak-brown/10 rounded-xl flex items-center justify-center">
              <DollarSign size={20} className="text-sumak-brown" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-sumak-brown">Caja</h1>
          </div>
          <button
            onClick={loadShifts}
            className="text-sm text-gray-500 hover:text-sumak-brown border border-gray-200 rounded-xl px-3 py-2 transition-colors"
          >
            Actualizar
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ── Current shift ── */}
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Estado actual</h2>
              {currentShift ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          Caja abierta
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Desde {formatDateTime(currentShift.opened_at)}</p>
                    </div>
                    <p className="font-black text-2xl text-gray-900 tabular-nums">{formatARS(currentShift.expected_calculated)}</p>
                  </div>

                  {/* Summary grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 font-semibold mb-1">Apertura</p>
                      <p className="font-black text-gray-900 text-sm tabular-nums">{formatARS(currentShift.opening_amount)}</p>
                    </div>
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-teal-500 font-semibold mb-1">V. Efectivo</p>
                      <p className="font-black text-teal-700 text-sm tabular-nums">{formatARS(currentShift.summary.total_efectivo)}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-green-500 font-semibold mb-1">Ingresos</p>
                      <p className="font-black text-green-700 text-sm tabular-nums">{formatARS(currentShift.summary.total_ingresos)}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-red-500 font-semibold mb-1">Egresos</p>
                      <p className="font-black text-red-700 text-sm tabular-nums">{formatARS(currentShift.summary.total_egresos)}</p>
                    </div>
                  </div>

                  {/* Transfer total */}
                  <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600">Ventas por transferencia</span>
                    <span className="font-black text-blue-700 tabular-nums">{formatARS(currentShift.summary.total_transferencia)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => { loadDetail(currentShift) }}
                      disabled={loadingDetail}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all active:scale-95"
                    >
                      Ver movimientos
                    </button>
                    <button
                      onClick={() => setShowCloseModal(true)}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all active:scale-95"
                    >
                      Cerrar caja
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <DollarSign size={28} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-700">No hay caja abierta</p>
                    <p className="text-sm text-gray-400 mt-1">Abrí un turno para empezar a registrar movimientos</p>
                  </div>
                  <button
                    onClick={() => setShowOpenModal(true)}
                    className="px-6 py-3 bg-sumak-brown text-sumak-gold font-bold rounded-xl hover:bg-sumak-brown/90 transition-all active:scale-95 shadow-sm"
                  >
                    Abrir caja
                  </button>
                </div>
              )}
            </section>

            {/* ── Shift history ── */}
            {closedShifts.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Historial de turnos</h2>
                <div className="space-y-2">
                  {closedShifts.map((shift) => {
                    const diff = shift.closing_amount !== null
                      ? shift.closing_amount - shift.expected_calculated
                      : null
                    const isExpanded = expandedShiftId === shift.id
                    return (
                      <div key={shift.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Row header */}
                        <button
                          onClick={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                          className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                Cerrado
                              </span>
                              {diff !== null && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  diff === 0 ? 'bg-green-100 text-green-700' : diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {diff > 0 ? 'Sobra ' : diff < 0 ? 'Falta ' : ''}{diff !== 0 ? formatARS(Math.abs(diff)) : 'Exacto'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{formatDateTime(shift.opened_at)} → {shift.closed_at ? formatDateTime(shift.closed_at) : '—'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-gray-900 tabular-nums">{formatARS(shift.expected_calculated)}</p>
                            <p className="text-xs text-gray-400">esperado</p>
                          </div>
                          {isExpanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="bg-gray-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-gray-400 font-semibold mb-1">Apertura</p>
                                <p className="font-black text-gray-900 text-sm tabular-nums">{formatARS(shift.opening_amount)}</p>
                              </div>
                              <div className="bg-teal-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-teal-500 font-semibold mb-1">V. Efectivo</p>
                                <p className="font-black text-teal-700 text-sm tabular-nums">{formatARS(shift.summary.total_efectivo)}</p>
                              </div>
                              <div className="bg-green-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-green-500 font-semibold mb-1">Ingresos</p>
                                <p className="font-black text-green-700 text-sm tabular-nums">{formatARS(shift.summary.total_ingresos)}</p>
                              </div>
                              <div className="bg-red-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-red-500 font-semibold mb-1">Egresos</p>
                                <p className="font-black text-red-700 text-sm tabular-nums">{formatARS(shift.summary.total_egresos)}</p>
                              </div>
                            </div>
                            {shift.closing_amount !== null && (
                              <div className={`rounded-xl p-3 flex items-center justify-between ${
                                diff === 0 ? 'bg-green-50' : (diff ?? 0) > 0 ? 'bg-blue-50' : 'bg-red-50'
                              }`}>
                                <span className="text-xs font-bold text-gray-600">Conteo real</span>
                                <span className="font-black tabular-nums text-gray-900">{formatARS(shift.closing_amount)}</span>
                              </div>
                            )}
                            {shift.notes && (
                              <p className="text-xs text-gray-500 italic">{shift.notes}</p>
                            )}
                            <button
                              onClick={() => loadDetail(shift)}
                              disabled={loadingDetail}
                              className="text-sm font-semibold text-teal-600 hover:text-teal-700 underline"
                            >
                              Ver todos los movimientos
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Open Shift Modal ── */}
      {showOpenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowOpenModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-sumak-brown flex items-center justify-between">
              <h3 className="text-sumak-gold font-black text-lg">Abrir caja</h3>
              <button onClick={() => setShowOpenModal(false)} className="text-sumak-gold/70 hover:text-sumak-gold"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">Monto de apertura (fondo de caja)</p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="$ 0"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xl font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400 tabular-nums"
                />
              </div>
              {openingError && <p className="text-red-600 text-sm font-semibold">{openingError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowOpenModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpenShift}
                  disabled={openingSubmitting}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 text-white ${
                    openingSubmitting ? 'bg-gray-300 cursor-not-allowed' : 'bg-sumak-brown hover:bg-sumak-brown/90 shadow-md'
                  }`}
                >
                  {openingSubmitting ? 'Abriendo...' : 'Abrir caja'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Shift Modal ── */}
      {showCloseModal && currentShift && (
        <CloseShiftModal
          shift={currentShift}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => {
            setShowCloseModal(false)
            loadShifts()
          }}
        />
      )}

      {/* ── Shift Detail Modal ── */}
      {detailShift && !loadingDetail && (
        <ShiftDetailModal
          shift={detailShift}
          movements={detailMovements}
          onClose={() => setDetailShift(null)}
        />
      )}
    </AdminLayoutClient>
  )
}
