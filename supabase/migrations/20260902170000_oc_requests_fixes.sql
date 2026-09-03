-- Ajustes a Solicitudes de OC:
-- 1. Guarda el monto de cada pago también en CLP (antes solo se guardaba en
--    UF con 4 decimales, lo que perdía hasta $1 por redondeo al convertir
--    de vuelta a CLP para mostrarlo).
-- 2. Guarda qué opción ("Con Migo" / "Sin Migo") se eligió al compartir la
--    solicitud recién creada.
-- 3. Correlativo global y atómico (vía trigger, no un COUNT por tabla/día
--    como el folio actual) — independiente de dónde se creó la solicitud.

alter table public.oc_payment_plans add column if not exists amount_clp numeric;
alter table public.oc_requests add column if not exists migo_choice text
  check (migo_choice in ('con', 'sin'));
alter table public.oc_requests add column if not exists sequence_number integer;

create sequence if not exists public.oc_requests_sequence_number_seq;

create or replace function public.set_oc_request_sequence_number()
returns trigger
language plpgsql
as $$
begin
  if new.sequence_number is null then
    new.sequence_number := nextval('public.oc_requests_sequence_number_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_oc_requests_sequence_number on public.oc_requests;
create trigger trg_oc_requests_sequence_number
  before insert on public.oc_requests
  for each row execute function public.set_oc_request_sequence_number();

-- Backfill: numera las solicitudes existentes en orden cronológico, desde 1.
with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.oc_requests
  where sequence_number is null
)
update public.oc_requests r
set sequence_number = n.rn
from numbered n
where r.id = n.id;

select setval(
  'public.oc_requests_sequence_number_seq',
  coalesce((select max(sequence_number) from public.oc_requests), 0) + 1,
  false
);

create unique index if not exists oc_requests_sequence_number_key
  on public.oc_requests (sequence_number);
