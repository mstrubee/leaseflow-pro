-- Presupuesto Operativo (GGCC/Fondo de Promoción/Otros) para los Ítems de
-- Presupuesto informativos (gantt_overview_budget_items) -- igual que ya
-- existe para contratos "Nuevo" en capex_new_location_budget, pero acá se
-- guarda directo en la fila del ítem (no hay variación por año: se aplica
-- igual a partir de su fecha, en ambos años de la planificación). Se
-- ingresan siempre en UF (ggcc_uf_m2 multiplicado por superficie_m2, que ya
-- existe; fondo_promocion_uf/otros_uf como monto mensual plano en UF) y se
-- convierten a CLP con la UF del día al mostrarse -- nunca se persiste en
-- CLP. No incluye Arriendo: estos ítems son solo informativos, sin canon.
ALTER TABLE public.gantt_overview_budget_items
  ADD COLUMN ggcc_uf_m2 NUMERIC,
  ADD COLUMN fondo_promocion_uf NUMERIC,
  ADD COLUMN otros_uf NUMERIC;
