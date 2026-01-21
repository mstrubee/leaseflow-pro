-- Add classification field to kpis table
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS kpi_classification TEXT DEFAULT 'objetivos_gerencia' CHECK (kpi_classification IN ('objetivos_gerencia', 'kpi_empresa'));

-- Add simplified goal fields for KPI Empresa
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS validity_start DATE;
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS validity_end DATE;
ALTER TABLE public.kpis ADD COLUMN IF NOT EXISTS goal_100 NUMERIC; -- Meta 100%
-- goal_80 and goal_120 will be auto-calculated (80% and 120% of goal_100)

-- Create table for KPI Empresa entries (ingresos)
CREATE TABLE IF NOT EXISTS public.kpi_empresa_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.kpi_empresa_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kpi_empresa_entries
CREATE POLICY "Users can view kpi_empresa_entries" ON public.kpi_empresa_entries
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert kpi_empresa_entries" ON public.kpi_empresa_entries
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update kpi_empresa_entries" ON public.kpi_empresa_entries
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete kpi_empresa_entries" ON public.kpi_empresa_entries
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_kpi_empresa_entries_kpi_id ON public.kpi_empresa_entries(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_empresa_entries_date ON public.kpi_empresa_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_kpis_classification ON public.kpis(kpi_classification);