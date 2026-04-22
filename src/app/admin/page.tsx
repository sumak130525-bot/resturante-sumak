'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient'
import { formatPrice } from '@/lib/utils'
import { ShoppingBag, ChefHat, TrendingUp, Clock } from 'lucide-react'

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
    activeItems: 0,
  })

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createClient()
      const [ordersRes, menuRes] = await Promise.all([
        supabase.from('orders').select('status, total') as unknown as Promise<{ data: { status: string; total: number }[] | null; error: unknown }>,
        supabase.from('menu_items').select('id').eq('active', true),
      ])

      const orders = ordersRes.data ?? []
      setStats({
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => o.status === 'pending').length,
        totalRevenue: orders
          .filter((o) => o.status !== 'cancelled')
          .reduce((s, o) => s + o.total, 0),
        activeItems: menuRes.data?.length ?? 0,
      })
    }

    fetchStats()
  }, [])

  const STAT_CARDS = [
    {
      label: 'Pedidos pendientes',
      value: stats.pendingOrders,
      icon: Clock,
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      iconColor: 'text-yellow-500',
    },
    {
      label: 'Total de pedidos',
      value: stats.totalOrders,
      icon: ShoppingBag,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Ingresos totales',
      value: formatPrice(stats.totalRevenue),
      icon: TrendingUp,
      color: 'bg-green-50 text-green-700 border-green-200',
      iconColor: 'text-green-500',
    },
    {
      label: 'Platos activos',
      value: stats.activeItems,
      icon: ChefHat,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      iconColor: 'text-amber-500',
    },
  ]

  return (
    <AdminLayoutClient active="dashboard">
      <div>
        <h1 className="font-serif text-3xl font-bold text-sumak-brown mb-8">
          Dashboard
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {STAT_CARDS.map(({ label, value, icon: Icon, color, iconColor }) => (
            <div
              key={label}
              className={`rounded-2xl border p-6 flex items-center gap-4 ${color}`}
            >
              <div className={`p-3 bg-white rounded-xl ${iconColor}`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-sm opacity-70">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <a
            href="/admin/orders"
            className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-3 mb-3">
              <ShoppingBag className="text-sumak-red" size={24} />
              <h2 className="font-bold text-sumak-brown text-lg">Gestionar Pedidos</h2>
            </div>
            <p className="text-gray-500 text-sm">
              Ver pedidos entrantes, actualizar estados y gestionar entregas en tiempo real.
            </p>
          </a>

          <a
            href="/admin/menu"
            className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-3 mb-3">
              <ChefHat className="text-sumak-red" size={24} />
              <h2 className="font-bold text-sumak-brown text-lg">Gestionar Menú</h2>
            </div>
            <p className="text-gray-500 text-sm">
              Agregar, editar o eliminar platos. Actualizar cantidades disponibles en tiempo real.
            </p>
          </a>
        </div>
      </div>
    </AdminLayoutClient>
  )
}
