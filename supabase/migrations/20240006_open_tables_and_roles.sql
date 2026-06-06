-- Migration: Open tables system & POS roles
-- Date: 2026-06-06

-- 1. Tabla orders — columnas nuevas
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS opened_by_employee_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_by_employee_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pre_bill_printed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_open_tables ON orders(table_number, is_open) WHERE is_open = true AND channel = 'pos';

-- 2. Tabla order_items — columnas nuevas
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sent_to_kitchen_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT now();

-- 3. Settings — insertar configuracion
INSERT INTO settings (key, value) VALUES ('open_tables_enabled', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('tip_suggestion_enabled', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('tip_suggestion_percentages', '10,15,20') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cocina_pin_required', 'false') ON CONFLICT (key) DO NOTHING;

-- 4. Tabla employees — columna role
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'mozo';
