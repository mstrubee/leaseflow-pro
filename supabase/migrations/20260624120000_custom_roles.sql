-- Custom role templates: admins can define named role presets with permission bundles
create table if not exists custom_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists custom_role_permissions (
  id uuid primary key default gen_random_uuid(),
  custom_role_id uuid not null references custom_roles(id) on delete cascade,
  resource text not null,
  permission text not null check (permission in ('view', 'edit')),
  unique (custom_role_id, resource)
);

-- RLS: only admins can read/write custom roles
alter table custom_roles enable row level security;
alter table custom_role_permissions enable row level security;

create policy "Admins can manage custom_roles"
  on custom_roles
  for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

create policy "Admins can manage custom_role_permissions"
  on custom_role_permissions
  for all
  using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );
