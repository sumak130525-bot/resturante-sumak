export type Category = {
  id: string
  name: string
  slug: string
  order_pos: number
  name_en?: string | null
  name_qu?: string | null
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
  available_qty: number | null
  active: boolean
  display_order?: number | null
  subcategory?: string | null
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
  channel?: 'web' | 'whatsapp' | 'pos'
  payment_method?: string | null
  table_number?: string | null
  mesa?: string | null
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
  available_qty: number | null
  active: boolean
  display_order?: number | null
  subcategory?: string | null
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
  payment_method: string | null
  table_number: string | null
  mesa: string | null
}

type OrderItemRow = {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  subtotal: number
}

export type ClosureDay = {
  id: string
  start_date: string       // 'YYYY-MM-DD'
  end_date: string | null
  reason: string
  created_at: string
}

export type KitchenStatus = {
  id: string
  is_closed: boolean
  reason: string | null
  schedule_start: string | null  // ISO timestamptz
  schedule_end: string | null
  manual: boolean
  created_at: string
}

// Tipo enriquecido devuelto por la API (incluye estado efectivo calculado)
export type KitchenStatusResponse = KitchenStatus & {
  effective_closed: boolean
}

type ClosureDayRow = {
  id: string
  start_date: string
  end_date: string | null
  reason: string
  created_at: string
}

type KitchenStatusRow = {
  id: string
  is_closed: boolean
  reason: string | null
  schedule_start: string | null
  schedule_end: string | null
  manual: boolean
  created_at: string
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
      closure_days: {
        Row: ClosureDayRow
        Insert: Omit<ClosureDayRow, 'id' | 'created_at'>
        Update: Partial<Omit<ClosureDayRow, 'id' | 'created_at'>>
      }
      kitchen_status: {
        Row: KitchenStatusRow
        Insert: Omit<KitchenStatusRow, 'id' | 'created_at'>
        Update: Partial<Omit<KitchenStatusRow, 'id' | 'created_at'>>
      }
    }
  }
}
