
-- Create many-to-many table for org member <-> company assignments
CREATE TABLE public.org_member_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_member_id UUID NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_member_id, company_id)
);

-- Enable RLS
ALTER TABLE public.org_member_companies ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as org_member_contracts)
CREATE POLICY "Authenticated users can view org member companies"
ON public.org_member_companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert org member companies"
ON public.org_member_companies FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete org member companies"
ON public.org_member_companies FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Make company_id nullable on org_members (no longer required since companies are in separate table)
ALTER TABLE public.org_members ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.org_members ALTER COLUMN company_id SET DEFAULT NULL;

-- Migrate existing company_id data to the new table
INSERT INTO public.org_member_companies (org_member_id, company_id)
SELECT id, company_id FROM public.org_members WHERE company_id IS NOT NULL
ON CONFLICT DO NOTHING;
