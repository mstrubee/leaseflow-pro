import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import { calculateEndDate, applyLag, addBusinessDays } from "@/lib/ganttDateUtils";

export interface GanttTask {
  id: string;
  timeline_id: string;
  parent_id: string | null;
  template_task_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  // Fechas del plan ORIGINAL — se fijan una sola vez al crear la tarea y
  // nunca se tocan después (ni con Reprog., ni arrastrando la barra, ni por
  // cascada de dependencias). Alimentan "% Avance Prog." y la línea azul de
  // la Curva S; start_date/end_date (que sí cambian) alimentan "% Avance
  // Real" y la línea roja.
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  // Ajuste propio (en días calendario) que "Reprog." acumuló para ESTA tarea
  // puntual, independiente de lo que herede en cascada de sus dependencias.
  // La fecha final de una tarea siempre es: fecha "natural" (por dependencia,
  // o su baseline si es un ancla) + este offset — así una corrección manual
  // en una fila dependiente sobrevive aunque su predecesora se reprograme de
  // nuevo más adelante, en vez de perderse al recalcularse desde cero.
  reprog_offset_days: number;
  duration_days: number;
  duration_type: "calendar" | "business";
  progress: number;
  status: "pending" | "in_progress" | "completed" | "delayed" | "discarded";
  has_lag: boolean;
  lag_days: number;
  lag_type: "calendar" | "business";
  // Cómo se evalúan las dependencias cuando hay 2 o más: "all" (esperar todas,
  // usa la fecha de término más tardía) u "any" (primera que finalice, usa la
  // más temprana). Sin efecto con 0 o 1 dependencia.
  dependency_join_mode: "all" | "any";
  // Cuándo se descartó (null si está activa). Al descartar, las dependencias
  // NUNCA se modifican — quedan intactas como referencia histórica ("nublada");
  // el motor de cálculo simplemente trata a la tarea descartada como si tuviera
  // plazo 0, sin afectar a quien dependía de ella más allá de eso.
  discarded_at: string | null;
  notes: string | null;
  color: string | null;
  display_order: number;
  responsible_member_id: string | null;
  origin: "nuevo" | "traslado" | null;
  created_at: string;
  updated_at: string;
  children?: GanttTask[];
  dependencies?: GanttTaskDependency[];
  purchase_orders?: GanttTaskPurchaseOrder[];
}

export interface OrgMember {
  id: string;
  name: string;
  position: string | null;
}

export interface GanttTaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dep_type: "start" | "end";
  lag_days: number;
  lag_type: "calendar" | "business";
  depends_on_task?: GanttTask;
}

// Una entrada del historial de undo (Ctrl+Z) del Gantt. "snapshot" cubre
// ediciones/reordenamientos/dependencias (foto completa de `tasks` antes del
// cambio); "delete" reusa el mismo shape que ya usaba lastDeletedRef.
export type GanttHistoryEntry =
  | { kind: "snapshot"; label: string; before: GanttTask[] }
  | { kind: "delete"; label: string; tasks: any[]; deps: any[] };

export interface GanttTaskPurchaseOrder {
  id: string;
  task_id: string;
  purchase_order_id: string;
  purchase_order?: {
    id: string;
    order_number: string;
    amount_uf: number;
    supplier_name: string | null;
  };
}

export interface CapexBudgetLine {
  id: string;
  parent_id: string | null;
  name: string;
  display_order: number;
}

export interface GanttTimeline {
  id: string;
  contract_id: string | null;
  service_contract_id: string | null;
  name: string;
  template_id: string | null;
  // Cronograma principal del contrato: siempre hay exactamente uno (índice único
  // parcial en DB). Solo un admin puede cambiarlo o eliminarlo.
  is_priority: boolean;
  // "general" (cronograma normal del contrato) o "maintenance" (cronograma de
  // mantenciones del local — sección separada, independiente del principal).
  category: "general" | "maintenance";
  created_at: string;
  updated_at: string;
  tasks?: GanttTask[];
}

export interface GanttTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GanttTemplateTask {
  id: string;
  template_id: string;
  parent_id: string | null;
  name: string;
  default_duration_days: number;
  duration_type: "calendar" | "business";
  display_order: number;
  children?: GanttTemplateTask[];
  dependencies?: { depends_on_task_id: string; lag_days: number; lag_type: string }[];
}

export interface Holiday {
  id: string;
  country: string;
  date: string;
  name: string;
  is_recurring: boolean;
}

