import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  duration_days: number;
  duration_type: "calendar" | "business";
  progress: number;
  status: "pending" | "in_progress" | "completed" | "delayed";
  has_lag: boolean;
  lag_days: number;
  lag_type: "calendar" | "business";
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

export interface GanttTimeline {
  id: string;
  contract_id: string;
  name: string;
  template_id: string | null;
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

export function useGantt(contractId: string) {
  const { toast } = useToast();
  const [timeline, setTimeline] = useState<GanttTimeline | null>(null);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [templates, setTemplates] = useState<GanttTemplate[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setLoading(true);
    try {
      // Check if timeline exists for this contract
      const { data: timelineData, error: timelineError } = await supabase
        .from("gantt_timelines")
        .select("*")
        .eq("contract_id", contractId)
        .maybeSingle();

      if (timelineError) throw timelineError;

      if (timelineData) {
        setTimeline(timelineData);

        // Load tasks
        const { data: tasksData, error: tasksError } = await supabase
          .from("gantt_tasks")
          .select("*")
          .eq("timeline_id", timelineData.id)
          .order("display_order");

        if (tasksError) throw tasksError;

        // Load dependencies
        const { data: depsData } = await supabase
          .from("gantt_task_dependencies")
          .select("*");

        // Load purchase order relations
        const { data: poData } = await supabase
          .from("gantt_task_purchase_orders")
          .select(`
            *,
            purchase_order:purchase_orders (
              id, order_number, amount_uf, supplier_name
            )
          `);

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
  }, [contractId, toast]);

  useEffect(() => {
    loadTimeline();
    loadHolidays();
    loadTemplates();
    loadOrgMembers();
  }, [loadTimeline, loadHolidays, loadTemplates, loadOrgMembers]);

  const createTimeline = async (name: string, templateId?: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: newTimeline, error } = await supabase
        .from("gantt_timelines")
        .insert({
          contract_id: contractId,
          name,
          template_id: templateId || null,
          created_by: user?.id,
        })
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

      await loadTimeline();
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

    // Load template dependencies
    const { data: templateDeps } = await supabase
      .from("gantt_template_dependencies")
      .select("*");

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
      duration_days: tt.default_duration_days || 1,
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
          duration_days: options.duration_days || 1,
          duration_type: options.duration_type || "calendar",
          start_date: options.start_date || null,
          end_date: options.end_date || null,
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

      if (hasChildren(id)) {
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
      } else {
        // Leaf: snap to the latest date implied by all predecessors.
        const deps = t.dependencies || [];
        let latest: Date | null = null;
        for (const dep of deps) {
          compute(dep.depends_on_task_id);
          const candidate = dependencyDate(dep);
          if (!candidate) continue;
          if (!latest || candidate > latest) latest = candidate;
        }
        if (latest) {
          latest = clamp(latest);
          start = format(latest, "yyyy-MM-dd");
          end = format(
            calculateEndDate(
              start,
              t.duration_days || 1,
              (t.duration_type as "calendar" | "business") || "calendar",
              holidays,
            ),
            "yyyy-MM-dd",
          );
        } else {
          // No resolvable predecessor: keep the stored anchor date.
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


  const updateTask = async (
    taskId: string,
    updates: Partial<GanttTask>,
    options?: { skipPropagation?: boolean; breakDependencies?: boolean }
  ) => {
    const scheduleRelevant =
      updates.start_date !== undefined ||
      updates.end_date !== undefined ||
      updates.duration_days !== undefined ||
      updates.duration_type !== undefined ||
      updates.parent_id !== undefined;

    // 1) Compute the full schedule synchronously from in-memory state (instant).
    let cascade = new Map<string, Partial<GanttTask>>();
    if (scheduleRelevant && !options?.skipPropagation) {
      const seed = new Map<string, Partial<GanttTask>>([[taskId, updates]]);
      cascade = computeScheduleDiff(tasks, seed);
    }

    const persistedTaskUpdates = { ...updates, ...(cascade.get(taskId) || {}) } as Partial<GanttTask>;

    // 2) Optimistic local update FIRST — edited task + all dependents at once.
    //    The UI reflects the change immediately; DB writes happen afterwards.
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          return { ...t, ...persistedTaskUpdates, ...(options?.breakDependencies ? { dependencies: [] } : {}) };
        }
        if (cascade.has(t.id)) return { ...t, ...cascade.get(t.id)! };
        return t;
      })
    );

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
            supabase.from("gantt_tasks").update(u as any).eq("id", id)
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
  };

  // Snapshot de la última eliminación para poder deshacer (Ctrl/Cmd+Z)
  const lastDeletedRef = useRef<{ tasks: any[]; deps: any[] } | null>(null);

