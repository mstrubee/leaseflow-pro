
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  parent_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read org_members"
  ON public.org_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage org_members"
  ON public.org_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.org_member_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id UUID NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_member_id, contract_id)
);

ALTER TABLE public.org_member_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read org_member_contracts"
  ON public.org_member_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage org_member_contracts"
  ON public.org_member_contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
