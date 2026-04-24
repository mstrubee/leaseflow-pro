-- Tabla de reuniones de Atención Especial
CREATE TABLE public.special_attention_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  pdf_url TEXT,
  pdf_path TEXT,
  snapshot JSONB,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.special_attention_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view meetings"
  ON public.special_attention_meetings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert meetings"
  ON public.special_attention_meetings FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update meetings"
  ON public.special_attention_meetings FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Admins can delete meetings"
  ON public.special_attention_meetings FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_sa_meetings_date ON public.special_attention_meetings (meeting_date DESC);

-- Tabla de participantes
CREATE TABLE public.special_attention_meeting_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.special_attention_meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.special_attention_meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view participants"
  ON public.special_attention_meeting_participants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert participants"
  ON public.special_attention_meeting_participants FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update participants"
  ON public.special_attention_meeting_participants FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated can delete participants"
  ON public.special_attention_meeting_participants FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_sa_meeting_participants_mid ON public.special_attention_meeting_participants (meeting_id);

-- Política de Storage para PDFs de reuniones (bucket repository-files ya existe y es público)
CREATE POLICY "Authenticated can upload meeting PDFs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'repository-files' AND (storage.foldername(name))[1] = 'special-attention-meetings');

CREATE POLICY "Admins can delete meeting PDFs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'repository-files' AND (storage.foldername(name))[1] = 'special-attention-meetings' AND public.has_role(auth.uid(), 'admin'));