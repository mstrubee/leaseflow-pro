-- Create table for notice ranges (multiple month ranges for contract termination notice)
CREATE TABLE public.notice_ranges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES public.contract_versions(id) ON DELETE CASCADE,
  start_month INTEGER NOT NULL,
  end_month INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_range CHECK (start_month <= end_month AND start_month >= 1)
);

-- Enable RLS
ALTER TABLE public.notice_ranges ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow all for authenticated users on notice_ranges" 
ON public.notice_ranges 
FOR ALL 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_notice_ranges_version_id ON public.notice_ranges(version_id);