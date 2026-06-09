-- Function: can a user access (and therefore edit) the Cronograma / Gantt?
-- Mirrors the frontend isHidden() logic: admins, users with an explicit
-- contract_gantt permission, and users without any contract-section
-- restriction can all access it. Users restricted to other contract
-- sections (but not gantt) cannot.
CREATE OR REPLACE FUNCTION public.can_access_gantt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id AND resource = 'contract_gantt'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id
        AND resource IN (
          'contract_address','contract_contact','contract_commercial',
          'contract_renegotiation','contract_surfaces','contract_documents',
          'contract_repository','contract_gantt','contract_alerts','contract_patents'
        )
    )
$$;

-- gantt_tasks
DROP POLICY IF EXISTS "Users can insert gantt_tasks with permission" ON public.gantt_tasks;
DROP POLICY IF EXISTS "Users can update gantt_tasks with permission" ON public.gantt_tasks;
DROP POLICY IF EXISTS "Users can delete gantt_tasks with permission" ON public.gantt_tasks;
CREATE POLICY "Users with gantt access can insert gantt_tasks" ON public.gantt_tasks
  FOR INSERT WITH CHECK (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can update gantt_tasks" ON public.gantt_tasks
  FOR UPDATE USING (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can delete gantt_tasks" ON public.gantt_tasks
  FOR DELETE USING (public.can_access_gantt(auth.uid()));

-- gantt_task_dependencies
DROP POLICY IF EXISTS "Users can insert gantt_task_dependencies with permission" ON public.gantt_task_dependencies;
DROP POLICY IF EXISTS "Users can update gantt_task_dependencies with permission" ON public.gantt_task_dependencies;
DROP POLICY IF EXISTS "Users can delete gantt_task_dependencies with permission" ON public.gantt_task_dependencies;
CREATE POLICY "Users with gantt access can insert gantt_task_dependencies" ON public.gantt_task_dependencies
  FOR INSERT WITH CHECK (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can update gantt_task_dependencies" ON public.gantt_task_dependencies
  FOR UPDATE USING (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can delete gantt_task_dependencies" ON public.gantt_task_dependencies
  FOR DELETE USING (public.can_access_gantt(auth.uid()));

-- gantt_timelines
DROP POLICY IF EXISTS "Users can insert gantt_timelines with permission" ON public.gantt_timelines;
DROP POLICY IF EXISTS "Users can update gantt_timelines with permission" ON public.gantt_timelines;
DROP POLICY IF EXISTS "Users can delete gantt_timelines with permission" ON public.gantt_timelines;
CREATE POLICY "Users with gantt access can insert gantt_timelines" ON public.gantt_timelines
  FOR INSERT WITH CHECK (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can update gantt_timelines" ON public.gantt_timelines
  FOR UPDATE USING (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can delete gantt_timelines" ON public.gantt_timelines
  FOR DELETE USING (public.can_access_gantt(auth.uid()));

-- gantt_task_purchase_orders
DROP POLICY IF EXISTS "Users can insert gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;
DROP POLICY IF EXISTS "Users can update gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;
DROP POLICY IF EXISTS "Users can delete gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;
CREATE POLICY "Users with gantt access can insert gantt_task_purchase_orders" ON public.gantt_task_purchase_orders
  FOR INSERT WITH CHECK (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can update gantt_task_purchase_orders" ON public.gantt_task_purchase_orders
  FOR UPDATE USING (public.can_access_gantt(auth.uid()));
CREATE POLICY "Users with gantt access can delete gantt_task_purchase_orders" ON public.gantt_task_purchase_orders
  FOR DELETE USING (public.can_access_gantt(auth.uid()));