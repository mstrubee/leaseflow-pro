-- Año sugerido manualmente SOLO para contratos sin cronograma Gantt: un
-- contrato sin Gantt no puede repartir su CAPEX entre dos años (todo cae en
-- un solo año, vía el badge de Comité GP o el campo "Año" manual -- ver
-- contractYearAmounts en CapexDashboard.tsx), por lo que nunca puede
-- aparecer en "Arrastre" (que exige CAPEX != 0 en ambos años). Este campo
-- permite indicar manualmente a qué año atribuir el monto completo, desde
-- la sección "Contratos con Estado de Avance incompleto" del diálogo de
-- planificación de presupuesto. A diferencia de capex_year_override (que
-- anula incluso un Gantt ya cargado), este hint SOLO se usa mientras el
-- contrato no tenga Gantt -- apenas se cargue uno, se ignora solo y el
-- monto vuelve a derivarse de las fechas reales de desembolso.
ALTER TABLE public.contracts
  ADD COLUMN capex_no_gantt_year_hint INT NULL;
