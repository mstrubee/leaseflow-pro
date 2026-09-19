-- ================================================================
-- Migration: add_profile_templates
-- Date: 2026-06-29
-- Purpose:
--   1. user_profile_templates — named permission profiles
--   2. profile_template_permissions — permissions per profile
--   3. profiles.is_active — user active/inactive status
--   4. profiles.profile_template_id — which profile a user is based on
-- ================================================================

-- ── 1. Profile templates table ──
CREATE TABLE public.user_profile_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Permissions per profile ──
CREATE TABLE public.profile_template_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.user_profile_templates(id) ON DELETE CASCADE,
  resource   text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('view', 'edit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, resource)
);

-- ── 3. Add is_active and profile_template_id to profiles ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_template_id uuid REFERENCES public.user_profile_templates(id) ON DELETE SET NULL;

-- ── 4. RLS ──
ALTER TABLE public.user_profile_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_template_permissions  ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (needed to display profile name in UI)
CREATE POLICY "Authenticated users can view profile templates"
  ON public.user_profile_templates FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only admins can write profile templates
CREATE POLICY "Admins can manage profile templates"
  ON public.user_profile_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can read profile permissions (needed to load tree)
CREATE POLICY "Authenticated users can view profile template permissions"
  ON public.profile_template_permissions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only admins can write profile permissions
CREATE POLICY "Admins can manage profile template permissions"
  ON public.profile_template_permissions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ── 5. Trigger: updated_at on user_profile_templates ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profile_templates_updated_at
  BEFORE UPDATE ON public.user_profile_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
