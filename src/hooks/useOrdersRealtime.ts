'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Order } from '@/lib/types'

export function useOrdersRealtime() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [newOrderCount, setNewOrderCount] = useState(0)

  const fetchOrders = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name))')
      .order('created_at', { ascending: false })

    if (data) setOrders(data as Order[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()

    const supabase = createClient()

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [payload.new as Order, ...prev])
            setNewOrderCount((c) => c + 1)
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === payload.new.id ? { ...o, ...payload.new } : o
              )
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchOrders])

  return { orders, loading, newOrderCount, resetNewCount: () => setNewOrderCount(0), refetch: fetchOrders }
}
