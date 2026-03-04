
ALTER TABLE public.special_attention_checklist
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.special_attention_checklist(id) ON DELETE SET NULL;
