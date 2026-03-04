
-- Add OT file URL column to maintenance_forms
ALTER TABLE public.maintenance_forms 
ADD COLUMN IF NOT EXISTS ot_file_url text;

-- Create storage bucket for OT files
INSERT INTO storage.buckets (id, name, public)
VALUES ('ot-files', 'ot-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload OT files
CREATE POLICY "Authenticated users can upload OT files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ot-files');

-- Allow authenticated users to read OT files
CREATE POLICY "Authenticated users can read OT files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ot-files');

-- Allow authenticated users to update OT files
CREATE POLICY "Authenticated users can update OT files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ot-files');

-- Allow public read for OT files (since bucket is public)
CREATE POLICY "Public read OT files"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'ot-files');
