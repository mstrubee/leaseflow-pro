
-- ============ POIs ============
CREATE TABLE IF NOT EXISTS public.pois (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  color TEXT,
  icon TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_layer TEXT,
  folder_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pois_user_id ON public.pois(user_id);
CREATE INDEX IF NOT EXISTS idx_pois_source_layer ON public.pois(source_layer);
CREATE INDEX IF NOT EXISTS idx_pois_deleted_at ON public.pois (deleted_at);
CREATE INDEX IF NOT EXISTS idx_pois_folder ON public.pois(folder_id);
CREATE INDEX IF NOT EXISTS idx_pois_user_active_created
  ON public.pois (user_id, created_at DESC, id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pois_user_trashed_deleted
  ON public.pois (user_id, deleted_at DESC, id)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pois_user_folder
  ON public.pois (user_id, folder_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.pois ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pois"
  ON public.pois FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own pois"
  ON public.pois FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pois"
  ON public.pois FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own pois"
  ON public.pois FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_pois_updated_at
  BEFORE UPDATE ON public.pois
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ POI Folders ============
CREATE TABLE IF NOT EXISTS public.poi_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.poi_folders(id) ON DELETE CASCADE,
  color TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_folders_user ON public.poi_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_poi_folders_parent ON public.poi_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_poi_folders_deleted_at ON public.poi_folders (deleted_at);
CREATE INDEX IF NOT EXISTS idx_poi_folders_user_parent
  ON public.poi_folders (user_id, parent_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.poi_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own folders"
  ON public.poi_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own folders"
  ON public.poi_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own folders"
  ON public.poi_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own folders"
  ON public.poi_folders FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_poi_folders_updated_at
  BEFORE UPDATE ON public.poi_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FK pois.folder_id -> poi_folders
ALTER TABLE public.pois
  ADD CONSTRAINT pois_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES public.poi_folders(id) ON DELETE SET NULL;

-- Anti-ciclos en jerarquía
CREATE OR REPLACE FUNCTION public.enforce_folder_max_depth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  cur UUID;
  hops INT := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A folder cannot be its own parent';
  END IF;
  cur := NEW.parent_id;
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'Folder hierarchy cannot contain cycles';
    END IF;
    hops := hops + 1;
    IF hops > 1000 THEN
      RAISE EXCEPTION 'Folder hierarchy too deep (>1000 levels)';
    END IF;
    SELECT parent_id INTO cur FROM public.poi_folders WHERE id = cur;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_poi_folders_max_depth
  BEFORE INSERT OR UPDATE ON public.poi_folders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_folder_max_depth();

-- Purga papelera 30 días
CREATE OR REPLACE FUNCTION public.purge_deleted_pois()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pois
   WHERE deleted_at IS NOT NULL AND deleted_at < (now() - interval '30 days');
  DELETE FROM public.poi_folders
   WHERE deleted_at IS NOT NULL AND deleted_at < (now() - interval '30 days');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_pois() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_pois() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_pois() FROM authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-deleted-pois-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-deleted-pois-daily',
  '17 3 * * *',
  $$ SELECT public.purge_deleted_pois(); $$
);

-- ============ Drive sync metadata ============
CREATE TABLE IF NOT EXISTS public.geoloc_drive_sync (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  root_folder_drive_id TEXT,
  pois_file_drive_id TEXT,
  folders_file_drive_id TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.geoloc_drive_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own drive sync"
  ON public.geoloc_drive_sync FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert their own drive sync"
  ON public.geoloc_drive_sync FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own drive sync"
  ON public.geoloc_drive_sync FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_geoloc_drive_sync_updated_at
  BEFORE UPDATE ON public.geoloc_drive_sync
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
