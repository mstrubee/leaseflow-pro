-- Migración: Renombrar CAPEX a OPEX en todo el sistema

-- 1. Primero eliminar los constraints existentes
ALTER TABLE public.contract_budgets DROP CONSTRAINT IF EXISTS contract_budgets_budget_type_check;
ALTER TABLE public.budget_templates DROP CONSTRAINT IF EXISTS budget_templates_budget_type_check;

-- 2. Actualizar datos existentes
UPDATE public.contract_budgets SET budget_type = 'opex' WHERE budget_type = 'capex';
UPDATE public.budget_templates SET budget_type = 'opex' WHERE budget_type = 'capex';
UPDATE public.budget_carryover SET budget_type = 'opex' WHERE budget_type = 'capex';

-- 3. Agregar nuevos constraints
ALTER TABLE public.contract_budgets ADD CONSTRAINT contract_budgets_budget_type_check 
  CHECK (budget_type IN ('inversion_inicial', 'opex'));

ALTER TABLE public.budget_templates ADD CONSTRAINT budget_templates_budget_type_check 
  CHECK (budget_type IN ('inversion_inicial', 'opex'));