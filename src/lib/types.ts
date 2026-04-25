export type Category = {
  id: string
  name: string
  slug: string
  order_pos: number
}

export type MenuItem = {
  id: string
  category_id: string
  name: string
  description: string | null
  name_en: string | null
  name_qu: string | null
  description_es: string | null
  description_en: string | null
  description_qu: string | null
  price: number
  image_url: string | null
  available: number
  active: boolean
  display_order?: number | null
  created_at: string
  categories?: Category
}

export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'delivered' | 'cancelled'

export type Order = {
  id: string
  customer_name: string
  customer_phone: string | null
  status: OrderStatus
  total: number
  notes: string | null
  created_at: string
  channel?: 'web' | 'whatsapp'
  order_items?: OrderItem[]
}

export type OrderItem = {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  subtotal: number
  menu_items?: MenuItem
}

export type CartItem = {
  menu_item: MenuItem
  quantity: number
}

// Tipos de filas puras (sin joins relacionales) para Supabase Database
type CategoryRow = {
  id: string
  name: string
  slug: string
  order_pos: number
}

type MenuItemRow = {
  id: string
  category_id: string
  name: string
  description: string | null
  name_en: string | null
  name_qu: string | null
  description_es: string | null
  description_en: string | null
  description_qu: string | null
  price: number
  image_url: string | null
  available: number
  active: boolean
  display_order?: number | null
  created_at: string
}

type OrderRow = {
  id: string
  customer_name: string
  customer_phone: string | null
  status: string
  total: number
  notes: string | null
  created_at: string
  channel: string | null
}

type OrderItemRow = {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  subtotal: number
}

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: CategoryRow
        Insert: Omit<CategoryRow, 'id'>
        Update: Partial<Omit<CategoryRow, 'id'>>
      }
      menu_items: {
        Row: MenuItemRow
        Insert: Omit<MenuItemRow, 'id' | 'created_at'>
        Update: Partial<Omit<MenuItemRow, 'id' | 'created_at'>>
      }
      orders: {
        Row: OrderRow
        Insert: Omit<OrderRow, 'id' | 'created_at'>
        Update: Partial<Omit<OrderRow, 'id' | 'created_at'>>
      }
      order_items: {
        Row: OrderItemRow
        Insert: Omit<OrderItemRow, 'id' | 'subtotal'>
        Update: Partial<Omit<OrderItemRow, 'id' | 'subtotal'>>
      }
    }
  }
}
