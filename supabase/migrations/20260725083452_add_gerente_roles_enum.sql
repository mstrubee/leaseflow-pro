-- ================================================================
-- Migration: add_gerente_roles_enum
-- Date: 2026-07-25
-- Purpose: add 'gerente' and 'equipo_gerencia' to app_role.
--
-- Split into its own migration on purpose: ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that references the new
-- value, so the schema/RLS changes that use these roles live in the
-- next migration file.
-- ================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'equipo_gerencia';
