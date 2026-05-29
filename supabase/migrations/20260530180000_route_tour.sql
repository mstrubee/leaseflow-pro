-- Agrupa rutas diarias que pertenecen a una misma "gira" multi-día.
-- Al armar una ruta que supera la jornada, se guarda una ruta por día hábil,
-- todas compartiendo el mismo tour_id, con day_index 0,1,2…
alter table public.maintenance_routes
  add column if not exists tour_id   uuid,
  add column if not exists day_index integer not null default 0,
  add column if not exists start_time text;  -- hora de inicio del día (HH:MM)

create index if not exists idx_maintenance_routes_tour on public.maintenance_routes (tour_id);
