'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Clock, History, Plus, Pencil, Trash2, Loader2,
  LogIn, LogOut, Lock, CheckCircle2, XCircle, Banknote, Printer,
  ChevronDown, ChevronUp, Eye, EyeOff, Delete, ArrowLeft, PauseCircle, PlayCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: string
  name: string
  role: string
  hourly_rate: number
  active: boolean
  pin?: string | null
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
  pause_entries?: PauseEntry[]
}

type PauseEntry = {
  id: string
  time_entry_id: string
  pause_start: string
  pause_end: string | null
  reason: string
  created_at: string
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
  payment_method: 'cash' | 'transfer' | 'mixed' | null
  cash_amount: number | null
  transfer_amount: number | null
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

type PinEmployee = {
  id: string
  name: string
  role: string
}

type PinStatus = 'working' | 'finished' | 'not_clocked'

type PinOpenEntry = { id: string; clock_in: string } | null

// ─── Argentina time helpers ───────────────────────────────────────────────────

const ARG_TZ = 'America/Argentina/Buenos_Aires'

function toArgTime(utcIso: string): string {
  const d = new Date(utcIso)
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ARG_TZ,
  })
}

function toArgDateTime(utcIso: string): string {
  const d = new Date(utcIso)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ARG_TZ,
  })
}

function todayArg(): string {
  const d = new Date()
  const parts = d.toLocaleDateString('en-CA', { timeZone: ARG_TZ }).split('-')
  return parts.join('-')
}

function firstDayOfMonthArg(): string {
  const d = new Date()
  const parts = d.toLocaleDateString('en-CA', { timeZone: ARG_TZ }).split('-')
  return `${parts[0]}-${parts[1]}-01`
}

function nowArgTimeString(): string {
  const d = new Date()
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ARG_TZ,
  })
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

// ─── PIN Screen ───────────────────────────────────────────────────────────────

type PinScreenPhase = 'keyboard' | 'employee' | 'confirm' | 'pause_reason'

