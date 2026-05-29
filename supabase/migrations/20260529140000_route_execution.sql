-- ── 1. Nuevo rol operador_terreno ────────────────────────────────────────────
alter type app_role add value if not exists 'operador_terreno';

-- ── 2. Ejecución de paradas ──────────────────────────────────────────────────
alter table maintenance_route_stops
  add column if not exists status          text not null default 'pending'
                                             check (status in ('pending','completed','postponed')),
  add column if not exists completed_at    timestamptz,
  add column if not exists completed_by    uuid references auth.users(id) on delete set null,
  add column if not exists postponed_to    date,
  add column if not exists postpone_note   text;

-- ── 3. Ejecución de forms por parada ────────────────────────────────────────
alter table maintenance_route_forms
  add column if not exists completed_at        timestamptz,
  add column if not exists completed_by        uuid references auth.users(id) on delete set null,
  add column if not exists operator_notes      text,
  add column if not exists visit_evidence_urls text[] default '{}';

-- ── 4. Tabla de log de cumplimiento ─────────────────────────────────────────
create table if not exists route_compliance_log (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references maintenance_routes(id) on delete cascade,
  stop_id       uuid references maintenance_route_stops(id) on delete set null,
  form_id       uuid references maintenance_route_forms(id) on delete set null,
  event_type    text not null check (event_type in ('completed','postponed','reopened')),
  performed_by  uuid references auth.users(id) on delete set null,
  performed_at  timestamptz not null default now(),
  notes         text,
  postponed_to  date
);

alter table route_compliance_log enable row level security;
create policy "compliance_log_all" on route_compliance_log
  for all to authenticated using (true);

create index on route_compliance_log (route_id);
create index on route_compliance_log (performed_at);
create index on route_compliance_log (event_type);
