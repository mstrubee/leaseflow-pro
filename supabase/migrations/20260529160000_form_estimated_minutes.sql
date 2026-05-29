-- Add estimated duration per form in route
alter table maintenance_route_forms
  add column if not exists estimated_minutes integer default 30;
