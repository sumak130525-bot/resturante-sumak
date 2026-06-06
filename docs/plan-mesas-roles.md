# Plan de implementación: Mesas abiertas con roles en POS
## Restaurante Sumak — v1.0

---

## Estado actual de implementación

> **Implementado en este sprint.** Este documento describe lo que se construyó y sirve como referencia futura.

---

## 1. Cambios de DB

### 1.1 Tabla `orders` — columnas nuevas (idempotentes)

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_open boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS opened_by_employee_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_by_employee_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pre_bill_printed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_open_tables
  ON orders(table_number, is_open)
  WHERE is_open = true AND channel = 'pos';
```

### 1.2 Tabla `order_items` — columnas nuevas

```sql
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sent_to_kitchen_at timestamptz;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now();
```

### 1.3 Tabla `settings` — seeds de configuración

```sql
INSERT INTO settings (key, value) VALUES ('tip_suggestion_enabled', 'false') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('tip_suggestion_percentages', '10,15,20') ON CONFLICT DO NOTHING;
INSERT INTO settings (key, value) VALUES ('cocina_pin_required', 'false') ON CONFLICT DO NOTHING;
```

### Semántica clave
- **Mesa abierta** = `is_open = true`, `channel = 'pos'`, `status = 'pending'`, `table_number` set
- **Item enviado a cocina** = `sent_to_kitchen_at IS NOT NULL`
- **Item pendiente de envío** = `sent_to_kitchen_at IS NULL`
- **Cerrar mesa** = `is_open = false`, `closed_at = now()`, `status = 'delivered'`

---

## 2. Endpoints API nuevos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/pos/auth` | Valida PIN, retorna empleado + permisos por rol |
| `GET`  | `/api/pos/orders/open-tables` | Lista mesas actualmente abiertas |
| `POST` | `/api/pos/orders/[id]/items` | Agrega items incrementales a mesa abierta |
| `POST` | `/api/pos/orders/[id]/send-kitchen` | Marca items pendientes como enviados, retorna datos para comanda |
| `GET`  | `/api/pos/orders/[id]/pre-bill` | Datos para ticket pre-cuenta + config de propina |
| `POST` | `/api/pos/orders/[id]/close` | Cobra y cierra mesa (actualiza pago, movimiento de caja, inventario) |

### Cambios en endpoints existentes
- `POST /api/pos/orders` — acepta `is_open: boolean` y `employee_id` opcionales. Cuando `is_open=true`, crea la orden como mesa abierta (no asigna `payment_method`, y los items se crean con `sent_to_kitchen_at = null`).

---

## 3. Tabla de permisos por rol

| Permiso | dueño | gerente | cajero | mozo | cocina |
|---------|-------|---------|--------|------|--------|
| `canOpenTable` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canAddItems` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canSendKitchen` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canRequestBill` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `canCharge` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `canCloseTable` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `canManageCash` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `canAccessAdmin` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `canSeeReports` | ✅ | ✅ | ❌ | ❌ | ❌ |

> Los roles heredados del sistema anterior (`admin` → `dueño` equivalent, `cocinero` → `cocina`) están mapeados en `ROLE_PERMISSIONS` en `/api/pos/auth/route.ts`.

---

## 4. Cambios de frontend

### 4.1 Nuevos archivos

| Archivo | Descripción |
|---------|-------------|
| `src/hooks/usePosAuth.ts` | Hook React: estado de sesión, login/logout, persistencia en `sessionStorage` |
| `src/components/pos/PinGate.tsx` | Pantalla de PIN numérico (4 dígitos, auto-submit, shake on error) |
| `src/components/pos/OpenTablesPanel.tsx` | Panel lateral con mesas abiertas (poll 30s) |
| `src/components/pos/KitchenPrint.ts` | Helpers `buildKitchenComanda()` y `buildPreBillText()` (ESC/POS markers) |

### 4.2 Cambios en archivos existentes

#### `src/app/pos/page.tsx`
- **PIN Gate**: Si no hay sesión activa, muestra `PinGate` antes de renderizar el POS
- **Estado de mesa abierta**: `activeOpenOrder` + `sendingKitchen` + `closingTable`
- **Botón "Mesas"** (🪑) en el header: abre `OpenTablesPanel`
- **Nombre del empleado** en header (click para cerrar sesión)
- **`TicketPanel`** — nuevas props: `canCharge`, `canSendKitchen`, `canRequestBill`, `onSendKitchen`, `onRequestBill`, `sendingKitchen`, `activeOpenOrder`
- **Botón "Enviar a cocina"** (naranja): visible solo para mozos; crea mesa o agrega items según contexto
- **Botón "Cobrar e Imprimir"**: visible solo para cajero/gerente/dueño
- **Botón "Pedir cuenta"**: visible solo para mozos con mesa activa
- **Banner de mesa abierta**: barra inferior permanente mientras hay mesa activa
- **`handleSendKitchen`**: flujo completo — crea orden si es nueva, agrega items si existe, marca como enviado, imprime comanda
- **`handleRequestBill`**: llama `/pre-bill`, imprime ticket con propinas sugeridas
- **`handleLoadOpenTable`**: carga mesa existente al TicketPanel
- **`handleClearActiveTable`**: limpia estado de mesa activa

#### `src/app/cocina/page.tsx`
- **PIN optativo**: lee `settings.cocina_pin_required`; si `true`, muestra `PinGate` con roles `['cocina', 'cocinero', 'dueno', 'gerente', 'admin']`
- **Botón "Pantalla menú"** (📺) en header: navega a `/menu-display`
- Todos los hooks se llaman antes de cualquier early return (reglas de React)

#### `src/app/admin/configuracion/page.tsx`
- **Sección "Propina sugerida"**: toggle on/off + campo de porcentajes (ej: `10,15,20`)
- **Sección "Pantalla cocina — Acceso"**: toggle PIN requerido/libre
- Ambas se guardan en `settings` table via `POST /api/admin/settings`

#### `tailwind.config.ts`
- Añade keyframes `shake` y `bounce-in` + utilities `animate-shake`, `animate-bounce-in`

---

## 5. Flujos de uso

### Flujo mozo (sin permiso de cobro)
```
1. Entra al POS → PinGate → ingresa PIN → rol mozo cargado
2. Selecciona items → ve botón naranja "Enviar a cocina" (no ve "Cobrar")
3. Ingresa número de mesa → toca "Enviar a cocina"
   → Crea orden con is_open=true en DB
   → Envía comanda al print-server
