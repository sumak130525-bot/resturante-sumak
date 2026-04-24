-- Tabla temporal para guardar datos de pedido antes del pago con MercadoPago.
-- El webhook la consulta usando external_reference y luego crea el pedido real.

CREATE TABLE pending_orders (
  id          text        PRIMARY KEY,
  customer_name text      NOT NULL,
  customer_phone text,
  notes       text,
  mesa        text,
  channel     text        DEFAULT 'web',
  items       jsonb       NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

-- Política amplia: sólo el service role la usa (anon/auth nunca necesitan acceso directo)
CREATE POLICY service_all ON pending_orders
  FOR ALL
  USING (true)
  WITH CHECK (true);
