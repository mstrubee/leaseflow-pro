-- 1. alert_categories: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Everyone can view active alert categories" ON public.alert_categories;
CREATE POLICY "Authenticated can view active alert categories"
ON public.alert_categories FOR SELECT TO authenticated
USING (is_active = true);

-- 2. cloud_storage_connections: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view active cloud connections" ON public.cloud_storage_connections;
CREATE POLICY "Users can view active cloud connections"
ON public.cloud_storage_connections FOR SELECT TO authenticated
USING (is_active = true);

-- 3. oc_budget_lines: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view oc_budget_lines" ON public.oc_budget_lines;
CREATE POLICY "Users can view oc_budget_lines"
ON public.oc_budget_lines FOR SELECT TO authenticated
USING (true);

-- 4. oc_payment_plans: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view payment plans" ON public.oc_payment_plans;
CREATE POLICY "Users can view payment plans"
ON public.oc_payment_plans FOR SELECT TO authenticated
USING (true);

-- 5. oc_quotations: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view quotations" ON public.oc_quotations;
CREATE POLICY "Users can view quotations"
ON public.oc_quotations FOR SELECT TO authenticated
USING (true);

-- 6. oc_requests: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Users can view OC requests" ON public.oc_requests;
CREATE POLICY "Users can view OC requests"
ON public.oc_requests FOR SELECT TO authenticated
USING (true);

-- 7. opex_local_additional: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view OPEX local additional" ON public.opex_local_additional;
CREATE POLICY "Authenticated can view OPEX local additional"
ON public.opex_local_additional FOR SELECT TO authenticated
USING (true);

-- 8. contract_contacts: gate SELECT behind contracts permission or admin
DROP POLICY IF EXISTS "Authenticated users can view contract_contacts" ON public.contract_contacts;
CREATE POLICY "Users can view contract_contacts with permission"
ON public.contract_contacts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'contracts'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'contracts'::text, 'all'::permission_type)
);

-- 9. supplier_emails: gate SELECT behind suppliers permission or admin
DROP POLICY IF EXISTS "Authenticated users can view supplier_emails" ON public.supplier_emails;
CREATE POLICY "Users can view supplier_emails with permission"
ON public.supplier_emails FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'suppliers'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'suppliers'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'suppliers'::text, 'all'::permission_type)
);

-- 10. suppliers: gate SELECT behind suppliers permission or admin
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
CREATE POLICY "Users can view suppliers with permission"
ON public.suppliers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_permission(auth.uid(), 'suppliers'::text, 'view'::permission_type)
  OR has_permission(auth.uid(), 'suppliers'::text, 'edit'::permission_type)
  OR has_permission(auth.uid(), 'suppliers'::text, 'all'::permission_type)
);