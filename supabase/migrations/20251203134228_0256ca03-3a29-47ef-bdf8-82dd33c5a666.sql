-- Create table for cloud storage connections
CREATE TABLE public.cloud_storage_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox')),
  name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  folder_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cloud_storage_connections ENABLE ROW LEVEL SECURITY;

-- Only admins can manage cloud connections
CREATE POLICY "Admins can manage cloud connections" ON public.cloud_storage_connections
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- All authenticated users can view active connections
CREATE POLICY "Users can view active connections" ON public.cloud_storage_connections
FOR SELECT USING (is_active = true);