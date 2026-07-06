-- Migración: agrega columna name a order_items para guardar el nombre del item
-- (necesario para combo headers donde menu_item_id es NULL)
-- Ejecutar en el SQL Editor de Supabase: https://supabase.com/dashboard/project/zdepdnezwscvkgnxolqk/sql/new

alter table order_items add column if not exists name text;
