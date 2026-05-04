
-- Fix Gantt RLS: resource identifier mismatch ('gantt' -> 'contract_gantt')

-- gantt_timelines
DROP POLICY IF EXISTS "Users can view gantt_timelines with permission" ON public.gantt_timelines;
DROP POLICY IF EXISTS "Users can modify gantt_timelines with permission" ON public.gantt_timelines;
DROP POLICY IF EXISTS "Users can update gantt_timelines with permission" ON public.gantt_timelines;
DROP POLICY IF EXISTS "Users can delete gantt_timelines with permission" ON public.gantt_timelines;

CREATE POLICY "Users can view gantt_timelines with permission" ON public.gantt_timelines
FOR SELECT USING (
  has_permission(auth.uid(), 'contract_gantt', 'view') OR
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can insert gantt_timelines with permission" ON public.gantt_timelines
FOR INSERT WITH CHECK (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can update gantt_timelines with permission" ON public.gantt_timelines
FOR UPDATE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can delete gantt_timelines with permission" ON public.gantt_timelines
FOR DELETE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);

-- gantt_tasks
DROP POLICY IF EXISTS "Users can view gantt_tasks with permission" ON public.gantt_tasks;
DROP POLICY IF EXISTS "Users can modify gantt_tasks with permission" ON public.gantt_tasks;
DROP POLICY IF EXISTS "Users can update gantt_tasks with permission" ON public.gantt_tasks;
DROP POLICY IF EXISTS "Users can delete gantt_tasks with permission" ON public.gantt_tasks;

CREATE POLICY "Users can view gantt_tasks with permission" ON public.gantt_tasks
FOR SELECT USING (
  has_permission(auth.uid(), 'contract_gantt', 'view') OR
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can insert gantt_tasks with permission" ON public.gantt_tasks
FOR INSERT WITH CHECK (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can update gantt_tasks with permission" ON public.gantt_tasks
FOR UPDATE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can delete gantt_tasks with permission" ON public.gantt_tasks
FOR DELETE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);

-- gantt_task_dependencies
DROP POLICY IF EXISTS "Users can view gantt_task_dependencies with permission" ON public.gantt_task_dependencies;
DROP POLICY IF EXISTS "Users can modify gantt_task_dependencies with permission" ON public.gantt_task_dependencies;
DROP POLICY IF EXISTS "Users can update gantt_task_dependencies with permission" ON public.gantt_task_dependencies;
DROP POLICY IF EXISTS "Users can delete gantt_task_dependencies with permission" ON public.gantt_task_dependencies;

CREATE POLICY "Users can view gantt_task_dependencies with permission" ON public.gantt_task_dependencies
FOR SELECT USING (
  has_permission(auth.uid(), 'contract_gantt', 'view') OR
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can insert gantt_task_dependencies with permission" ON public.gantt_task_dependencies
FOR INSERT WITH CHECK (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can update gantt_task_dependencies with permission" ON public.gantt_task_dependencies
FOR UPDATE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can delete gantt_task_dependencies with permission" ON public.gantt_task_dependencies
FOR DELETE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);

-- gantt_task_purchase_orders
DROP POLICY IF EXISTS "Users can view gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;
DROP POLICY IF EXISTS "Users can modify gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;
DROP POLICY IF EXISTS "Users can update gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;
DROP POLICY IF EXISTS "Users can delete gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders;

CREATE POLICY "Users can view gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders
FOR SELECT USING (
  has_permission(auth.uid(), 'contract_gantt', 'view') OR
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can insert gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders
FOR INSERT WITH CHECK (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can update gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders
FOR UPDATE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
CREATE POLICY "Users can delete gantt_task_purchase_orders with permission" ON public.gantt_task_purchase_orders
FOR DELETE USING (
  has_permission(auth.uid(), 'contract_gantt', 'edit') OR
  has_permission(auth.uid(), 'contract_gantt', 'all')
);
