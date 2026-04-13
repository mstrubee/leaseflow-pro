
-- contract_budgets: expand SELECT to include contracts permission
DROP POLICY "Users can view contract_budgets with permission" ON public.contract_budgets;
CREATE POLICY "Users can view contract_budgets with permission" ON public.contract_budgets
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);

-- budget_lines: expand SELECT to include contracts permission
DROP POLICY "Users can view budget_lines with permission" ON public.budget_lines;
CREATE POLICY "Users can view budget_lines with permission" ON public.budget_lines
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);
