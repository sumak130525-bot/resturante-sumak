'use client'

import { useEffect, useState } from 'react'
import type { ClosureDay } from '@/lib/types'

const TZ = 'America/Argentina/Mendoza'

function getTodayInMendoza(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

function isDateInRange(today: string, start: string, end: string | null): boolean {
  if (end) {
    return today >= start && today <= end
  }
  return today === start
}

/** Banner rojo visible cuando hoy es un día de cierre especial */
export function ClosureBanner() {
  const [closure, setClosure] = useState<ClosureDay | null>(null)

  useEffect(() => {
    fetch('/api/admin/closure-days')
      .then((r) => r.ok ? r.json() : [])
      .then((days: ClosureDay[]) => {
        const today = getTodayInMendoza()
        const active = days.find((d) => isDateInRange(today, d.start_date, d.end_date))
        setClosure(active ?? null)
      })
      .catch(() => {})
  }, [])

  if (!closure) return null

  return (
    <div className="bg-red-600 text-white py-3 px-4">
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-semibold flex-wrap text-center">
        <span className="text-lg">🔒</span>
        <span>
          Hoy estamos cerrados
          {closure.reason ? ` — ${closure.reason}` : ''}
        </span>
      </div>
    </div>
  )
}
