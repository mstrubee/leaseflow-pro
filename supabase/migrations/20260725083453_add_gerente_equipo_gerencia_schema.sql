-- ================================================================
-- Migration: add_gerente_equipo_gerencia_schema
-- Date: 2026-07-25
-- Purpose:
--   Sistema de invitación y roles restringidos:
--   1. profiles: org_member_id, created_by, invitation_status
--   2. invitations — token de un solo uso para activar cuentas
--   3. login_events — auditoría de inicios de sesión
--   4. RLS: gerente administra solo su equipo (created_by = auth.uid())
--   5. RLS: equipo_gerencia sin escritura en gantt (patch a
--      can_access_gantt) y SELECT restringido al cronograma
--      principal + bloqueo del resto de tablas de negocio
-- ================================================================

-- ── 1. profiles: nuevas columnas ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_member_id     uuid REFERENCES public.org_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_status text NOT NULL DEFAULT 'active'
    CHECK (invitation_status IN ('pending', 'active', 'reset'));

-- ── 2. invitations ──
CREATE TABLE public.invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      uuid NOT NULL DEFAULT gen_random_uuid(),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'reset')),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at    timestamptz
);

CREATE UNIQUE INDEX invitations_token_idx ON public.invitations (token);
CREATE INDEX invitations_user_id_idx ON public.invitations (user_id);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all invitations"
  ON public.invitations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can manage invitations of own team"
  ON public.invitations FOR ALL
  TO authenticated
  USING (invited_by = auth.uid() AND public.has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (invited_by = auth.uid() AND public.has_role(auth.uid(), 'gerente'::app_role));

-- El propio invitado necesita leer su invitación pending para validar el
-- token en el primer login / reset (antes de tener rol o permisos propios).
CREATE POLICY "Invited user can view own invitation"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 3. login_events ──
CREATE TABLE public.login_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_in_at  timestamptz NOT NULL DEFAULT now(),
  user_agent    text
);

CREATE INDEX login_events_user_id_idx ON public.login_events (user_id, logged_in_at DESC);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all login events"
  ON public.login_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gerentes can view login events of own team"
  ON public.login_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = login_events.user_id
        AND profiles.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view own login events"
  ON public.login_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Insertado por el propio cliente al detectar SIGNED_IN (ver useAuth.tsx).
CREATE POLICY "Users can insert own login event"
  ON public.login_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── 4. profiles: gerente administra su equipo ──
-- (las políticas de admin ya existentes -- "Users can view own profile",
--  "Admins can delete profiles", etc. -- se dejan intactas; estas se suman)
CREATE POLICY "Gerentes can view own team profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes can update own team profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerentes can delete own team profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'gerente'::app_role));

-- ── 5a. can_access_gantt: excluir explícitamente a equipo_gerencia ──
-- La función original da acceso de ESCRITURA a cualquier usuario sin
-- ninguna fila en user_permissions (fallback permisivo). equipo_gerencia
-- nunca tendrá filas ahí, así que sin este patch heredaría acceso de
-- edición al cronograma por el fallback. Se cierra explícitamente antes
-- de que el rol exista en ningún usuario real.
CREATE OR REPLACE FUNCTION public.can_access_gantt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.has_role(_user_id, 'equipo_gerencia'::app_role)
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_permissions
        WHERE user_id = _user_id AND resource = 'contract_gantt'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.user_permissions
        WHERE user_id = _user_id
          AND resource IN (
            'contract_address', 'contract_contact', 'contract_commercial',
            'contract_renegotiation', 'contract_surfaces', 'contract_documents',
            'contract_repository', 'contract_gantt', 'contract_alerts', 'contract_patents'
          )
      )
    )
$$;

-- ── 5b. gantt_timelines / gantt_tasks / gantt_task_dependencies:
--       equipo_gerencia solo lee el cronograma PRINCIPAL (is_priority = true,
--       category = 'general'); se excluye de la política general de
--       "cualquier autenticado puede ver todo".
DROP POLICY IF EXISTS "Authenticated users can view gantt_timelines" ON public.gantt_timelines;
CREATE POLICY "Authenticated users can view gantt_timelines"
  ON public.gantt_timelines FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'equipo_gerencia'::app_role));

CREATE POLICY "Equipo gerencia can view principal timeline"
  ON public.gantt_timelines FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'equipo_gerencia'::app_role)
    AND is_priority = true
    AND category = 'general'
  );

DROP POLICY IF EXISTS "Authenticated users can view gantt_tasks" ON public.gantt_tasks;
CREATE POLICY "Authenticated users can view gantt_tasks"
  ON public.gantt_tasks FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'equipo_gerencia'::app_role));

CREATE POLICY "Equipo gerencia can view principal timeline tasks"
  ON public.gantt_tasks FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'equipo_gerencia'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.gantt_timelines gt
      WHERE gt.id = gantt_tasks.timeline_id
        AND gt.is_priority = true
        AND gt.category = 'general'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view gantt_task_dependencies" ON public.gantt_task_dependencies;
CREATE POLICY "Authenticated users can view gantt_task_dependencies"
  ON public.gantt_task_dependencies FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'equipo_gerencia'::app_role));

CREATE POLICY "Equipo gerencia can view principal timeline dependencies"
  ON public.gantt_task_dependencies FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'equipo_gerencia'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.gantt_tasks t
      JOIN public.gantt_timelines gt ON gt.id = t.timeline_id
      WHERE t.id = gantt_task_dependencies.task_id
        AND gt.is_priority = true
        AND gt.category = 'general'
    )
  );

-- ── 5c. Resto de tablas de negocio: equipo_gerencia queda excluido de la
--       política blanket "cualquier autenticado puede ver todo".
--       (contracts NO se incluye: equipo_gerencia sí necesita listar/abrir
--       proyectos para llegar a la sección Cronograma; gantt_timelines/
--       gantt_tasks/gantt_task_dependencies se resolvieron arriba con
--       carve-out al cronograma principal, no exclusión total.
--       gantt_task_purchase_orders SÍ queda con exclusión total -- no tiene
--       carve-out de "principal": el requerimiento es solo lectura del
--       cronograma, no de las OC asociadas a sus tareas. Revisar si el
--       producto pide mostrar esos datos en el detalle de tarea.)
DO $$
DECLARE
  r RECORD;
  tables TEXT[] := ARRAY[
    'alert_recipients', 'budget_carryover', 'budget_lines', 'budget_reassignments',
    'contract_addresses', 'contract_budgets', 'contract_companies', 'contract_contacts',
    'contract_documents', 'contract_import_audit', 'contract_patents', 'contract_versions',
    'credit_notes', 'finalized_contracts', 'folder_statuses', 'gantt_task_purchase_orders',
    'invoices', 'notice_ranges', 'opex_master_budget', 'patent_document_alerts',
    'patent_documents', 'purchase_items', 'purchase_orders',
    'renegotiation_draft_escalations', 'renegotiation_draft_notice_ranges',
    'renegotiation_drafts', 'rent_escalations', 'repository_files', 'repository_folders',
    'supplier_categories', 'supplier_emails', 'supplier_influence_zones',
    'supplier_products', 'suppliers', 'termination_notices', 'version_notices'
  ];
  t TEXT;
  policy_name TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    policy_name := format('Authenticated users can view %s', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), ''equipo_gerencia''::app_role))',
      policy_name, t
    );
  END LOOP;
END $$;
