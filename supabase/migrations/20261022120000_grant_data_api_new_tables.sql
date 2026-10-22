-- Grants explícitos de Data API para tablas creadas entre 2026-06-25 y 2026-10-20.
--
-- Contexto: desde 2026-10-30 Supabase deja de dar acceso automático (Data API) a las
-- tablas nuevas de `public`. Estas tablas se crearon cuando el acceso automático aún
-- existía, así que sus migraciones no traen GRANT: la DB oficial funciona hoy, pero una
-- reconstrucción desde cero (db reset, rama de preview, proyecto nuevo) las dejaría con
-- "permission denied".
--
-- Mismos permisos que usa el resto del proyecto (ver 20260608211422): authenticated con
-- CRUD, service_role con todo. El acceso fino lo sigue controlando RLS. No se otorga
-- nada a anon: ninguna de estas tablas tiene políticas para anon.
--
-- NO incluye `oc_verification_secret`: guarda el secreto de verificación de OC, tiene RLS
-- sin políticas a propósito y solo la lee una función SECURITY DEFINER.
--
-- Idempotente: GRANT repetido no falla, y se omite cualquier tabla que no exista.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'budget_line_progress_statuses',
    'user_profile_templates',
    'profile_template_permissions',
    'invitations',
    'login_events',
    'geochile_integration_settings',
    'contract_isochrone_links',
    'board_report_shares',
    'contract_isochrone_reports',
    'expense_reports',
    'expense_items',
    'oc_centro_mappings',
    'gantt_overview_statuses',
    'capex_clasificacion_types',
    'capex_avance_status_types',
    'gantt_overview_budget_items',
    'gantt_overview_timeline_settings',
    'capex_company_splits',
    'capex_approved_budgets',
    'capex_approved_budget_files',
    'capex_approved_budget_increases',
    'capex_budget_drafts',
    'capex_new_location_budget',
    'gantt_overview_extra_contracts',
    'opex_budget_plan_items',
    'opex_budget_plan_exclusions',
    'opex_category_mappings'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END;
$$;
