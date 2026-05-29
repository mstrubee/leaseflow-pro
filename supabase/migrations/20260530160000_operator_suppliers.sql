-- Vincula operadores de terreno a uno o más proveedores.
-- Un operador solo verá las rutas de los proveedores a los que está ligado.
create table if not exists public.operator_suppliers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, supplier_id)
);

create index if not exists idx_operator_suppliers_user     on public.operator_suppliers (user_id);
create index if not exists idx_operator_suppliers_supplier on public.operator_suppliers (supplier_id);

grant select, insert, update, delete on public.operator_suppliers to authenticated;
grant all on public.operator_suppliers to service_role;

alter table public.operator_suppliers enable row level security;

drop policy if exists "operator_suppliers_select" on public.operator_suppliers;
create policy "operator_suppliers_select" on public.operator_suppliers
  for select to authenticated using (true);

drop policy if exists "operator_suppliers_write" on public.operator_suppliers;
create policy "operator_suppliers_write" on public.operator_suppliers
  for all to authenticated using (true) with check (true);
