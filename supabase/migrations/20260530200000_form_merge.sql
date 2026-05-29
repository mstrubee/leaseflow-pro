-- Fusión permanente de forms de mantención (solo del mismo contrato/local).
-- Los forms fusionados comparten merge_group_id; uno es el primario.
-- Se mantiene historial en maintenance_form_merge_log.

alter table public.maintenance_forms
  add column if not exists merge_group_id uuid,
  add column if not exists merge_is_primary boolean not null default false;

create index if not exists idx_maintenance_forms_merge_group
  on public.maintenance_forms (merge_group_id) where merge_group_id is not null;

-- Historial de fusiones
create table if not exists public.maintenance_form_merge_log (
  id            uuid primary key default gen_random_uuid(),
  merge_group_id uuid not null,
  form_ids      uuid[] not null,
  form_numbers  text[] not null,
  contract_id   uuid,
  action        text not null default 'merged' check (action in ('merged','unmerged')),
  performed_by  uuid references auth.users(id) on delete set null,
  performed_at  timestamptz not null default now()
);

alter table public.maintenance_form_merge_log enable row level security;
drop policy if exists "merge_log_all" on public.maintenance_form_merge_log;
create policy "merge_log_all" on public.maintenance_form_merge_log
  for all to authenticated using (true) with check (true);

grant select, insert on public.maintenance_form_merge_log to authenticated;
grant all on public.maintenance_form_merge_log to service_role;

-- ── Fusionar: valida mismo contrato, asigna grupo, registra historial ───────
create or replace function public.merge_maintenance_forms(p_form_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_group   uuid := gen_random_uuid();
  v_contract uuid;
  v_count   int;
  v_numbers text[];
begin
  if array_length(p_form_ids, 1) is null or array_length(p_form_ids, 1) < 2 then
    raise exception 'Se requieren al menos 2 forms para fusionar';
  end if;

  -- Todos deben ser del mismo contrato
  select count(distinct contract_id), array_agg(form_number order by created_at)
    into v_count, v_numbers
  from maintenance_forms where id = any(p_form_ids);

  if v_count > 1 then
    raise exception 'Solo se pueden fusionar forms del mismo local';
  end if;

  select contract_id into v_contract from maintenance_forms where id = any(p_form_ids) limit 1;

  -- Asignar grupo; el primero (más antiguo) es el primario
  update maintenance_forms set merge_group_id = v_group, merge_is_primary = false
   where id = any(p_form_ids);
  update maintenance_forms set merge_is_primary = true
   where id = (select id from maintenance_forms where id = any(p_form_ids) order by created_at limit 1);

  insert into maintenance_form_merge_log (merge_group_id, form_ids, form_numbers, contract_id, action, performed_by)
  values (v_group, p_form_ids, v_numbers, v_contract, 'merged', auth.uid());

  return v_group;
end;
$$;

-- ── Deshacer fusión de un grupo ─────────────────────────────────────────────
create or replace function public.unmerge_maintenance_forms(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ids     uuid[];
  v_numbers text[];
  v_contract uuid;
begin
  select array_agg(id), array_agg(form_number), max(contract_id)
    into v_ids, v_numbers, v_contract
  from maintenance_forms where merge_group_id = p_group_id;

  update maintenance_forms set merge_group_id = null, merge_is_primary = false
   where merge_group_id = p_group_id;

  if v_ids is not null then
    insert into maintenance_form_merge_log (merge_group_id, form_ids, form_numbers, contract_id, action, performed_by)
    values (p_group_id, v_ids, v_numbers, v_contract, 'unmerged', auth.uid());
  end if;
end;
$$;

-- ── Trigger: completar/resolver un form del grupo propaga al resto ──────────
-- (anti-recursión: solo actualiza filas cuyo valor difiere)
create or replace function public.propagate_merged_form_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.merge_group_id is not null
     and (new.status is distinct from old.status or new.sub_status is distinct from old.sub_status) then
    update maintenance_forms
      set status = new.status, sub_status = new.sub_status, status_changed_at = now()
    where merge_group_id = new.merge_group_id
      and id <> new.id
      and (status is distinct from new.status or sub_status is distinct from new.sub_status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagate_merged_form_status on public.maintenance_forms;
create trigger trg_propagate_merged_form_status
  after update on public.maintenance_forms
  for each row execute function public.propagate_merged_form_status();
