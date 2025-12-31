-- Fix: Security Definer View issue
-- Recreate the view with SECURITY INVOKER to use the querying user's permissions

DROP VIEW IF EXISTS cloud_storage_connections_public;

CREATE VIEW cloud_storage_connections_public 
WITH (security_invoker = true) AS
SELECT 
  id, 
  provider, 
  name, 
  folder_url, 
  is_active, 
  created_at, 
  updated_at
FROM cloud_storage_connections
WHERE is_active = true;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON cloud_storage_connections_public TO authenticated;

-- Add a new SELECT policy for authenticated users to read the base table's non-sensitive data
-- This allows the view to work with SECURITY INVOKER
CREATE POLICY "Authenticated users can view active connections basic info"
ON cloud_storage_connections
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);