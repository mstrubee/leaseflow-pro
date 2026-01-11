-- Migración: Renombrar INVERSION INICIAL a CAPEX en todo el sistema

-- 1. Primero eliminar los constraints existentes
ALTER TABLE public.contract_budgets DROP CONSTRAINT IF EXISTS contract_budgets_budget_type_check;
ALTER TABLE public.budget_templates DROP CONSTRAINT IF EXISTS budget_templates_budget_type_check;

-- 2. Actualizar datos existentes
UPDATE public.contract_budgets SET budget_type = 'capex' WHERE budget_type = 'inversion_inicial';
UPDATE public.budget_templates SET budget_type = 'capex' WHERE budget_type = 'inversion_inicial';
UPDATE public.budget_carryover SET budget_type = 'capex' WHERE budget_type = 'inversion_inicial';

-- 3. Agregar nuevos constraints
ALTER TABLE public.contract_budgets ADD CONSTRAINT contract_budgets_budget_type_check 
  CHECK (budget_type IN ('capex', 'opex'));

ALTER TABLE public.budget_templates ADD CONSTRAINT budget_templates_budget_type_check 
  CHECK (budget_type IN ('capex', 'opex'));