function PinScreen({ onExitPin }: { onExitPin: () => void }) {
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [phase, setPhase] = useState<PinScreenPhase>('keyboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employee, setEmployee] = useState<PinEmployee | null>(null)
  const [status, setStatus] = useState<PinStatus>('not_clocked')
  const [openEntry, setOpenEntry] = useState<PinOpenEntry>(null)
  const [hasOpenPause, setHasOpenPause] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState('')

  const pressKey = (key: string) => {
    if (pin.length < 4) {
      const next = pin + key
      setPin(next)
      setError(null)
      if (next.length === 4) {
        // Auto-submit on 4th digit
        submitPin(next)
      }
    }
  }

  const deleteKey = () => {
    setPin((p) => p.slice(0, -1))
    setError(null)
  }

  const submitPin = async (pinValue: string) => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/empleados/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinValue }),
    })
    if (res.ok) {
      const d = await res.json()
      setEmployee(d.employee)
      setStatus(d.status)
      setOpenEntry(d.open_entry)
      setHasOpenPause(d.has_open_pause ?? false)
      setPhase('employee')
    } else {
      setError('PIN incorrecto')
      setPin('')
    }
    setLoading(false)
  }

  const handleAction = async (action: 'entrada' | 'salida' | 'pausa' | 'regresar', reason?: string) => {
    if (!employee) return
    setActionLoading(true)
    const body: Record<string, string> = { employee_id: employee.id, action }
    if (reason) body.reason = reason
    const res = await fetch('/api/empleados/fichaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const timeStr = nowArgTimeString()
      const msgs: Record<string, string> = {
        entrada: `Entrada registrada ${timeStr}`,
        salida: `Salida registrada ${timeStr}`,
        pausa: `Pausa iniciada ${timeStr}`,
        regresar: `Regreso registrado ${timeStr}`,
      }
      setConfirmMsg(msgs[action] ?? `Registrado ${timeStr}`)
      setPhase('confirm')
      setTimeout(() => {
        setPhase('keyboard')
        setPin('')
        setEmployee(null)
        setConfirmMsg(null)
        setError(null)
        setPauseReason('')
        setHasOpenPause(false)
      }, 3000)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al registrar')
    }
    setActionLoading(false)
  }

  const backToKeyboard = () => {
    setPhase('keyboard')
    setPin('')
    setEmployee(null)
    setError(null)
    setPauseReason('')
    setHasOpenPause(false)
  }

  // ── Confirmation screen ──
  if (phase === 'confirm') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-6 animate-scale-in">
          <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-400" />
          </div>
          <p className="text-white text-2xl font-bold text-center">{confirmMsg}</p>
          <p className="text-white/40 text-sm">Volviendo al teclado…</p>
        </div>
      </div>
    )
  }

  // ── Pause reason screen ──
  if (phase === 'pause_reason' && employee) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="bg-[#3d2b1f] px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => { setPhase('employee'); setError(null); setPauseReason('') }}
            className="text-white/60 hover:text-white transition-colors p-1"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-white font-bold text-xl">Motivo de la pausa</h1>
            <p className="text-amber-300/70 text-sm">{employee.name}</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          <p className="text-white/60 text-sm text-center">Ingresá el motivo de la pausa (obligatorio)</p>
          <textarea
            className="w-full max-w-sm bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white text-base placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            rows={3}
            placeholder="Ej: Almuerzo, descanso, trámite…"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            autoFocus
          />
          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-300 text-sm px-4 py-3 rounded-xl text-center w-full max-w-sm">
              {error}
            </div>
          )}
          <button
            onClick={() => {
              if (!pauseReason.trim()) { setError('El motivo es obligatorio'); return }
              setError(null)
              handleAction('pausa', pauseReason.trim())
            }}
            disabled={actionLoading || !pauseReason.trim()}
            className="w-full max-w-sm py-6 rounded-3xl text-2xl font-bold flex items-center justify-center gap-4 transition-all bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 shadow-lg shadow-yellow-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading ? <Loader2 size={32} className="animate-spin" /> : <PauseCircle size={32} />}
            CONFIRMAR PAUSA
          </button>
        </div>

        <div className="pb-8 text-center">
          <button
            onClick={onExitPin}
            className="text-amber-500/70 hover:text-amber-400 text-sm transition-colors underline underline-offset-4"
          >
            Salir de modo PIN
          </button>
        </div>
      </div>
    )
  }

  // ── Employee action screen ──
  if (phase === 'employee' && employee) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Header */}
        <div className="bg-[#3d2b1f] px-6 py-4 flex items-center gap-3">
          <button
            onClick={backToKeyboard}
            className="text-white/60 hover:text-white transition-colors p-1"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-white font-bold text-xl">{employee.name}</h1>
            {employee.role && (
              <p className="text-amber-300/70 text-sm">{employee.role}</p>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          <div className={cn(
            'px-5 py-2.5 rounded-full text-base font-semibold',
            status === 'working' && hasOpenPause
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
              : status === 'working'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : status === 'finished'
              ? 'bg-gray-600/30 text-gray-400 border border-gray-500/30'
              : 'bg-gray-700/30 text-gray-400 border border-gray-600/30'
          )}>
            {status === 'working' && hasOpenPause
              ? 'En pausa'
              : status === 'working' && openEntry
              ? `Trabajando desde ${toArgTime(openEntry.clock_in)}`
              : status === 'finished'
              ? 'Turno finalizado hoy'
              : 'No fichó hoy'}
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-300 text-sm px-4 py-3 rounded-xl text-center">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="w-full max-w-sm flex flex-col gap-4">
            {/* ENTRADA — only when not clocked */}
            <button
              onClick={() => handleAction('entrada')}
              disabled={actionLoading || status === 'working' || status === 'finished'}
              className={cn(
                'w-full py-7 rounded-3xl text-2xl font-bold flex items-center justify-center gap-4 transition-all',
                status === 'not_clocked'
                  ? 'bg-green-600 text-white hover:bg-green-500 active:scale-95 shadow-lg shadow-green-900/50'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              )}
            >
              {actionLoading ? <Loader2 size={32} className="animate-spin" /> : <LogIn size={32} />}
              ENTRADA
            </button>

            {/* PAUSA — only when working (no open pause) */}
            {status === 'working' && !hasOpenPause && (
              <button
                onClick={() => { setError(null); setPauseReason(''); setPhase('pause_reason') }}
                disabled={actionLoading}
                className="w-full py-7 rounded-3xl text-2xl font-bold flex items-center justify-center gap-4 transition-all bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 shadow-lg shadow-yellow-900/50 disabled:opacity-50"
              >
                <PauseCircle size={32} />
                PAUSA
              </button>
            )}

            {/* REGRESAR — only when there is an open pause */}
            {status === 'working' && hasOpenPause && (
              <button
                onClick={() => handleAction('regresar')}
                disabled={actionLoading}
                className="w-full py-7 rounded-3xl text-2xl font-bold flex items-center justify-center gap-4 transition-all bg-green-600 text-white hover:bg-green-500 active:scale-95 shadow-lg shadow-green-900/50 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={32} className="animate-spin" /> : <PlayCircle size={32} />}
                REGRESAR
              </button>
            )}

            {/* FINALIZAR — only when working */}
            <button
              onClick={() => handleAction('salida')}
              disabled={actionLoading || status !== 'working'}
              className={cn(
                'w-full py-7 rounded-3xl text-2xl font-bold flex items-center justify-center gap-4 transition-all',
                status === 'working'
                  ? 'bg-red-600 text-white hover:bg-red-500 active:scale-95 shadow-lg shadow-red-900/50'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              )}
            >
              {actionLoading ? <Loader2 size={32} className="animate-spin" /> : <LogOut size={32} />}
              FINALIZAR
            </button>
          </div>
        </div>

        {/* Exit PIN link */}
        <div className="pb-8 text-center">
          <button
            onClick={onExitPin}
            className="text-amber-500/70 hover:text-amber-400 text-sm transition-colors underline underline-offset-4"
          >
            Salir de modo PIN
          </button>
        </div>
      </div>
    )
  }

  // ── PIN Keyboard ──
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3']

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="bg-[#3d2b1f] px-6 py-5 text-center">
        <h1 className="text-white text-2xl font-bold tracking-wide">Identifícate</h1>
      </div>

      {/* PIN display */}
      <div className="flex flex-col items-center pt-10 pb-6 px-6 gap-4">
        <div className="relative flex items-center">
          <div className="flex gap-4 items-center min-h-[3rem]">
            {pin.length === 0 ? (
              <span className="text-white/30 text-lg tracking-widest">Ingresá tu PIN</span>
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 transition-all',
                    i < pin.length
                      ? 'bg-white border-white'
                      : 'border-white/30 bg-transparent'
                  )}
                />
              ))
            )}
          </div>
          {pin.length > 0 && (
            <button
              onClick={() => setShowPin((s) => !s)}
              className="ml-4 text-white/40 hover:text-white/70 transition-colors"
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>

        {/* Show actual PIN digits if eye is open */}
        {showPin && pin.length > 0 && (
          <p className="text-white/70 text-3xl font-mono tracking-[0.5em]">{pin}</p>
        )}

        {error && (
          <div className="mt-1 text-red-400 text-sm font-medium">{error}</div>
        )}
      </div>

      {/* Keypad */}
      <div className="flex-1 flex items-center justify-center px-6">
        {loading ? (
          <Loader2 size={40} className="animate-spin text-white/40" />
        ) : (
          <div className="w-full max-w-xs">
            {/* 3x3 top grid */}
            <div className="grid grid-cols-3 gap-5 mb-5">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => pressKey(k)}
                  className="aspect-square rounded-full border-2 border-white/80 bg-black text-white text-3xl font-bold flex items-center justify-center hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all select-none"
                >
                  {k}
                </button>
              ))}
            </div>
            {/* Bottom row: ⌫  0  Aceptar */}
            <div className="grid grid-cols-3 gap-5">
              <button
                onClick={deleteKey}
                className="aspect-square rounded-full border-2 border-white/30 bg-gray-700/60 text-white flex items-center justify-center hover:bg-gray-600/60 active:scale-95 transition-all select-none"
              >
                <Delete size={26} />
              </button>
              <button
                onClick={() => pressKey('0')}
                className="aspect-square rounded-full border-2 border-white/80 bg-black text-white text-3xl font-bold flex items-center justify-center hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all select-none"
              >
                0
              </button>
              <button
                onClick={() => pin.length > 0 && submitPin(pin)}
                disabled={pin.length === 0}
                className={cn(
                  'aspect-square rounded-full border-2 text-sm font-bold flex items-center justify-center active:scale-95 transition-all select-none leading-tight text-center px-1',
                  pin.length > 0
                    ? 'border-orange-300/80 bg-orange-200/20 text-orange-200 hover:bg-orange-200/30'
                    : 'border-white/10 bg-transparent text-white/20 cursor-not-allowed'
                )}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exit PIN link */}
      <div className="pb-10 text-center">
        <button
          onClick={onExitPin}
          className="text-amber-500/70 hover:text-amber-400 text-sm transition-colors underline underline-offset-4"
        >
          Salir de modo PIN
        </button>
      </div>
    </div>
  )
}

