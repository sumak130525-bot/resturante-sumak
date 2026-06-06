'use client'

import { useState, useCallback, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PosPermissions = {
  canOpenTable: boolean
  canAddItems: boolean
  canSendKitchen: boolean
  canRequestBill: boolean
  canCharge: boolean
  canCloseTable: boolean
  canManageCash: boolean
  canAccessAdmin: boolean
  canSeeReports: boolean
}

export type PosEmployee = {
  id: string
  name: string
  role: string
}

export type PosSession = {
  employee: PosEmployee
  permissions: PosPermissions
}

// Permisos vacíos (no autenticado)
export const EMPTY_PERMISSIONS: PosPermissions = {
  canOpenTable: false,
  canAddItems: false,
  canSendKitchen: false,
  canRequestBill: false,
  canCharge: false,
  canCloseTable: false,
  canManageCash: false,
  canAccessAdmin: false,
  canSeeReports: false,
}

// ─── Session storage key ──────────────────────────────────────────────────────

const SESSION_KEY = 'pos_employee_session'

function saveSession(session: PosSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {}
}

function loadSession(): PosSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PosSession
  } catch {
    return null
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePosAuth() {
  const [session, setSession] = useState<PosSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restaurar sesión desde sessionStorage al montar
  useEffect(() => {
    const saved = loadSession()
    if (saved) setSession(saved)
  }, [])

  const login = useCallback(async (pin: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pos/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'PIN incorrecto')
        return false
      }
      const newSession: PosSession = {
        employee: data.employee,
        permissions: data.permissions,
      }
      setSession(newSession)
      saveSession(newSession)
      return true
    } catch {
      setError('Error de conexión')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setSession(null)
    clearSession()
    setError(null)
  }, [])

  return {
    session,
    employee: session?.employee ?? null,
    permissions: session?.permissions ?? EMPTY_PERMISSIONS,
    isAuthenticated: session !== null,
    loading,
    error,
    login,
    logout,
  }
}
