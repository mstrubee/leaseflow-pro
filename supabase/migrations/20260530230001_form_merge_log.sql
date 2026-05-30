-- Historial de fusiones (tabla simple, sin funciones/triggers).
create table if not exists public.maintenance_form_merge_log (
  id             uuid primary key default gen_random_uuid(),
  merge_group_id uuid not null,
  form_ids       uuid[] not null default '{}',
  form_numbers   text[] not null default '{}',
  contract_id    uuid,
  action         text not null default 'merged',
  performed_by   uuid,
  performed_at   timestamptz not null default now()
);

alter table public.maintenance_form_merge_log enable row level security;

drop policy if exists "merge_log_all" on public.maintenance_form_merge_log;
create policy "merge_log_all" on public.maintenance_form_merge_log
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.maintenance_form_merge_log to authenticated;
grant all on public.maintenance_form_merge_log to service_role;
