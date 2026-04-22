'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MenuItem, Category } from '@/lib/types'

export function useMenuRealtime() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMenu = useCallback(async () => {
    const supabase = createClient()

    const [itemsRes, catsRes] = await Promise.all([
      supabase
        .from('menu_items')
        .select('*, categories(*)')
        .eq('active', true)
        .order('name'),
      supabase
        .from('categories')
        .select('*')
        .order('order_pos'),
    ])

    if (itemsRes.data) setMenuItems(itemsRes.data as MenuItem[])
    if (catsRes.data) setCategories(catsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMenu()

    const supabase = createClient()

    // Suscripción a cambios en menu_items (especialmente available)
    const channel = supabase
      .channel('menu-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setMenuItems((prev) =>
              prev.map((item) =>
                item.id === payload.new.id
                  ? { ...item, ...payload.new }
                  : item
              )
            )
          } else if (payload.eventType === 'INSERT') {
            setMenuItems((prev) => [...prev, payload.new as MenuItem])
          } else if (payload.eventType === 'DELETE') {
            setMenuItems((prev) =>
              prev.filter((item) => item.id !== payload.old.id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchMenu])

  return { menuItems, categories, loading, refetch: fetchMenu }
}
