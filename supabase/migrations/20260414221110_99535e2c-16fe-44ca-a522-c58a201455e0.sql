
-- purchase_orders: expand SELECT
DROP POLICY "Users can view purchase_orders with permission" ON public.purchase_orders;
CREATE POLICY "Users can view purchase_orders with permission" ON public.purchase_orders
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);

-- invoices: expand SELECT
DROP POLICY "Users can view invoices with permission" ON public.invoices;
CREATE POLICY "Users can view invoices with permission" ON public.invoices
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);

-- credit_notes: expand SELECT
DROP POLICY "Users can view credit_notes with permission" ON public.credit_notes;
CREATE POLICY "Users can view credit_notes with permission" ON public.credit_notes
FOR SELECT USING (
  has_permission(auth.uid(), 'budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'purchase_orders'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contract_budget'::text, 'all'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);

-- budget_reassignments: expand SELECT
DROP POLICY "Users can view budget_reassignments with permission" ON public.budget_reassignments;
CREATE POLICY "Users can view budget_reassignments with permission" ON public.budget_reassignments
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

-- budget_carryover: expand SELECT
DROP POLICY "Users can view budget_carryover with permission" ON public.budget_carryover;
CREATE POLICY "Users can view budget_carryover with permission" ON public.budget_carryover
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
