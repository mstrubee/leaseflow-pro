
-- Create table for supplier influence zones
CREATE TABLE public.supplier_influence_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  commune TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supplier_influence_zones ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view supplier influence zones"
  ON public.supplier_influence_zones FOR SELECT
  USING (public.has_permission(auth.uid(), 'suppliers', 'view'));

CREATE POLICY "Users can insert supplier influence zones"
  ON public.supplier_influence_zones FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'suppliers', 'edit'));

CREATE POLICY "Users can update supplier influence zones"
  ON public.supplier_influence_zones FOR UPDATE
  USING (public.has_permission(auth.uid(), 'suppliers', 'edit'));

CREATE POLICY "Users can delete supplier influence zones"
  ON public.supplier_influence_zones FOR DELETE
  USING (public.has_permission(auth.uid(), 'suppliers', 'edit'));

-- Index for performance
CREATE INDEX idx_supplier_influence_zones_supplier_id ON public.supplier_influence_zones(supplier_id);
