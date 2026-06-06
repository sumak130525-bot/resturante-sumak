'use client'

import { useState, useCallback } from 'react'
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type PinGateProps = {
  onAuth: (employee: { id: string; name: string; role: string }) => void
  title?: string
  subtitle?: string
  // Roles permitidos para acceder (si está vacío, cualquier rol puede entrar)
  allowedRoles?: string[]
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PinGate({ onAuth, title, subtitle, allowedRoles }: PinGateProps) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  const handleDigit = useCallback((digit: string) => {
    setError(null)
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + digit
      if (next.length === 4) {
        // Auto-submit cuando llega a 4 dígitos
        setTimeout(() => submitPin(next), 80)
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = useCallback(() => {
    setError(null)
    setPin((prev) => prev.slice(0, -1))
  }, [])

  const submitPin = useCallback(async (pinValue: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pos/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error ?? 'PIN incorrecto')
        setPin('')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        return
      }

      // Verificar roles permitidos
      if (allowedRoles && allowedRoles.length > 0) {
        const role = (data.employee?.role ?? '').toLowerCase()
        if (!allowedRoles.includes(role)) {
          setError('No tienes acceso con este rol.')
          setPin('')
          setShake(true)
          setTimeout(() => setShake(false), 500)
          return
        }
      }

      // Guardar sesión en sessionStorage para que usePosAuth la lea
      try {
        sessionStorage.setItem('pos_employee_session', JSON.stringify({
          employee: data.employee,
          permissions: data.permissions,
        }))
      } catch {}

      onAuth(data.employee)
    } catch {
      setError('Error de conexión')
      setPin('')
    } finally {
      setLoading(false)
    }
  }, [onAuth, allowedRoles])

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div
        className={cn(
          'flex flex-col items-center gap-6 w-full max-w-xs px-4',
          shake && 'animate-shake',
        )}
      >
        {/* Logo / título */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">{title ?? 'POS Sumak'}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
        </div>

        {/* Indicadores de PIN */}
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'w-4 h-4 rounded-full border-2 transition-all duration-150',
                pin.length > i
                  ? 'bg-amber-400 border-amber-400'
                  : 'bg-transparent border-gray-500',
              )}
            />
          ))}
        </div>

        {/* Mensaje de error */}
        {error && (
          <p className="text-red-400 text-sm font-medium text-center">{error}</p>
        )}

        {/* Teclado numérico */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {digits.map((d, idx) => {
            if (d === '') return <div key={idx} />
            if (d === 'del') {
              return (
                <button
                  key="del"
                  onClick={handleDelete}
                  disabled={loading || pin.length === 0}
                  className={cn(
                    'h-16 rounded-2xl flex items-center justify-center',
                    'bg-gray-800 text-gray-300 text-xl font-medium',
                    'active:scale-95 transition-transform',
                    'disabled:opacity-40',
                  )}
                  aria-label="Borrar"
                >
                  <Delete size={22} />
                </button>
              )
            }
            return (
              <button
                key={d}
                onClick={() => handleDigit(d)}
                disabled={loading || pin.length >= 4}
                className={cn(
                  'h-16 rounded-2xl text-2xl font-semibold',
                  'bg-gray-800 text-white',
                  'active:scale-95 transition-transform',
                  'disabled:opacity-40',
                  'hover:bg-gray-700',
                )}
              >
                {d}
              </button>
            )
          })}
        </div>

        {/* Spinner de carga */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Verificando...
          </div>
        )}
      </div>
    </div>
  )
}
