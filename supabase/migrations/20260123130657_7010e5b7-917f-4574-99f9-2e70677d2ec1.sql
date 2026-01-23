-- Add quotation file fields to oc_requests table
ALTER TABLE public.oc_requests 
ADD COLUMN IF NOT EXISTS quotation_url TEXT,
ADD COLUMN IF NOT EXISTS quotation_file_name TEXT;