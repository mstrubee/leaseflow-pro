-- Inventario de Activos Fijos
-- Catálogo de activos (stock) + asignación de ítems a contratos.
-- Cada contrato puede tener uno o más ítems del inventario asociados; la
-- cantidad asignada descuenta del stock disponible del activo.

create table if not exists public.fixed_assets (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  category           text,
  sku                text,
  unit               text not null default 'unidad',
  total_quantity     integer not null default 1 check (total_quantity >= 0),
  acquisition_value  numeric,
  acquisition_date   date,
  status             text not null default 'activo' check (status in ('activo', 'mantencion', 'baja')),
  location           text,
  photo_url          text,
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_fixed_assets_category on public.fixed_assets (category);
create index if not exists idx_fixed_assets_status   on public.fixed_assets (status);

create table if not exists public.contract_fixed_assets (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid not null references public.contracts(id) on delete cascade,
  fixed_asset_id uuid not null references public.fixed_assets(id) on delete restrict,
  quantity       integer not null default 1 check (quantity > 0),
  assigned_by    uuid references auth.users(id) on delete set null,
  assigned_at    timestamptz not null default now(),
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_contract_fixed_assets_contract on public.contract_fixed_assets (contract_id);
create index if not exists idx_contract_fixed_assets_asset    on public.contract_fixed_assets (fixed_asset_id);

-- Mantiene updated_at al día en fixed_assets
create or replace function public.set_fixed_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fixed_assets_updated_at on public.fixed_assets;
create trigger trg_fixed_assets_updated_at
  before update on public.fixed_assets
  for each row execute function public.set_fixed_assets_updated_at();

-- Impide asignar más unidades de las que hay disponibles en stock
create or replace function public.check_fixed_asset_stock()
returns trigger
language plpgsql
as $$
declare
  total       integer;
  already_assigned integer;
begin
  select total_quantity into total
  from public.fixed_assets
  where id = new.fixed_asset_id;

  select coalesce(sum(quantity), 0) into already_assigned
  from public.contract_fixed_assets
  where fixed_asset_id = new.fixed_asset_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if already_assigned + new.quantity > total then
    raise exception 'Stock insuficiente: solo quedan % unidad(es) disponibles', total - already_assigned;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_fixed_asset_stock on public.contract_fixed_assets;
create trigger trg_check_fixed_asset_stock
  before insert or update on public.contract_fixed_assets
  for each row execute function public.check_fixed_asset_stock();

-- Vista con el stock disponible calculado por activo
create or replace view public.fixed_assets_with_availability as
select
  fa.*,
  fa.total_quantity - coalesce(assigned.qty, 0) as available_quantity
from public.fixed_assets fa
left join (
  select fixed_asset_id, sum(quantity) as qty
  from public.contract_fixed_assets
  group by fixed_asset_id
) assigned on assigned.fixed_asset_id = fa.id;

grant select, insert, update, delete on public.fixed_assets to authenticated;
grant all on public.fixed_assets to service_role;
grant select, insert, update, delete on public.contract_fixed_assets to authenticated;
grant all on public.contract_fixed_assets to service_role;
grant select on public.fixed_assets_with_availability to authenticated;
grant select on public.fixed_assets_with_availability to service_role;

alter table public.fixed_assets enable row level security;
alter table public.contract_fixed_assets enable row level security;

drop policy if exists "fixed_assets_select" on public.fixed_assets;
create policy "fixed_assets_select" on public.fixed_assets
  for select to authenticated using (true);

drop policy if exists "fixed_assets_write" on public.fixed_assets;
create policy "fixed_assets_write" on public.fixed_assets
  for all to authenticated using (true) with check (true);

drop policy if exists "contract_fixed_assets_select" on public.contract_fixed_assets;
create policy "contract_fixed_assets_select" on public.contract_fixed_assets
  for select to authenticated using (true);

drop policy if exists "contract_fixed_assets_write" on public.contract_fixed_assets;
create policy "contract_fixed_assets_write" on public.contract_fixed_assets
  for all to authenticated using (true) with check (true);
