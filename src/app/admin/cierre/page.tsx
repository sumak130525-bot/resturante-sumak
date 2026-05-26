'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { Lock, ChefHat, Plus, Trash2, Power, Calendar, Clock } from 'lucide-react'
import type { ClosureDay, KitchenStatusResponse } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminCierrePage() {
  // ── Estado: Días Cerrados ─────────────────────────────────────────────────
  const [closureDays, setClosureDays] = useState<ClosureDay[]>([])
  const [loadingDays, setLoadingDays] = useState(true)
  const [savingDay, setSavingDay] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newReason, setNewReason] = useState('')

  // ── Estado: Cocina ────────────────────────────────────────────────────────
  const [kitchen, setKitchen] = useState<KitchenStatusResponse | null>(null)
  const [loadingKitchen, setLoadingKitchen] = useState(true)
  const [savingKitchen, setSavingKitchen] = useState(false)

  const [kitchenReason, setKitchenReason] = useState('')
  const [schedStart, setSchedStart] = useState('')
  const [schedEnd, setSchedEnd] = useState('')

  // ── Feedback ──────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3500)
  }

  const showError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 5000)
  }

  // ── Fetch datos ───────────────────────────────────────────────────────────
  const fetchDays = useCallback(async () => {
    setLoadingDays(true)
    const r = await fetch('/api/admin/closure-days')
    if (r.ok) setClosureDays(await r.json())
    setLoadingDays(false)
  }, [])

  const fetchKitchen = useCallback(async () => {
    setLoadingKitchen(true)
    const r = await fetch('/api/admin/kitchen-status')
    if (r.ok) {
      const data: KitchenStatusResponse = await r.json()
      setKitchen(data)
      setKitchenReason(data.reason ?? '')
      setSchedStart(
        data.schedule_start
          ? new Date(data.schedule_start).toISOString().slice(0, 16)
          : ''
      )
      setSchedEnd(
        data.schedule_end
          ? new Date(data.schedule_end).toISOString().slice(0, 16)
          : ''
      )
    }
    setLoadingKitchen(false)
  }, [])

  useEffect(() => {
    fetchDays()
    fetchKitchen()
  }, [fetchDays, fetchKitchen])

  // ── Días Cerrados: agregar ────────────────────────────────────────────────
  const handleAddDay = async () => {
    if (!newStart || !newReason.trim()) {
      showError('Completá la fecha de inicio y el motivo')
      return
    }
    setSavingDay(true)
    const r = await fetch('/api/admin/closure-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: newStart,
        end_date: newEnd || null,
        reason: newReason.trim(),
      }),
    })
    if (r.ok) {
      setNewStart('')
      setNewEnd('')
      setNewReason('')
      await fetchDays()
      showSuccess('Fecha de cierre agregada')
    } else {
      const d = await r.json()
      showError(d.error ?? 'Error al guardar')
    }
    setSavingDay(false)
  }

  // ── Días Cerrados: eliminar ───────────────────────────────────────────────
  const handleDeleteDay = async (id: string) => {
    if (!confirm('¿Eliminar esta fecha de cierre?')) return
    setDeletingId(id)
    const r = await fetch('/api/admin/closure-days', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (r.ok) {
      await fetchDays()
      showSuccess('Fecha eliminada')
    } else {
      const d = await r.json()
      showError(d.error ?? 'Error al eliminar')
    }
    setDeletingId(null)
  }

  // ── Cocina: toggle manual ─────────────────────────────────────────────────
  const handleKitchenToggle = async () => {
    if (!kitchen) return
    setSavingKitchen(true)
    const newClosed = !kitchen.effective_closed
    const r = await fetch('/api/admin/kitchen-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_closed: newClosed,
        reason: kitchenReason.trim() || null,
        manual: true,
        schedule_start: null,
        schedule_end: null,
      }),
    })
    if (r.ok) {
      const data: KitchenStatusResponse = await r.json()
      setKitchen(data)
      showSuccess(newClosed ? 'Cocina marcada como cerrada' : 'Cocina marcada como abierta')
    } else {
      const d = await r.json()
      showError(d.error ?? 'Error al actualizar')
    }
    setSavingKitchen(false)
  }

  // ── Cocina: guardar razón (sin cambiar estado) ────────────────────────────
  const handleSaveKitchenReason = async () => {
    if (!kitchen) return
    setSavingKitchen(true)
    const r = await fetch('/api/admin/kitchen-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: kitchenReason.trim() || null }),
    })
    if (r.ok) {
      const data: KitchenStatusResponse = await r.json()
      setKitchen(data)
      showSuccess('Motivo guardado')
    } else {
      const d = await r.json()
      showError(d.error ?? 'Error al guardar')
    }
    setSavingKitchen(false)
  }

  // ── Cocina: programar cierre ──────────────────────────────────────────────
  const handleScheduleKitchen = async () => {
    if (!schedStart) {
      showError('Indicá al menos la fecha/hora de inicio del cierre programado')
      return
    }
    setSavingKitchen(true)
    const r = await fetch('/api/admin/kitchen-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manual: false,
        is_closed: false,
        reason: kitchenReason.trim() || null,
        schedule_start: new Date(schedStart).toISOString(),
        schedule_end: schedEnd ? new Date(schedEnd).toISOString() : null,
      }),
    })
    if (r.ok) {
      const data: KitchenStatusResponse = await r.json()
      setKitchen(data)
      showSuccess('Cierre programado guardado')
    } else {
      const d = await r.json()
      showError(d.error ?? 'Error al programar')
    }
    setSavingKitchen(false)
  }

  // ── Cocina: cancelar programación ─────────────────────────────────────────
  const handleCancelSchedule = async () => {
    setSavingKitchen(true)
    const r = await fetch('/api/admin/kitchen-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manual: true,
        is_closed: false,
        schedule_start: null,
        schedule_end: null,
      }),
    })
    if (r.ok) {
      const data: KitchenStatusResponse = await r.json()
      setKitchen(data)
      setSchedStart('')
      setSchedEnd('')
      showSuccess('Programación cancelada')
    } else {
      const d = await r.json()
      showError(d.error ?? 'Error')
    }
    setSavingKitchen(false)
  }

  // ── Clases compartidas ────────────────────────────────────────────────────
  const inputClass = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 bg-white'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
  const btnPrimary = 'flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors'
  const btnDanger = 'flex items-center gap-2 border border-red-200 text-red-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors'
  const btnSecondary = 'flex items-center gap-2 border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors'

  // ── Estado efectivo de cocina ─────────────────────────────────────────────
  const kitchenEffectivelyClosed = kitchen?.effective_closed ?? false
  const isScheduled = kitchen ? !kitchen.manual : false

  return (
    <AdminLayoutClient active="cierre">
      <div className="space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sumak-brown/10 rounded-xl flex items-center justify-center">
            <Lock size={20} className="text-sumak-brown" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-sumak-brown">Gestión de Cierres</h1>
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

        {/* ════════════════════════════════════════
            SECCIÓN 1: DÍAS CERRADOS
            ════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-gray-500" />
            <h2 className="text-base font-semibold text-gray-700">Días Cerrados</h2>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">

            <p className="text-xs text-gray-500">
              Agregá fechas puntuales o rangos en que el restaurante estará cerrado (ej: feriados, eventos).
              La web y el bot de WhatsApp mostrarán el motivo indicado.
            </p>

            {/* Tabla de fechas existentes */}
            {loadingDays ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : closureDays.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No hay fechas de cierre configuradas.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3">Desde</th>
                      <th className="text-left px-4 py-3">Hasta</th>
                      <th className="text-left px-4 py-3">Motivo</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {closureDays.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{formatDate(d.start_date)}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {d.end_date ? formatDate(d.end_date) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{d.reason}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteDay(d.id)}
                            disabled={deletingId === d.id}
                            className={btnDanger}
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                            {deletingId === d.id ? 'Eliminando...' : 'Eliminar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulario agregar */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agregar fecha de cierre</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={labelClass}>Fecha inicio *</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Fecha fin (opcional)</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={newEnd}
                    min={newStart}
                    onChange={(e) => setNewEnd(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Motivo *</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="ej: Feriado nacional"
                  />
                </div>
              </div>
              <button
                onClick={handleAddDay}
                disabled={savingDay}
                className={btnPrimary}
              >
                <Plus size={15} />
                {savingDay ? 'Guardando...' : 'Agregar fecha'}
              </button>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════
            SECCIÓN 2: COCINA CERRADA
            ════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ChefHat size={16} className="text-gray-500" />
            <h2 className="text-base font-semibold text-gray-700">Cocina Cerrada</h2>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">

            <p className="text-xs text-gray-500">
              Indicá si la cocina está operativa. Podés cerrala manualmente o programar un horario/fecha.
            </p>

            {loadingKitchen ? (
              <div className="space-y-3">
                <div className="h-20 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            ) : (
              <>
                {/* Toggle manual grande */}
                <div className={`flex items-center justify-between gap-4 p-5 rounded-2xl border-2 transition-colors ${
                  kitchenEffectivelyClosed
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div>
                    <p className={`text-base font-bold ${kitchenEffectivelyClosed ? 'text-red-700' : 'text-green-700'}`}>
                      {isScheduled
                        ? kitchenEffectivelyClosed
                          ? '🍳 Cocina cerrada (programado)'
                          : '🍳 Cocina abierta (programado)'
                        : kitchenEffectivelyClosed
                          ? '🍳 Cocina cerrada'
                          : '🍳 Cocina abierta'
                      }
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isScheduled
                        ? 'El estado se gestiona por programación horaria'
                        : 'Control manual activo'}
                    </p>
                  </div>
                  <button
                    onClick={handleKitchenToggle}
                    disabled={savingKitchen || isScheduled}
                    title={isScheduled ? 'Cancelá la programación para usar el toggle manual' : undefined}
                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                      kitchenEffectivelyClosed ? 'bg-red-500' : 'bg-green-500'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-7 w-7 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                      kitchenEffectivelyClosed ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Campo de motivo */}
                <div>
                  <label className={labelClass}>Motivo del cierre (opcional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className={inputClass}
                      value={kitchenReason}
                      onChange={(e) => setKitchenReason(e.target.value)}
                      placeholder="ej: Mantenimiento de equipos"
                    />
                    <button
                      onClick={handleSaveKitchenReason}
                      disabled={savingKitchen}
                      className={btnSecondary}
                    >
                      Guardar
                    </button>
                  </div>
                </div>

                {/* Programar cierre */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={14} className="text-gray-400" />
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Programar cierre</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={labelClass}>Inicio del cierre *</label>
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={schedStart}
                        onChange={(e) => setSchedStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Fin del cierre (opcional)</label>
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={schedEnd}
                        min={schedStart}
                        onChange={(e) => setSchedEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleScheduleKitchen}
                      disabled={savingKitchen}
                      className={btnPrimary}
                    >
                      <Power size={15} />
                      {savingKitchen ? 'Guardando...' : 'Guardar programación'}
                    </button>
                    {isScheduled && (
                      <button
                        onClick={handleCancelSchedule}
                        disabled={savingKitchen}
                        className={btnSecondary}
                      >
                        Cancelar programación
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    Al guardar una programación, el toggle manual se desactiva. La cocina se cerrará automáticamente en el horario indicado (TZ: America/Argentina/Mendoza).
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

      </div>
    </AdminLayoutClient>
  )
}
