-- Add "Adicional por administración" percentage field
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS adicional_administracion_percentage numeric NULL;

-- Add extended common expenses calculation fields
ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS gastos_comunes_uf_ml_frente numeric NULL;

ALTER TABLE public.contract_versions 
ADD COLUMN IF NOT EXISTS gastos_comunes_prorrata_kwh_clima numeric NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.contract_versions.adicional_administracion_percentage IS 'Porcentaje adicional por administración sobre el canon de arriendo en curso';
COMMENT ON COLUMN public.contract_versions.gastos_comunes_uf_ml_frente IS 'Gastos comunes en UF por metro lineal de frente';
COMMENT ON COLUMN public.contract_versions.gastos_comunes_prorrata_kwh_clima IS 'Gastos comunes por prorrata KWH clima en UF';