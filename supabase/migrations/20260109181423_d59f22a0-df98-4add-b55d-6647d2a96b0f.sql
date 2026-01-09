-- Create table for multiple notices per contract version
CREATE TABLE public.version_notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES public.contract_versions(id) ON DELETE CASCADE,
  notice_type TEXT NOT NULL CHECK (notice_type IN ('meses', 'fecha')),
  notice_value TEXT NOT NULL,
  notice_bilaterality TEXT DEFAULT 'unilateral_gp' CHECK (notice_bilaterality IN ('unilateral_gp', 'bilateral')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.version_notices ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all authenticated users for now, since contracts don't have user ownership)
CREATE POLICY "Allow all operations on version_notices"
ON public.version_notices
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_version_notices_version_id ON public.version_notices(version_id);