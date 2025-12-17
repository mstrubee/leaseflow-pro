-- Add notice bilaterality to contract_versions
ALTER TABLE public.contract_versions
ADD COLUMN IF NOT EXISTS notice_bilaterality text DEFAULT 'unilateral_gp';

-- Create termination_notices table
CREATE TABLE public.termination_notices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  notice_type text NOT NULL CHECK (notice_type IN ('sent', 'received')),
  notice_date date NOT NULL,
  document_url text,
  drive_file_id text,
  storage_provider text DEFAULT 'local',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.termination_notices ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Authenticated users can manage termination notices"
ON public.termination_notices
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);