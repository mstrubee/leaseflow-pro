import { supabase } from "@/integrations/supabase/client";
import { calculateEndDate } from "@/lib/ganttDateUtils";
import { format } from "date-fns";

interface ScheduleMaintenanceTaskParams {
  contractId: string;
  formId: string;
  /** Tarea ya vinculada a este form (maintenance_forms.gantt_task_id) — si
   *  existe, se actualiza en vez de crear una nueva, para no duplicar cada
   *  vez que se reprograma el mismo form. */
  existingTaskId: string | null;
  name: string;
  startDate: string; // yyyy-MM-dd
  durationDays: number;
}

/**
 * Encuentra (o crea) el cronograma de mantenciones del contrato (categoría
 * "maintenance" en gantt_timelines — la misma tabla que usa el Gantt de
 * contratos, separada del cronograma principal) y crea o actualiza una tarea
 * en él a partir de los datos de un form de mantención. Se usa desde el botón
 * "Programar" del listado de /maintenance y desde su diálogo de edición.
 */
export async function scheduleMaintenanceTask({
  contractId,
  formId,
  existingTaskId,
  name,
  startDate,
  durationDays,
}: ScheduleMaintenanceTaskParams): Promise<{ taskId: string } | { error: string }> {
  const endDate = format(calculateEndDate(startDate, durationDays, "calendar", []), "yyyy-MM-dd");

  if (existingTaskId) {
    const { error } = await supabase
      .from("gantt_tasks")
      .update({ name, start_date: startDate, end_date: endDate, duration_days: durationDays })
      .eq("id", existingTaskId);
    if (error) return { error: error.message };
    return { taskId: existingTaskId };
  }

  // Buscar el cronograma de mantenciones del contrato; si no existe, crearlo.
  const { data: existingTimeline, error: findError } = await supabase
    .from("gantt_timelines")
    .select("id")
    .eq("contract_id", contractId)
    .eq("category", "maintenance")
    .limit(1)
    .maybeSingle();
  if (findError) return { error: findError.message };

  let timelineId = existingTimeline?.id as string | undefined;

  if (!timelineId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newTimeline, error: createError } = await supabase
      .from("gantt_timelines")
      .insert({
        contract_id: contractId,
        name: "Cronograma de Mantenciones",
        category: "maintenance",
        created_by: user?.id,
      })
      .select("id")
      .single();
    if (createError || !newTimeline) return { error: createError?.message || "No se pudo crear el cronograma de mantenciones" };
    timelineId = newTimeline.id;
  }

  const { data: siblings } = await supabase
    .from("gantt_tasks")
    .select("display_order")
    .eq("timeline_id", timelineId)
    .is("parent_id", null);
  const maxOrder = siblings && siblings.length > 0 ? Math.max(...siblings.map((s) => s.display_order ?? 0)) : -1;

  const { data: newTask, error: taskError } = await supabase
    .from("gantt_tasks")
    .insert({
      timeline_id: timelineId,
      parent_id: null,
      name,
      start_date: startDate,
      end_date: endDate,
      duration_days: durationDays,
      duration_type: "calendar",
      display_order: maxOrder + 1,
    })
    .select("id")
    .single();
  if (taskError || !newTask) return { error: taskError?.message || "No se pudo crear la tarea" };

  const { error: linkError } = await supabase
    .from("maintenance_forms")
    .update({ gantt_task_id: newTask.id })
    .eq("id", formId);
  if (linkError) return { error: linkError.message };

  return { taskId: newTask.id };
}
