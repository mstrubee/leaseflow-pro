-- Add required_exit_date column to termination_notices
ALTER TABLE public.termination_notices 
ADD COLUMN IF NOT EXISTS required_exit_date date NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.termination_notices.required_exit_date IS 'Fecha de salida requerida que modifica la fecha de término del contrato';

-- Create index for faster queries on exit dates
CREATE INDEX IF NOT EXISTS idx_termination_notices_exit_date 
ON public.termination_notices(required_exit_date) 
WHERE required_exit_date IS NOT NULL;