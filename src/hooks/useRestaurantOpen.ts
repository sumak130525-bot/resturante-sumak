'use client'

import { useEffect, useState, useCallback } from 'react'
import { isRestaurantOpen, type ClosureDayRecord } from '@/lib/businessHours'
import type { KitchenStatusResponse } from '@/lib/types'

export interface RestaurantOpenState {
  isOpen: boolean
  loading: boolean
  /** Re-check immediately (e.g. right before submitting an order) */
  refresh: () => Promise<boolean>
}

/**
 * Client-side hook that checks whether the restaurant is currently open.
 * Combines:
 *   1. Hardcoded weekly schedule (Mon–Sat 08:00–22:30)
 *   2. Special closure days from /api/admin/closure-days
 *   3. Kitchen override from /api/admin/kitchen-status
 */
export function useRestaurantOpen(): RestaurantOpenState {
  const [isOpen, setIsOpen] = useState(true)  // optimistic default
  const [loading, setLoading] = useState(true)

  const check = useCallback(async (): Promise<boolean> => {
    try {
      const [closureDays, kitchenStatus] = await Promise.all([
        fetch('/api/admin/closure-days')
          .then((r) => (r.ok ? (r.json() as Promise<ClosureDayRecord[]>) : []))
          .catch(() => [] as ClosureDayRecord[]),
        fetch('/api/admin/kitchen-status')
          .then((r) => (r.ok ? (r.json() as Promise<KitchenStatusResponse>) : null))
          .catch(() => null),
      ])

      const open = isRestaurantOpen({
        closureDays,
        kitchenEffectiveClosed: kitchenStatus?.effective_closed ?? false,
      })

      setIsOpen(open)
      return open
    } catch {
      return true  // fail-open on client (backend will still block)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    check().finally(() => setLoading(false))

    // Re-check every 2 minutes so the UI updates when the restaurant opens/closes
    const interval = setInterval(() => { check() }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [check])

  return { isOpen, loading, refresh: check }
}
