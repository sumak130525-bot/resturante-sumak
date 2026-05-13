'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Users, Clock, History, Plus, Pencil, Trash2, Loader2,
  LogIn, LogOut, Lock, CheckCircle2, XCircle, Banknote, Printer,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: string
  name: string
  role: string
  hourly_rate: number
  active: boolean
  created_at: string
}

type TimeEntry = {
  id: string
  employee_id: string
  clock_in: string
  clock_out: string | null
  hours_worked: number | null
  date: string
  employees?: { name: string; role: string; hourly_rate: number } | null
}

type EmployeePayment = {
  id: string
  employee_id: string
  type: 'advance' | 'salary'
  amount: number
  description: string | null
  period_from: string | null
  period_to: string | null
  hours_worked: number | null
  gross_amount: number | null
  advances_deducted: number | null
  cash_movement_id: string | null
  created_at: string
  employees?: { name: string; role: string; hourly_rate: number } | null
}

type CalcResult = {
  employee: { id: string; name: string; role: string; hourly_rate: number }
  period_from: string
  period_to: string
  hours_worked: number
  hourly_rate: number
  gross_amount: number
  advances_total: number
  net_amount: number
}

type Tab = 'fichaje' | 'empleados' | 'historial' | 'pagos'

// ─── Argentina time helpers ───────────────────────────────────────────────────

const ARG_OFFSET_MS = -3 * 60 * 60 * 1000

