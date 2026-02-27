
-- Add activity tracking columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS activity_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS current_section text;

-- Enable Realtime for profiles table
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
