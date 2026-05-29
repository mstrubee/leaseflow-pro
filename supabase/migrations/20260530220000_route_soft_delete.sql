-- Papelera de rutas: soft delete con retención de 1 semana.
alter table public.maintenance_routes
  add column if not exists deleted_at timestamptz;

create index if not exists idx_maintenance_routes_deleted
  on public.maintenance_routes (deleted_at);

-- Purga rutas eliminadas hace más de 7 días (borrado definitivo)
create or replace function public.purge_deleted_routes()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.maintenance_routes
  where deleted_at is not null
    and deleted_at < now() - interval '7 days';
end;
$$;
