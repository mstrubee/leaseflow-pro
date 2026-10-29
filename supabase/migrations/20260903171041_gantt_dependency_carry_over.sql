-- ================================================================
-- Migration: gantt_dependency_carry_over
-- Date: 2026-09-03
-- Purpose:
--   Regla opcional por dependencia de Gantt: si la predecesora termina
--   después del día "carry_over_threshold_day" de su mes, la tarea
--   dependiente pasa automáticamente al día hábil
--   "carry_over_landing_business_day" del mes SIGUIENTE, en vez del
--   cálculo normal (fin de la predecesora + lag_days). Solo aplica a
--   dependencias "al término" (dep_type = 'end') -- se enforza en la UI
--   (DependencyDialog.tsx) y en el cálculo (useGantt.ts), no acá.
-- ================================================================

ALTER TABLE public.gantt_task_dependencies
  ADD COLUMN IF NOT EXISTS carry_over_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carry_over_threshold_day smallint,
  ADD COLUMN IF NOT EXISTS carry_over_landing_business_day smallint NOT NULL DEFAULT 1;

ALTER TABLE public.gantt_task_dependencies
  DROP CONSTRAINT IF EXISTS gantt_task_dependencies_carry_over_threshold_check,
  DROP CONSTRAINT IF EXISTS gantt_task_dependencies_carry_over_landing_check,
  DROP CONSTRAINT IF EXISTS gantt_task_dependencies_carry_over_requires_threshold;

ALTER TABLE public.gantt_task_dependencies
  ADD CONSTRAINT gantt_task_dependencies_carry_over_threshold_check
    CHECK (carry_over_threshold_day IS NULL OR (carry_over_threshold_day BETWEEN 1 AND 31)),
  ADD CONSTRAINT gantt_task_dependencies_carry_over_landing_check
    CHECK (carry_over_landing_business_day >= 1),
  ADD CONSTRAINT gantt_task_dependencies_carry_over_requires_threshold
    CHECK (NOT carry_over_enabled OR carry_over_threshold_day IS NOT NULL);
