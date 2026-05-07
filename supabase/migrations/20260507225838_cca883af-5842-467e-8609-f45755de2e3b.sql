
CREATE TABLE public.geoloc_sync_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT
);

ALTER TABLE public.geoloc_sync_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync requests"
ON public.geoloc_sync_requests FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create sync requests"
ON public.geoloc_sync_requests FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') AND requested_by = auth.uid());

CREATE POLICY "Admins can update sync requests"
ON public.geoloc_sync_requests FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.geoloc_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.geoloc_sync_requests(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  files_updated INT NOT NULL DEFAULT 0,
  files_skipped_protected INT NOT NULL DEFAULT 0,
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT
);

ALTER TABLE public.geoloc_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync log"
ON public.geoloc_sync_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert sync log"
ON public.geoloc_sync_log FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_geoloc_sync_requests_status ON public.geoloc_sync_requests(status, requested_at DESC);
CREATE INDEX idx_geoloc_sync_log_executed ON public.geoloc_sync_log(executed_at DESC);
