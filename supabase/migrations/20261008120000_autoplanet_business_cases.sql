-- Autoplanet Servicios — Casos de Negocio (negocio B2C de servicios automotrices).
-- Tabla NUEVA e independiente de contract_business_cases: no toca nada de lo existente.
-- Acceso: admin siempre; otros roles solo si tienen el recurso 'autoplanet_servicios'
-- en user_permissions (se habilita desde Admin → Permisos).

CREATE TABLE public.autoplanet_business_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Nuevo caso',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autoplanet_business_cases TO authenticated;
GRANT ALL ON public.autoplanet_business_cases TO service_role;

ALTER TABLE public.autoplanet_business_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autoplanet access can view business cases"
  ON public.autoplanet_business_cases FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'autoplanet_servicios', 'view')
    OR public.has_permission(auth.uid(), 'autoplanet_servicios', 'edit')
  );

CREATE POLICY "Autoplanet editors can create business cases"
  ON public.autoplanet_business_cases FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'autoplanet_servicios', 'edit'));

CREATE POLICY "Autoplanet editors can update business cases"
  ON public.autoplanet_business_cases FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'autoplanet_servicios', 'edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'autoplanet_servicios', 'edit'));

CREATE POLICY "Admins can delete autoplanet business cases"
  ON public.autoplanet_business_cases FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_autoplanet_business_cases_updated_at
  BEFORE UPDATE ON public.autoplanet_business_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