// ─── Admin Auth Gate ──────────────────────────────────────────────────────────

function AdminAuthGate({
  onAuth,
  onCancel,
}: {
  onAuth: () => void
  onCancel: () => void
}) {
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-700 flex items-center justify-center">
              <Lock size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl">Acceso Admin</h1>
              <p className="text-white/40 text-sm mt-0.5">Ingresá tus credenciales</p>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-white/50 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@sumak.com"
                className="w-full bg-black/50 border border-white/20 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-white/50 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/50 border border-white/20 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                required
              />
            </div>
            {error && (
              <div className="bg-red-900/40 border border-red-500/40 text-red-300 text-sm p-3 rounded-xl">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-700 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" />Entrando…</> : 'Ingresar como admin'}
            </button>
          </form>
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-4 text-white/40 hover:text-white/60 text-sm transition-colors py-2"
        >
          Cancelar — volver al teclado PIN
        </button>
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
  const [pin, setPin] = useState(employee?.pin ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate PIN
    if (pin && !/^\d{4}$/.test(pin)) {
      setError('El PIN debe ser exactamente 4 dígitos numéricos')
      return
    }

    setSaving(true)
    const body = {
      name,
      role,
      hourly_rate: Number(hourlyRate),
      pin: pin || null,
    }
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
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">PIN de fichaje (4 dígitos)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 tracking-widest font-mono"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Ej: 1234"
            />
            <p className="text-xs text-gray-400 mt-1">El empleado usará este PIN para fichar entrada/salida. Dejar vacío si no tiene PIN.</p>
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

// ─── Tab: Fichaje (Admin view — read-only status) ─────────────────────────────

function TabFichaje({ employees }: { employees: Employee[] }) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  const activeEmployees = employees.filter((e) => e.active)

  const fetchEntries = useCallback(async () => {
    const res = await fetch('/api/empleados/fichaje')
    if (res.ok) setEntries(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

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

  const working = activeEmployees.filter((e) => openEntryMap.has(e.id))
  const finished = activeEmployees.filter((e) => !openEntryMap.has(e.id) && closedToday.has(e.id))
  const notClocked = activeEmployees.filter((e) => !openEntryMap.has(e.id) && !closedToday.has(e.id))

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
        Los empleados fichan su entrada y salida usando su PIN desde la pantalla principal.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : activeEmployees.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No hay empleados activos</div>
      ) : (
        <>
          {working.length > 0 && (
            <div>
              <h3 className="text-xs font-bold tracking-wider uppercase text-green-600 mb-3">
                Trabajando ahora ({working.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {working.map((emp) => {
                  const openEntry = openEntryMap.get(emp.id)
                  return (
                    <div key={emp.id} className="bg-white rounded-2xl border border-green-200 p-4 flex items-center gap-3 shadow-sm">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0 animate-pulse" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{emp.name}</p>
                        {emp.role && <p className="text-xs text-gray-400">{emp.role}</p>}
                        {openEntry && (
                          <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            Desde {toArgTime(openEntry.clock_in)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {finished.length > 0 && (
            <div>
              <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-3">
                Finalizaron hoy ({finished.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {finished.map((emp) => (
                  <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm opacity-60">
                    <XCircle size={14} className="text-gray-300 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-700 truncate">{emp.name}</p>
                      {emp.role && <p className="text-xs text-gray-400">{emp.role}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notClocked.length > 0 && (
            <div>
              <h3 className="text-xs font-bold tracking-wider uppercase text-gray-300 mb-3">
                Sin fichar hoy ({notClocked.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {notClocked.map((emp) => (
                  <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm opacity-40">
                    <div className="w-2.5 h-2.5 rounded-full border border-gray-300 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-600 truncate">{emp.name}</p>
                      {emp.role && <p className="text-xs text-gray-400">{emp.role}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
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
                <th className="text-center px-5 py-3.5 font-semibold text-gray-600 hidden md:table-cell">PIN</th>
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
                  <td className="px-5 py-4 text-center hidden md:table-cell">
                    {emp.pin ? (
                      <span className="font-mono text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">
                        ••••
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">Sin PIN</span>
                    )}
                  </td>
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

// Helper: sums all completed pauses for a time entry, returns minutes
function totalPauseMinutes(pauses: PauseEntry[] | undefined): number {
  if (!pauses || pauses.length === 0) return 0
  return pauses.reduce((acc, p) => {
    if (!p.pause_end) return acc
    const ms = new Date(p.pause_end).getTime() - new Date(p.pause_start).getTime()
    return acc + ms / 60000
  }, 0)
}

// Helper: converts "HH:MM" + date string (YYYY-MM-DD) to UTC ISO using Argentina timezone
function buildArgIso(date: string, time: string): string {
  // date = "YYYY-MM-DD", time = "HH:MM"
  // Argentina is UTC-3 always (no DST)
  const [h, m] = time.split(':').map(Number)
  const utcMs = new Date(`${date}T00:00:00Z`).getTime() + (h * 60 + m) * 60 * 1000 + 3 * 60 * 60 * 1000
  return new Date(utcMs).toISOString()
}

// Helper: extracts "HH:MM" from UTC ISO in Argentina timezone
function toArgHHMM(utcIso: string): string {
  const d = new Date(utcIso)
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ARG_TZ,
  })
}

function TabHistorial({ employees }: { employees: Employee[] }) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [from, setFrom] = useState(firstDayOfMonthArg())
  const [to, setTo] = useState(todayArg())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editClockIn, setEditClockIn] = useState('')
  const [editClockOut, setEditClockOut] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const startEdit = (entry: TimeEntry) => {
    setEditingId(entry.id)
    setEditClockIn(toArgHHMM(entry.clock_in))
    setEditClockOut(entry.clock_out ? toArgHHMM(entry.clock_out) : '')
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditClockIn('')
    setEditClockOut('')
    setEditError(null)
  }

  const handleEditSave = async (entry: TimeEntry) => {
    if (!editClockIn) { setEditError('La hora de entrada es requerida'); return }
    setEditSaving(true)
    setEditError(null)
    const body: { id: string; clock_in: string; clock_out?: string } = {
      id: entry.id,
      clock_in: buildArgIso(entry.date, editClockIn),
    }
    if (editClockOut) {
      body.clock_out = buildArgIso(entry.date, editClockOut)
    }
    const res = await fetch('/api/empleados/fichaje', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      cancelEdit()
      await fetchHistorial()
    } else {
      const d = await res.json()
      setEditError(d.error ?? 'Error al guardar')
    }
    setEditSaving(false)
  }

  const handleDelete = async (entry: TimeEntry) => {
    if (!confirm('¿Eliminar este registro de fichaje?')) return
    setDeletingId(entry.id)
    const res = await fetch(`/api/empleados/fichaje?id=${entry.id}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchHistorial()
    } else {
      const d = await res.json()
      alert(d.error ?? 'Error al eliminar')
    }
    setDeletingId(null)
  }

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
          {(() => {
            // Compute effective hours (gross - pauses) across all entries
            const totalEffectiveMinutes = entries.reduce((acc, e) => {
              const grossMin = (e.hours_worked ?? 0) * 60
              const pauseMin = totalPauseMinutes(e.pause_entries)
              return acc + Math.max(0, grossMin - pauseMin)
            }, 0)
            const totalEffectiveHours = Math.round(totalEffectiveMinutes / 60 * 100) / 100
            const rate = selectedEmp?.hourly_rate ?? 0
            const effectiveAmount = Math.round(totalEffectiveHours * rate * 100) / 100
            return (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-blue-100 p-5">
                  <p className="text-xs text-gray-400 mb-1">Registros</p>
                  <p className="text-2xl font-bold text-gray-800">{entries.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-400 mb-1">Horas brutas</p>
                  <p className="text-2xl font-bold text-gray-600">{formatHours(totalHours)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-green-100 p-5">
                  <p className="text-xs text-gray-400 mb-1">Horas efectivas</p>
                  <p className="text-2xl font-bold text-green-700">{formatHours(totalEffectiveHours)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-amber-100 p-5">
                  <p className="text-xs text-gray-400 mb-1">
                    Monto estimado
                    {selectedEmp ? <span className="ml-1 font-normal text-gray-300">({formatARS(rate)}/h)</span> : ''}
                  </p>
                  <p className="text-2xl font-bold text-amber-700">{formatARS(effectiveAmount)}</p>
                </div>
              </div>
            )
          })()}

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
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600">Brutas</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600 hidden sm:table-cell">Efectivas</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600 hidden md:table-cell">Monto</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map((entry) => {
                    const grossHrs = entry.hours_worked ?? 0
                    const pauseMin = totalPauseMinutes(entry.pause_entries)
                    const effectiveHrs = Math.max(0, Math.round((grossHrs * 60 - pauseMin) / 60 * 100) / 100)
                    const rate = selectedEmp?.hourly_rate ?? 0
                    const amount = effectiveHrs * rate
                    const isEditing = editingId === entry.id
                    const pauses = entry.pause_entries ?? []
                    return (
                      <>
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
                          <td className="px-5 py-3.5 text-right text-gray-500">{formatHours(grossHrs)}</td>
                          <td className="px-5 py-3.5 text-right text-gray-700 font-medium hidden sm:table-cell">
                            {formatHours(effectiveHrs)}
                            {pauses.length > 0 && (
                              <span className="ml-1 text-xs text-yellow-600">
                                (-{Math.round(pauseMin)}m pausa)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right text-amber-700 font-medium hidden md:table-cell">
                            {formatARS(amount)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(entry)}
                                disabled={deletingId === entry.id}
                                className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                title="Eliminar"
                              >
                                {deletingId === entry.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Pause sub-rows */}
                        {pauses.map((pause) => {
                          const pauseDurMin = pause.pause_end
                            ? Math.round((new Date(pause.pause_end).getTime() - new Date(pause.pause_start).getTime()) / 60000)
                            : null
                          return (
                            <tr key={pause.id} className="bg-yellow-50/60">
                              <td className="pl-10 pr-2 py-2 text-yellow-700 text-xs" colSpan={2}>
                                <span className="inline-flex items-center gap-1.5">
                                  <PauseCircle size={11} className="text-yellow-500 flex-shrink-0" />
                                  {toArgTime(pause.pause_start)}
                                  {pause.pause_end ? ` → ${toArgTime(pause.pause_end)}` : ' (abierta)'}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-yellow-700 text-xs" colSpan={2}>
                                {pauseDurMin !== null ? `${pauseDurMin} min` : '—'}
                              </td>
                              <td className="px-2 py-2 text-yellow-600 text-xs italic" colSpan={3}>
                                {pause.reason}
                              </td>
                            </tr>
                          )
                        })}
                        {isEditing && (
                          <tr key={entry.id + '-edit'} className="bg-indigo-50/40">
                            <td colSpan={7} className="px-5 py-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-gray-600">Entrada:</span>
                                  <input
                                    type="time"
                                    className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                                    value={editClockIn}
                                    onChange={(e) => setEditClockIn(e.target.value)}
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-gray-600">Salida:</span>
                                  <input
                                    type="time"
                                    className="border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                                    value={editClockOut}
                                    onChange={(e) => setEditClockOut(e.target.value)}
                                  />
                                </div>
                                {editError && <span className="text-xs text-red-600">{editError}</span>}
                                <button
                                  onClick={() => handleEditSave(entry)}
                                  disabled={editSaving}
                                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {editSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                                  Guardar
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  {(() => {
                    const totalEffectiveMinutes = entries.reduce((acc, e) => {
                      const grossMin = (e.hours_worked ?? 0) * 60
                      const pauseMin = totalPauseMinutes(e.pause_entries)
                      return acc + Math.max(0, grossMin - pauseMin)
                    }, 0)
                    const totalEffectiveHours = Math.round(totalEffectiveMinutes / 60 * 100) / 100
                    const rate = selectedEmp?.hourly_rate ?? 0
                    const effectiveAmount = Math.round(totalEffectiveHours * rate * 100) / 100
                    return (
                      <tr>
                        <td colSpan={3} className="px-5 py-3.5 font-semibold text-gray-700">Total del período</td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-500">{formatHours(totalHours)}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-800 hidden sm:table-cell">{formatHours(totalEffectiveHours)}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-amber-700 hidden md:table-cell">{formatARS(effectiveAmount)}</td>
                        <td></td>
                      </tr>
                    )
                  })()}
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

function paymentMethodLabel(pm: 'cash' | 'transfer' | 'mixed' | null): string {
  if (pm === 'transfer') return 'Transferencia'
  if (pm === 'mixed') return 'Mixto'
  return 'Efectivo'
}

function printViaIframe(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 500)
  }
}

function printAdvanceReceipt(payment: EmployeePayment, empName: string, empRole: string) {
  const dateStr = toArgDateTime(payment.created_at)
  const pmLabel = paymentMethodLabel(payment.payment_method)
  const mixedRows = payment.payment_method === 'mixed'
    ? `<div class="row"><span>  Efectivo:</span><span>${formatARS(payment.cash_amount ?? 0)}</span></div>
  <div class="row"><span>  Transferencia:</span><span>${formatARS(payment.transfer_amount ?? 0)}</span></div>`
    : ''
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
  <div class="row"><span>Método de pago:</span><span>${pmLabel}</span></div>
  ${mixedRows}
  <div class="separator"></div>
  <div class="firma">Firma del empleado</div>
</body>
</html>`
  printViaIframe(html)
}

function printSalaryReceipt(payment: EmployeePayment, empName: string, empRole: string) {
  const dateStr = toArgDateTime(payment.created_at)
  const periodStr = payment.period_from && payment.period_to
    ? `${formatDate(payment.period_from)} al ${formatDate(payment.period_to)}`
    : '—'
  const pmLabel = paymentMethodLabel(payment.payment_method)
  const mixedRows = payment.payment_method === 'mixed'
    ? `<div class="row"><span>  Efectivo:</span><span>${formatARS(payment.cash_amount ?? 0)}</span></div>
  <div class="row"><span>  Transferencia:</span><span>${formatARS(payment.transfer_amount ?? 0)}</span></div>`
    : ''
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
  <div class="row"><span>Método de pago:</span><span>${pmLabel}</span></div>
  ${mixedRows}
  <div class="separator"></div>
  <div class="firma">Firma del empleado</div>
</body>
</html>`
  printViaIframe(html)
}

// ─── Tab: Pagos ───────────────────────────────────────────────────────────────

function TabPagos({ employees }: { employees: Employee[] }) {
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterFrom, setFilterFrom] = useState(firstDayOfMonthArg())
  const [filterTo, setFilterTo] = useState(todayArg())
  const [filterType, setFilterType] = useState('')

  const [modal, setModal] = useState<'none' | 'advance' | 'salary'>('none')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [advEmployee, setAdvEmployee] = useState('')
  const [advAmount, setAdvAmount] = useState('')
  const [advDescription, setAdvDescription] = useState('')
  const [advPaymentMethod, setAdvPaymentMethod] = useState<'cash' | 'transfer' | 'mixed'>('cash')
  const [advCashAmount, setAdvCashAmount] = useState('')
  const [advTransferAmount, setAdvTransferAmount] = useState('')

  const [salEmployee, setSalEmployee] = useState('')
  const [salFrom, setSalFrom] = useState(firstDayOfMonthArg())
  const [salTo, setSalTo] = useState(todayArg())
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [salCustomAmount, setSalCustomAmount] = useState('')
  const [salPaymentMethod, setSalPaymentMethod] = useState<'cash' | 'transfer' | 'mixed'>('cash')
  const [salCashAmount, setSalCashAmount] = useState('')
  const [salTransferAmount, setSalTransferAmount] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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

  const handleAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError(null)
    // Validate mixed amounts
    if (advPaymentMethod === 'mixed') {
      const ca = Number(advCashAmount) || 0
      const ta = Number(advTransferAmount) || 0
      if (Math.abs(ca + ta - Number(advAmount)) >= 1) {
        setSaveError(`La suma de efectivo + transferencia debe ser igual al monto total (${formatARS(Number(advAmount))})`)
        return
      }
    }
    setSaving(true)
    const res = await fetch('/api/empleados/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: advEmployee,
        type: 'advance',
        amount: Number(advAmount),
        description: advDescription || undefined,
        payment_method: advPaymentMethod,
        cash_amount: advPaymentMethod === 'mixed' ? Number(advCashAmount) || 0 : advPaymentMethod === 'cash' ? Number(advAmount) : 0,
        transfer_amount: advPaymentMethod === 'mixed' ? Number(advTransferAmount) || 0 : advPaymentMethod === 'transfer' ? Number(advAmount) : 0,
      }),
    })
    if (res.ok) {
      const pmt: EmployeePayment = await res.json()
      const emp = employees.find((e) => e.id === advEmployee)
      setModal('none')
      resetAdvForm()
      await fetchPayments()
      printAdvanceReceipt(pmt, emp?.name ?? '', emp?.role ?? '')
    } else {
      const d = await res.json()
      setSaveError(d.error ?? 'Error al registrar adelanto')
    }
    setSaving(false)
  }

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

  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!calcResult) return
    setSaveError(null)
    const netToPay = Number(salCustomAmount) || calcResult.net_amount
    // Validate mixed amounts
    if (salPaymentMethod === 'mixed') {
      const ca = Number(salCashAmount) || 0
      const ta = Number(salTransferAmount) || 0
      if (Math.abs(ca + ta - netToPay) >= 1) {
        setSaveError(`La suma de efectivo + transferencia debe ser igual al monto a pagar (${formatARS(netToPay)})`)
        return
      }
    }
    setSaving(true)
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
        payment_method: salPaymentMethod,
        cash_amount: salPaymentMethod === 'mixed' ? Number(salCashAmount) || 0 : salPaymentMethod === 'cash' ? netToPay : 0,
        transfer_amount: salPaymentMethod === 'mixed' ? Number(salTransferAmount) || 0 : salPaymentMethod === 'transfer' ? netToPay : 0,
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
    setAdvEmployee(''); setAdvAmount(''); setAdvDescription(''); setSaveError(null)
    setAdvPaymentMethod('cash'); setAdvCashAmount(''); setAdvTransferAmount('')
  }
  function resetSalForm() {
    setSalEmployee(''); setSalFrom(firstDayOfMonthArg()); setSalTo(todayArg())
    setCalcResult(null); setSalCustomAmount(''); setSaveError(null); setCalcError(null)
    setSalPaymentMethod('cash'); setSalCashAmount(''); setSalTransferAmount('')
  }

  const handleEditSave = async (paymentId: string) => {
    const newAmt = Number(editAmount)
    if (!newAmt || newAmt <= 0) { setEditError('El monto debe ser mayor que 0'); return }
    setEditSaving(true)
    setEditError(null)
    const res = await fetch('/api/empleados/pagos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: paymentId, amount: newAmt }),
    })
    if (res.ok) {
      setEditingId(null)
      setEditAmount('')
      await fetchPayments()
    } else {
      const d = await res.json()
      setEditError(d.error ?? 'Error al editar')
    }
    setEditSaving(false)
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('¿Borrar este registro? También se eliminará el movimiento de caja asociado.')) return
    setDeletingId(paymentId)
    const res = await fetch(`/api/empleados/pagos?id=${paymentId}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchPayments()
    } else {
      const d = await res.json()
      alert(d.error ?? 'Error al borrar')
    }
    setDeletingId(null)
  }

  const totalAdvances = payments.filter((p) => p.type === 'advance').reduce((s, p) => s + Number(p.amount), 0)
  const totalSalaries = payments.filter((p) => p.type === 'salary').reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-5">
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
            <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hasta</label>
            <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>
        </div>
      </div>

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

      {listLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={24} className="animate-spin" /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">Sin pagos en este período</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Fecha</th>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600">Empleado</th>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600 hidden sm:table-cell">Tipo</th>
                <th className="text-left px-5 py-3.5 font-semibold text-gray-600 hidden md:table-cell">Método</th>
                <th className="text-right px-5 py-3.5 font-semibold text-gray-600">Monto</th>
                <th className="text-center px-5 py-3.5 font-semibold text-gray-600">Recibo</th>
                <th className="text-center px-5 py-3.5 font-semibold text-gray-600">Acciones</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map((pmt) => {
                const isExpanded = expandedId === pmt.id
                const isEditing = editingId === pmt.id
                const empName = pmt.employees?.name ?? '—'
                const empRole = pmt.employees?.role ?? ''
                return (
                  <>
                    <tr
                      key={pmt.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pmt.id)}
                    >
                      <td className="px-5 py-3.5 text-gray-600 font-medium whitespace-nowrap">{toArgDateTime(pmt.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800">{empName}</p>
                        {empRole && <p className="text-xs text-gray-400">{empRole}</p>}
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', pmt.type === 'advance' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>
                          {pmt.type === 'advance' ? 'Adelanto' : 'Sueldo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        {pmt.payment_method === 'transfer' ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Transfer</span>
                        ) : pmt.payment_method === 'mixed' ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Mixto</span>
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Efectivo</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-800">{formatARS(pmt.amount)}</td>
                      <td className="px-5 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (pmt.type === 'advance') printAdvanceReceipt(pmt, empName, empRole)
                            else printSalaryReceipt(pmt, empName, empRole)
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-sumak-brown/10 transition-colors"
                          title="Imprimir recibo"
                        >
                          <Printer size={15} />
                        </button>
                      </td>
                      <td className="px-2 py-3.5 text-center">
                        {isExpanded ? <ChevronUp size={13} className="text-gray-300" /> : <ChevronDown size={13} className="text-gray-300" />}
                      </td>
                      <td className="px-5 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {pmt.type === 'advance' && (
                            <button
                              onClick={() => { setEditingId(pmt.id); setEditAmount(String(pmt.amount)); setEditError(null) }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-sumak-brown hover:bg-sumak-brown/10 transition-colors"
                              title="Editar monto"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePayment(pmt.id)}
                            disabled={deletingId === pmt.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Borrar"
                          >
                            {deletingId === pmt.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr key={pmt.id + '-edit'} className="bg-amber-50/60">
                        <td colSpan={8} className="px-5 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold text-gray-600">Nuevo monto (ARS):</span>
                            <input
                              type="number"
                              min="1"
                              step="0.01"
                              className="border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 w-36"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {editError && <span className="text-xs text-red-600">{editError}</span>}
                            <button
                              onClick={() => handleEditSave(pmt.id)}
                              disabled={editSaving}
                              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              {editSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                              Guardar
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditAmount(''); setEditError(null) }}
                              className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && !isEditing && (
                      <tr key={pmt.id + '-detail'} className="bg-amber-50/30">
                        <td colSpan={8} className="px-5 py-3 text-xs text-gray-600 space-y-1">
                          {pmt.type === 'advance' && pmt.description && <div>Concepto: {pmt.description}</div>}
                          {pmt.payment_method === 'mixed' && (
                            <div>Desglose: Efectivo {formatARS(pmt.cash_amount ?? 0)} + Transferencia {formatARS(pmt.transfer_amount ?? 0)}</div>
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

      {/* Advance Modal */}
      {modal === 'advance' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5 animate-scale-in">
            <h2 className="font-serif text-xl font-bold text-sumak-brown flex items-center gap-2"><Banknote size={20} /> Registrar adelanto</h2>
            <form onSubmit={handleAdvanceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Empleado *</label>
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={advEmployee} onChange={(e) => setAdvEmployee(e.target.value)} required>
                  <option value="">Seleccionar…</option>
                  {employees.filter((e) => e.active).map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} {emp.role ? `(${emp.role})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Monto (ARS) *</label>
                <input type="number" min="1" step="0.01" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} required placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Descripción</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={advDescription} onChange={(e) => setAdvDescription(e.target.value)} placeholder="Opcional" />
              </div>
              {/* Payment method */}
              <div>
                <p className="text-xs font-bold text-gray-600 mb-2">Método de pago</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['cash', 'transfer', 'mixed'] as const).map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setAdvPaymentMethod(pm)}
                      className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                        advPaymentMethod === pm
                          ? pm === 'cash' ? 'bg-green-600 text-white shadow-sm'
                            : pm === 'transfer' ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-purple-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {pm === 'cash' ? '💵 Efectivo' : pm === 'transfer' ? '📲 Transfer' : '💰 Mixto'}
                    </button>
                  ))}
                </div>
                {advPaymentMethod === 'mixed' && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Monto efectivo</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={advCashAmount}
                        onChange={(e) => setAdvCashAmount(e.target.value)}
                        placeholder="$ 0"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 tabular-nums"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Monto transferencia</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={advTransferAmount}
                        onChange={(e) => setAdvTransferAmount(e.target.value)}
                        placeholder="$ 0"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 tabular-nums"
                      />
                    </div>
                    {(() => {
                      const total = Number(advAmount) || 0
                      const ca = Number(advCashAmount) || 0
                      const ta = Number(advTransferAmount) || 0
                      const diff = ca + ta - total
                      if (total > 0 && Math.abs(diff) < 1) return <p className="text-xs text-green-600 font-semibold">Suma correcta</p>
                      if (total > 0) return <p className="text-xs text-red-500 font-semibold">Debe sumar {formatARS(total)}</p>
                      return null
                    })()}
                  </div>
                )}
              </div>
              {advPaymentMethod === 'cash' && <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Se registrará como egreso en caja y se imprimirá el recibo.</p>}
              {advPaymentMethod === 'transfer' && <p className="text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2">No toca la caja física. Solo se registra el pago.</p>}
              {advPaymentMethod === 'mixed' && <p className="text-xs text-purple-700 bg-purple-50 rounded-xl px-3 py-2">Solo el monto en efectivo se registrará como egreso en caja.</p>}
              {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{saveError}</div>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setModal('none'); resetAdvForm() }} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                  {saving ? 'Guardando…' : 'Registrar e imprimir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Modal */}
      {modal === 'salary' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 animate-scale-in my-4">
            <h2 className="font-serif text-xl font-bold text-sumak-brown flex items-center gap-2"><Banknote size={20} /> Pagar sueldo</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Empleado *</label>
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={salEmployee} onChange={(e) => { setSalEmployee(e.target.value); setCalcResult(null) }} required>
                  <option value="">Seleccionar…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} {emp.role ? `(${emp.role})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Período desde *</label>
                  <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={salFrom} onChange={(e) => { setSalFrom(e.target.value); setCalcResult(null) }} required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Período hasta *</label>
                  <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={salTo} onChange={(e) => { setSalTo(e.target.value); setCalcResult(null) }} required />
                </div>
              </div>
              <button type="button" onClick={handleCalc} disabled={!salEmployee || !salFrom || !salTo || calcLoading} className="w-full border border-sumak-brown text-sumak-brown rounded-xl py-2.5 text-sm font-medium hover:bg-sumak-brown/5 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {calcLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                {calcLoading ? 'Calculando…' : 'Calcular horas y montos'}
              </button>
              {calcError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{calcError}</div>}
            </div>
            {calcResult && (
              <form onSubmit={handleSalarySubmit} className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Horas trabajadas</span><span className="font-medium">{formatHours(calcResult.hours_worked)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tarifa/hora</span><span className="font-medium">{formatARS(calcResult.hourly_rate)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Bruto</span><span className="font-medium">{formatARS(calcResult.gross_amount)}</span></div>
                  <div className="flex justify-between text-red-600"><span>(−) Adelantos en el período</span><span className="font-medium">{formatARS(calcResult.advances_total)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2"><span>Neto sugerido</span><span className="text-green-700">{formatARS(calcResult.net_amount)}</span></div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Monto a pagar (ARS) *</label>
                  <input type="number" min="0" step="0.01" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sumak-brown/30" value={salCustomAmount} onChange={(e) => { setSalCustomAmount(e.target.value); setSalCashAmount(''); setSalTransferAmount('') }} required />
                  <p className="text-xs text-gray-400 mt-1">Podés ajustar el monto si es necesario.</p>
                </div>
                {/* Payment method */}
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-2">Método de pago</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['cash', 'transfer', 'mixed'] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setSalPaymentMethod(pm)}
                        className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                          salPaymentMethod === pm
                            ? pm === 'cash' ? 'bg-green-600 text-white shadow-sm'
                              : pm === 'transfer' ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-purple-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {pm === 'cash' ? '💵 Efectivo' : pm === 'transfer' ? '📲 Transfer' : '💰 Mixto'}
                      </button>
                    ))}
                  </div>
                  {salPaymentMethod === 'mixed' && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Monto efectivo</p>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={salCashAmount}
                          onChange={(e) => setSalCashAmount(e.target.value)}
                          placeholder="$ 0"
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 tabular-nums"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Monto transferencia</p>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={salTransferAmount}
                          onChange={(e) => setSalTransferAmount(e.target.value)}
                          placeholder="$ 0"
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sumak-brown/30 tabular-nums"
                        />
                      </div>
                      {(() => {
                        const total = Number(salCustomAmount) || calcResult.net_amount
                        const ca = Number(salCashAmount) || 0
                        const ta = Number(salTransferAmount) || 0
                        if (total > 0 && Math.abs(ca + ta - total) < 1) return <p className="text-xs text-green-600 font-semibold">Suma correcta</p>
                        if (total > 0) return <p className="text-xs text-red-500 font-semibold">Debe sumar {formatARS(total)}</p>
                        return null
                      })()}
                    </div>
                  )}
                </div>
                {salPaymentMethod === 'cash' && <p className="text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">Se registrará como egreso en caja y se imprimirá el recibo de sueldo.</p>}
                {salPaymentMethod === 'transfer' && <p className="text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2">No toca la caja física. Solo se registra el pago.</p>}
                {salPaymentMethod === 'mixed' && <p className="text-xs text-purple-700 bg-purple-50 rounded-xl px-3 py-2">Solo el monto en efectivo se registrará como egreso en caja.</p>}
                {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{saveError}</div>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setModal('none'); resetSalForm() }} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 bg-sumak-brown text-white rounded-xl py-2.5 text-sm font-medium hover:bg-sumak-brown/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                    {saving ? 'Guardando…' : 'Pagar e imprimir recibo'}
                  </button>
                </div>
              </form>
            )}
            {!calcResult && (
              <button type="button" onClick={() => { setModal('none'); resetSalForm() }} className="w-full border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">Cancelar</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel({ onBackToPin }: { onBackToPin: () => void }) {
  const [tab, setTab] = useState<Tab>('fichaje')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true)
    const res = await fetch('/api/empleados')
    if (res.ok) setEmployees(await res.json())
    setLoadingEmployees(false)
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    onBackToPin()
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
            <div className="w-9 h-9 bg-sumak-gold rounded-xl flex items-center justify-center font-serif font-bold text-sumak-brown text-base flex-shrink-0">S</div>
            <div>
              <h1 className="font-serif font-bold text-lg leading-tight">Control Horario</h1>
              <p className="text-xs text-amber-300">Sumak Restaurante — Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToPin}
              className="flex items-center gap-1.5 text-amber-200 hover:text-white text-sm transition-colors border border-amber-400/30 px-3 py-1.5 rounded-lg hover:bg-white/10"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Modo PIN</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-amber-300 hover:text-white text-sm transition-colors"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
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
        {tab === 'empleados' && <TabEmpleados employees={employees} loading={loadingEmployees} onRefresh={fetchEmployees} />}
        {tab === 'historial' && <TabHistorial employees={employees} />}
        {tab === 'pagos' && <TabPagos employees={employees} />}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type AppMode = 'pin' | 'admin_auth' | 'admin'

export default function EmpleadosPage() {
  const [mode, setMode] = useState<AppMode>('pin')
  const [checkingAuth, setCheckingAuth] = useState(true)

  // On mount: check if already logged in as admin → go straight to admin panel
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setMode('admin')
      setCheckingAuth(false)
    }
    check()
  }, [])

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-white/30" />
      </div>
    )
  }

  if (mode === 'pin') {
    return (
      <PinScreen
        onExitPin={() => setMode('admin_auth')}
      />
    )
  }

  if (mode === 'admin_auth') {
    return (
      <AdminAuthGate
        onAuth={() => setMode('admin')}
        onCancel={() => setMode('pin')}
      />
    )
  }

  return (
    <AdminPanel
      onBackToPin={async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        setMode('pin')
      }}
    />
  )
}
