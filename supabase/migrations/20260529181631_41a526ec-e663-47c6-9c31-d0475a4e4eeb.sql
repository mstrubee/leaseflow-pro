-- ── Tablas base de rutas ─────────────────────────────────────────────────────
create table if not exists public.maintenance_locations (
  id            uuid primary key default gen_random_uuid(),
  poi_id        uuid unique not null,
  name          text not null,
  folder        text not null,
  local_code    text,
  local_name    text,
  gerente_zonal text,
  zona          text,
  centro_sap    text,
  lat           numeric(12,10) not null,
  lng           numeric(12,10) not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.maintenance_routes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  scheduled_date date,
  status         text not null default 'draft'
                   check (status in ('draft','assigned','in_progress','completed')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.maintenance_route_stops (
  id                     uuid primary key default gen_random_uuid(),
  route_id               uuid not null references public.maintenance_routes(id) on delete cascade,
  location_id            uuid not null references public.maintenance_locations(id) on delete restrict,
  stop_order             integer not null,
  estimated_travel_min   integer,
  status                 text not null default 'pending'
                           check (status in ('pending','completed','postponed')),
  completed_at           timestamptz,
  completed_by           uuid references auth.users(id) on delete set null,
  postponed_to           date,
  postpone_note          text,
  created_at             timestamptz not null default now(),
  unique (route_id, stop_order)
);

create table if not exists public.maintenance_route_forms (
  id                  uuid primary key default gen_random_uuid(),
  route_stop_id       uuid not null references public.maintenance_route_stops(id) on delete cascade,
  maintenance_form_id uuid not null references public.maintenance_forms(id) on delete cascade,
  completed           boolean not null default false,
  completed_at        timestamptz,
  completed_by        uuid references auth.users(id) on delete set null,
  operator_notes      text,
  visit_evidence_urls text[] default '{}',
  created_at          timestamptz not null default now(),
  unique (route_stop_id, maintenance_form_id)
);

create table if not exists public.route_compliance_log (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references public.maintenance_routes(id) on delete cascade,
  stop_id       uuid references public.maintenance_route_stops(id) on delete set null,
  form_id       uuid references public.maintenance_route_forms(id) on delete set null,
  event_type    text not null check (event_type in ('completed','postponed','reopened')),
  performed_by  uuid references auth.users(id) on delete set null,
  performed_at  timestamptz not null default now(),
  notes         text,
  postponed_to  date
);

-- ── Trigger updated_at ───────────────────────────────────────────────────────
create or replace function public.update_maintenance_routes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_maintenance_routes_updated_at on public.maintenance_routes;
create trigger trg_maintenance_routes_updated_at
  before update on public.maintenance_routes
  for each row execute function public.update_maintenance_routes_updated_at();

-- ── Función: agregar comentario a un formulario de mantención ─────────────────
create or replace function public.append_maintenance_comment(p_form_id uuid, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.maintenance_forms
  set additional_comments = coalesce(additional_comments || E'\n', '') || p_comment
  where id = p_form_id;
end;
$$;

-- ── GRANTS ───────────────────────────────────────────────────────────────────
grant select on public.maintenance_locations to authenticated;
grant all on public.maintenance_locations to service_role;

grant select, insert, update, delete on public.maintenance_routes to authenticated;
grant all on public.maintenance_routes to service_role;

grant select, insert, update, delete on public.maintenance_route_stops to authenticated;
grant all on public.maintenance_route_stops to service_role;

grant select, insert, update, delete on public.maintenance_route_forms to authenticated;
grant all on public.maintenance_route_forms to service_role;

grant select, insert, update, delete on public.route_compliance_log to authenticated;
grant all on public.route_compliance_log to service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.maintenance_locations   enable row level security;
alter table public.maintenance_routes       enable row level security;
alter table public.maintenance_route_stops  enable row level security;
alter table public.maintenance_route_forms  enable row level security;
alter table public.route_compliance_log     enable row level security;

drop policy if exists "locations_select" on public.maintenance_locations;
create policy "locations_select" on public.maintenance_locations
  for select to authenticated using (true);

drop policy if exists "routes_select" on public.maintenance_routes;
create policy "routes_select" on public.maintenance_routes
  for select to authenticated using (true);
drop policy if exists "routes_insert" on public.maintenance_routes;
create policy "routes_insert" on public.maintenance_routes
  for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "routes_update" on public.maintenance_routes;
create policy "routes_update" on public.maintenance_routes
  for update to authenticated using (true);
drop policy if exists "routes_delete" on public.maintenance_routes;
create policy "routes_delete" on public.maintenance_routes
  for delete to authenticated using (true);

drop policy if exists "stops_all" on public.maintenance_route_stops;
create policy "stops_all" on public.maintenance_route_stops
  for all to authenticated using (true) with check (true);
drop policy if exists "rforms_all" on public.maintenance_route_forms;
create policy "rforms_all" on public.maintenance_route_forms
  for all to authenticated using (true) with check (true);
drop policy if exists "compliance_log_all" on public.route_compliance_log;
create policy "compliance_log_all" on public.route_compliance_log
  for all to authenticated using (true) with check (true);

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists idx_route_stops_route on public.maintenance_route_stops (route_id, stop_order);
create index if not exists idx_route_forms_stop on public.maintenance_route_forms (route_stop_id);
create index if not exists idx_route_forms_form on public.maintenance_route_forms (maintenance_form_id);
create index if not exists idx_locations_folder on public.maintenance_locations (folder);
create index if not exists idx_compliance_route on public.route_compliance_log (route_id);
create index if not exists idx_compliance_performed on public.route_compliance_log (performed_at);
create index if not exists idx_compliance_event on public.route_compliance_log (event_type);

-- ── Coordenadas en direcciones de contrato ───────────────────────────────────
alter table public.contract_addresses
  add column if not exists lat numeric(12,10),
  add column if not exists lng numeric(12,10),
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_source text;

create index if not exists idx_contract_addresses_latlng
  on public.contract_addresses (lat, lng)
  where lat is not null and lng is not null;