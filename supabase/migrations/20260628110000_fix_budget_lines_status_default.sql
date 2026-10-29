-- ============================================================
-- Fix budget_lines.status column default
-- The default was 'pendiente' but the CHECK constraint only
-- allows 'autorizado' | 'no_autorizado'.
-- This inconsistency would cause INSERT failures if the default
-- was ever used (e.g. raw SQL inserts without explicit status).
-- All existing rows already have valid status values.
-- ============================================================
ALTER TABLE public.budget_lines
  ALTER COLUMN status SET DEFAULT 'no_autorizado';

-- Verify no existing rows violate the constraint
-- (they don't — all rows have 'autorizado' or 'no_autorizado')
