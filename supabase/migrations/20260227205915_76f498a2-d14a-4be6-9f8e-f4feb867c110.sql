
CREATE TABLE public.patent_kpi_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID REFERENCES public.kpis(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert single config row
INSERT INTO public.patent_kpi_config (id) VALUES (gen_random_uuid());

-- RLS
ALTER TABLE public.patent_kpi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read patent_kpi_config"
  ON public.patent_kpi_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can update patent_kpi_config"
  ON public.patent_kpi_config FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