function toArgTime(utcIso: string): string {
  const d = new Date(new Date(utcIso).getTime() - ARG_OFFSET_MS)
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function toArgDateTime(utcIso: string): string {
  const d = new Date(new Date(utcIso).getTime() - ARG_OFFSET_MS)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function todayArg(): string {
  const d = new Date(Date.now() - ARG_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function firstDayOfMonthArg(): string {
  const d = new Date(Date.now() - ARG_OFFSET_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function formatHours(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h ${mm}m`
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError('Credenciales incorrectas. Intenta de nuevo.')
      setLoading(false)
    } else {
      onAuth()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-hero-gradient px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-40" />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-sumak-gold/10 animate-spin-slow pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full border border-sumak-gold/8 animate-spin-slow pointer-events-none" style={{ animationDirection: 'reverse', animationDuration: '14s' }} />

      <div className="relative w-full max-w-md animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-gold-glow">
              <Users size={28} className="text-sumak-brown" />
            </div>
            <div>
              <h1 className="font-serif font-bold text-3xl text-white tracking-wide">Empleados</h1>
              <p className="text-white/50 text-sm mt-0.5">Control horario de personal</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-8 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Lock size={14} className="text-sumak-brown-light" />
            <p className="text-xs font-semibold text-sumak-brown-light tracking-wider uppercase">Acceso restringido</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@sumak.com"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-sumak-brown-light mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className={cn('btn-primary w-full flex items-center justify-center gap-2 py-3.5')}
            >
              {loading ? <><Loader2 size={17} className="animate-spin" />Entrando…</> : 'Ingresar'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-white/25 mt-6">Solo para administradores de Sumak Restaurante</p>
      </div>
    </div>
  )
}

// ─── Employee Modal ───────────────────────────────────────────────────────────

function EmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(employee?.name ?? '')
  const [role, setRole] = useState(employee?.role ?? '')
  const [hourlyRate, setHourlyRate] = useState(String(employee?.hourly_rate ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const body = { name, role, hourly_rate: Number(hourlyRate) }
    const res = employee
      ? await fetch('/api/empleados', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id: employee.id }) })
      : await fetch('/api/empleados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      onSaved()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al guardar')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5 animate-scale-in">
        <h2 className="font-serif text-xl font-bold text-sumak-brown">
          {employee ? 'Editar empleado' : 'Agregar empleado'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nombre completo"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cargo</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ej: Mozo, Cocinero, Cajero"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Pago por hora (ARS)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="0"
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-sumak-brown text-white rounded-xl py-2.5 text-sm font-medium hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab: Fichaje ─────────────────────────────────────────────────────────────

function TabFichaje({ employees }: { employees: Employee[] }) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeEmployees = employees.filter((e) => e.active)

  const fetchEntries = useCallback(async () => {
    const res = await fetch('/api/empleados/fichaje')
    if (res.ok) setEntries(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleAction = async (employee_id: string, action: 'entrada' | 'salida') => {
    setError(null)
    setActionLoading(employee_id + action)
    const res = await fetch('/api/empleados/fichaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id, action }),
    })
    if (res.ok) {
      await fetchEntries()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al registrar fichaje')
    }
    setActionLoading(null)
  }

  // Map employee_id -> today's open entry
  const openEntryMap = new Map<string, TimeEntry>()
  const closedToday = new Set<string>()
  for (const e of entries) {
    if (!e.clock_out) {
      openEntryMap.set(e.employee_id, e)
    } else {
      closedToday.add(e.employee_id)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : activeEmployees.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No hay empleados activos</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeEmployees.map((emp) => {
            const openEntry = openEntryMap.get(emp.id)
            const hasClosed = closedToday.has(emp.id) && !openEntry
            const isWorking = !!openEntry
            const isLoading = actionLoading === emp.id + 'entrada' || actionLoading === emp.id + 'salida'

            return (
              <div
                key={emp.id}
                className={cn(
                  'bg-white rounded-2xl border p-5 space-y-4 shadow-sm transition-all',
                  isWorking ? 'border-green-200' : hasClosed ? 'border-gray-100' : 'border-gray-100'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800 text-base">{emp.name}</p>
                    {emp.role && <p className="text-xs text-gray-400 mt-0.5">{emp.role}</p>}
                  </div>
                  <div className={cn(
                    'text-xs font-semibold px-2.5 py-1 rounded-full',
                    isWorking
                      ? 'bg-green-100 text-green-700'
                      : hasClosed
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-gray-100 text-gray-400'
                  )}>
                    {isWorking ? 'Trabajando' : hasClosed ? 'Finalizado' : 'Sin fichar'}
                  </div>
                </div>

                <div className="text-sm text-gray-500">
                  {isWorking && openEntry ? (
                    <span className="flex items-center gap-1.5 text-green-700">
                      <CheckCircle2 size={14} />
                      Entrada: {toArgTime(openEntry.clock_in)}
                    </span>
                  ) : hasClosed ? (
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <XCircle size={14} />
                      Ya fichó hoy
                    </span>
                  ) : (
                    <span className="text-gray-300">No fichó hoy</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(emp.id, 'entrada')}
                    disabled={isLoading || isWorking || hasClosed}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-xl transition-colors',
                      !isWorking && !hasClosed
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    )}
                  >
                    {actionLoading === emp.id + 'entrada' ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                    Entrada
                  </button>
                  <button
                    onClick={() => handleAction(emp.id, 'salida')}
                    disabled={isLoading || !isWorking}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-xl transition-colors',
                      isWorking
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    )}
                  >
                    {actionLoading === emp.id + 'salida' ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                    Salida
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Empleados (CRUD) ────────────────────────────────────────────────────

function TabEmpleados({
  employees,
  loading,
  onRefresh,
}: {
  employees: Employee[]
  loading: boolean
  onRefresh: () => void
}) {
  const [modal, setModal] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`¿Eliminar a ${emp.name}? Esto también eliminará todos sus fichajes.`)) return
    setError(null)
    setDeleting(emp.id)
    const res = await fetch('/api/empleados', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: emp.id }),
    })
    if (res.ok) {
      onRefresh()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al eliminar')
    }
    setDeleting(null)
  }

  const handleToggleActive = async (emp: Employee) => {
    const res = await fetch('/api/empleados', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: emp.id, active: !emp.active }),
    })
    if (res.ok) onRefresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{employees.length} empleado{employees.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setModal({ open: true, employee: null })}
          className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 transition-colors"
        >
          <Plus size={15} />
          Agregar empleado
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No hay empleados. Agrega el primero.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600 hidden sm:table-cell">Cargo</th>
                <th className="text-right px-5 py-3.5 font-semibold text-gray-600 hidden md:table-cell">$/hora</th>
                <th className="text-center px-5 py-3.5 font-semibold text-gray-600">Estado</th>
                <th className="text-right px-5 py-3.5 font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-800">{emp.name}</td>
                  <td className="px-5 py-4 text-gray-500 hidden sm:table-cell">{emp.role || '—'}</td>
                  <td className="px-5 py-4 text-gray-700 text-right hidden md:table-cell">
                    {formatARS(emp.hourly_rate)}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button
                      onClick={() => handleToggleActive(emp)}
                      className={cn(
                        'text-xs font-semibold px-2.5 py-1 rounded-full transition-colors',
                        emp.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      )}
                    >
                      {emp.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setModal({ open: true, employee: emp })}
                        className="p-2 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-sumak-brown/10 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(emp)}
                        disabled={deleting === emp.id}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Eliminar"
                      >
                        {deleting === emp.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <EmployeeModal
          employee={modal.employee}
          onClose={() => setModal({ open: false, employee: null })}
          onSaved={() => { setModal({ open: false, employee: null }); onRefresh() }}
        />
      )}
    </div>
  )
}

// ─── Tab: Historial de Horas ──────────────────────────────────────────────────

function TabHistorial({ employees }: { employees: Employee[] }) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [from, setFrom] = useState(firstDayOfMonthArg())
  const [to, setTo] = useState(todayArg())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistorial = useCallback(async () => {
    if (!selectedEmployee) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ employee_id: selectedEmployee, from, to })
    const res = await fetch(`/api/empleados/horas?${params}`)
    if (res.ok) {
      const d = await res.json()
      setEntries(d.entries ?? [])
      setTotalHours(d.totalHours ?? 0)
      setTotalAmount(d.totalAmount ?? 0)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al cargar historial')
    }
    setLoading(false)
  }, [selectedEmployee, from, to])

  useEffect(() => { fetchHistorial() }, [fetchHistorial])

  const selectedEmp = employees.find((e) => e.id === selectedEmployee)

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Empleado</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
            >
              <option value="">Seleccionar empleado…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} {emp.role ? `(${emp.role})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {!selectedEmployee ? (
        <div className="text-center py-16 text-gray-400 text-sm">Selecciona un empleado para ver el historial</div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-blue-100 p-5">
              <p className="text-xs text-gray-400 mb-1">Registros</p>
              <p className="text-2xl font-bold text-gray-800">{entries.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-green-100 p-5">
              <p className="text-xs text-gray-400 mb-1">Total horas</p>
              <p className="text-2xl font-bold text-green-700">{formatHours(totalHours)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-amber-100 p-5">
              <p className="text-xs text-gray-400 mb-1">
                Monto estimado
                {selectedEmp ? <span className="ml-1 font-normal text-gray-300">({formatARS(selectedEmp.hourly_rate)}/h)</span> : ''}
              </p>
              <p className="text-2xl font-bold text-amber-700">{formatARS(totalAmount)}</p>
            </div>
          </div>

          {/* Table */}
          {entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              Sin registros en este período
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Fecha</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Entrada</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Salida</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600">Horas</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600 hidden sm:table-cell">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry) => {
                    const hrs = entry.hours_worked ?? 0
                    const rate = selectedEmp?.hourly_rate ?? 0
                    const amount = hrs * rate
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5 text-gray-700 font-medium">
                          {new Date(entry.date + 'T00:00:00').toLocaleDateString('es-AR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                          })}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{toArgTime(entry.clock_in)}</td>
                        <td className="px-5 py-3.5 text-gray-600">
                          {entry.clock_out ? toArgTime(entry.clock_out) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right text-gray-700">{formatHours(hrs)}</td>
                        <td className="px-5 py-3.5 text-right text-amber-700 font-medium hidden sm:table-cell">
                          {formatARS(amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-5 py-3.5 font-semibold text-gray-700">Total del período</td>
                    <td className="px-5 py-3.5 text-right font-bold text-gray-800">{formatHours(totalHours)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-amber-700 hidden sm:table-cell">{formatARS(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Receipt Print Helpers ────────────────────────────────────────────────────

function printAdvanceReceipt(payment: EmployeePayment, empName: string, empRole: string) {
  const dateStr = toArgDateTime(payment.created_at)
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo Adelanto</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; padding: 4mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .separator { border-top: 1px dashed #000; margin: 3mm 0; }
  .row { display: flex; justify-content: space-between; margin: 1mm 0; }
  .title { font-size: 13px; font-weight: bold; margin-bottom: 2mm; }
  .subtitle { font-size: 10px; margin-bottom: 1mm; }
  .firma { margin-top: 10mm; border-top: 1px solid #000; padding-top: 2mm; width: 50mm; margin-left: auto; margin-right: auto; text-align: center; font-size: 10px; }
  @media print { @page { margin: 0; size: 72mm auto; } body { padding: 2mm; } }
</style>
</head>
<body>
  <div class="center">
    <div class="title">SUMAK RESTAURANTE</div>
    <div class="subtitle">RECIBO DE ADELANTO</div>
  </div>
  <div class="separator"></div>
  <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
  <div class="row"><span>Empleado:</span><span>${empName}</span></div>
  <div class="row"><span>Cargo:</span><span>${empRole || '—'}</span></div>
  <div class="separator"></div>
  <div class="row bold"><span>MONTO ADELANTADO:</span><span>${formatARS(payment.amount)}</span></div>
  ${payment.description ? `<div class="row"><span>Concepto:</span><span>${payment.description}</span></div>` : ''}
  <div class="separator"></div>
  <div class="firma">Firma del empleado</div>
</body>
</html>`
  sessionStorage.setItem('receipt_print', html)
  const w = window.open('', '_blank', 'width=400,height=600')
  if (w) {
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }
}

function printSalaryReceipt(payment: EmployeePayment, empName: string, empRole: string) {
  const dateStr = toArgDateTime(payment.created_at)
  const periodStr = payment.period_from && payment.period_to
    ? `${formatDate(payment.period_from)} al ${formatDate(payment.period_to)}`
    : '—'
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo Sueldo</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; padding: 4mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .separator { border-top: 1px dashed #000; margin: 3mm 0; }
  .row { display: flex; justify-content: space-between; margin: 1mm 0; }
  .title { font-size: 13px; font-weight: bold; margin-bottom: 2mm; }
  .subtitle { font-size: 10px; margin-bottom: 1mm; }
  .firma { margin-top: 10mm; border-top: 1px solid #000; padding-top: 2mm; width: 50mm; margin-left: auto; margin-right: auto; text-align: center; font-size: 10px; }
  .deduccion { color: #c00; }
  @media print { @page { margin: 0; size: 72mm auto; } body { padding: 2mm; } }
</style>
</head>
<body>
  <div class="center">
    <div class="title">SUMAK RESTAURANTE</div>
    <div class="subtitle">RECIBO DE SUELDO</div>
  </div>
  <div class="separator"></div>
  <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
  <div class="row"><span>Empleado:</span><span>${empName}</span></div>
  <div class="row"><span>Cargo:</span><span>${empRole || '—'}</span></div>
  <div class="separator"></div>
  <div class="row"><span>Período:</span><span>${periodStr}</span></div>
  <div class="row"><span>Horas trabajadas:</span><span>${formatHours(payment.hours_worked ?? 0)}</span></div>
  <div class="row"><span>Tarifa/hora:</span><span>${formatARS(payment.employees?.hourly_rate ?? 0)}</span></div>
  <div class="separator"></div>
  <div class="row"><span>Bruto:</span><span>${formatARS(payment.gross_amount ?? 0)}</span></div>
  <div class="row deduccion"><span>(-) Adelantos:</span><span>${formatARS(payment.advances_deducted ?? 0)}</span></div>
  <div class="separator"></div>
  <div class="row bold"><span>NETO A PAGAR:</span><span>${formatARS(payment.amount)}</span></div>
  <div class="separator"></div>
  <div class="firma">Firma del empleado</div>
</body>
</html>`
  sessionStorage.setItem('receipt_print', html)
  const w = window.open('', '_blank', 'width=400,height=700')
  if (w) {
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }
}

// ─── Tab: Pagos ───────────────────────────────────────────────────────────────

function TabPagos({ employees }: { employees: Employee[] }) {
  // List state
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterFrom, setFilterFrom] = useState(firstDayOfMonthArg())
  const [filterTo, setFilterTo] = useState(todayArg())
  const [filterType, setFilterType] = useState('')

  // Modal state
  const [modal, setModal] = useState<'none' | 'advance' | 'salary'>('none')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Advance form
  const [advEmployee, setAdvEmployee] = useState('')
  const [advAmount, setAdvAmount] = useState('')
  const [advDescription, setAdvDescription] = useState('')

  // Salary form
  const [salEmployee, setSalEmployee] = useState('')
  const [salFrom, setSalFrom] = useState(firstDayOfMonthArg())
  const [salTo, setSalTo] = useState(todayArg())
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [salCustomAmount, setSalCustomAmount] = useState('')

  // Collapse rows
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchPayments = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    const params = new URLSearchParams()
    if (filterEmployee) params.set('employee_id', filterEmployee)
    if (filterFrom) params.set('from', filterFrom)
    if (filterTo) params.set('to', filterTo)
    if (filterType) params.set('type', filterType)
    const res = await fetch(`/api/empleados/pagos?${params}`)
    if (res.ok) setPayments(await res.json())
    else {
      const d = await res.json()
      setListError(d.error ?? 'Error al cargar pagos')
    }
    setListLoading(false)
  }, [filterEmployee, filterFrom, filterTo, filterType])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  // ── Advance submit ──
  const handleAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError(null)
    setSaving(true)
    const res = await fetch('/api/empleados/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: advEmployee,
        type: 'advance',
        amount: Number(advAmount),
        description: advDescription || undefined,
      }),
    })
    if (res.ok) {
      const pmt: EmployeePayment = await res.json()
      const emp = employees.find((e) => e.id === advEmployee)
      setModal('none')
      resetAdvForm()
      await fetchPayments()
      // Print receipt
      printAdvanceReceipt(pmt, emp?.name ?? '', emp?.role ?? '')
    } else {
      const d = await res.json()
      setSaveError(d.error ?? 'Error al registrar adelanto')
    }
    setSaving(false)
  }

  // ── Salary calc ──
  const handleCalc = async () => {
    if (!salEmployee || !salFrom || !salTo) return
    setCalcLoading(true)
    setCalcError(null)
    setCalcResult(null)
    const params = new URLSearchParams({ employee_id: salEmployee, period_from: salFrom, period_to: salTo })
    const res = await fetch(`/api/empleados/pagos/calcular?${params}`)
    if (res.ok) {
      const d: CalcResult = await res.json()
      setCalcResult(d)
      setSalCustomAmount(String(d.net_amount))
    } else {
      const d = await res.json()
      setCalcError(d.error ?? 'Error al calcular')
    }
    setCalcLoading(false)
  }

  // ── Salary submit ──
  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!calcResult) return
    setSaveError(null)
    setSaving(true)
    const netToPay = Number(salCustomAmount) || calcResult.net_amount
    const res = await fetch('/api/empleados/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: salEmployee,
        type: 'salary',
        amount: netToPay,
        period_from: salFrom,
        period_to: salTo,
        hours_worked: calcResult.hours_worked,
        gross_amount: calcResult.gross_amount,
        advances_deducted: calcResult.advances_total,
      }),
    })
    if (res.ok) {
      const pmt: EmployeePayment = await res.json()
      const emp = employees.find((e) => e.id === salEmployee)
      setModal('none')
      resetSalForm()
      await fetchPayments()
      printSalaryReceipt(
        { ...pmt, employees: { name: emp?.name ?? '', role: emp?.role ?? '', hourly_rate: calcResult.hourly_rate } },
        emp?.name ?? '',
        emp?.role ?? ''
      )
    } else {
      const d = await res.json()
      setSaveError(d.error ?? 'Error al registrar sueldo')
    }
    setSaving(false)
  }

  function resetAdvForm() {
    setAdvEmployee('')
    setAdvAmount('')
    setAdvDescription('')
    setSaveError(null)
  }

  function resetSalForm() {
    setSalEmployee('')
    setSalFrom(firstDayOfMonthArg())
    setSalTo(todayArg())
    setCalcResult(null)
    setSalCustomAmount('')
    setSaveError(null)
    setCalcError(null)
  }

  // Summary totals
  const totalAdvances = payments.filter((p) => p.type === 'advance').reduce((s, p) => s + Number(p.amount), 0)
  const totalSalaries = payments.filter((p) => p.type === 'salary').reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-5">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
        <button
          onClick={() => { resetAdvForm(); setModal('advance') }}
          className="flex items-center gap-2 bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-amber-700 transition-colors"
        >
          <Banknote size={15} />
          Registrar adelanto
        </button>
        <button
          onClick={() => { resetSalForm(); setModal('salary') }}
          className="flex items-center gap-2 bg-sumak-brown text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-sumak-brown/90 transition-colors"
        >
          <Plus size={15} />
          Pagar sueldo
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Empleado</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
            >
              <option value="">Todos</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tipo</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="advance">Adelantos</option>
              <option value="salary">Sueldos</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Desde</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hasta</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-amber-100 p-4">
          <p className="text-xs text-gray-400 mb-1">Adelantos</p>
          <p className="text-xl font-bold text-amber-600">{formatARS(totalAdvances)}</p>
          <p className="text-xs text-gray-300 mt-0.5">{payments.filter((p) => p.type === 'advance').length} registros</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 p-4">
          <p className="text-xs text-gray-400 mb-1">Sueldos</p>
          <p className="text-xl font-bold text-green-700">{formatARS(totalSalaries)}</p>
          <p className="text-xs text-gray-300 mt-0.5">{payments.filter((p) => p.type === 'salary').length} registros</p>
        </div>
        <div className="bg-white rounded-2xl border border-sumak-brown/20 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-400 mb-1">Total egresado</p>
          <p className="text-xl font-bold text-sumak-brown">{formatARS(totalAdvances + totalSalaries)}</p>
          <p className="text-xs text-gray-300 mt-0.5">{payments.length} movimientos</p>
        </div>
      </div>

      {listError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{listError}</div>
      )}

      {/* Payments table */}
      {listLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={24} className="animate-spin" /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
          Sin pagos en este período
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Fecha</th>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Empleado</th>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600 hidden sm:table-cell">Tipo</th>
                <th className="text-right px-5 py-3.5 font-semibold text-gray-600">Monto</th>
                <th className="text-center px-5 py-3.5 font-semibold text-gray-600">Recibo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map((pmt) => {
                const isExpanded = expandedId === pmt.id
                const empName = pmt.employees?.name ?? '—'
                const empRole = pmt.employees?.role ?? ''
                return (
                  <>
                    <tr
                      key={pmt.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pmt.id)}
                    >
                      <td className="px-5 py-3.5 text-gray-600 font-medium whitespace-nowrap">
                        {toArgDateTime(pmt.created_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800">{empName}</p>
                        {empRole && <p className="text-xs text-gray-400">{empRole}</p>}
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className={cn(
                          'text-xs font-semibold px-2.5 py-1 rounded-full',
                          pmt.type === 'advance'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        )}>
                          {pmt.type === 'advance' ? 'Adelanto' : 'Sueldo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-800">
                        {formatARS(pmt.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (pmt.type === 'advance') printAdvanceReceipt(pmt, empName, empRole)
                            else printSalaryReceipt(pmt, empName, empRole)
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-sumak-brown/10 transition-colors"
                          title="Imprimir recibo"
                        >
                          <Printer size={15} />
                        </button>
                        {isExpanded ? <ChevronUp size={13} className="inline ml-1 text-gray-300" /> : <ChevronDown size={13} className="inline ml-1 text-gray-300" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={pmt.id + '-detail'} className="bg-amber-50/30">
                        <td colSpan={5} className="px-5 py-3 text-xs text-gray-600 space-y-1">
                          {pmt.type === 'advance' && pmt.description && (
                            <div>Concepto: {pmt.description}</div>
                          )}
                          {pmt.type === 'salary' && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
                              <div>Período: {pmt.period_from ? `${formatDate(pmt.period_from)} – ${formatDate(pmt.period_to!)}` : '—'}</div>
                              <div>Horas: {formatHours(pmt.hours_worked ?? 0)}</div>
                              <div>Bruto: {formatARS(pmt.gross_amount ?? 0)}</div>
                              <div>Adelantos deducidos: {formatARS(pmt.advances_deducted ?? 0)}</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Advance Modal ── */}
      {modal === 'advance' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5 animate-scale-in">
            <h2 className="font-serif text-xl font-bold text-sumak-brown flex items-center gap-2">
              <Banknote size={20} /> Registrar adelanto
            </h2>
            <form onSubmit={handleAdvanceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Empleado *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                  value={advEmployee}
                  onChange={(e) => setAdvEmployee(e.target.value)}
                  required
                >
                  <option value="">Seleccionar…</option>
                  {employees.filter((e) => e.active).map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} {emp.role ? `(${emp.role})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Monto (ARS) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                  value={advAmount}
                  onChange={(e) => setAdvAmount(e.target.value)}
                  required
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Descripción</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                  value={advDescription}
                  onChange={(e) => setAdvDescription(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                Se registrará como egreso en caja y se imprimirá el recibo.
              </p>
              {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{saveError}</div>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setModal('none'); resetAdvForm() }}
                  className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                  {saving ? 'Guardando…' : 'Registrar e imprimir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Salary Modal ── */}
      {modal === 'salary' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 animate-scale-in my-4">
            <h2 className="font-serif text-xl font-bold text-sumak-brown flex items-center gap-2">
              <Banknote size={20} /> Pagar sueldo
            </h2>

            {/* Step 1: select employee and period, then calculate */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Empleado *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                  value={salEmployee}
                  onChange={(e) => { setSalEmployee(e.target.value); setCalcResult(null) }}
                  required
                >
                  <option value="">Seleccionar…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} {emp.role ? `(${emp.role})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Período desde *</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                    value={salFrom}
                    onChange={(e) => { setSalFrom(e.target.value); setCalcResult(null) }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Período hasta *</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                    value={salTo}
                    onChange={(e) => { setSalTo(e.target.value); setCalcResult(null) }}
                    required
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCalc}
                disabled={!salEmployee || !salFrom || !salTo || calcLoading}
                className="w-full border border-sumak-brown text-sumak-brown rounded-xl py-2.5 text-sm font-medium hover:bg-sumak-brown/5 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {calcLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                {calcLoading ? 'Calculando…' : 'Calcular horas y montos'}
              </button>
              {calcError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{calcError}</div>
              )}
            </div>

            {/* Step 2: show result and confirm */}
            {calcResult && (
              <form onSubmit={handleSalarySubmit} className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Horas trabajadas</span>
                    <span className="font-medium">{formatHours(calcResult.hours_worked)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tarifa/hora</span>
                    <span className="font-medium">{formatARS(calcResult.hourly_rate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Bruto</span>
                    <span className="font-medium">{formatARS(calcResult.gross_amount)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>(−) Adelantos en el período</span>
                    <span className="font-medium">{formatARS(calcResult.advances_total)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
                    <span>Neto sugerido</span>
                    <span className="text-green-700">{formatARS(calcResult.net_amount)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Monto a pagar (ARS) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30"
                    value={salCustomAmount}
                    onChange={(e) => setSalCustomAmount(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">Podés ajustar el monto si es necesario.</p>
                </div>
                <p className="text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">
                  Se registrará como egreso en caja y se imprimirá el recibo de sueldo.
                </p>
                {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{saveError}</div>}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setModal('none'); resetSalForm() }}
                    className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-sumak-brown text-white rounded-xl py-2.5 text-sm font-medium hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                    {saving ? 'Guardando…' : 'Pagar e imprimir recibo'}
                  </button>
                </div>
              </form>
            )}

            {!calcResult && (
              <button
                type="button"
                onClick={() => { setModal('none'); resetSalForm() }}
                className="w-full border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmpleadosPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [tab, setTab] = useState<Tab>('fichaje')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const router = useRouter()

  // Check existing Supabase session on mount
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setAuthenticated(true)
      setCheckingAuth(false)
    }
    check()
  }, [])

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true)
    const res = await fetch('/api/empleados')
    if (res.ok) setEmployees(await res.json())
    setLoadingEmployees(false)
  }, [])

  useEffect(() => {
    if (authenticated) fetchEmployees()
  }, [authenticated, fetchEmployees])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-sumak-brown" />
      </div>
    )
  }

  if (!authenticated) {
    return <AuthGate onAuth={() => setAuthenticated(true)} />
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'fichaje', label: 'Fichaje', icon: Clock },
    { key: 'empleados', label: 'Empleados', icon: Users },
    { key: 'historial', label: 'Historial', icon: History },
    { key: 'pagos', label: 'Pagos', icon: Banknote },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-sumak-brown text-white px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sumak-gold rounded-xl flex items-center justify-center font-serif font-bold text-sumak-brown text-base flex-shrink-0">
              S
            </div>
            <div>
              <h1 className="font-serif font-bold text-lg leading-tight">Control Horario</h1>
              <p className="text-xs text-amber-300">Sumak Restaurante</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-amber-300 hover:text-white text-sm transition-colors"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2 px-4 sm:px-5 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex-shrink-0',
                  tab === key
                    ? 'border-sumak-brown text-sumak-brown'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'fichaje' && <TabFichaje employees={employees} />}
        {tab === 'empleados' && (
          <TabEmpleados
            employees={employees}
            loading={loadingEmployees}
            onRefresh={fetchEmployees}
          />
        )}
        {tab === 'historial' && <TabHistorial employees={employees} />}
        {tab === 'pagos' && <TabPagos employees={employees} />}
      </div>
    </div>
  )
}
