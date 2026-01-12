-- Drop existing policies to avoid conflicts (if they exist)
DROP POLICY IF EXISTS "Authenticated users can view repository files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload repository files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update repository files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete repository files" ON storage.objects;

-- Recreate secure policies for authenticated users only
CREATE POLICY "Authenticated users can view repository files"
ON storage.objects FOR SELECT
USING (bucket_id = 'repository-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload repository files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'repository-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update repository files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'repository-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete repository files"
ON storage.objects FOR DELETE
USING (bucket_id = 'repository-files' AND auth.role() = 'authenticated');