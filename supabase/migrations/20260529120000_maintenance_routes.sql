-- Locales de mantención (Autoplanet + Agroplanet) con coordenadas
create table if not exists maintenance_locations (
  id            uuid primary key default gen_random_uuid(),
  poi_id        uuid unique not null,
  name          text not null,
  folder        text not null,           -- 'Autoplanet' | 'Agroplanet'
  local_code    text,                    -- ej: 'AP0070'
  local_name    text,                    -- ej: 'AP0070-Orientales'
  gerente_zonal text,
  zona          text,
  centro_sap    text,
  lat           numeric(12,10) not null,
  lng           numeric(12,10) not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Rutas de mantención
create table if not exists maintenance_routes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  supplier_id    uuid references suppliers(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  scheduled_date date,
  status         text not null default 'draft'
                   check (status in ('draft','assigned','in_progress','completed')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Paradas de la ruta (locales en orden)
create table if not exists maintenance_route_stops (
  id                     uuid primary key default gen_random_uuid(),
  route_id               uuid not null references maintenance_routes(id) on delete cascade,
  location_id            uuid not null references maintenance_locations(id) on delete restrict,
  stop_order             integer not null,
  estimated_travel_min   integer,
  created_at             timestamptz not null default now(),
  unique (route_id, stop_order)
);

-- Forms asignados a cada parada
create table if not exists maintenance_route_forms (
  id                  uuid primary key default gen_random_uuid(),
  route_stop_id       uuid not null references maintenance_route_stops(id) on delete cascade,
  maintenance_form_id uuid not null references maintenance_forms(id) on delete cascade,
  completed           boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (route_stop_id, maintenance_form_id)
);

-- Trigger updated_at en maintenance_routes
create or replace function update_maintenance_routes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_maintenance_routes_updated_at
  before update on maintenance_routes
  for each row execute function update_maintenance_routes_updated_at();

-- RLS
alter table maintenance_locations   enable row level security;
alter table maintenance_routes       enable row level security;
alter table maintenance_route_stops  enable row level security;
alter table maintenance_route_forms  enable row level security;

-- maintenance_locations: lectura para autenticados
create policy "locations_select" on maintenance_locations
  for select to authenticated using (true);

-- maintenance_routes: CRUD para autenticados
create policy "routes_select" on maintenance_routes
  for select to authenticated using (true);
create policy "routes_insert" on maintenance_routes
  for insert to authenticated with check (auth.uid() = created_by);
create policy "routes_update" on maintenance_routes
  for update to authenticated using (true);
create policy "routes_delete" on maintenance_routes
  for delete to authenticated using (true);

-- route_stops / route_forms: acceso via ruta padre
create policy "stops_all" on maintenance_route_stops
  for all to authenticated using (true);
create policy "rforms_all" on maintenance_route_forms
  for all to authenticated using (true);

-- Índices útiles
create index on maintenance_route_stops (route_id, stop_order);
create index on maintenance_route_forms (route_stop_id);
create index on maintenance_route_forms (maintenance_form_id);
create index on maintenance_locations (folder);