4. Toca botón 🪑 "Mesas" → ve mesa en lista
5. Toca mesa → carga items existentes al panel
6. Agrega más items → "Enviar a cocina" (segunda ronda)
7. Toca "Pedir cuenta" → imprime pre-cuenta con propinas sugeridas
```

### Flujo cajero (cierre de mesa)
```
1. Entra al POS → PinGate → PIN cajero
2. Toca 🪑 "Mesas" → selecciona mesa abierta
3. Ve resumen de lo consumido + botón "Cobrar e Imprimir" (verde)
4. Elige método de pago → toca "Cobrar e Imprimir"
   → POST /api/pos/orders/[id]/close
   → Orden: is_open=false, closed_at=now, status=delivered
   → Movimiento de caja registrado
   → Inventario consumido
   → Ticket final impreso
```

---

## 6. Decisiones de diseño tomadas

| Decisión | Elección | Alternativa descartada | Razón |
|----------|----------|----------------------|-------|
| Sesión POS | `sessionStorage` (no JWT) | Cookie httpOnly / JWT | Consistente con arquitectura actual; basta con seguridad a nivel componente |
| Permisos | Hardcoded en `/api/pos/auth` | Tabla `role_permissions` en DB | Menor complejidad; roles estables en gastronomía |
| Mesa abierta | Flag `is_open` en `orders` existente | Tabla `open_tabs` separada | Reutiliza estructura existente, sin migración compleja |
| Envío incremental | Columna `sent_to_kitchen_at` en `order_items` | Tabla `kitchen_sends` separada | Más simple; permite filtrar por ronda |
| PIN cocina | Setting en `settings` table | Middleware Next.js | Consistente con patrón existente del proyecto |

---

## 7. Riesgos y pendientes

### Riesgos activos
1. **Migración DB**: Los `ALTER TABLE` idempotentes se ejecutan en el primer `POST /api/pos/orders`. Si no se llama a ese endpoint, las columnas nuevas no existen. Solución: ejecutar el SQL manualmente en Supabase o llamar al endpoint una vez.
2. **Sesión POS perdida al cerrar tab**: El `sessionStorage` se borra al cerrar. El empleado debe re-autenticarse con PIN. Es comportamiento esperado (seguro).
3. **Cobro de mesa abierta sin enviar últimos items**: Si el cajero cobra pero hay items sin enviar a cocina (`sent_to_kitchen_at = null`), esos items quedan sin comanda. Recomendación: agregar warning en el UI antes del cobro.

### Pendientes para próxima iteración
- [ ] Botón "Cobrar mesa" en el panel de Mesas Abiertas (para que el cajero pueda cerrar directamente desde allí sin cargar el ticket)
- [ ] Historial de rondas enviadas dentro del panel de mesa
- [ ] Validación de "hay items sin enviar" antes del cobro
- [ ] Pantalla admin de empleados: agregar dropdown de roles estandarizados (dueño/gerente/cajero/mozo/cocina) en lugar de campo libre
- [ ] Tests automatizados para `/api/pos/auth` y `/api/pos/orders/[id]/send-kitchen`

---

## 8. Archivos modificados/creados en este sprint

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/app/api/pos/auth/route.ts` | Nuevo | PIN validation + role permissions |
| `src/app/api/pos/orders/open-tables/route.ts` | Nuevo | Lista mesas abiertas |
| `src/app/api/pos/orders/[id]/items/route.ts` | Nuevo | Items incrementales |
| `src/app/api/pos/orders/[id]/send-kitchen/route.ts` | Nuevo | Envío a cocina |
| `src/app/api/pos/orders/[id]/pre-bill/route.ts` | Nuevo | Pre-cuenta |
| `src/app/api/pos/orders/[id]/close/route.ts` | Nuevo | Cierre y cobro |
| `src/app/api/pos/orders/route.ts` | Modificado | +is_open, +employee_id, +sent_to_kitchen_at en items |
| `src/hooks/usePosAuth.ts` | Nuevo | Hook de autenticación POS |
| `src/components/pos/PinGate.tsx` | Nuevo | Pantalla PIN |
| `src/components/pos/OpenTablesPanel.tsx` | Nuevo | Panel mesas abiertas |
| `src/components/pos/KitchenPrint.ts` | Nuevo | Helpers de impresión |
| `src/app/pos/page.tsx` | Modificado | PIN gate, mesa abierta, roles, botones por rol |
| `src/app/cocina/page.tsx` | Modificado | PIN optativo, botón menu-display |
| `src/app/admin/configuracion/page.tsx` | Modificado | Config propina + PIN cocina |
| `tailwind.config.ts` | Modificado | +animate-shake, +animate-bounce-in |
| `docs/plan-mesas-roles.md` | Nuevo | Este documento |
