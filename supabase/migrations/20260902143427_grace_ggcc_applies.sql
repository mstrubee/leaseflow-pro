-- ================================================================
-- Migration: grace_ggcc_applies
-- Date: 2026-09-02
-- Purpose:
--   Los meses de gracia solo eximen el arriendo (canon), nunca los
--   gastos comunes -- así se comportó siempre el cálculo (GGCC es un
--   monto independiente del canon). Este flag permite, caso a caso,
--   marcar que los GGCC TAMPOCO se cobran durante la gracia. Default
--   true preserva el comportamiento histórico para contratos ya
--   cargados.
-- ================================================================

ALTER TABLE public.contract_versions
  ADD COLUMN IF NOT EXISTS grace_ggcc_applies boolean NOT NULL DEFAULT true;

ALTER TABLE public.renegotiation_drafts
  ADD COLUMN IF NOT EXISTS grace_ggcc_applies boolean NOT NULL DEFAULT true;