  const pickTaskCols = (t: GanttTask) => ({
    id: t.id, timeline_id: t.timeline_id, parent_id: t.parent_id, template_task_id: t.template_task_id,
    name: t.name, start_date: t.start_date, end_date: t.end_date, duration_days: t.duration_days,
    duration_type: t.duration_type, progress: t.progress, status: t.status, has_lag: t.has_lag,
    lag_days: t.lag_days, lag_type: t.lag_type, notes: t.notes, color: t.color, display_order: t.display_order,
    responsible_member_id: t.responsible_member_id, origin: t.origin,
  });

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
    lastDeletedRef.current = { tasks: snapTasks, deps: snapDeps };

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

  const undoDelete = async () => {
    const snap = lastDeletedRef.current;
    if (!snap || snap.tasks.length === 0) return;
    lastDeletedRef.current = null;

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

  const addDependency = async (
    taskId: string,
    dependsOnTaskId: string,
    options?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }
  ) => {
    setSaving(true);
    try {
      const dependentTask = tasks.find(t => t.id === taskId);
      const parentTask = tasks.find(t => t.id === dependsOnTaskId);

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
      const tasksWithNewDependency = tasks.map((t) =>
        t.id === taskId
          ? { ...t, dependencies: [...(t.dependencies || []), insertedDep] }
          : t,
      );
      const scheduleDiff = computeScheduleDiff(tasksWithNewDependency, new Map(), tasks);

      // Optimistic local update — no loadTimeline needed.
      setTasks(prev => prev.map(t => {
        const dateUpdates = scheduleDiff.get(t.id) || {};
        if (t.id !== taskId) return Object.keys(dateUpdates).length > 0 ? { ...t, ...dateUpdates } : t;
        return { ...t, ...dateUpdates, dependencies: [...(t.dependencies || []), insertedDep] };
      }));

      if (scheduleDiff.size > 0) {
        const results = await Promise.all(
          Array.from(scheduleDiff.entries()).map(([id, u]) =>
            supabase.from("gantt_tasks").update(u as any).eq("id", id),
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_task_dependencies")
        .delete()
        .eq("id", dependencyId);

      if (error) throw error;

      // Optimistic local update — remove dep from state without reloading.
      setTasks(prev => prev.map(t => ({
        ...t,
        dependencies: t.dependencies?.filter(d => d.id !== dependencyId),
      })));
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la dependencia",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateDependency = async (
    dependencyId: string,
    updates: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }
  ) => {
    setSaving(true);
    try {
      // Find the dependency to know which dependent task to recalc
      const dependentTask = tasks.find(t => t.dependencies?.some(d => d.id === dependencyId));
      const dep = dependentTask?.dependencies?.find(d => d.id === dependencyId);

      const { error } = await supabase
        .from("gantt_task_dependencies")
        .update(updates as any)
        .eq("id", dependencyId);

      if (error) throw error;

      if (dep && dependentTask) {
        const tasksWithUpdatedDependency = tasks.map((t) => ({
          ...t,
          dependencies: t.dependencies?.map((d) =>
            d.id === dependencyId ? { ...d, ...updates } : d,
          ),
        }));
        const scheduleDiff = computeScheduleDiff(tasksWithUpdatedDependency, new Map(), tasks);

        setTasks(prev => prev.map(t => {
          const dateUpdates = scheduleDiff.get(t.id) || {};
          return {
            ...t,
            ...dateUpdates,
            dependencies: t.dependencies?.map(d =>
              d.id === dependencyId ? { ...d, ...updates } : d
            ),
          };
        }));

        if (scheduleDiff.size > 0) {
          const results = await Promise.all(
            Array.from(scheduleDiff.entries()).map(([id, u]) =>
              supabase.from("gantt_tasks").update(u as any).eq("id", id),
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
          default_duration_days: t.duration_days || 1,
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

  const createTimelineFromCapex = async (name: string) => {
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

      const visibleLines = (lines || []).filter((l) => !l.is_ghost);

      if (visibleLines.length === 0) {
        toast({
          variant: "destructive",
          title: "Sin líneas",
          description: "El presupuesto CAPEX no tiene líneas para importar",
        });
        return null;
      }

      // 3. Create the timeline
      const { data: newTimeline, error: tlErr } = await supabase
        .from("gantt_timelines")
        .insert({
          contract_id: contractId,
          name,
          template_id: null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (tlErr || !newTimeline) throw tlErr || new Error("No se pudo crear la línea de tiempo");

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

      await loadTimeline();
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_timelines")
        .delete()
        .eq("id", timeline.id);
      if (error) throw error;
      toast({ title: "Carta Gantt eliminada", description: "La línea de tiempo y sus tareas fueron eliminadas." });
      setTimeline(null);
      setTasks([]);
      await loadTimeline();
      return true;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la Carta Gantt" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    timeline,
    tasks,
    taskTree,
    holidays,
    templates,
    orgMembers,
    loading,
    saving,
    createTimeline,
    createTimelineFromCapex,
    deleteTimeline,
    addTask,
    updateTask,
    deleteTask,
    undoDelete,
    addDependency,
    removeDependency,
    updateDependency,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    saveAsNewTemplate,
    updateBaseTemplate,
    reload: loadTimeline,
  };
}
