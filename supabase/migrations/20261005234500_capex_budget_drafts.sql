-- Herramienta de planificación "Presupuesto CAPEX año siguiente" (/capex):
-- un borrador por año, previo a que el presupuesto sea oficial/aprobado
-- (eso sigue siendo capex_approved_budgets). Mientras está en estado
-- 'borrador' todos los montos se recalculan en vivo en la pantalla; al
-- "Cerrar Presupuesto" se congela un snapshot (para que el histórico no
-- cambie después aunque los datos subyacentes -- contratos, ítems -- sigan
-- moviéndose) y el borrador pasa a 'cerrado' (ya no editable).
CREATE TABLE public.capex_budget_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'cerrado')),
  -- Snapshot de los totales y desgloses al momento del cierre (objetivo,
  -- arrastre, a_pedir, contratos de arrastre, ítems informativos valorizados).
  -- Null mientras el borrador sigue abierto.
  snapshot JSONB,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.capex_budget_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view capex_budget_drafts"
  ON public.capex_budget_drafts FOR SELECT USING (true);

CREATE POLICY "Admins can manage capex_budget_drafts"
  ON public.capex_budget_drafts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Valorización manual de los Ítems de Presupuesto informativos (línea de
-- tiempo general de /reports, tabla gantt_overview_budget_items) para que
-- puedan sumarse al Objetivo de un año de planificación: se ingresan en
-- superficie + UF/m2 (igual criterio que el canon de un contrato), y el
-- monto se expresa siempre en CLP (superficie * valor_uf_m2 * UF del día),
-- nunca en UF. Ambas columnas nullable -- un ítem sin valorizar simplemente
-- no aporta monto al Objetivo todavía.
ALTER TABLE public.gantt_overview_budget_items
  ADD COLUMN superficie_m2 NUMERIC,
  ADD COLUMN valor_uf_m2 NUMERIC;
