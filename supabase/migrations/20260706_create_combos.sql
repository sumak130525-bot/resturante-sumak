-- Migración: tabla combos
-- Ejecutar en el SQL Editor de Supabase: https://supabase.com/dashboard/project/zdepdnezwscvkgnxolqk/sql/new

create table if not exists combos (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Almuerzo',
  price integer not null,
  slots jsonb not null,
  positions integer[] not null,
  image_urls text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table combos enable row level security;

create policy combos_select_anon on combos
  for select using (true);
