'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MenuItem, Category } from '@/lib/types'

export function useMenuRealtime() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMenu = useCallback(async () => {
    try {
      const supabase = createClient()

      const [itemsRes, catsRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('*, categories(*)')
          .eq('active', true)
          .gt('display_order', 0)
          .order('display_order', { ascending: true, nullsFirst: false })
          .order('name'),
        supabase
          .from('categories')
          .select('*')
          .order('order_pos'),
      ])

      if (itemsRes.data) {
        // Items with display_order null or 0 are treated as unordered — sort them after positioned items, then by name
        const sorted = (itemsRes.data as MenuItem[]).slice().sort((a, b) => {
          const aOrder = a.display_order ?? 0
          const bOrder = b.display_order ?? 0
          const aUnset = aOrder === 0
          const bUnset = bOrder === 0
          if (aUnset && bUnset) return a.name.localeCompare(b.name)
          if (aUnset) return 1
          if (bUnset) return -1
          return aOrder - bOrder
        })
        setMenuItems(sorted)
      }
      if (catsRes.data) setCategories(catsRes.data)
    } catch (err) {
      console.error('[useMenuRealtime] fetchMenu error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMenu()

    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

    try {
      const supabase = createClient()

      // Suscripción a cambios en menu_items (especialmente available)
      channel = supabase
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
        .subscribe((status, err) => {
          if (err) {
            console.error('[useMenuRealtime] realtime subscribe error:', err)
          }
        })
    } catch (err) {
      console.error('[useMenuRealtime] realtime setup error:', err)
    }

    return () => {
      if (channel) {
        try {
          const supabase = createClient()
          supabase.removeChannel(channel)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [fetchMenu])

  return { menuItems, categories, loading, refetch: fetchMenu }
}
