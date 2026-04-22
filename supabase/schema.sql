-- ================================================
-- SUMAK RESTAURANTE - Schema de base de datos
-- Ejecutar en el SQL Editor de Supabase
-- ================================================

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla de categorías
CREATE TABLE IF NOT EXISTS public.categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  slug      text UNIQUE NOT NULL,
  order_pos int  NOT NULL DEFAULT 0
);

-- 3. Tabla de platos del menú
CREATE TABLE IF NOT EXISTS public.menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name         text NOT NULL,
  description  text,
  price        int  NOT NULL CHECK (price >= 0),
  image_url    text,
  available    int  NOT NULL DEFAULT 0 CHECK (available >= 0),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- 4. Tabla de pedidos
CREATE TABLE IF NOT EXISTS public.orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  text NOT NULL,
  customer_phone text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','ready','delivered','cancelled')),
  total          int  NOT NULL CHECK (total >= 0),
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- 5. Items de cada pedido
CREATE TABLE IF NOT EXISTS public.order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id  uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  quantity      int  NOT NULL CHECK (quantity > 0),
  unit_price    int  NOT NULL CHECK (unit_price >= 0),
  subtotal      int  GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ================================================
-- GRANTS DE TABLA (necesarios para el rol anon)
-- Ejecutar si POST /api/orders da error de RLS
-- ================================================
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE public.categories  TO anon;
GRANT SELECT ON TABLE public.menu_items  TO anon;
GRANT INSERT ON TABLE public.orders      TO anon;
GRANT INSERT ON TABLE public.order_items TO anon;

GRANT ALL ON TABLE public.categories  TO authenticated;
GRANT ALL ON TABLE public.menu_items  TO authenticated;
GRANT ALL ON TABLE public.orders      TO authenticated;
GRANT ALL ON TABLE public.order_items TO authenticated;

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================

ALTER TABLE public.categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Categorías: lectura pública, escritura solo autenticados
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (true);

CREATE POLICY "categories_admin_write" ON public.categories
  FOR ALL USING (auth.role() = 'authenticated');

-- Menú: lectura pública (solo activos), escritura solo admin
CREATE POLICY "menu_items_public_read" ON public.menu_items
  FOR SELECT USING (active = true);

CREATE POLICY "menu_items_admin_all" ON public.menu_items
  FOR ALL USING (auth.role() = 'authenticated');

-- Pedidos: inserción pública, lectura/edición solo admin
CREATE POLICY "orders_public_insert" ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "orders_admin_select" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "orders_admin_update" ON public.orders
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Order items: inserción pública, lectura solo admin
CREATE POLICY "order_items_public_insert" ON public.order_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "order_items_admin_select" ON public.order_items
  FOR SELECT USING (auth.role() = 'authenticated');

-- ================================================
-- HABILITAR REALTIME
-- ================================================
-- Ejecutar esto en el dashboard de Supabase > Database > Replication
-- O directamente:
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;

-- ================================================
-- DATOS INICIALES (SEED)
-- ================================================

-- Insertar categorías
INSERT INTO public.categories (name, slug, order_pos) VALUES
  ('Sopas',             'sopas',              1),
  ('Platos Principales','platos-principales', 2),
  ('Empanadas',         'empanadas',          3),
  ('Acompañamientos',   'acompanamientos',    4),
  ('Bebidas',           'bebidas',            5)
ON CONFLICT (slug) DO NOTHING;

-- Insertar platos (usando subconsultas para obtener category_id)
INSERT INTO public.menu_items (name, description, price, available, category_id) VALUES
  -- Sopas
  ('Sopa de Maní',       'Deliciosa sopa boliviana a base de maní tostado con verduras y carne', 4000, 20,
   (SELECT id FROM public.categories WHERE slug = 'sopas')),
  ('Chairo',             'Sopa andina tradicional con chuño, carne seca y verduras de temporada',  4500, 20,
   (SELECT id FROM public.categories WHERE slug = 'sopas')),
  ('Sopa de Quinua',     'Reconfortante sopa con quinua, vegetales y especias andinas',            4000, 20,
   (SELECT id FROM public.categories WHERE slug = 'sopas')),
  ('Lagua de Choclo',    'Crema espesa de maíz tierno con queso y hierbas frescas',                4000, 20,
   (SELECT id FROM public.categories WHERE slug = 'sopas')),

  -- Platos Principales
  ('Pique Macho',        'Carne y salchichas en cubos con papas fritas, tomate, cebolla y locoto',  18000, 15,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Silpancho',          'Milanesa de carne aplastada con arroz, papa y huevo frito',               12000, 15,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Chicharrón de Cerdo','Cerdo frito crujiente servido con mote y llajua picante',                 15000, 12,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Majadito',           'Arroz con charque y huevo, plato tradicional del oriente boliviano',      10000, 15,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Picante de Pollo',   'Pollo en salsa espesa de ají amarillo con papas y arroz',                12000, 15,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Fricasé',            'Cerdo en caldo picante de ají amarillo con chuño y mote',                 13000, 12,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Falso Conejo',       'Carne de res apanada en salsa de tomate con papas y arroz',               10000, 15,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Anticucho',          'Brochetas de corazón de res marinadas a la parrilla con papa y maní',      8000, 18,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Sajta de Pollo',     'Pollo en salsa de ají con chuño y tunta, plato festivo boliviano',        12000, 12,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),
  ('Thimpu de Cordero',  'Cordero cocido lentamente con verduras, chuño y salsa de maní',           18000, 10,
   (SELECT id FROM public.categories WHERE slug = 'platos-principales')),

  -- Empanadas
  ('Salteña',            'Empanada jugosa rellena de carne, papa, huevo y aceitunas',                1500, 30,
   (SELECT id FROM public.categories WHERE slug = 'empanadas')),
  ('Tucumana',           'Empanada frita grande rellena de pollo o carne con papas',                 3000, 25,
   (SELECT id FROM public.categories WHERE slug = 'empanadas')),

  -- Acompañamientos
  ('Llajua',             'Salsa picante boliviana de tomate y locoto, acompañamiento infaltable',    4000, 50,
   (SELECT id FROM public.categories WHERE slug = 'acompanamientos')),
  ('Papa Rellena',       'Papa entera rellena con carne molida, huevo y especias, frita',            5000, 20,
   (SELECT id FROM public.categories WHERE slug = 'acompanamientos')),
  ('Plato Paceño',       'Choclo, queso frito, haba cocida y papa, plato vegetariano andino',        6000, 15,
   (SELECT id FROM public.categories WHERE slug = 'acompanamientos')),

  -- Bebidas
  ('Api con Pastel',     'Bebida caliente de maíz morado y amarillo acompañada de pastel frito',     3500, 25,
   (SELECT id FROM public.categories WHERE slug = 'bebidas'))
;
