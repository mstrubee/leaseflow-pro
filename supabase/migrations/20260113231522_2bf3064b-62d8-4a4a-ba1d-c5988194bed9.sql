-- Create renegotiation drafts table for storing multiple draft proposals
CREATE TABLE public.renegotiation_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NULL,
  
  -- Commercial conditions (same fields as contract_versions)
  initial_rent NUMERIC NULL,
  regime_rent NUMERIC NOT NULL,
  variable_rent_percentage NUMERIC NULL,
  duration_months INTEGER NOT NULL,
  notice_type TEXT NOT NULL DEFAULT 'meses',
  notice_value TEXT NOT NULL,
  effective_date DATE NULL,
  effective_from_signature BOOLEAN DEFAULT false,
  
  -- Additional fields
  guarantee_multiplier NUMERIC NULL,
  has_periodic_adjustments BOOLEAN DEFAULT false,
  first_adjustment_month INTEGER NULL,
  adjustment_periodicity_months INTEGER NULL,
  adjustment_type TEXT NULL,
  adjustment_value NUMERIC NULL,
  
  -- Gastos comunes
  gastos_comunes_methodology TEXT DEFAULT 'uf_m2',
  gastos_comunes_uf_m2 NUMERIC NULL,
  gastos_comunes_uf_ml_frente NUMERIC NULL,
  gastos_comunes_prorrata_kwh_clima NUMERIC NULL,
  gastos_comunes_percentage NUMERIC NULL,
  gastos_comunes_total_centro NUMERIC NULL,
  gastos_comunes_tope NUMERIC NULL,
  gastos_comunes_tope_type TEXT NULL,
  has_extended_gastos_comunes BOOLEAN DEFAULT false,
  adicional_administracion_percentage NUMERIC NULL,
  
  -- Other fields
  fondo_promocion_percentage NUMERIC NULL,
  grace_months INTEGER NULL,
  notice_bilaterality TEXT DEFAULT 'unilateral',
  otros_egresos_amount NUMERIC NULL,
  otros_egresos_description TEXT NULL,
  
  -- Template source
  source_type TEXT DEFAULT 'scratch', -- 'current', 'draft', 'scratch'
  source_draft_id UUID NULL REFERENCES public.renegotiation_drafts(id) ON DELETE SET NULL,
  
  -- Status
  status TEXT DEFAULT 'draft' -- 'draft', 'accepted', 'rejected'
);

-- Create renegotiation draft escalations table
CREATE TABLE public.renegotiation_draft_escalations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.renegotiation_drafts(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create renegotiation draft notice ranges table (for range-type notices)
CREATE TABLE public.renegotiation_draft_notice_ranges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.renegotiation_drafts(id) ON DELETE CASCADE,
  start_month INTEGER NOT NULL,
  end_month INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.renegotiation_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renegotiation_draft_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renegotiation_draft_notice_ranges ENABLE ROW LEVEL SECURITY;

-- RLS policies for renegotiation_drafts
CREATE POLICY "Authenticated users can view renegotiation drafts"
  ON public.renegotiation_drafts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert renegotiation drafts"
  ON public.renegotiation_drafts FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update renegotiation drafts"
  ON public.renegotiation_drafts FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete renegotiation drafts"
  ON public.renegotiation_drafts FOR DELETE
  TO authenticated USING (true);

-- RLS policies for renegotiation_draft_escalations
CREATE POLICY "Authenticated users can manage draft escalations"
  ON public.renegotiation_draft_escalations FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- RLS policies for renegotiation_draft_notice_ranges
CREATE POLICY "Authenticated users can manage draft notice ranges"
  ON public.renegotiation_draft_notice_ranges FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_renegotiation_drafts_updated_at
  BEFORE UPDATE ON public.renegotiation_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_renegotiation_drafts_contract ON public.renegotiation_drafts(contract_id);
CREATE INDEX idx_renegotiation_draft_escalations_draft ON public.renegotiation_draft_escalations(draft_id);
CREATE INDEX idx_renegotiation_draft_notice_ranges_draft ON public.renegotiation_draft_notice_ranges(draft_id);