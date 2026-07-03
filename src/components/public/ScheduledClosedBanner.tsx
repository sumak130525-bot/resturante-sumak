'use client'

import { Clock } from 'lucide-react'
import { useRestaurantOpen } from '@/hooks/useRestaurantOpen'

/**
 * Banner displayed when the restaurant is closed by the hardcoded weekly schedule
 * (Mon–Sat 08:00–22:30, Domingo cerrado).
 *
 * This is intentionally separate from ClosureBanner (special closure days) and
 * KitchenClosedBanner (manual kitchen override).
 */
export function ScheduledClosedBanner() {
  const { isOpen, loading } = useRestaurantOpen()

  // Don't flash while loading; once loaded show only when closed
  if (loading || isOpen) return null

  return (
    <div className="bg-sumak-brown text-white py-3 px-4">
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm font-semibold flex-wrap text-center">
        <Clock size={16} className="text-sumak-gold shrink-0" />
        <span>
          Estamos cerrados.{' '}
          <span className="text-sumak-gold">Horario: Lunes a Sábado 8:00–22:30</span>
        </span>
      </div>
    </div>
  )
}
