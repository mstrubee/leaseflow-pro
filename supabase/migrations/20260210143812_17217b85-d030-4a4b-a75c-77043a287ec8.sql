-- Junction table: OC request ↔ maintenance forms with individual amounts
CREATE TABLE public.oc_request_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  oc_request_id UUID NOT NULL REFERENCES public.oc_requests(id) ON DELETE CASCADE,
  maintenance_form_id UUID NOT NULL,
  amount_uf NUMERIC NOT NULL DEFAULT 0,
  amount_clp NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate form assignments
ALTER TABLE public.oc_request_forms ADD CONSTRAINT oc_request_forms_unique UNIQUE (oc_request_id, maintenance_form_id);

-- Index for lookups
CREATE INDEX idx_oc_request_forms_request ON public.oc_request_forms(oc_request_id);
CREATE INDEX idx_oc_request_forms_form ON public.oc_request_forms(maintenance_form_id);

-- Enable RLS
ALTER TABLE public.oc_request_forms ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other budget tables)
CREATE POLICY "Authenticated users can view oc_request_forms"
  ON public.oc_request_forms FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert oc_request_forms"
  ON public.oc_request_forms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update oc_request_forms"
  ON public.oc_request_forms FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete oc_request_forms"
  ON public.oc_request_forms FOR DELETE
  USING (auth.uid() IS NOT NULL);