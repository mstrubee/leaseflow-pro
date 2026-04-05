-- Add sync_status and synced_at columns to repository_files
ALTER TABLE public.repository_files
  ADD COLUMN IF NOT EXISTS sync_status text,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- Index for efficient querying of pending files
CREATE INDEX IF NOT EXISTS idx_repository_files_sync_pending
  ON public.repository_files (sync_status)
  WHERE drive_file_id IS NULL AND sync_status IS NULL;