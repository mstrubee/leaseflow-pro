
-- contract_budgets: SELECT
DROP POLICY "Users can view contract_budgets with permission" ON public.contract_budgets;
CREATE POLICY "Users can view contract_budgets with permission" ON public.contract_budgets
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- contract_budgets: INSERT
DROP POLICY "Users can modify contract_budgets with permission" ON public.contract_budgets;
CREATE POLICY "Users can modify contract_budgets with permission" ON public.contract_budgets
FOR INSERT WITH CHECK (
  has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- contract_budgets: UPDATE
DROP POLICY "Users can update contract_budgets with permission" ON public.contract_budgets;
CREATE POLICY "Users can update contract_budgets with permission" ON public.contract_budgets
FOR UPDATE USING (
  has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- contract_budgets: DELETE
DROP POLICY "Users can delete contract_budgets with permission" ON public.contract_budgets;
CREATE POLICY "Users can delete contract_budgets with permission" ON public.contract_budgets
FOR DELETE USING (
  has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- budget_lines: SELECT
DROP POLICY "Users can view budget_lines with permission" ON public.budget_lines;
CREATE POLICY "Users can view budget_lines with permission" ON public.budget_lines
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- budget_lines: INSERT
DROP POLICY "Users can modify budget_lines with permission" ON public.budget_lines;
CREATE POLICY "Users can modify budget_lines with permission" ON public.budget_lines
FOR INSERT WITH CHECK (
  has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- budget_lines: UPDATE
DROP POLICY "Users can update budget_lines with permission" ON public.budget_lines;
CREATE POLICY "Users can update budget_lines with permission" ON public.budget_lines
FOR UPDATE USING (
  has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);

-- budget_lines: DELETE
DROP POLICY "Users can delete budget_lines with permission" ON public.budget_lines;
CREATE POLICY "Users can delete budget_lines with permission" ON public.budget_lines
FOR DELETE USING (
  has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
);
