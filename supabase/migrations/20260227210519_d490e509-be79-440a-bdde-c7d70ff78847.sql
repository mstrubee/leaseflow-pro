
ALTER TABLE public.patent_kpi_config 
ADD COLUMN checklist_item_id UUID REFERENCES public.patent_checklist_items(id) ON DELETE SET NULL;
