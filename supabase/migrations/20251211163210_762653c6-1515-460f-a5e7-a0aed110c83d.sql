-- Add new columns to contract_contacts (Arrendador)
ALTER TABLE public.contract_contacts 
ADD COLUMN IF NOT EXISTS cedula_identidad text,
ADD COLUMN IF NOT EXISTS domicilio_comercial text;

-- Add new column to contract_addresses (Datos de la Propiedad)
ALTER TABLE public.contract_addresses 
ADD COLUMN IF NOT EXISTS rol_sii text;

-- Add effective_date column if not exists (already exists, but ensure it's used as Fecha Inicio)
-- The effective_date column already exists in contract_versions

-- Create table for dashboard section order preferences
CREATE TABLE IF NOT EXISTS public.dashboard_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section_key text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, section_key)
);

-- Enable RLS on dashboard_sections
ALTER TABLE public.dashboard_sections ENABLE ROW LEVEL SECURITY;

-- Users can manage their own dashboard sections
CREATE POLICY "Users can manage own dashboard sections" 
ON public.dashboard_sections 
FOR ALL 
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add priority field to alerts for finiquito alerts
ALTER TABLE public.alerts
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;

-- Add alert_subtype for finiquito type alerts
ALTER TABLE public.alerts
ADD COLUMN IF NOT EXISTS alert_subtype text;

-- Add index for priority sorting
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON public.alerts(priority DESC, due_date ASC);