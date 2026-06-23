import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, addDays, differenceInDays } from "date-fns";

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

  // Computes, IN MEMORY, the date changes to cascade to all dependent tasks.
  // Uses the dependencies already attached to each in-memory task (t.dependencies),
  // so no DB round-trips are needed — the cascade is instant.
  // Returns a map of taskId -> partial updates.
  const computeDateCascade = (
    allTasks: GanttTask[],
    taskId: string,
    newStartDate: string,
    newEndDate: string,
  ): Map<string, Partial<GanttTask>> => {
    const result = new Map<string, Partial<GanttTask>>();
    const taskById = new Map(allTasks.map((t) => [t.id, t]));

    // Reverse adjacency: predecessorId -> [successorTaskId]
    const successorsOf = new Map<string, string[]>();
    for (const t of allTasks) {
      for (const dep of t.dependencies || []) {
        const arr = successorsOf.get(dep.depends_on_task_id) || [];
        arr.push(t.id);
        successorsOf.set(dep.depends_on_task_id, arr);
      }
    }

    // Effective start/end dates for every task. Seed with current values, then
    // override the edited task with its new dates.
    const effStart = new Map<string, string>();
    const effEnd = new Map<string, string>();
    for (const t of allTasks) {
      if (t.start_date) effStart.set(t.id, t.start_date);
      if (t.end_date) effEnd.set(t.id, t.end_date);
    }
    effStart.set(taskId, newStartDate);
    effEnd.set(taskId, newEndDate);

    // All tasks reachable downstream from the edited task.
    const reachable = new Set<string>();
    const stack = [taskId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const sid of successorsOf.get(id) || []) {
        if (!reachable.has(sid)) {
          reachable.add(sid);
          stack.push(sid);
        }
      }
    }

    // In-degree within the reachable subgraph (predecessors that are the origin
    // or are themselves reachable). Kahn's algorithm guarantees a successor is
    // only computed once ALL its relevant predecessors have been resolved.
    const inDegree = new Map<string, number>();
    for (const sid of reachable) {
      const deps = taskById.get(sid)?.dependencies || [];
      const count = deps.filter(
        (d) => d.depends_on_task_id === taskId || reachable.has(d.depends_on_task_id),
      ).length;
      inDegree.set(sid, count);
    }

    const queue: string[] = [];
    const resolveAndPush = (id: string) => {
      for (const sid of successorsOf.get(id) || []) {
        if (!reachable.has(sid)) continue;
        const rem = (inDegree.get(sid) ?? 1) - 1;
        inDegree.set(sid, rem);
        if (rem <= 0) queue.push(sid);
      }
    };
    resolveAndPush(taskId);

    while (queue.length) {
      const id = queue.shift()!;
      const t = taskById.get(id);
      if (!t) continue;

      // Start at the LATEST date implied across ALL of this task's dependencies.
      let latest: Date | null = null;
      for (const dep of t.dependencies || []) {
        const anchorStr =
          dep.dep_type === "start"
            ? effStart.get(dep.depends_on_task_id)
            : effEnd.get(dep.depends_on_task_id);
        if (!anchorStr) continue;
        const baseOffset = dep.dep_type === "start" ? 0 : 1;
        const candidate = addDays(parseISO(anchorStr), baseOffset + (dep.lag_days ?? 0));
        if (!latest || candidate > latest) latest = candidate;
      }

      if (latest) {
        const duration = t.duration_days || 1;
        const startStr = format(latest, "yyyy-MM-dd");
        const endStr = format(addDays(latest, duration - 1), "yyyy-MM-dd");
        effStart.set(id, startStr);
        effEnd.set(id, endStr);
        if (startStr !== t.start_date || endStr !== t.end_date) {
          result.set(id, { start_date: startStr, end_date: endStr });
        }
      }

      resolveAndPush(id);
    }

    return result;
  };


  const updateTask = async (
    taskId: string,
    updates: Partial<GanttTask>,
    options?: { skipPropagation?: boolean; breakDependencies?: boolean }
  ) => {
    // 1) Compute the dependent cascade synchronously from in-memory state (instant).
    let cascade = new Map<string, Partial<GanttTask>>();
    if ((updates.end_date || updates.start_date) && !options?.skipPropagation) {
      const current = tasks.find((t) => t.id === taskId);
      const startStr = updates.start_date || current?.start_date || updates.end_date!;
      const endStr = updates.end_date || current?.end_date || updates.start_date!;
      cascade = computeDateCascade(tasks, taskId, startStr, endStr);
    }

    // 2) Optimistic local update FIRST — edited task + all dependents at once.
    //    The UI reflects the change immediately; DB writes happen afterwards.
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          return { ...t, ...updates, ...(options?.breakDependencies ? { dependencies: [] } : {}) };
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
        .update(updates as any)
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
          Array.from(cascade.entries()).map(([id, u]) =>
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

      // Compute new start date considering ALL dependencies (including the new one).
      const allDepsWithNew: GanttTaskDependency[] = [
        ...(dependentTask.dependencies || []),
        inserted as GanttTaskDependency,
      ];
      let latestStart: Date | null = null;
      for (const d of allDepsWithNew) {
        const pt = tasks.find(t => t.id === d.depends_on_task_id);
        const anchorStr = d.dep_type === "start" ? pt?.start_date : pt?.end_date;
        if (!anchorStr) continue;
        const anchorDate = parseISO(anchorStr);
        const baseOffset = d.dep_type === "start" ? 0 : 1;
        const candidateStart = addDays(anchorDate, baseOffset + (d.lag_days ?? 0));
        if (!latestStart || candidateStart > latestStart) latestStart = candidateStart;
      }

      let newStartStr = dependentTask.start_date;
      let newEndStr = dependentTask.end_date;
      if (latestStart) {
        const duration = dependentTask.duration_days || 1;
        newStartStr = format(latestStart, "yyyy-MM-dd");
        newEndStr = format(addDays(latestStart, duration - 1), "yyyy-MM-dd");
        await supabase
          .from("gantt_tasks")
          .update({ start_date: newStartStr, end_date: newEndStr })
          .eq("id", taskId);
      }

      // Optimistic local update — no loadTimeline needed.
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          start_date: newStartStr,
          end_date: newEndStr,
          dependencies: [...(t.dependencies || []), inserted as GanttTaskDependency],
        };
      }));

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
        // Recompute start date using ALL dependencies (take the latest anchor).
        const allDeps = dependentTask.dependencies || [];
        let latestStart: Date | null = null;
        for (const d of allDeps) {
          const parentTask = tasks.find(t => t.id === d.depends_on_task_id);
          const dep_type = d.id === dep.id ? (updates.dep_type ?? d.dep_type ?? "end") : (d.dep_type ?? "end");
          const lag_days = d.id === dep.id ? (updates.lag_days ?? d.lag_days ?? 0) : (d.lag_days ?? 0);
          const anchorStr = dep_type === "start" ? parentTask?.start_date : parentTask?.end_date;
          if (!anchorStr) continue;
          const anchorDate = parseISO(anchorStr);
          const baseOffset = dep_type === "start" ? 0 : 1;
          const candidateStart = addDays(anchorDate, baseOffset + lag_days);
          if (!latestStart || candidateStart > latestStart) latestStart = candidateStart;
        }
        if (latestStart) {
          const duration = dependentTask.duration_days || 1;
          const newEndDate = addDays(latestStart, duration - 1);
          const newStartStr = format(latestStart, "yyyy-MM-dd");
          const newEndStr = format(newEndDate, "yyyy-MM-dd");
          await supabase
            .from("gantt_tasks")
            .update({ start_date: newStartStr, end_date: newEndStr })
            .eq("id", dependentTask.id);

          // Optimistic local update — reflect dep changes + new dates without reloading.
          setTasks(prev => prev.map(t => {
            if (t.id !== dependentTask.id) return t;
            return {
              ...t,
              start_date: newStartStr,
              end_date: newEndStr,
              dependencies: t.dependencies?.map(d =>
                d.id === dependencyId ? { ...d, ...updates } : d
              ),
            };
          }));
        } else {
          // No date change needed, just update the dep metadata in state.
          setTasks(prev => prev.map(t => ({
            ...t,
            dependencies: t.dependencies?.map(d =>
              d.id === dependencyId ? { ...d, ...updates } : d
            ),
          })));
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
