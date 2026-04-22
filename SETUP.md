# Sumak Restaurante Boliviano — Guía de Setup

## Requisitos previos
- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Vercel](https://vercel.com) para deploy

---

## 1. Instalar Node.js

Descarga e instala desde: https://nodejs.org/en/download

Verifica: `node --version` y `npm --version`

---

## 2. Instalar dependencias del proyecto

```bash
cd C:\Users\titos\Projects\restaurante
npm install
```

---

## 3. Configurar Supabase

1. Ve a [supabase.com](https://supabase.com) → Crear nuevo proyecto (ej: `sumak-restaurante`)
2. Anota la **URL** y la **anon key** del proyecto (Settings > API)
3. Ve a **SQL Editor** → pega y ejecuta todo el contenido de `supabase/schema.sql`
4. Esto crea las tablas, activa RLS, Realtime y carga los 20 platos iniciales

### Crear usuario administrador
En Supabase > Authentication > Users > "Add User":
- Email: `admin@sumak.com` (o el que prefieras)
- Password: (elige una contraseña segura)

---

## 4. Variables de entorno

Copia `.env.local.example` a `.env.local` y completa con tus valores:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tuproyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...tu-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...tu-service-role-key...
```

La `SUPABASE_SERVICE_ROLE_KEY` está en Supabase > Settings > API > `service_role`.

---

## 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abre: http://localhost:3000

- **Menú público:** http://localhost:3000
- **Panel admin:** http://localhost:3000/admin/login

---

## 6. Deploy en Vercel

1. Sube el proyecto a GitHub (o usa Vercel CLI)
2. En Vercel: Import Project → selecciona el repositorio
3. En "Environment Variables" agrega las 3 variables del paso 4
4. Deploy!

---

## Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx              # Página pública del menú
│   ├── admin/
│   │   ├── login/page.tsx    # Login admin
│   │   ├── page.tsx          # Dashboard
│   │   ├── menu/page.tsx     # Gestión de menú
│   │   └── orders/page.tsx   # Gestión de pedidos
│   └── api/
│       ├── menu/             # GET menú público
│       ├── orders/           # POST crear pedido
│       └── admin/
│           ├── menu/         # CRUD menú (protegido)
│           └── orders/       # GET/PUT pedidos (protegido)
├── components/
│   ├── public/               # Componentes de la página pública
│   └── admin/                # Componentes del panel admin
├── hooks/
│   ├── useMenuRealtime.ts    # WebSocket para cantidades del menú
│   └── useOrdersRealtime.ts  # WebSocket para pedidos entrantes
└── lib/
    ├── supabase/             # Clientes Supabase (client/server)
    ├── types.ts              # Tipos TypeScript
    └── utils.ts              # Utilidades (formatPrice, cn, etc.)
```

---

## Agregar fotos a los platos

Opción A — URL directa:
- En el panel admin, edita un plato y pega la URL de la imagen

Opción B — Supabase Storage:
1. En Supabase > Storage > Create bucket `menu-images` (público)
2. Sube las fotos
3. Copia la URL pública y pégala en el campo de imagen del plato

---

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Servidor de producción |
| `npm run lint` | Revisar errores de linting |
