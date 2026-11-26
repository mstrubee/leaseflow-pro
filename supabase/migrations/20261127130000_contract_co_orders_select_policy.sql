-- Lectura de las Órdenes CO para usuarios que no son admin.
--
-- La política original (20261124150000_contract_co_orders.sql) solo cubría el recurso
-- 'budget'. contract_budgets, en cambio, también deja leer con 'contract_budget' y
-- 'contracts'. Sin esto, un usuario con solo esos permisos veía el presupuesto pero NO las CO,
-- y sus Solicitudes de OC CAPEX salían sin número de CO (sin avisar).
-- Esta política copia la regla de lectura de contract_budgets. Escribir CO sigue siendo solo admin.
--
-- Idempotente. Aplicar solo al Supabase nuevo (rama `migration`).

DROP POLICY IF EXISTS "Users can view contract_co_orders with permission" ON public.contract_co_orders;
CREATE POLICY "Users can view contract_co_orders with permission"
  ON public.contract_co_orders FOR SELECT TO authenticated
  USING (
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
