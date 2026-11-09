-- Migration: add frozen_amount columns to contract_budgets
-- These columns store the "monto aprobado por directorio" (frozen approved amount).
-- Only admin users can set/clear this via the budget control panel.

ALTER TABLE public.contract_budgets
  ADD COLUMN IF NOT EXISTS frozen_amount_uf NUMERIC,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by UUID REFERENCES auth.users(id);
