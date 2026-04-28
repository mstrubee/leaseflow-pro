-- Columnas espejo en pois
ALTER TABLE public.pois
  ADD COLUMN IF NOT EXISTS source_project TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_user_id UUID,
  ADD COLUMN IF NOT EXISTS is_mirror BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pois_source
  ON public.pois (source_project, source_id)
  WHERE source_project IS NOT NULL AND source_id IS NOT NULL;

-- Columnas espejo en poi_folders
ALTER TABLE public.poi_folders
  ADD COLUMN IF NOT EXISTS source_project TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_user_id UUID,
  ADD COLUMN IF NOT EXISTS is_mirror BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_poi_folders_source
  ON public.poi_folders (source_project, source_id)
  WHERE source_project IS NOT NULL AND source_id IS NOT NULL;

-- Mapeo de usuarios entre proyectos
CREATE TABLE IF NOT EXISTS public.geoloc_user_map (
  source_project TEXT NOT NULL,
  source_user_id UUID NOT NULL,
  gplanet_user_id UUID NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_project, source_user_id)
);

ALTER TABLE public.geoloc_user_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user map"
  ON public.geoloc_user_map
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see their own mapping"
  ON public.geoloc_user_map
  FOR SELECT
  USING (auth.uid() = gplanet_user_id);

-- Estado de sincronización
CREATE TABLE IF NOT EXISTS public.geoloc_sync_state (
  source_project TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ,
  last_cursor_pois TIMESTAMPTZ,
  last_cursor_folders TIMESTAMPTZ,
  status TEXT,
  last_error TEXT,
  pois_synced_total BIGINT NOT NULL DEFAULT 0,
  folders_synced_total BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.geoloc_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sync state"
  ON public.geoloc_sync_state
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read sync state"
  ON public.geoloc_sync_state
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.geoloc_sync_state (source_project, status)
VALUES ('geoloc', 'idle')
ON CONFLICT (source_project) DO NOTHING;