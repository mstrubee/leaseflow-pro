-- Columna de fusión de forms (minimal, sin funciones ni triggers para que el
-- runner de Lovable no la revierta junto con código complejo).
alter table public.maintenance_forms
  add column if not exists merge_group_id uuid;

create index if not exists idx_maintenance_forms_merge_group
  on public.maintenance_forms (merge_group_id) where merge_group_id is not null;
