-- Add display_order column to patent_emitters if not exists
ALTER TABLE public.patent_emitters 
ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;