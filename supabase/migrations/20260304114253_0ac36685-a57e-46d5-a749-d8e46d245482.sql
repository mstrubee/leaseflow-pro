
CREATE TABLE public.special_attention_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.special_attention_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage special attention checklist"
ON public.special_attention_checklist
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
