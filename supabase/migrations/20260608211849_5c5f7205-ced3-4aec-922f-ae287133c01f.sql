-- 1. org_members: restrict email/phone to admins via column-level grants
REVOKE SELECT ON public.org_members FROM authenticated;
GRANT SELECT (id, company_id, name, position, parent_id, display_order, created_at)
  ON public.org_members TO authenticated;

-- 2. Remove tables that don't use postgres_changes from the realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.closing_process_notes;