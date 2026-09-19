-- Permite "duplicar" un contrato entre dos o más empresas en el dashboard de
-- CAPEX (/capex), cada copia con su propio % del CAPEX total del contrato y
-- su propio flag de exclusión -- ej. el contrato "Parral" aparece como una
-- línea en "Autoplanet" con 80% y otra en "Agroplanet" con 20%, con las
-- mismas fechas/timing (no se duplica ni cambia el Gantt, solo el monto).
--
-- Funcionalidad GENERAL, reutilizable para cualquier contrato futuro: un
-- contrato SIN filas acá se sigue mostrando exactamente igual que hoy (una
-- sola línea agrupada por contract_companies) -- cero regresión. Un
-- contrato CON una o más filas acá se muestra dividido según esas filas en
-- vez de agruparse por contract_companies.
--
-- No valida que la suma de percentage de las filas de un mismo contrato dé
-- 100% -- responsabilidad de quien cargue los datos.
CREATE TABLE public.capex_company_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  percentage NUMERIC NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  -- Igual que contracts.excluded_from_capex_dashboard, pero por copia: excluir
  -- la copia de Autoplanet no afecta la copia de Agroplanet del mismo contrato.
  excluded_from_capex_dashboard BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_company_splits ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que capex_clasificacion_types: SELECT abierto, escritura solo
-- para admins.
CREATE POLICY "Anyone can view capex_company_splits"
  ON public.capex_company_splits FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_company_splits"
  ON public.capex_company_splits FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
