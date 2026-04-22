import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

export function getAvailabilityColor(available: number): string {
  if (available === 0) return 'bg-gray-400 text-white'
  if (available <= 3) return 'bg-red-500 text-white'
  if (available <= 8) return 'bg-yellow-500 text-white'
  return 'bg-green-500 text-white'
}

export function getAvailabilityLabel(available: number): string {
  if (available === 0) return 'Agotado'
  if (available === 1) return '1 disponible'
  return `${available} disponibles`
}
