-- Add parent_kpi_id to kpis table to support Sub-KPIs
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS parent_kpi_id UUID REFERENCES public.kpis(id) ON DELETE CASCADE;

-- Add assigned_user_id to allow assigning Sub-KPIs to specific users
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS assigned_user_id UUID;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_kpis_parent_kpi_id ON public.kpis(parent_kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpis_assigned_user_id ON public.kpis(assigned_user_id);