export function useGantt(
  contractId: string | null,
  serviceContractId?: string | null,
  category: "general" | "maintenance" = "general",
) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [timeline, setTimeline] = useState<GanttTimeline | null>(null);
  const [timelines, setTimelines] = useState<GanttTimeline[]>([]);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  // Espejo síncrono del estado de tareas. React no actualiza la variable
  // `tasks` (ni el `prev` de un setTasks) entre dos `await` consecutivos, así
  // que cuando el diálogo de dependencias guarda VARIAS dependencias de una
  // sola vez, cada mutación veía el estado previo a las anteriores — y
  // recalculaba la fecha del sucesor ignorando las dependencias recién
  // agregadas (perdiendo la fecha más tardía en modo "esperar todas"). Este
  // ref se actualiza al instante en cada mutación de dependencias, para que
  // la siguiente lea el estado ya con los cambios previos aplicados.
  const tasksRef = useRef<GanttTask[]>([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // Historial de undo (Ctrl+Z), hasta 10 pasos, mezclando ediciones y
  // eliminaciones en el orden real en que ocurrieron. Cada mutator relevante
  // (updateTask, reorderTask, addDependency, removeDependency,
  // updateDependency, deleteTask) empuja una entrada antes de aplicar su
  // cambio. Se limpia al cambiar de cronograma (ver loadTimeline).
  const MAX_GANTT_HISTORY = 10;
  const historyRef = useRef<GanttHistoryEntry[]>([]);
  // Agrupa varias mutaciones seguidas de un mismo gesto (ej. guardar el
  // diálogo de dependencias, o arrastrar una fila que dispara cascada en
  // ancestros) en UNA sola entrada de historial — sin esto, cada `await`
  // interno empujaría su propio snapshot y un solo Ctrl+Z no alcanzaría
  // para deshacer el gesto completo.
  const groupOpenRef = useRef(false);
  const pendingGroupRef = useRef<{ label: string; before: GanttTask[] } | null>(null);

  const pushHistoryEntry = useCallback((entry: GanttHistoryEntry) => {
    historyRef.current.push(entry);
    if (historyRef.current.length > MAX_GANTT_HISTORY) historyRef.current.shift();
  }, []);

  const pushHistory = useCallback((label: string) => {
    if (groupOpenRef.current) return; // el snapshot del grupo ya lo tomó beginUndoGroup
    pushHistoryEntry({ kind: "snapshot", label, before: tasksRef.current });
  }, [pushHistoryEntry]);

  const beginUndoGroup = useCallback((label: string) => {
    if (groupOpenRef.current) return; // no anidar grupos
    pendingGroupRef.current = { label, before: tasksRef.current };
    groupOpenRef.current = true;
  }, []);

  const endUndoGroup = useCallback(() => {
    if (!groupOpenRef.current) return;
    groupOpenRef.current = false;
    const pending = pendingGroupRef.current;
    pendingGroupRef.current = null;
    // Solo se empuja si de verdad cambió algo (referencia distinta = hubo
    // al menos un setTasks nuevo durante el grupo)
    if (pending && pending.before !== tasksRef.current) {
      pushHistoryEntry({ kind: "snapshot", label: pending.label, before: pending.before });
    }
  }, [pushHistoryEntry]);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [templates, setTemplates] = useState<GanttTemplate[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capexLines, setCapexLines] = useState<CapexBudgetLine[]>([]);
  const [capexLinesLoading, setCapexLinesLoading] = useState(false);

  // Vista previa de las líneas CAPEX del contrato, para que el usuario pueda
  // elegir cuáles importar antes de crear el cronograma (ver createTimelineFromCapex).
  const loadCapexLines = useCallback(async () => {
    if (serviceContractId || !contractId) {
      setCapexLines([]);
      return;
    }
    setCapexLinesLoading(true);
    try {
      const { data: capexBudgets } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("budget_type", "capex");
      const budgetIds = (capexBudgets || []).map((b) => b.id);
      if (budgetIds.length === 0) {
        setCapexLines([]);
        return;
      }
      const { data: lines } = await supabase
        .from("budget_lines")
        .select("id, parent_id, name, display_order, is_ghost")
        .in("budget_id", budgetIds)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      setCapexLines((lines || []).filter((l) => !l.is_ghost));
    } finally {
      setCapexLinesLoading(false);
    }
  }, [contractId, serviceContractId]);

  const loadOrgMembers = useCallback(async () => {
    const { data } = await supabase.rpc("get_org_members_basic");
    if (data) setOrgMembers(data as OrgMember[]);
  }, []);

  const loadHolidays = useCallback(async () => {
    const { data } = await supabase
      .from("holidays")
      .select("*")
      .eq("country", "Chile")
      .order("date");
    if (data) setHolidays(data);
  }, []);

  const loadTemplates = useCallback(async () => {
    // Activas = is_active true O null (plantillas antiguas creadas sin el flag).
    // Solo se excluyen las desactivadas explícitamente (is_active = false).
    const { data } = await supabase
      .from("gantt_templates")
      .select("*")
      .or("is_active.is.null,is_active.eq.true")
      .order("name");
    if (data) setTemplates(data);
  }, []);

  const loadTimeline = useCallback(async () => {
    // Un (re)cargado del cronograma invalida cualquier snapshot de undo
    // anterior (podría apuntar a otro timeline, o a un estado ya obsoleto).
    historyRef.current = [];
    groupOpenRef.current = false;
    pendingGroupRef.current = null;
    setLoading(true);
    try {
      // Un contrato puede tener varios cronogramas. Se cargan todos (el
      // principal primero) y se trabaja sobre el seleccionado; si no hay
      // selección explícita, se abre el principal.
      const filterCol = serviceContractId ? "service_contract_id" : "contract_id";
      const filterVal = serviceContractId ?? contractId!;
      const { data: timelineRows, error: timelineError } = await supabase
        .from("gantt_timelines")
        .select("*")
        .eq(filterCol, filterVal)
        .eq("category", category)
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: true });

      if (timelineError) throw timelineError;

      const allTimelines = (timelineRows || []) as GanttTimeline[];
      setTimelines(allTimelines);
      const timelineData =
        (selectedTimelineId && allTimelines.find((t) => t.id === selectedTimelineId)) ||
        allTimelines[0] ||
        null;

      if (timelineData) {
        setTimeline(timelineData);

        // Load tasks
        const { data: tasksData, error: tasksError } = await supabase
          .from("gantt_tasks")
          .select("*")
          .eq("timeline_id", timelineData.id)
          .order("display_order");

        if (tasksError) throw tasksError;

        const taskIds = (tasksData || []).map(t => t.id);

        // Load dependencies — filtrado por las tareas de ESTE cronograma. Sin este
        // filtro, la consulta trae las dependencias de TODOS los contratos del
        // sistema y queda expuesta al límite de 1000 filas de Supabase, que trunca
        // la respuesta en silencio y hace que falten dependencias al abrir/crear
        // un cronograma cuando la cantidad total del sistema se acerca a ese tope.
        const { data: depsData } = taskIds.length > 0
          ? await supabase
              .from("gantt_task_dependencies")
              .select("*")
              .in("task_id", taskIds)
          : { data: [] as any[] };

        // Load purchase order relations
        const { data: poData } = taskIds.length > 0
          ? await supabase
              .from("gantt_task_purchase_orders")
              .select(`
                *,
                purchase_order:purchase_orders (
                  id, order_number, amount_uf, supplier_name
                )
              `)
              .in("task_id", taskIds)
          : { data: [] as any[] };

        // Attach dependencies and POs to tasks
        const tasksWithRelations = (tasksData || []).map(task => ({
          ...task,
          dependencies: depsData?.filter(d => d.task_id === task.id) || [],
          purchase_orders: poData?.filter(po => po.task_id === task.id) || [],
        }));

        // Load tasks exactly as stored. We must NOT recalculate-and-persist the
        // schedule on load: doing so previously ratcheted dates further into the
        // future on every open (circular dependencies never converged), which
        // corrupted the data and froze the browser. The schedule is only
        // recalculated in response to an explicit user edit.
        setTasks(tasksWithRelations as GanttTask[]);
      } else {
        setTimeline(null);
        setTasks([]);
      }
    } catch (error: any) {
      console.error("Error loading timeline:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar la línea de tiempo",
      });
    } finally {
      setLoading(false);
    }
  }, [contractId, serviceContractId, category, selectedTimelineId, toast]);

  // El cronograma (y sus tareas) se recarga al cambiar de contrato o de
  // cronograma seleccionado; los catálogos estáticos solo se cargan una vez.
  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  useEffect(() => {
    loadHolidays();
    loadTemplates();
    loadOrgMembers();
  }, [loadHolidays, loadTemplates, loadOrgMembers]);

  const createTimeline = async (name: string, templateId?: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Los cronogramas nuevos nunca nacen como principal: designar el
      // principal es una acción explícita de un administrador ("Hacer
      // principal"), no algo que se herede ni se asigne automáticamente.
      const timelinePayload = serviceContractId
        ? { service_contract_id: serviceContractId, name, template_id: templateId || null, created_by: user?.id, category }
        : { contract_id: contractId!, name, template_id: templateId || null, created_by: user?.id, category };

      const { data: newTimeline, error } = await supabase
        .from("gantt_timelines")
        .insert(timelinePayload)
        .select()
        .single();

      if (error) throw error;

      // If template selected, copy tasks from template
      if (templateId) {
        await copyTasksFromTemplate(newTimeline.id, templateId);
      }

      toast({
        title: "Línea de tiempo creada",
        description: "La línea de tiempo ha sido creada exitosamente",
      });

      // Abrir el cronograma recién creado (el efecto de carga reacciona al cambio)
      setSelectedTimelineId(newTimeline!.id);
      return newTimeline;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la línea de tiempo",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const copyTasksFromTemplate = async (timelineId: string, templateId: string) => {
    // Load template tasks
    const { data: templateTasks } = await supabase
      .from("gantt_template_tasks")
      .select("*")
      .eq("template_id", templateId)
      .order("display_order");

    if (!templateTasks || templateTasks.length === 0) return;

    type TemplateTaskRow = typeof templateTasks[number] & {
      default_responsible_member_id?: string | null;
      default_origin?: string | null;
    };

    // Load template dependencies — filtrado por las tareas de ESTA plantilla.
    // Sin este filtro, la consulta trae las dependencias de TODAS las plantillas
    // del sistema y queda expuesta al límite de 1000 filas de Supabase.
    const templateTaskIds = templateTasks.map(tt => tt.id);
    const { data: templateDeps } = await supabase
      .from("gantt_template_dependencies")
      .select("*")
      .in("task_id", templateTaskIds);

    // Map to track template_task_id -> new_task_id
    const taskIdMap = new Map<string, string>();

    // First pass: create all tasks without parent_id
    const PARENT_COLORS = [
      "#3b82f6", "#10b981", "#f97316", "#ef4444", "#8b5cf6",
      "#ec4899", "#eab308", "#06b6d4", "#64748b",
    ];
    let colorIdx = 0;
    const tasksToInsert = (templateTasks as TemplateTaskRow[]).map(tt => ({
      timeline_id: timelineId,
      template_task_id: tt.id,
      name: tt.name,
      duration_days: tt.default_duration_days ?? 1,
      duration_type: tt.duration_type,
      display_order: tt.display_order,
      parent_id: null as string | null,
      responsible_member_id: tt.default_responsible_member_id ?? null,
      origin: (tt.default_origin ?? null) as "nuevo" | "traslado" | null,
      // Assign a color only to root (template) tasks. Since parent_id is set in a 2nd pass,
      // tasks that will become children get color=null and inherit from their parent.
      color: tt.parent_id ? null : PARENT_COLORS[(colorIdx++) % PARENT_COLORS.length],
    }));

    const { data: insertedTasks, error } = await supabase
      .from("gantt_tasks")
      .insert(tasksToInsert)
      .select();

    if (error || !insertedTasks) return;

    // Build mapping
    insertedTasks.forEach(task => {
      if (task.template_task_id) {
        taskIdMap.set(task.template_task_id, task.id);
      }
    });

    // Second pass: update parent_id
    for (const tt of templateTasks) {
      if (tt.parent_id) {
        const newTaskId = taskIdMap.get(tt.id);
        const newParentId = taskIdMap.get(tt.parent_id);
        if (newTaskId && newParentId) {
          await supabase
            .from("gantt_tasks")
            .update({ parent_id: newParentId })
            .eq("id", newTaskId);
        }
      }
    }

    // Third pass: create dependencies
    if (templateDeps) {
      const depsToInsert = templateDeps
        .map(dep => {
          const newTaskId = taskIdMap.get(dep.task_id);
          const newDependsOnId = taskIdMap.get(dep.depends_on_task_id);
          if (newTaskId && newDependsOnId) {
            return {
              task_id: newTaskId,
              depends_on_task_id: newDependsOnId,
              dep_type: (dep as any).dep_type ?? "end",
              lag_days: dep.lag_days ?? 0,
              lag_type: dep.lag_type ?? "calendar",
            };
          }
          return null;
        })
        .filter(Boolean);

      if (depsToInsert.length > 0) {
        await supabase
          .from("gantt_task_dependencies")
          .insert(depsToInsert as any);
      }
    }
  };

  const addTask = async (
    name: string,
    parentId: string | null = null,
    options: Partial<GanttTask> = {}
  ) => {
    if (!timeline) return null;

    setSaving(true);
    try {
      // Get max display_order for siblings
      const siblings = tasks.filter(t => t.parent_id === parentId);
      const maxOrder = siblings.length > 0
        ? Math.max(...siblings.map(t => t.display_order))
        : -1;

      // Auto-assign a color to root (parent) tasks if none provided.
      // Children leave color null → they inherit the parent color via getEffectiveColor.
      const PARENT_COLORS = [
        "#3b82f6", "#10b981", "#f97316", "#ef4444", "#8b5cf6",
        "#ec4899", "#eab308", "#06b6d4", "#64748b",
      ];
      let assignedColor: string | null = (options as any).color ?? null;
      if (parentId === null && !assignedColor) {
        const usedColors = new Set(
          tasks.filter((t) => t.parent_id === null && t.color).map((t) => t.color as string)
        );
        const available = PARENT_COLORS.find((c) => !usedColors.has(c));
        assignedColor =
          available ?? PARENT_COLORS[Math.floor(Math.random() * PARENT_COLORS.length)];
      }

      const { data, error } = await supabase
        .from("gantt_tasks")
        .insert({
          timeline_id: timeline.id,
          parent_id: parentId,
          name,
          display_order: maxOrder + 1,
          duration_days: options.duration_days ?? 1,
          duration_type: options.duration_type || "calendar",
          start_date: options.start_date || null,
          end_date: options.end_date || null,
          // El plan original queda fijado a las fechas con que nace la tarea.
          baseline_start_date: options.start_date || null,
          baseline_end_date: options.end_date || null,
          status: options.status || "pending",
          color: assignedColor,
        })
        .select()
        .single();

      if (error) throw error;

      // Optimistic local insert — avoids full reload that collapses rows / loses scroll
      setTasks((prev) => [
        ...prev,
        { ...(data as any), dependencies: [], purchase_orders: [] } as GanttTask,
      ]);
      return data;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar la tarea",
      });
      // Resync from DB on error
      await loadTimeline();
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Effective (rolled-up) dates for a task: a parent spans from its earliest child
  // to its latest child (recursive); a leaf uses its own stored dates. Ensures a
  // predecessor that is a parent always exposes real dates even if its stored
  // start/end are stale or empty.
  const getEffectiveTaskDates = (
    task: GanttTask,
    allTasks: GanttTask[],
  ): { start: string | null; end: string | null } => {
    const children = allTasks.filter((t) => t.parent_id === task.id);
    if (children.length === 0) {
      return { start: task.start_date, end: task.end_date };
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const c of children) {
      const { start, end } = getEffectiveTaskDates(c, allTasks);
      if (start && (!minStart || start < minStart)) minStart = start;
      if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
    }
    return { start: minStart, end: maxEnd };
  };



  // Recomputes, in memory, the full schedule until it reaches a stable state:
  // - leaf tasks with predecessors snap to the latest valid dependency date;
  // - parent tasks roll up from their children;
  // - tasks depending on parents move when those parent roll-ups change.
  const computeScheduleDiff = (
    sourceTasks: GanttTask[],
    seedUpdates: Map<string, Partial<GanttTask>> = new Map(),
    compareTasks: GanttTask[] = sourceTasks,
    // Tareas que cambiaron de una forma que no es un seed de fecha (cambió su
    // estado, o su propia lista de dependencias) pero que igual pueden
    // arrastrar cascada hacia adelante — ej. la tarea descartada/restaurada,
    // o la que recibió/perdió/editó una dependencia. Arrancan el mismo
    // recorrido hacia adelante que un seed de fecha, sin forzar ellas mismas
    // una fecha manual.
    extraAffectedSeeds: string[] = [],
  ): Map<string, Partial<GanttTask>> => {
    const result = new Map<string, Partial<GanttTask>>();
    const workingTasks = sourceTasks.map((t) => ({
      ...t,
      ...(seedUpdates.get(t.id) || {}),
    }));
    const originalById = new Map(compareTasks.map((t) => [t.id, t]));

    // parent -> children
    const childrenOf = new Map<string, GanttTask[]>();
    for (const t of workingTasks) {
      if (t.parent_id) {
        const arr = childrenOf.get(t.parent_id) || [];
        arr.push(t);
        childrenOf.set(t.parent_id, arr);
      }
    }
    const hasChildren = (id: string) => (childrenOf.get(id)?.length ?? 0) > 0;
    const taskById = new Map(workingTasks.map((t) => [t.id, t]));

    // El tiempo corre hacia adelante: reprogramar (o editar) una tarea solo
    // puede mover lo que viene DESPUÉS de ella (sus dependientes, directos o
    // transitivos, y la línea madre que agrupa sus fechas) — nunca sus
    // predecesoras. "affected" es el conjunto de tareas que esta edición
    // puede legítimamente cambiar; todo lo demás conserva la fecha que ya
    // tenía guardada, SIN volver a derivarla de sus propias dependencias.
    //
    // Esto importa porque el motor es capaz de recalcular cualquier tarea a
    // partir de sus predecesoras en cualquier momento — pero si esa tarea
    // arrastra un desajuste histórico entre su dependencia declarada y su
    // fecha realmente guardada (ej. una dependencia agregada después, sin
    // resincronizar fechas ya fijadas a mano), recalcularla como efecto
    // colateral de una edición ajena "corregiría" ese desajuste en silencio
    // y la movería sin que nadie la haya tocado — exactamente lo reportado
    // ("al reprogramar una fila, se mueven predecesoras que no debían moverse").
    const dependentsOf = new Map<string, string[]>();
    for (const t of workingTasks) {
      for (const dep of t.dependencies || []) {
        const arr = dependentsOf.get(dep.depends_on_task_id) || [];
        arr.push(t.id);
        dependentsOf.set(dep.depends_on_task_id, arr);
      }
    }
    const affected = new Set<string>([...seedUpdates.keys(), ...extraAffectedSeeds]);
    {
      let grew = true;
      while (grew) {
        grew = false;
        for (const id of Array.from(affected)) {
          for (const depId of dependentsOf.get(id) || []) {
            if (!affected.has(depId)) { affected.add(depId); grew = true; }
          }
          const parentId = taskById.get(id)?.parent_id;
          if (parentId && !affected.has(parentId)) { affected.add(parentId); grew = true; }
        }
      }
    }

    // Effective dates, resolved via a single-pass topological evaluation.
    const effStart = new Map<string, string>();
    const effEnd = new Map<string, string>();

    // Horizon safety net: a schedule must never drift far beyond its own start.
    // Even if the data contains an impossible link, dates are clamped so the UI
    // can never blow up trying to render hundreds of years of columns.
    let minAnchor: Date | null = null;
    for (const t of workingTasks) {
      if (t.start_date) {
        const d = parseISO(t.start_date);
        if (!minAnchor || d < minAnchor) minAnchor = d;
      }
    }
    const horizon = minAnchor ? addDays(minAnchor, 365 * 10) : null;
    const clamp = (d: Date): Date => (horizon && d > horizon ? horizon : d);

    const dependencyDate = (dep: GanttTaskDependency): Date | null => {
      const depType = dep.dep_type ?? "end";
      const lag = dep.lag_days ?? 0;
      const lagType = dep.lag_type === "business" ? "business" : "calendar";
      const anchorStr = depType === "start"
        ? effStart.get(dep.depends_on_task_id)
        : effEnd.get(dep.depends_on_task_id);
      if (!anchorStr) return null;
      if (depType === "start") {
        if (lag === 0) return parseISO(anchorStr);
        return lagType === "business"
          ? addBusinessDays(parseISO(anchorStr), lag, holidays)
          : addDays(parseISO(anchorStr), lag);
      }
      return applyLag(anchorStr, lag, lagType, holidays);
    };

    // Topological, cycle-safe resolution. Each task is computed once; predecessors
    // and children are resolved on demand. A node already being visited (a cycle)
    // is broken by returning its current stored value instead of recursing,
    // which guarantees termination even with circular dependencies.
    const resolved = new Set<string>();
    const visiting = new Set<string>();

    const compute = (id: string): { start: string | null; end: string | null } => {
      if (resolved.has(id)) {
        return { start: effStart.get(id) ?? null, end: effEnd.get(id) ?? null };
      }
      const t = taskById.get(id);
      if (visiting.has(id)) {
        // Cycle break: do not recurse further; use whatever is known so far.
        return {
          start: effStart.get(id) ?? t?.start_date ?? null,
          end: effEnd.get(id) ?? t?.end_date ?? null,
        };
      }
      if (!t) return { start: null, end: null };

      visiting.add(id);
      let start: string | null = null;
      let end: string | null = null;

      if (!affected.has(id)) {
        // Fuera del alcance de esta edición (no es la tarea editada, ni su
        // línea madre, ni algo que dependa de ella en cadena): se deja tal
        // cual está guardada, sin recalcular desde sus propias dependencias.
        start = t.start_date;
        end = t.end_date;
      } else if (hasChildren(id)) {
        // Parent: roll up from children.
        let minStart: string | null = null;
        let maxEnd: string | null = null;
        for (const c of childrenOf.get(id) || []) {
          const r = compute(c.id);
          if (r.start && (!minStart || r.start < minStart)) minStart = r.start;
          if (r.end && (!maxEnd || r.end > maxEnd)) maxEnd = r.end;
        }
        start = minStart;
        end = maxEnd;
      } else if (seedUpdates.get(id)?.start_date !== undefined || seedUpdates.get(id)?.end_date !== undefined) {
        // Edición manual DIRECTA de esta tarea (date-picker de Inicio/Término
        // o Plazo) — no es una reprogramación (esa siembra reprog_offset_days,
        // nunca fechas literales) ni una cascada de otra tarea: es fijar el
        // plan a mano. Se respeta la fecha sembrada tal cual, sin derivarla de
        // la dependencia ni del baseline — si no, quedaría descartada en
        // silencio cada vez que esta tarea ya tuviera algún desfase previo
        // (ej. venía de haber sido reprogramada antes), mostrando el cambio
        // como si fuera un atraso en vez de una simple corrección del plan.
        start = t.start_date;
        end = t.end_date;
      } else {
        // Leaf: su fecha "natural" (antes de aplicar su propio offset de
        // Reprog.) sale de sus dependencias si las tiene — con 2+, "all" (por
        // defecto) espera a la más tardía (AND), "any" arranca con la primera
        // que termine, usando la más temprana (OR) — o de su plan original
        // (baseline) si es un ancla sin predecesor resoluble. Sumar SIEMPRE
        // el offset a ese punto fijo (nunca a "donde quedó la última vez") es
        // lo que permite reprogramar la misma fila más de una vez sin que se
        // acumule error, y que el offset propio de una dependiente sobreviva
        // aunque su predecesora se reprograme de nuevo después.
        const deps = t.dependencies || [];
        const joinMode = t.dependency_join_mode === "any" ? "any" : "all";
        let chosen: Date | null = null;
        for (const dep of deps) {
          compute(dep.depends_on_task_id);
          const candidate = dependencyDate(dep);
          if (!candidate) continue;
          if (!chosen) chosen = candidate;
          else if (joinMode === "any" ? candidate < chosen : candidate > chosen) chosen = candidate;
        }

        let naturalStart: Date | null = null;
        let naturalEnd: Date | null = null;
        if (chosen) {
          naturalStart = clamp(chosen);
          // Una tarea descartada "no consume tiempo" para efectos de cálculo — su
          // propia dependencia (nublada, se conserva sin cambios) sigue siendo
          // visible, pero acá se le trata como plazo 0 (fin = inicio) para que
          // quien dependía de ella salte directamente al punto donde ella habría
          // empezado, sin sumar su duración. El desfase declarado hacia SU propia
          // predecesora sí se respeta (compone correctamente cadenas de varias
          // tareas descartadas seguidas).
          const effectiveDuration = t.status === "discarded" ? 0 : (t.duration_days ?? 1);
          naturalEnd = calculateEndDate(
            format(naturalStart, "yyyy-MM-dd"),
            effectiveDuration,
            (t.duration_type as "calendar" | "business") || "calendar",
            holidays,
          );
        } else {
          // Ancla: sin predecesor resoluble, el punto de partida natural es su
          // plan original — si todavía no tiene baseline (tarea recién creada
          // sin fechas propias asignadas), se usa lo que ya tenga guardado.
          const baseS = t.baseline_start_date ?? t.start_date;
          const baseE = t.baseline_end_date ?? t.end_date;
          naturalStart = baseS ? parseISO(baseS) : null;
          naturalEnd = baseE ? parseISO(baseE) : null;
        }

        // El offset propio de Reprog. SOLO corre el Término de esta misma
        // fila — el Inicio nunca lo toca (queda 100% en manos de su
        // dependencia, o fijo en su baseline si es un ancla). Así el origen
        // de cada cambio queda inequívoco: Inicio = lo que le llegó de una
        // dependencia (incluye, en cascada, cualquier offset que haya sumado
        // una predecesora); Término = lo que ESTA fila reprogramó por su
        // cuenta, encima de esa base.
        const offset = t.reprog_offset_days ?? 0;
        if (naturalStart && naturalEnd) {
          start = format(naturalStart, "yyyy-MM-dd");
          end = format(offset !== 0 ? addDays(naturalEnd, offset) : naturalEnd, "yyyy-MM-dd");
        } else {
          start = t.start_date;
          end = t.end_date;
        }
      }

      if (start) effStart.set(id, start);
      if (end) effEnd.set(id, end);
      visiting.delete(id);
      resolved.add(id);
      return { start, end };
    };

    for (const t of workingTasks) compute(t.id);

    // Build date diffs vs the comparison snapshot.
    for (const t of workingTasks) {
      const original = originalById.get(t.id);
      if (!original) continue;
      const s = effStart.get(t.id);
      const e = effEnd.get(t.id);
      if (!s || !e) continue;
      const upd: Partial<GanttTask> = {};
      if (s !== original.start_date) upd.start_date = s;
      if (e !== original.end_date) upd.end_date = e;
      if (hasChildren(t.id)) {
        const dur = differenceInDays(parseISO(e), parseISO(s)) + 1;
        if (dur !== original.duration_days) (upd as Partial<GanttTask>).duration_days = dur;
      }
      if (Object.keys(upd).length > 0) result.set(t.id, upd);
    }

    return result;
  };

  // Cualquier cambio de fecha que NO venga de la columna "Reprog." (edición
  // directa de Inicio/Plazo/Término, cascada por agregar/quitar/editar una
  // dependencia, descartar/restaurar, sync de plantilla) resincroniza el
  // plan original al nuevo valor — nunca debe registrarse como un atraso o
  // adelanto, eso es exclusivo de una reprogramación explícita vía "Reprog.".
  // También resetea reprog_offset_days si la tarea traía uno: al fijarse un
  // plan nuevo, cualquier ajuste manual anterior queda absorbido en él.
  const resyncBaseline = (
    currentTasks: GanttTask[],
    id: string,
    upd: Partial<GanttTask>,
  ): Partial<GanttTask> => {
    if (upd.start_date === undefined && upd.end_date === undefined) return upd;
    const current = currentTasks.find((t) => t.id === id);
    if (!current) return upd;
    const newStart = upd.start_date !== undefined ? upd.start_date : current.start_date;
    const newEnd = upd.end_date !== undefined ? upd.end_date : current.end_date;
    if (!newStart && !newEnd) return upd;
    return {
      ...upd,
      baseline_start_date: newStart,
      baseline_end_date: newEnd,
      ...(current.reprog_offset_days ? { reprog_offset_days: 0 } : {}),
    };
  };

  const updateTask = async (
    taskId: string,
    updates: Partial<GanttTask>,
    options?: { skipPropagation?: boolean; breakDependencies?: boolean; isReprogram?: boolean }
  ) => {
    const scheduleRelevant =
      updates.start_date !== undefined ||
      updates.end_date !== undefined ||
      updates.duration_days !== undefined ||
      updates.duration_type !== undefined ||
      updates.parent_id !== undefined ||
      updates.dependency_join_mode !== undefined ||
      updates.reprog_offset_days !== undefined;

    // Undo: solo fechas/plazo/posición/nombre entran al historial -- status,
    // progreso, color, notas o responsable quedan afuera a propósito (no
    // pedidos, y evita ensuciar los 10 pasos con toggles de estado).
    if (scheduleRelevant || updates.name !== undefined) pushHistory("Editar tarea");

    // Estado más fresco (ver nota en tasksRef): garantiza que si esta llamada
    // llega justo después de agregar dependencias en el mismo guardado por
    // lotes del diálogo (ej. al cambiar además el modo "esperar todas"), el
    // recálculo vea todas esas dependencias ya aplicadas.
    const baseTasks = tasksRef.current;

    // 1) Compute the full schedule synchronously from in-memory state (instant).
    let cascade = new Map<string, Partial<GanttTask>>();
    if (scheduleRelevant && !options?.skipPropagation) {
      const seed = new Map<string, Partial<GanttTask>>([[taskId, updates]]);
      cascade = computeScheduleDiff(baseTasks, seed);
    }

    // Política de baseline según el origen del cambio de fecha:
    // - "Reprog." (isReprogram=true) es una reprogramación EXPLÍCITA — el plan
    //   original nunca se toca (solo se captura la primera vez, si la tarea
    //   nació sin fechas). Así el atraso/adelanto queda medible para siempre.
    // - Cualquier otra edición de fecha/plazo (date-picker, duración, arrastre,
    //   cascada disparada por una de estas) NO es una reprogramación: es fijar
    //   o corregir el plan, así que el nuevo valor pasa a ser el plan original.
    const applyBaselinePolicy = (id: string, upd: Partial<GanttTask>): Partial<GanttTask> => {
      if (options?.isReprogram) {
        if (upd.start_date === undefined && upd.end_date === undefined) return upd;
        const current = baseTasks.find((t) => t.id === id);
        if (!current || current.baseline_start_date) return upd;
        const newStart = upd.start_date !== undefined ? upd.start_date : current.start_date;
        const newEnd = upd.end_date !== undefined ? upd.end_date : current.end_date;
        if (!newStart && !newEnd) return upd;
        return { ...upd, baseline_start_date: newStart, baseline_end_date: newEnd };
      }
      return resyncBaseline(baseTasks, id, upd);
    };

    const persistedTaskUpdates = applyBaselinePolicy(
      taskId,
      { ...updates, ...(cascade.get(taskId) || {}) } as Partial<GanttTask>,
    );

    // 2) Optimistic local update FIRST — edited task + all dependents at once.
    //    The UI reflects the change immediately; DB writes happen afterwards.
    const nextTasks = baseTasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, ...persistedTaskUpdates, ...(options?.breakDependencies ? { dependencies: [] } : {}) };
      }
      if (cascade.has(t.id)) return { ...t, ...applyBaselinePolicy(t.id, cascade.get(t.id)!) };
      return t;
    });
    tasksRef.current = nextTasks;
    setTasks(nextTasks);

    // 3) Persist in the background (the edited task + dependents in parallel).
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_tasks")
        .update(persistedTaskUpdates as any)
        .eq("id", taskId);
      if (error) throw error;

      if (options?.breakDependencies) {
        await supabase
          .from("gantt_task_dependencies")
          .delete()
          .eq("task_id", taskId);
      }

      if (cascade.size > 0) {
        const results = await Promise.all(
          Array.from(cascade.entries()).filter(([id]) => id !== taskId).map(([id, u]) =>
            supabase.from("gantt_tasks").update(applyBaselinePolicy(id, u) as any).eq("id", id)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar la tarea",
      });
      // Resync from DB on error
      await loadTimeline();
    } finally {
      setSaving(false);
    }
    // Se retorna el cascade para que quien llamó (ej. el input de "Reprog.") sepa
    // qué otras tareas dependientes también cambiaron de fecha y en cuánto.
    return cascade;
  };

  const pickTaskCols = (t: GanttTask) => ({
    id: t.id, timeline_id: t.timeline_id, parent_id: t.parent_id, template_task_id: t.template_task_id,
    name: t.name, start_date: t.start_date, end_date: t.end_date, duration_days: t.duration_days,
    duration_type: t.duration_type, progress: t.progress, status: t.status, has_lag: t.has_lag,
    lag_days: t.lag_days, lag_type: t.lag_type, notes: t.notes, color: t.color, display_order: t.display_order,
    responsible_member_id: t.responsible_member_id, origin: t.origin,
    dependency_join_mode: t.dependency_join_mode,
    discarded_at: t.discarded_at,
    // Antes faltaban estas 3 -- deshacer una eliminación o una edición de
    // fecha dejaba baseline/offset desincronizados en la DB (aunque
    // start_date/end_date se restauraran bien), lo que podía corromper el
    // próximo cálculo de cascada (ver política de baseline en updateTask).
    baseline_start_date: t.baseline_start_date, baseline_end_date: t.baseline_end_date,
    reprog_offset_days: t.reprog_offset_days,
  });

  // Columnas de gantt_tasks que le importan al diff de undo (todas las de
  // pickTaskCols salvo id/timeline_id, que nunca cambian por edición).
  const GANTT_TASK_DIFF_COLS = [
    "parent_id", "template_task_id", "name", "start_date", "end_date", "duration_days",
    "duration_type", "progress", "status", "has_lag", "lag_days", "lag_type", "notes", "color",
    "display_order", "responsible_member_id", "origin", "dependency_join_mode", "discarded_at",
    "baseline_start_date", "baseline_end_date", "reprog_offset_days",
  ] as const;

  const deleteTask = async (taskId: string) => {
    // ids a eliminar: la tarea + sus descendientes (la BD cascada; lo replicamos local)
    const collectIds = (id: string): string[] => {
      const kids = tasks.filter((t) => t.parent_id === id);
      return [id, ...kids.flatMap((k) => collectIds(k.id))];
    };
    const ids = collectIds(taskId);
    const idsToRemove = new Set(ids);

    // Snapshot para deshacer: filas de tareas + sus dependencias (cascada de la BD)
    const snapTasks = tasks.filter((t) => idsToRemove.has(t.id)).map(pickTaskCols);
    let snapDeps: any[] = [];
    try {
      const list = ids.join(",");
      const { data } = await (supabase as any)
        .from("gantt_task_dependencies")
        .select("id, task_id, depends_on_task_id, dep_type, lag_days, lag_type")
        .or(`task_id.in.(${list}),depends_on_task_id.in.(${list})`);
      snapDeps = data ?? [];
    } catch { /* sin deps */ }
    pushHistoryEntry({ kind: "delete", label: "Eliminar tarea", tasks: snapTasks, deps: snapDeps });

    // Actualización local optimista (instantánea, sin recargar la sección)
    setTasks((prev) => prev.filter((t) => !idsToRemove.has(t.id)));

    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_tasks")
        .delete()
        .eq("id", taskId);
      if (error) throw error;
      toast({ title: "Tarea eliminada", description: "Pulsa Ctrl+Z (Cmd+Z) para deshacer" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la tarea",
      });
      await loadTimeline(); // resync solo si falló
    } finally {
      setSaving(false);
    }
  };

  // Restaura una entrada kind:"delete" (misma lógica que antes tenía undoDelete).
  const restoreDeletedSnapshot = async (snap: { tasks: any[]; deps: any[] }) => {
    if (snap.tasks.length === 0) return;

    // 1) Restaurar en el estado local de inmediato (sin recargar la sección)
    const nowIso = new Date().toISOString();
    const restored = snap.tasks.map((t) => ({
      ...t,
      children: [],
      dependencies: [] as any[],
      purchase_orders: [],
      created_at: nowIso,
      updated_at: nowIso,
    })) as unknown as GanttTask[];
    setTasks((prev) => {
      const all = [...prev, ...restored];
      if (snap.deps.length === 0) return all;
      const depsByOwner = new Map<string, any[]>();
      for (const d of snap.deps) {
        const arr = depsByOwner.get(d.task_id) || [];
        arr.push(d);
        depsByOwner.set(d.task_id, arr);
      }
      return all.map((t) => {
        const add = depsByOwner.get(t.id);
        if (!add) return t;
        const merged = [...(t.dependencies || [])];
        for (const d of add) if (!merged.some((x) => x.id === d.id)) merged.push(d as any);
        return { ...t, dependencies: merged };
      });
    });

    // 2) Persistir en segundo plano
    setSaving(true);
    try {
      // Re-insertar tareas SIN parent_id (preservando ids; evita conflictos de FK)
      const noParent = snap.tasks.map((t) => ({ ...t, parent_id: null }));
      const { error: insErr } = await supabase.from("gantt_tasks").insert(noParent as any);
      if (insErr) throw insErr;
      for (const t of snap.tasks) {
        if (t.parent_id) {
          await supabase.from("gantt_tasks").update({ parent_id: t.parent_id }).eq("id", t.id);
        }
      }
      if (snap.deps.length > 0) {
        await supabase.from("gantt_task_dependencies").insert(snap.deps as any);
      }
      toast({ title: "Eliminación deshecha" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo deshacer la eliminación" });
      await loadTimeline(); // resync solo si falló
    } finally {
      setSaving(false);
    }
  };

  // Restaura una entrada kind:"snapshot" (edición de fecha/nombre/orden o
  // dependencias): compara la foto de "antes" contra el estado actual, y
  // escribe en Supabase solo lo que efectivamente cambió.
  const restoreSnapshot = async (before: GanttTask[]) => {
    const current = tasksRef.current;
    const beforeById = new Map(before.map((t) => [t.id, t]));
    const currentById = new Map(current.map((t) => [t.id, t]));

    // 1) Restauración optimista local, antes de escribir en Supabase
    tasksRef.current = before;
    setTasks(before);

    // 2) Persistir en segundo plano solo lo que cambió
    setSaving(true);
    try {
      for (const [id, prevTask] of beforeById) {
        const curTask = currentById.get(id);
        if (!curTask) continue; // la tarea no existía en el estado actual (fuera de alcance: creación de tareas)

        const changed: Record<string, unknown> = {};
        for (const col of GANTT_TASK_DIFF_COLS) {
          if ((prevTask as any)[col] !== (curTask as any)[col]) changed[col] = (prevTask as any)[col];
        }
        if (Object.keys(changed).length > 0) {
          const { error } = await supabase.from("gantt_tasks").update(changed as any).eq("id", id);
          if (error) throw error;
        }

        const prevDeps = prevTask.dependencies || [];
        const curDeps = curTask.dependencies || [];
        const prevDepIds = new Set(prevDeps.map((d) => d.id));
        const curDepIds = new Set(curDeps.map((d) => d.id));

        for (const d of prevDeps) {
          if (!curDepIds.has(d.id)) {
            const { error } = await supabase.from("gantt_task_dependencies").insert({
              id: d.id, task_id: d.task_id, depends_on_task_id: d.depends_on_task_id,
              dep_type: d.dep_type, lag_days: d.lag_days, lag_type: d.lag_type,
            } as any);
            if (error) throw error;
          }
        }
        for (const d of curDeps) {
          if (!prevDepIds.has(d.id)) {
            const { error } = await supabase.from("gantt_task_dependencies").delete().eq("id", d.id);
            if (error) throw error;
          }
        }
        for (const d of prevDeps) {
          const cur = curDeps.find((c) => c.id === d.id);
          if (cur && (cur.dep_type !== d.dep_type || cur.lag_days !== d.lag_days || cur.lag_type !== d.lag_type)) {
            const { error } = await supabase.from("gantt_task_dependencies")
              .update({ dep_type: d.dep_type, lag_days: d.lag_days, lag_type: d.lag_type } as any)
              .eq("id", d.id);
            if (error) throw error;
          }
        }
      }
      toast({ title: "Cambio deshecho" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo deshacer el cambio" });
      await loadTimeline(); // resync solo si falló
    } finally {
      setSaving(false);
    }
  };

  // Deshacer general (Ctrl/Cmd+Z): saca la última entrada del historial y la
  // despacha según su tipo. Bloqueado mientras `saving` es true, para no
  // pisar una escritura en curso del cambio original con la del undo.
  const undoLastChange = async () => {
    if (saving) return;
    const entry = historyRef.current.pop();
    if (!entry) return;
    if (entry.kind === "delete") {
      await restoreDeletedSnapshot(entry);
    } else {
      await restoreSnapshot(entry.before);
    }
  };

  const addDependency = async (
    taskId: string,
    dependsOnTaskId: string,
    options?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }
  ) => {
    pushHistory("Agregar dependencia");
    setSaving(true);
    try {
      // Estado más fresco (incluye dependencias agregadas en llamadas previas
      // del mismo guardado por lotes del diálogo).
      const baseTasks = tasksRef.current;
      const dependentTask = baseTasks.find(t => t.id === taskId);
      const parentTask = baseTasks.find(t => t.id === dependsOnTaskId);

      if (!dependentTask || !parentTask) {
        throw new Error("Tarea no encontrada");
      }

      const dep_type = options?.dep_type ?? "end";
      const lag_days = options?.lag_days ?? 0;
      const lag_type = options?.lag_type ?? "calendar";

      const { data: inserted, error } = await supabase
        .from("gantt_task_dependencies")
        .insert({
          task_id: taskId,
          depends_on_task_id: dependsOnTaskId,
          dep_type,
          lag_days,
          lag_type,
        } as any)
        .select("id, task_id, depends_on_task_id, dep_type, lag_days, lag_type")
        .single();

      if (error) throw error;

      const insertedDep = inserted as GanttTaskDependency;
      const tasksWithNewDependency = baseTasks.map((t) =>
        t.id === taskId
          ? { ...t, dependencies: [...(t.dependencies || []), insertedDep] }
          : t,
      );
      const scheduleDiff = computeScheduleDiff(tasksWithNewDependency, new Map(), baseTasks, [taskId]);

      // Optimistic local update — no loadTimeline needed. Se actualiza tasksRef
      // de forma síncrona para que una llamada posterior del mismo lote vea ya
      // esta dependencia (y su recálculo) aplicados.
      const nextTasks = tasksWithNewDependency.map(t => {
        const dateUpdates = resyncBaseline(baseTasks, t.id, scheduleDiff.get(t.id) || {});
        return Object.keys(dateUpdates).length > 0 ? { ...t, ...dateUpdates } : t;
      });
      tasksRef.current = nextTasks;
      setTasks(nextTasks);

      if (scheduleDiff.size > 0) {
        const results = await Promise.all(
          Array.from(scheduleDiff.entries()).map(([id, u]) =>
            supabase.from("gantt_tasks").update(resyncBaseline(baseTasks, id, u) as any).eq("id", id),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }

      toast({
        title: "Dependencia creada",
        description: `"${dependentTask.name}" ahora depende de "${parentTask.name}"`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar la dependencia",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeDependency = async (dependencyId: string) => {
    pushHistory("Quitar dependencia");
    setSaving(true);
    try {
      // Estado más fresco (ver nota en tasksRef).
      const baseTasks = tasksRef.current;
      // Identify which task owns this dependency before deleting it.
      const ownerTask = baseTasks.find((t) =>
        t.dependencies?.some((d) => d.id === dependencyId),
      );

      const { error } = await supabase
        .from("gantt_task_dependencies")
        .delete()
        .eq("id", dependencyId);

      if (error) throw error;

      // Build the post-deletion state: only the targeted relationship is removed,
      // every other dependency stays intact.
      const tasksAfter = baseTasks.map((t) => ({
        ...t,
        dependencies: t.dependencies?.filter((d) => d.id !== dependencyId),
      }));

      // When a leaf task loses ALL of its dependencies it must fall back to
      // "no automatic scheduling": clear its computed start/end so the user can
      // assign a new dependency or a manual start date. computeScheduleDiff keeps
      // stored anchors for depless leaves, so we clear them explicitly here.
      const seed = new Map<string, Partial<GanttTask>>();
      const forcedClears = new Map<string, Partial<GanttTask>>();
      if (ownerTask) {
        const remaining =
          tasksAfter.find((t) => t.id === ownerTask.id)?.dependencies || [];
        const isLeaf = !tasksAfter.some((t) => t.parent_id === ownerTask.id);
        if (remaining.length === 0 && isLeaf) {
          seed.set(ownerTask.id, { start_date: null, end_date: null });
          forcedClears.set(ownerTask.id, { start_date: null, end_date: null });
        }
      }

      // Recalculate the whole schedule from the remaining dependencies.
      const scheduleDiff = computeScheduleDiff(tasksAfter, seed, baseTasks, ownerTask ? [ownerTask.id] : []);
      // computeScheduleDiff never emits null clears, so merge them in by hand.
      for (const [id, upd] of forcedClears) {
        scheduleDiff.set(id, { ...(scheduleDiff.get(id) || {}), ...upd });
      }

      // Optimistic local update — remove dep and apply recomputed dates.
      // tasksAfter ya tiene la dependencia quitada; se aplican los diffs de
      // fecha encima y se sincroniza tasksRef para el resto del lote.
      const nextTasks = tasksAfter.map((t) => {
        const dateUpdates = resyncBaseline(baseTasks, t.id, scheduleDiff.get(t.id) || {});
        return Object.keys(dateUpdates).length > 0 ? { ...t, ...dateUpdates } : t;
      });
      tasksRef.current = nextTasks;
      setTasks(nextTasks);

      if (scheduleDiff.size > 0) {
        const results = await Promise.all(
          Array.from(scheduleDiff.entries()).map(([id, u]) =>
            supabase.from("gantt_tasks").update(resyncBaseline(baseTasks, id, u) as any).eq("id", id),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la dependencia",
      });
      await loadTimeline(); // resync solo si falló
    } finally {
      setSaving(false);
    }
  };


  const updateDependency = async (
    dependencyId: string,
    updates: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }
  ) => {
    pushHistory("Editar dependencia");
    setSaving(true);
    try {
      // Estado más fresco (ver nota en tasksRef).
      const baseTasks = tasksRef.current;
      // Find the dependency to know which dependent task to recalc
      const dependentTask = baseTasks.find(t => t.dependencies?.some(d => d.id === dependencyId));
      const dep = dependentTask?.dependencies?.find(d => d.id === dependencyId);

      const { error } = await supabase
        .from("gantt_task_dependencies")
        .update(updates as any)
        .eq("id", dependencyId);

      if (error) throw error;

      if (dep && dependentTask) {
        const tasksWithUpdatedDependency = baseTasks.map((t) => ({
          ...t,
          dependencies: t.dependencies?.map((d) =>
            d.id === dependencyId ? { ...d, ...updates } : d,
          ),
        }));
        const scheduleDiff = computeScheduleDiff(tasksWithUpdatedDependency, new Map(), baseTasks, [dependentTask.id]);

        const nextTasks = tasksWithUpdatedDependency.map(t => {
          const dateUpdates = resyncBaseline(baseTasks, t.id, scheduleDiff.get(t.id) || {});
          return Object.keys(dateUpdates).length > 0 ? { ...t, ...dateUpdates } : t;
        });
        tasksRef.current = nextTasks;
        setTasks(nextTasks);

        if (scheduleDiff.size > 0) {
          const results = await Promise.all(
            Array.from(scheduleDiff.entries()).map(([id, u]) =>
              supabase.from("gantt_tasks").update(resyncBaseline(baseTasks, id, u) as any).eq("id", id),
            ),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) throw failed.error;
        }
      }

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar la dependencia" });
    } finally {
      setSaving(false);
    }
  };

  // Ids de todos los descendientes (recursivo) de una tarea, según el árbol actual.
  const getDescendantIds = (taskId: string, all: GanttTask[]): string[] => {
    const direct = all.filter((t) => t.parent_id === taskId);
    return direct.flatMap((c) => [c.id, ...getDescendantIds(c.id, all)]);
  };

  // Cuántos descendientes tiene una tarea — usado por la UI para la
  // confirmación inteligente ("...también descartará N tareas descendientes").
  const getDescendantCount = (taskId: string) => getDescendantIds(taskId, tasks).length;

  // Descarta una tarea y TODA su rama (hijas, nietas, etc. — recursivo). No se
  // elimina ni se pierde información: las dependencias declaradas se
  // conservan intactas en gantt_task_dependencies (quedan visibles como
  // referencia histórica/"nublada"). El motor de cálculo (computeScheduleDiff)
  // trata a una tarea descartada como si tuviera plazo 0 — no aporta tiempo a
  // quien dependía de ella, que salta directo a donde ella habría empezado —
  // sin modificar ninguna fila de dependencias. Todo se aplica de forma
  // optimista sobre el estado en memoria (sin recargar la página, sin perder
  // scroll/ramas expandidas/selección/foco) y se persiste en segundo plano.
  const discardTask = async (taskId: string) => {
    const idsToDiscard = [taskId, ...getDescendantIds(taskId, tasks)];
    setSaving(true);
    try {
      const discardedAt = new Date().toISOString();
      const applyStatus = (t: GanttTask): GanttTask =>
        idsToDiscard.includes(t.id) ? { ...t, status: "discarded", discarded_at: discardedAt } : t;

      const nextTasks = tasks.map(applyStatus);
      const diff = computeScheduleDiff(nextTasks, new Map(), tasks, idsToDiscard);

      setTasks((prev) =>
        prev.map((t) => {
          const withStatus = applyStatus(t);
          const dateUpd = diff.get(t.id);
          return dateUpd ? { ...withStatus, ...resyncBaseline(tasks, t.id, dateUpd) } : withStatus;
        }),
      );

      const { error: statusErr } = await supabase
        .from("gantt_tasks")
        .update({ status: "discarded", discarded_at: discardedAt })
        .in("id", idsToDiscard);
      if (statusErr) throw statusErr;

      if (diff.size > 0) {
        const results = await Promise.all(
          Array.from(diff.entries()).map(([id, u]) => supabase.from("gantt_tasks").update(resyncBaseline(tasks, id, u) as any).eq("id", id)),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }

      const descendantCount = idsToDiscard.length - 1;
      toast({
        title: "Tarea descartada",
        description: descendantCount > 0
          ? `Se descartaron ${idsToDiscard.length} tareas (la tarea y ${descendantCount} descendiente${descendantCount === 1 ? "" : "s"}). No participan en el cálculo y pueden restaurarse en cualquier momento.`
          : "Ya no participa en el cálculo del cronograma. Puede restaurarse en cualquier momento.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo descartar la tarea" });
      await loadTimeline(); // resync solo si falló
    } finally {
      setSaving(false);
    }
  };

  // Restaura una tarea y TODA su rama: vuelven a "Pendiente" y, como las
  // dependencias nunca se tocaron, el cronograma se recalcula automáticamente
  // con la estructura original — no hay nada que reconstruir. Igual que
  // discardTask, todo ocurre en memoria + persistencia dirigida, sin recargar.
  const restoreTask = async (taskId: string) => {
    const idsToRestore = [taskId, ...getDescendantIds(taskId, tasks)];
    setSaving(true);
    try {
      const applyStatus = (t: GanttTask): GanttTask =>
        idsToRestore.includes(t.id) ? { ...t, status: "pending", discarded_at: null } : t;

      const nextTasks = tasks.map(applyStatus);
      const diff = computeScheduleDiff(nextTasks, new Map(), tasks, idsToRestore);

      setTasks((prev) =>
        prev.map((t) => {
          const withStatus = applyStatus(t);
          const dateUpd = diff.get(t.id);
          return dateUpd ? { ...withStatus, ...resyncBaseline(tasks, t.id, dateUpd) } : withStatus;
        }),
      );

      const { error: statusErr } = await supabase
        .from("gantt_tasks")
        .update({ status: "pending", discarded_at: null })
        .in("id", idsToRestore);
      if (statusErr) throw statusErr;

      if (diff.size > 0) {
        const results = await Promise.all(
          Array.from(diff.entries()).map(([id, u]) => supabase.from("gantt_tasks").update(resyncBaseline(tasks, id, u) as any).eq("id", id)),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }

      const descendantCount = idsToRestore.length - 1;
      toast({
        title: "Tarea restaurada",
        description: descendantCount > 0
          ? `Se restauraron ${idsToRestore.length} tareas (la tarea y ${descendantCount} descendiente${descendantCount === 1 ? "" : "s"}) con sus dependencias originales.`
          : "Volvió a \"Pendiente\" con sus dependencias originales.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo restaurar la tarea" });
      await loadTimeline();
    } finally {
      setSaving(false);
    }
  };

  const linkPurchaseOrder = async (taskId: string, purchaseOrderId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_task_purchase_orders")
        .insert({
          task_id: taskId,
          purchase_order_id: purchaseOrderId,
        });

      if (error) throw error;

      toast({
        title: "OC vinculada",
        description: "La orden de compra ha sido vinculada a la tarea",
      });

      await loadTimeline();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo vincular la orden de compra",
      });
    } finally {
      setSaving(false);
    }
  };

  const unlinkPurchaseOrder = async (linkId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_task_purchase_orders")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      await loadTimeline();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo desvincular la orden de compra",
      });
    } finally {
      setSaving(false);
    }
  };

  // Build tree structure from flat tasks
  const buildTaskTree = useCallback((flatTasks: GanttTask[]): GanttTask[] => {
    const taskMap = new Map<string, GanttTask>();
    flatTasks.forEach(task => {
      taskMap.set(task.id, { ...task, children: [] });
    });

    const rootTasks: GanttTask[] = [];
    taskMap.forEach(task => {
      if (task.parent_id && taskMap.has(task.parent_id)) {
        const parent = taskMap.get(task.parent_id)!;
        parent.children = parent.children || [];
        parent.children.push(task);
      } else {
        rootTasks.push(task);
      }
    });

    // Sort children by display_order
    const sortChildren = (tasks: GanttTask[]) => {
      tasks.sort((a, b) => a.display_order - b.display_order);
      tasks.forEach(task => {
        if (task.children && task.children.length > 0) {
          sortChildren(task.children);
        }
      });
    };
    sortChildren(rootTasks);

    return rootTasks;
  }, []);

  const taskTree = buildTaskTree(tasks);

  const reorderTask = async (taskId: string, newIndex: number, siblingIds: string[]) => {
    pushHistory("Reordenar tarea");
    // 1) Actualización local optimista (instantánea, sin recargar toda la sección)
    const orderMap = new Map(siblingIds.map((id, idx) => [id, idx]));
    setTasks((prev) =>
      prev.map((t) => (orderMap.has(t.id) ? { ...t, display_order: orderMap.get(t.id)! } : t)),
    );

    // 2) Persistir en segundo plano, en paralelo
    setSaving(true);
    try {
      const results = await Promise.all(
        siblingIds.map((id, idx) =>
          supabase.from("gantt_tasks").update({ display_order: idx }).eq("id", id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo reordenar la tarea",
      });
      await loadTimeline(); // resync solo si falló
    } finally {
      setSaving(false);
    }
  };

  // Snapshot the current timeline tasks into template tasks (rows in gantt_template_tasks + dependencies)
  const writeTasksToTemplate = async (templateId: string) => {
    // Explicitly delete dependencies first (defensive: in case CASCADE is bypassed by RLS chain)
    // Find all template task ids first, then delete deps referencing them, then delete tasks.
    const { data: existingTaskIds, error: listErr } = await supabase
      .from("gantt_template_tasks")
      .select("id")
      .eq("template_id", templateId);
    if (listErr) throw listErr;

    if (existingTaskIds && existingTaskIds.length > 0) {
      const ids = existingTaskIds.map((r: any) => r.id);
      const { error: depDelErr } = await supabase
        .from("gantt_template_dependencies")
        .delete()
        .in("task_id", ids);
      if (depDelErr) throw depDelErr;

      const { error: taskDelErr } = await supabase
        .from("gantt_template_tasks")
        .delete()
        .in("id", ids);
      if (taskDelErr) throw taskDelErr;

      // Verify the delete actually removed everything (RLS could silently no-op)
      const { count: remaining, error: countErr } = await supabase
        .from("gantt_template_tasks")
        .select("id", { count: "exact", head: true })
        .eq("template_id", templateId);
      if (countErr) throw countErr;
      if ((remaining ?? 0) > 0) {
        throw new Error("No se pudieron eliminar las tareas anteriores de la plantilla (permisos insuficientes)");
      }
    }

    if (tasks.length === 0) return;

    // Build mapping current task id -> new template task id
    const idMap = new Map<string, string>();

    // Insert tasks one by one to guarantee a reliable id mapping (avoids relying on insert(...).select() order)
    for (const t of tasks) {
      const { data: insertedRow, error: insErr } = await supabase
        .from("gantt_template_tasks")
        .insert({
          template_id: templateId,
          parent_id: null,
          name: t.name,
          default_duration_days: t.duration_days ?? 1,
          duration_type: t.duration_type,
          display_order: t.display_order,
          // Guardar responsable y origen en la plantilla (editables luego)
          default_responsible_member_id: (t as any).responsible_member_id ?? null,
          default_origin: (t as any).origin ?? null,
        } as any)
        .select()
        .single();
      if (insErr || !insertedRow) throw insErr || new Error("No se pudo insertar tarea de plantilla");
      idMap.set(t.id, insertedRow.id);
    }

    // Second pass: update parent_id
    for (const t of tasks) {
      if (t.parent_id) {
        const newId = idMap.get(t.id);
        const newParentId = idMap.get(t.parent_id);
        if (newId && newParentId) {
          await supabase
            .from("gantt_template_tasks")
            .update({ parent_id: newParentId })
            .eq("id", newId);
        }
      }
    }

    // Third pass: dependencies
    const deps: { task_id: string; depends_on_task_id: string; dep_type: string; lag_days: number; lag_type: string }[] = [];
    tasks.forEach((t) => {
      (t.dependencies || []).forEach((d) => {
        const a = idMap.get(d.task_id);
        const b = idMap.get(d.depends_on_task_id);
        if (a && b) deps.push({
          task_id: a,
          depends_on_task_id: b,
          dep_type: d.dep_type ?? "end",
          lag_days: d.lag_days ?? 0,
          lag_type: d.lag_type ?? "calendar",
        });
      });
    });
    if (deps.length > 0) {
      await supabase.from("gantt_template_dependencies").insert(deps as any);
    }
  };

  const saveAsNewTemplate = async (name: string, description?: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tpl, error } = await supabase
        .from("gantt_templates")
        .insert({ name, description: description || null, created_by: user?.id, is_active: true })
        .select()
        .single();
      if (error || !tpl) throw error;
      await writeTasksToTemplate(tpl.id);
      toast({ title: "Plantilla creada", description: `Se creó la plantilla "${name}" con el cronograma actual` });
      await loadTemplates();
      return tpl;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo crear la plantilla" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateBaseTemplate = async () => {
    if (!timeline?.template_id) {
      toast({ variant: "destructive", title: "Sin plantilla base", description: "Este cronograma no fue creado a partir de una plantilla" });
      return false;
    }
    setSaving(true);
    try {
      await writeTasksToTemplate(timeline.template_id);
      await supabase.from("gantt_templates").update({ updated_at: new Date().toISOString() }).eq("id", timeline.template_id);
      toast({ title: "Plantilla actualizada", description: "La plantilla base se actualizó con esta versión" });
      await loadTemplates();
      return true;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar la plantilla base" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Actualiza una plantilla A PARTIR del cronograma actual, PRESERVANDO los ids
  // de las tareas-plantilla (a diferencia de writeTasksToTemplate, que borra y
  // recrea). Esto mantiene vivos los vínculos template_task_id de los cronogramas
  // ya derivados. Empareja tarea-plantilla ↔ tarea-cronograma por template_task_id
  // (cronograma derivado) o por nombre + orden (cronograma origen).
  // Solo sincroniza plazos (duraciones) y dependencias con sus características.
  const syncTemplateFromTimeline = async (
    templateId: string
  ): Promise<{ matched: number; total: number } | null> => {
    setSaving(true);
    try {
      const { data: tplTasks, error: tplErr } = await supabase
        .from("gantt_template_tasks")
        .select("id, name, display_order")
        .eq("template_id", templateId);
      if (tplErr) throw tplErr;
      if (!tplTasks || tplTasks.length === 0) {
        toast({ variant: "destructive", title: "Plantilla vacía", description: "La plantilla no tiene tareas para sincronizar." });
        return null;
      }

      // Emparejar templateTaskId -> tarea del cronograma
      const match = new Map<string, GanttTask>();
      const useIdMatch = tasks.some((t) => t.template_task_id);
      if (useIdMatch) {
        const byId = new Map(
          tasks.filter((t) => t.template_task_id).map((t) => [t.template_task_id as string, t])
        );
        for (const tt of tplTasks) {
          const m = byId.get(tt.id);
          if (m) match.set(tt.id, m);
        }
      } else {
        // Cronograma origen: emparejar por nombre, desempatando por display_order.
        const tlByName = new Map<string, GanttTask[]>();
        for (const t of tasks) {
          const arr = tlByName.get(t.name) ?? [];
          arr.push(t);
          tlByName.set(t.name, arr);
        }
        for (const arr of tlByName.values()) arr.sort((a, b) => a.display_order - b.display_order);
        const tplByName = new Map<string, typeof tplTasks>();
        for (const tt of tplTasks) {
          const arr = tplByName.get(tt.name) ?? [];
          arr.push(tt);
          tplByName.set(tt.name, arr);
        }
        for (const [name, tts] of tplByName) {
          const tls = (tlByName.get(name) ?? []).slice().sort((a, b) => a.display_order - b.display_order);
          const sortedTts = tts.slice().sort((a, b) => a.display_order - b.display_order);
          sortedTts.forEach((tt, i) => { if (tls[i]) match.set(tt.id, tls[i]); });
        }
      }

      // Mapa inverso: id de tarea del cronograma -> id de tarea-plantilla
      const tlToTpl = new Map<string, string>();
      for (const [tplId, tl] of match) tlToTpl.set(tl.id, tplId);

      // 1) Plazos: actualizar duraciones de las tareas-plantilla emparejadas
      for (const [tplId, tl] of match) {
        await supabase
          .from("gantt_template_tasks")
          .update({ default_duration_days: tl.duration_days ?? 1, duration_type: tl.duration_type })
          .eq("id", tplId);
      }

      // 2) Dependencias: reconstruir a partir de las del cronograma
      const tplTaskIds = tplTasks.map((t) => t.id);
      const { error: delErr } = await supabase
        .from("gantt_template_dependencies")
        .delete()
        .in("task_id", tplTaskIds);
      if (delErr) throw delErr;

      const newDeps: { task_id: string; depends_on_task_id: string; dep_type: string; lag_days: number; lag_type: string }[] = [];
      for (const t of tasks) {
        for (const d of (t.dependencies || [])) {
          const a = tlToTpl.get(d.task_id);
          const b = tlToTpl.get(d.depends_on_task_id);
          if (a && b) newDeps.push({
            task_id: a,
            depends_on_task_id: b,
            dep_type: d.dep_type ?? "end",
            lag_days: d.lag_days ?? 0,
            lag_type: d.lag_type ?? "calendar",
          });
        }
      }
      if (newDeps.length > 0) {
        const { error: insErr } = await supabase.from("gantt_template_dependencies").insert(newDeps as any);
        if (insErr) throw insErr;
      }

      await supabase.from("gantt_templates").update({ updated_at: new Date().toISOString() }).eq("id", templateId);
      await loadTemplates();
      toast({
        title: "Plantilla actualizada",
        description: `Se sincronizaron dependencias y plazos (${match.size}/${tplTasks.length} tareas emparejadas).`,
      });
      return { matched: match.size, total: tplTasks.length };
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar la plantilla" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Aplica al cronograma actual (derivado) las dependencias y plazos de su
  // plantilla base. Empareja por template_task_id, sobreescribe duraciones y
  // dependencias template-gestionadas, preserva tareas/dependencias manuales
  // que no provienen de la plantilla, y recalcula el cronograma.
  const applyTemplateUpdates = async (): Promise<boolean> => {
    if (!timeline?.template_id) {
      toast({ variant: "destructive", title: "Sin plantilla base", description: "Este cronograma no fue creado a partir de una plantilla." });
      return false;
    }
    setSaving(true);
    try {
      const templateId = timeline.template_id;
      const { data: tplTasks } = await supabase
        .from("gantt_template_tasks")
        .select("id, default_duration_days, duration_type")
        .eq("template_id", templateId);
      if (!tplTasks || tplTasks.length === 0) throw new Error("La plantilla no tiene tareas");

      const tplTaskIds = new Set(tplTasks.map((t) => t.id));
      // Filtrado por las tareas de ESTA plantilla — sin esto la consulta trae las
      // dependencias de TODAS las plantillas del sistema (riesgo de truncado por
      // el límite de 1000 filas de Supabase).
      const { data: tplDeps } = await supabase
        .from("gantt_template_dependencies")
        .select("task_id, depends_on_task_id, dep_type, lag_days, lag_type")
        .in("task_id", tplTasks.map((t) => t.id));
      const durByTpl = new Map(tplTasks.map((t) => [t.id, { d: t.default_duration_days ?? 1, dt: (t.duration_type as "calendar" | "business") }]));
      const tplDepsFiltered = (tplDeps ?? []).filter((d) => tplTaskIds.has(d.task_id) && tplTaskIds.has(d.depends_on_task_id));

      // templateTaskId -> tarea del cronograma actual
      const linkByTpl = new Map<string, GanttTask>();
      for (const t of tasks) if (t.template_task_id && tplTaskIds.has(t.template_task_id)) linkByTpl.set(t.template_task_id, t);
      if (linkByTpl.size === 0) {
        toast({ variant: "destructive", title: "Sin tareas vinculadas", description: "Ninguna tarea de este cronograma está vinculada a la plantilla." });
        return false;
      }
      const linkedTaskIds = new Set(Array.from(linkByTpl.values()).map((t) => t.id));

      // 1) Plazos: actualizar duraciones de las tareas vinculadas
      for (const [tplId, tl] of linkByTpl) {
        const info = durByTpl.get(tplId);
        if (info) await supabase.from("gantt_tasks").update({ duration_days: info.d, duration_type: info.dt }).eq("id", tl.id);
      }

      // 2) Dependencias template-gestionadas (ambos extremos vinculados): borrar y reinsertar
      const linkedIdsArr = Array.from(linkedTaskIds);
      const { error: delErr } = await supabase
        .from("gantt_task_dependencies")
        .delete()
        .in("task_id", linkedIdsArr)
        .in("depends_on_task_id", linkedIdsArr);
      if (delErr) throw delErr;

      const newDeps = tplDepsFiltered
        .map((d) => {
          const a = linkByTpl.get(d.task_id);
          const b = linkByTpl.get(d.depends_on_task_id);
          if (a && b) return {
            task_id: a.id,
            depends_on_task_id: b.id,
            dep_type: d.dep_type ?? "end",
            lag_days: d.lag_days ?? 0,
            lag_type: d.lag_type ?? "calendar",
          };
          return null;
        })
        .filter(Boolean) as { task_id: string; depends_on_task_id: string; dep_type: string; lag_days: number; lag_type: string }[];

      let insertedDeps: GanttTaskDependency[] = [];
      if (newDeps.length > 0) {
        const { data: ins, error: insErr } = await supabase.from("gantt_task_dependencies").insert(newDeps as any).select();
        if (insErr) throw insErr;
        insertedDeps = (ins as GanttTaskDependency[]) ?? [];
      }

      // 3) Reconstruir tareas en memoria (nuevas duraciones + dependencias) para recalcular fechas
      const childIds = new Set(tasks.filter((t) => t.parent_id).map((t) => t.parent_id as string));
      const nextTasks: GanttTask[] = tasks.map((t) => {
        const info = t.template_task_id ? durByTpl.get(t.template_task_id) : null;
        const duration_days = info ? info.d : t.duration_days;
        const duration_type = info ? info.dt : t.duration_type;
        const keep = (t.dependencies || []).filter(
          (d) => !(linkedTaskIds.has(d.task_id) && linkedTaskIds.has(d.depends_on_task_id))
        );
        const added = insertedDeps.filter((d) => d.task_id === t.id);
        return { ...t, duration_days, duration_type, dependencies: [...keep, ...added] };
      });

      // Semilla: recalcular fin de tareas hoja sin predecesores (anclas) según su nueva duración
      const seed = new Map<string, Partial<GanttTask>>();
      for (const t of nextTasks) {
        const isLeaf = !childIds.has(t.id);
        if (isLeaf && (t.dependencies || []).length === 0 && t.start_date) {
          const end = format(
            calculateEndDate(t.start_date, t.duration_days ?? 1, t.duration_type, holidays),
            "yyyy-MM-dd",
          );
          seed.set(t.id, { end_date: end });
        }
      }

      // 4) Recalcular fechas y persistir diffs (comparando contra el estado original)
      // Además del seed (anclas sin dependencias), toda tarea cuya duración
      // cambió por la plantilla o cuyas dependencias se relincaron necesita
      // entrar al recorrido de "afectados" aunque no traiga un seed de fecha.
      const durationOrDepsChangedIds = nextTasks
        .filter((t) => (t.template_task_id && durByTpl.has(t.template_task_id)) || linkedTaskIds.has(t.id))
        .map((t) => t.id);
      const scheduleDiff = computeScheduleDiff(nextTasks, seed, tasks, durationOrDepsChangedIds);
      if (scheduleDiff.size > 0) {
        const results = await Promise.all(
          Array.from(scheduleDiff.entries()).map(([id, u]) => supabase.from("gantt_tasks").update(resyncBaseline(tasks, id, u) as any).eq("id", id))
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }

      await loadTimeline();
      toast({
        title: "Cronograma actualizado",
        description: `Se aplicaron las dependencias y plazos de la plantilla base (${linkByTpl.size} tareas).`,
      });
      return true;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar desde la plantilla" });
      await loadTimeline();
      return false;
    } finally {
      setSaving(false);
    }
  };

  // selectedLineIds: undefined/null = importar todas las líneas (comportamiento
  // por defecto); un array = importar solo esas líneas (línea a línea o por
  // jerarquía, decidido en la UI antes de llamar a esta función).
  const createTimelineFromCapex = async (name: string, selectedLineIds?: string[] | null) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Find CAPEX budgets for this contract
      const { data: capexBudgets, error: budgetsErr } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("budget_type", "capex");
      if (budgetsErr) throw budgetsErr;

      if (!capexBudgets || capexBudgets.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin presupuesto CAPEX",
          description: "Este contrato no tiene un presupuesto CAPEX para importar",
        });
        return null;
      }

      const budgetIds = capexBudgets.map((b) => b.id);

      // 2. Fetch all active CAPEX budget lines preserving hierarchy
      const { data: lines, error: linesErr } = await supabase
        .from("budget_lines")
        .select("id, parent_id, name, display_order, is_ghost")
        .in("budget_id", budgetIds)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      if (linesErr) throw linesErr;

      let visibleLines = (lines || []).filter((l) => !l.is_ghost);

      if (visibleLines.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin líneas",
          description: "El presupuesto CAPEX no tiene líneas para importar",
        });
        return null;
      }

      if (selectedLineIds) {
        const selectedSet = new Set(selectedLineIds);
        visibleLines = visibleLines.filter((l) => selectedSet.has(l.id));
        if (visibleLines.length === 0) {
          toast({
            variant: "destructive",
            title: "Sin líneas seleccionadas",
            description: "Selecciona al menos una línea del presupuesto para importar",
          });
          return null;
        }
      }

      // 3. Create the timeline — nunca nace como principal (ver createTimeline)
      const capexTimelinePayload = serviceContractId
        ? { service_contract_id: serviceContractId, name, template_id: null, created_by: user?.id }
        : { contract_id: contractId!, name, template_id: null, created_by: user?.id };

      const { data: newTimeline, error: tlErr } = await supabase
        .from("gantt_timelines")
        .insert(capexTimelinePayload)
        .select()
        .single();
      if (tlErr) throw tlErr;
      if (!newTimeline) throw new Error("No se pudo crear la línea de tiempo");

      // 4. Insert all tasks first without parent_id, build id mapping
      const idMap = new Map<string, string>();
      for (const line of visibleLines) {
        const { data: insertedTask, error: insErr } = await supabase
          .from("gantt_tasks")
          .insert({
            timeline_id: newTimeline.id,
            parent_id: null,
            name: line.name,
            duration_days: 1,
            duration_type: "calendar",
            display_order: line.display_order ?? 0,
            status: "pending",
          })
          .select()
          .single();
        if (insErr || !insertedTask) throw insErr || new Error("No se pudo insertar tarea");
        idMap.set(line.id, insertedTask.id);
      }

      // 5. Second pass: set parent_id (only when parent was also imported)
      for (const line of visibleLines) {
        if (line.parent_id && idMap.has(line.parent_id)) {
          const newId = idMap.get(line.id)!;
          const newParentId = idMap.get(line.parent_id)!;
          await supabase
            .from("gantt_tasks")
            .update({ parent_id: newParentId })
            .eq("id", newId);
        }
      }

      toast({
        title: "Línea de tiempo creada",
        description: `Se importaron ${visibleLines.length} líneas del presupuesto CAPEX`,
      });

      setSelectedTimelineId(newTimeline.id);
      return newTimeline;
    } catch (error: any) {
      console.error("Error creating timeline from CAPEX:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la línea de tiempo desde CAPEX",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteTimeline = async () => {
    if (!timeline) return false;
    // El cronograma principal solo puede eliminarlo un administrador.
    // La política RLS de DB lo garantiza; este guard da el mensaje claro.
    if (timeline.is_priority && !isAdmin) {
      toast({
        variant: "destructive",
        title: "Cronograma principal protegido",
        description: "Solo un administrador puede eliminar el cronograma principal.",
      });
      return false;
    }
    setSaving(true);
    try {
      // .select() para verificar el borrado real: con RLS, un DELETE sin
      // permiso no arroja error — simplemente elimina 0 filas.
      const { data: deleted, error } = await supabase
        .from("gantt_timelines")
        .delete()
        .eq("id", timeline.id)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin permisos",
          description: "No fue posible eliminar este cronograma (el principal solo puede eliminarlo un administrador).",
        });
        return false;
      }
      // El principal no se hereda: si se elimina (solo un admin puede), el
      // contrato queda sin cronograma principal hasta que un admin designe uno
      // nuevo explícitamente con "Hacer principal".
      toast({ title: "Carta Gantt eliminada", description: "La línea de tiempo y sus tareas fueron eliminadas." });
      setTimeline(null);
      setTasks([]);
      // Volver al principal (o al primero disponible) del contrato
      if (selectedTimelineId) setSelectedTimelineId(null);
      else await loadTimeline();
      return true;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la Carta Gantt" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Cambia cuál cronograma es el principal del contrato. Solo admins: la UI lo
  // restringe y un trigger en DB lo garantiza (protege contra degradar+borrar).
  const setPriorityTimeline = async (timelineId: string) => {
    const current = timelines.find((t) => t.is_priority);
    if (current?.id === timelineId) return true;
    setSaving(true);
    try {
      // Primero degradar el principal actual (el índice único solo admite uno)
      if (current) {
        const { error: demoteErr } = await supabase
          .from("gantt_timelines")
          .update({ is_priority: false })
          .eq("id", current.id);
        if (demoteErr) throw demoteErr;
      }
      const { error } = await supabase
        .from("gantt_timelines")
        .update({ is_priority: true })
        .eq("id", timelineId);
      if (error) {
        // Restaurar el principal anterior si la promoción falló
        if (current) {
          await supabase.from("gantt_timelines").update({ is_priority: true }).eq("id", current.id);
        }
        throw error;
      }
      toast({ title: "Cronograma principal actualizado" });
      await loadTimeline();
      return true;
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cambiar el cronograma principal (requiere permisos de administrador).",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    timeline,
    timelines,
    selectTimeline: setSelectedTimelineId,
    setPriorityTimeline,
    tasks,
    taskTree,
    holidays,
    templates,
    orgMembers,
    loading,
    saving,
    capexLines,
    capexLinesLoading,
    loadCapexLines,
    createTimeline,
    createTimelineFromCapex,
    deleteTimeline,
    addTask,
    updateTask,
    deleteTask,
    undoLastChange,
    beginUndoGroup,
    endUndoGroup,
    addDependency,
    removeDependency,
    updateDependency,
    discardTask,
    restoreTask,
    getDescendantCount,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    saveAsNewTemplate,
    updateBaseTemplate,
    syncTemplateFromTimeline,
    applyTemplateUpdates,
    reload: loadTimeline,
  };
}
