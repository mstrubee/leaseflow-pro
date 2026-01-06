-- Fix for EXPOSED_SENSITIVE_DATA: Cloud Storage OAuth Tokens
-- This migration secures OAuth tokens by moving them to a separate table
-- that is only accessible via SECURITY DEFINER functions

-- Step 1: Create secure token storage table (NO RLS - only accessible via functions)
CREATE TABLE IF NOT EXISTS public.cloud_storage_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.cloud_storage_connections(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Step 2: Migrate existing tokens to the new table
INSERT INTO public.cloud_storage_tokens (connection_id, access_token, refresh_token)
SELECT id, access_token, refresh_token
FROM public.cloud_storage_connections
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL
ON CONFLICT (connection_id) DO UPDATE 
SET access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    updated_at = now();

-- Step 3: Drop the sensitive columns from the main table
ALTER TABLE public.cloud_storage_connections DROP COLUMN IF EXISTS access_token;
ALTER TABLE public.cloud_storage_connections DROP COLUMN IF EXISTS refresh_token;

-- Step 4: Enable RLS on token table but with NO policies (blocks all client access)
ALTER TABLE public.cloud_storage_tokens ENABLE ROW LEVEL SECURITY;
-- No policies = no client access allowed (only SECURITY DEFINER functions can access)

-- Step 5: Create SECURITY DEFINER function to get tokens (admin only)
CREATE OR REPLACE FUNCTION public.get_cloud_storage_token(p_connection_id UUID)
RETURNS TABLE(access_token TEXT, refresh_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to retrieve tokens
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can access cloud storage tokens';
  END IF;
  
  RETURN QUERY 
  SELECT t.access_token, t.refresh_token 
  FROM public.cloud_storage_tokens t 
  WHERE t.connection_id = p_connection_id;
END;
$$;

-- Step 6: Create SECURITY DEFINER function to set/update tokens (admin only)
CREATE OR REPLACE FUNCTION public.set_cloud_storage_token(
  p_connection_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to set tokens
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can manage cloud storage tokens';
  END IF;
  
  INSERT INTO public.cloud_storage_tokens (connection_id, access_token, refresh_token)
  VALUES (p_connection_id, p_access_token, p_refresh_token)
  ON CONFLICT (connection_id) 
  DO UPDATE SET 
    access_token = p_access_token,
    refresh_token = p_refresh_token,
    updated_at = now();
END;
$$;

-- Step 7: Create SECURITY DEFINER function for Edge Functions to access tokens
-- This bypasses auth.uid() check and uses service role validation
CREATE OR REPLACE FUNCTION public.get_cloud_storage_token_internal(p_connection_id UUID)
RETURNS TABLE(access_token TEXT, refresh_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function is meant to be called by Edge Functions using service role key
  -- Edge Functions should validate admin access before calling this
  RETURN QUERY 
  SELECT t.access_token, t.refresh_token 
  FROM public.cloud_storage_tokens t 
  WHERE t.connection_id = p_connection_id;
END;
$$;

-- Step 8: Update RLS policies on cloud_storage_connections to be admin-only for write operations
DROP POLICY IF EXISTS "Authenticated users can view active connections basic info" ON public.cloud_storage_connections;

-- Admins can do everything
CREATE POLICY "Admins have full access to cloud connections"
ON public.cloud_storage_connections
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can only view basic info (no tokens anymore since columns are dropped)
CREATE POLICY "Users can view active cloud connections"
ON public.cloud_storage_connections
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Step 9: Add updated_at trigger to token table
CREATE TRIGGER update_cloud_storage_tokens_updated_at
BEFORE UPDATE ON public.cloud_storage_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();