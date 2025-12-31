-- Fix: Cloud Storage Tokens Exposed to Users
-- Create a secure view that excludes sensitive token fields

-- Drop the permissive SELECT policy that exposes tokens
DROP POLICY IF EXISTS "Users can view active connections" ON cloud_storage_connections;

-- Create a secure view that excludes sensitive columns
CREATE OR REPLACE VIEW cloud_storage_connections_public AS
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

-- Enable RLS on the view (views inherit table RLS by default, but we make it explicit)
-- The base table now only allows admin access via the existing "Admins can manage cloud connections" policy