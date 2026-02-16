
-- Table for closing process notes
CREATE TABLE public.closing_process_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.closing_process_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies - authenticated users can read
CREATE POLICY "Authenticated users can view closing notes"
ON public.closing_process_notes FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can insert
CREATE POLICY "Admins can insert closing notes"
ON public.closing_process_notes FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update closing notes"
ON public.closing_process_notes FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete closing notes"
ON public.closing_process_notes FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Index for fast lookups
CREATE INDEX idx_closing_process_notes_contract_id ON public.closing_process_notes(contract_id);

-- Trigger for updated_at
CREATE TRIGGER update_closing_process_notes_updated_at
BEFORE UPDATE ON public.closing_process_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.closing_process_notes;
