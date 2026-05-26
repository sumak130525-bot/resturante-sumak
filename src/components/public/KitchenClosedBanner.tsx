'use client'

import { useEffect, useState } from 'react'
import type { KitchenStatusResponse } from '@/lib/types'

/** Banner ámbar visible cuando la cocina está temporalmente cerrada */
export function KitchenClosedBanner() {
  const [status, setStatus] = useState<KitchenStatusResponse | null>(null)

  useEffect(() => {
    fetch('/api/admin/kitchen-status')
      .then((r) => r.ok ? r.json() : null)
      .then((data: KitchenStatusResponse | null) => {
        setStatus(data)
      })
      .catch(() => {})
  }, [])

  if (!status?.effective_closed) return null

  return (
    <div className="bg-amber-500 text-white py-3 px-4">
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-semibold flex-wrap text-center">
        <span className="text-lg">🍳</span>
        <span>
          La cocina está temporalmente cerrada
          {status.reason ? ` — ${status.reason}` : ''}
        </span>
      </div>
    </div>
  )
}
