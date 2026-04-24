CREATE TABLE public.special_attention_participants_directory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT special_attention_participants_directory_name_role_unique UNIQUE (name, role)
);

ALTER TABLE public.special_attention_participants_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view directory"
ON public.special_attention_participants_directory
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert directory"
ON public.special_attention_participants_directory
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update directory"
ON public.special_attention_participants_directory
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete directory"
ON public.special_attention_participants_directory
FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_special_attention_participants_directory_updated_at
BEFORE UPDATE ON public.special_attention_participants_directory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();