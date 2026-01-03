-- Add alternative methodology for gastos comunes calculation
-- This allows calculating based on percentage of total common expenses with a cap

ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS gastos_comunes_methodology text DEFAULT 'uf_m2',
ADD COLUMN IF NOT EXISTS gastos_comunes_percentage numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gastos_comunes_total_centro numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS gastos_comunes_tope numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.contract_versions.gastos_comunes_methodology IS 'Methodology for calculating common expenses: uf_m2 (traditional) or percentage (of total common expenses)';
COMMENT ON COLUMN public.contract_versions.gastos_comunes_percentage IS 'Percentage of total common expenses when using percentage methodology';
COMMENT ON COLUMN public.contract_versions.gastos_comunes_total_centro IS 'Total common expenses of the commercial center in UF';
COMMENT ON COLUMN public.contract_versions.gastos_comunes_tope IS 'Maximum cap for common expenses in UF when using percentage methodology';