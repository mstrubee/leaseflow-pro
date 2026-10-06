-- Marca qué Estados de Comité GP habilitan a un contrato "En Negociación"
-- para aparecer en el desplegable de "Agregar Ítem" de la Línea de tiempo
-- general de Cartas Gantt (/reports) -- ver GanttOverviewTimeline.tsx. Antes
-- esos ítems se creaban con nombre libre, lo que generaba duplicados cuando
-- el contrato real ya existía (ej. "Chiguayante" apareciendo tanto en
-- Arrastre como en Ítems informativos).
ALTER TABLE public.comite_gp_statuses
  ADD COLUMN is_calendarizable BOOLEAN NOT NULL DEFAULT false;
