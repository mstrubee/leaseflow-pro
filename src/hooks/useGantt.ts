import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  is_priority: boolean;
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
  const [timelines, setTimelines] = useState<GanttTimeline[]>([]);
  const [tasksByTimeline, setTasksByTimeline] = useState<Record<string, GanttTask[]>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [templates, setTemplates] = useState<GanttTemplate[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const allTasks = useMemo(
    () => Object.values(tasksByTimeline).flat(),
    [tasksByTimeline]
  );

  const loadOrgMembers = useCallback(async () => {
    const { data } = await supabase.rpc("get_org_members_basic");
    if (data) {
      const sorted = [...(data as OrgMember[])].sort((a, b) =>
        a.name.localeCompare(b.name, "es")
      );
      setOrgMembers(sorted);
    }
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
    const { data } = await supabase
      .from("gantt_templates")
      .select("*")
      .or("is_active.is.null,is_active.eq.true")
      .order("name");
    if (data) setTemplates(data);
  }, []);

  const loadTimelines = useCallback(async () => {
    setLoading(true);
    try {
      const { data: timelinesData, error: timelinesErr } = await supabase
        .from("gantt_timelines")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: true });

      if (timelinesErr) throw timelinesErr;

      if (!timelinesData || timelinesData.length === 0) {
        setTimelines([]);
        setTasksByTimeline({});
        return;
      }

      const sorted = [...timelinesData].sort((a, b) =>
        (b.is_priority ? 1 : 0) - (a.is_priority ? 1 : 0)
      );
      setTimelines(sorted as GanttTimeline[]);

      const timelineIds = timelinesData.map((t) => t.id);

      const { data: tasksData, error: tasksErr } = await supabase
        .from("gantt_tasks")
        .select("*")
        .in("timeline_id", timelineIds)
        .order("display_order");

      if (tasksErr) throw tasksErr;

      const { data: depsData } = await supabase
        .from("gantt_task_dependencies")
        .select("*");

      const { data: poData } = await supabase
        .from("gantt_task_purchase_orders")
        .select(`
          *,
          purchase_order:purchase_orders (
            id, order_number, amount_uf, supplier_name
          )
        `);

      const byTimeline: Record<string, GanttTask[]> = {};
      for (const tl of timelinesData) {
        const tlTasks = (tasksData || []).filter((t) => t.timeline_id === tl.id);
        byTimeline[tl.id] = tlTasks.map((task) => ({
          ...task,
          dependencies: depsData?.filter((d) => d.task_id === task.id) || [],
          purchase_orders: poData?.filter((po) => po.task_id === task.id) || [],
        })) as GanttTask[];
      }
      setTasksByTimeline(byTimeline);
    } catch (error: any) {
      console.error("Error loading timelines:", error);
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
    loadTimelines();
    loadHolidays();
    loadTemplates();
    loadOrgMembers();
  }, [loadTimelines, loadHolidays, loadTemplates, loadOrgMembers]);

  const createTimeline = async (name: string, templateId?: string) => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // First timeline per contract is always priority
      const isPriority = timelines.length === 0;

      const { data: newTimeline, error } = await supabase
        .from("gantt_timelines")
        .insert({
          contract_id: contractId,
          name,
          template_id: templateId || null,
          created_by: user?.id,
          is_priority: isPriority,
        })
        .select()
        .single();

      if (error) throw error;

      if (templateId) {
        await copyTasksFromTemplate(newTimeline.id, templateId);
      }

      toast({
        title: "Línea de tiempo creada",
        description: "La línea de tiempo ha sido creada exitosamente",
      });

      await loadTimelines();
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

    const { data: templateDeps } = await supabase
      .from("gantt_template_dependencies")
      .select("*");

    const taskIdMap = new Map<string, string>();

    const PARENT_COLORS = [
      "#3b82f6", "#10b981", "#f97316", "#ef4444", "#8b5cf6",
      "#ec4899", "#eab308", "#06b6d4", "#64748b",
    ];
    let colorIdx = 0;
    const tasksToInsert = (templateTasks as TemplateTaskRow[]).map((tt) => ({
      timeline_id: timelineId,
      template_task_id: tt.id,
      name: tt.name,
      duration_days: tt.default_duration_days || 1,
      duration_type: tt.duration_type,
      display_order: tt.display_order,
      parent_id: null as string | null,
      responsible_member_id: tt.default_responsible_member_id ?? null,
      origin: (tt.default_origin ?? null) as "nuevo" | "traslado" | null,
      color: tt.parent_id ? null : PARENT_COLORS[(colorIdx++) % PARENT_COLORS.length],
    }));

    const { data: insertedTasks, error } = await supabase
      .from("gantt_tasks")
      .insert(tasksToInsert)
      .select();

    if (error || !insertedTasks) return;

    insertedTasks.forEach((task) => {
      if (task.template_task_id) {
        taskIdMap.set(task.template_task_id, task.id);
      }
    });

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

    if (templateDeps) {
      const depsToInsert = templateDeps
        .map((dep) => {
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
        await supabase.from("gantt_task_dependencies").insert(depsToInsert as any);
      }
    }
  };

  const addTask = async (
    timelineId: string,
    name: string,
    parentId: string | null = null,
    options: Partial<GanttTask> = {}
  ) => {
    setSaving(true);
    try {
      const tlTasks = tasksByTimeline[timelineId] || [];
      const siblings = tlTasks.filter((t) => t.parent_id === parentId);
      const maxOrder = siblings.length > 0
        ? Math.max(...siblings.map((t) => t.display_order))
        : -1;

      const PARENT_COLORS = [
        "#3b82f6", "#10b981", "#f97316", "#ef4444", "#8b5cf6",
        "#ec4899", "#eab308", "#06b6d4", "#64748b",
      ];
      let assignedColor: string | null = (options as any).color ?? null;
      if (parentId === null && !assignedColor) {
        const usedColors = new Set(
          tlTasks.filter((t) => t.parent_id === null && t.color).map((t) => t.color as string)
        );
        const available = PARENT_COLORS.find((c) => !usedColors.has(c));
        assignedColor =
          available ?? PARENT_COLORS[Math.floor(Math.random() * PARENT_COLORS.length)];
      }

      const { data, error } = await supabase
        .from("gantt_tasks")
        .insert({
          timeline_id: timelineId,
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

      setTasksByTimeline((prev) => ({
        ...prev,
        [timelineId]: [
          ...(prev[timelineId] || []),
          { ...(data as any), dependencies: [], purchase_orders: [] } as GanttTask,
        ],
      }));
      return data;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar la tarea",
      });
      await loadTimelines();
      return null;
    } finally {
      setSaving(false);
    }
  };

  const computeDateCascade = (
    flatTasks: GanttTask[],
    taskId: string,
    newStartDate: string,
    newEndDate: string,
  ): Map<string, Partial<GanttTask>> => {
    const result = new Map<string, Partial<GanttTask>>();
    const taskById = new Map(flatTasks.map((t) => [t.id, t]));

    const successorsOf = new Map<string, string[]>();
    for (const t of flatTasks) {
      for (const dep of t.dependencies || []) {
        const arr = successorsOf.get(dep.depends_on_task_id) || [];
        arr.push(t.id);
        successorsOf.set(dep.depends_on_task_id, arr);
      }
    }

    const effStart = new Map<string, string>();
    const effEnd = new Map<string, string>();
    for (const t of flatTasks) {
      if (t.start_date) effStart.set(t.id, t.start_date);
      if (t.end_date) effEnd.set(t.id, t.end_date);
    }
    effStart.set(taskId, newStartDate);
    effEnd.set(taskId, newEndDate);

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
    const targetTask = allTasks.find((t) => t.id === taskId);
    const timelineId = targetTask?.timeline_id;

    let cascade = new Map<string, Partial<GanttTask>>();
    if ((updates.end_date || updates.start_date) && !options?.skipPropagation && timelineId) {
      const current = targetTask;
      const startStr = updates.start_date || current?.start_date || updates.end_date!;
      const endStr = updates.end_date || current?.end_date || updates.start_date!;
      const tlTasks = tasksByTimeline[timelineId] || [];
      cascade = computeDateCascade(tlTasks, taskId, startStr, endStr);
    }

    if (timelineId) {
      setTasksByTimeline((prev) => ({
        ...prev,
        [timelineId]: (prev[timelineId] || []).map((t) => {
          if (t.id === taskId) {
            return { ...t, ...updates, ...(options?.breakDependencies ? { dependencies: [] } : {}) };
          }
          if (cascade.has(t.id)) return { ...t, ...cascade.get(t.id)! };
          return t;
        }),
      }));
    }

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
      await loadTimelines();
    } finally {
      setSaving(false);
    }
  };

  const lastDeletedRef = useRef<{ tasks: any[]; deps: any[]; timelineId: string } | null>(null);

  const pickTaskCols = (t: GanttTask) => ({
    id: t.id, timeline_id: t.timeline_id, parent_id: t.parent_id, template_task_id: t.template_task_id,
    name: t.name, start_date: t.start_date, end_date: t.end_date, duration_days: t.duration_days,
    duration_type: t.duration_type, progress: t.progress, status: t.status, has_lag: t.has_lag,
    lag_days: t.lag_days, lag_type: t.lag_type, notes: t.notes, color: t.color, display_order: t.display_order,
    responsible_member_id: t.responsible_member_id, origin: t.origin,
  });

  const deleteTask = async (taskId: string) => {
    const timelineId = allTasks.find((t) => t.id === taskId)?.timeline_id;
    if (!timelineId) return;

    const tlTasks = tasksByTimeline[timelineId] || [];
    const collectIds = (id: string): string[] => {
      const kids = tlTasks.filter((t) => t.parent_id === id);
      return [id, ...kids.flatMap((k) => collectIds(k.id))];
    };
    const ids = collectIds(taskId);
    const idsToRemove = new Set(ids);

    const snapTasks = tlTasks.filter((t) => idsToRemove.has(t.id)).map(pickTaskCols);
    let snapDeps: any[] = [];
    try {
      const list = ids.join(",");
      const { data } = await (supabase as any)
        .from("gantt_task_dependencies")
        .select("id, task_id, depends_on_task_id, dep_type, lag_days, lag_type")
        .or(`task_id.in.(${list}),depends_on_task_id.in.(${list})`);
      snapDeps = data ?? [];
    } catch { /* sin deps */ }
    lastDeletedRef.current = { tasks: snapTasks, deps: snapDeps, timelineId };

    setTasksByTimeline((prev) => ({
      ...prev,
      [timelineId]: (prev[timelineId] || []).filter((t) => !idsToRemove.has(t.id)),
    }));

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
      await loadTimelines();
    } finally {
      setSaving(false);
    }
  };

  const undoDelete = async () => {
    const snap = lastDeletedRef.current;
    if (!snap || snap.tasks.length === 0) return;
    lastDeletedRef.current = null;

    const nowIso = new Date().toISOString();
    const restored = snap.tasks.map((t) => ({
      ...t,
      children: [],
      dependencies: [] as any[],
      purchase_orders: [],
      created_at: nowIso,
      updated_at: nowIso,
    })) as unknown as GanttTask[];

    setTasksByTimeline((prev) => {
      const prevTl = prev[snap.timelineId] || [];
      const all = [...prevTl, ...restored];
      if (snap.deps.length === 0) return { ...prev, [snap.timelineId]: all };

      const depsByOwner = new Map<string, any[]>();
      for (const d of snap.deps) {
        const arr = depsByOwner.get(d.task_id) || [];
        arr.push(d);
        depsByOwner.set(d.task_id, arr);
      }
      return {
        ...prev,
        [snap.timelineId]: all.map((t) => {
          const add = depsByOwner.get(t.id);
          if (!add) return t;
          const merged = [...(t.dependencies || [])];
          for (const d of add) if (!merged.some((x) => x.id === d.id)) merged.push(d as any);
          return { ...t, dependencies: merged };
        }),
      };
    });

    setSaving(true);
    try {
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
      await loadTimelines();
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
      const dependentTask = allTasks.find((t) => t.id === taskId);
      const parentTask = allTasks.find((t) => t.id === dependsOnTaskId);

      if (!dependentTask || !parentTask) throw new Error("Tarea no encontrada");

      const dep_type = options?.dep_type ?? "end";
      const lag_days = options?.lag_days ?? 0;
      const lag_type = options?.lag_type ?? "calendar";

      const { data: inserted, error } = await supabase
        .from("gantt_task_dependencies")
        .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId, dep_type, lag_days, lag_type } as any)
        .select("id, task_id, depends_on_task_id, dep_type, lag_days, lag_type")
        .single();

      if (error) throw error;

      const allDepsWithNew: GanttTaskDependency[] = [
        ...(dependentTask.dependencies || []),
        inserted as GanttTaskDependency,
      ];
      let latestStart: Date | null = null;
      for (const d of allDepsWithNew) {
        const pt = allTasks.find((t) => t.id === d.depends_on_task_id);
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

      const timelineId = dependentTask.timeline_id;
      setTasksByTimeline((prev) => ({
        ...prev,
        [timelineId]: (prev[timelineId] || []).map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            start_date: newStartStr,
            end_date: newEndStr,
            dependencies: [...(t.dependencies || []), inserted as GanttTaskDependency],
          };
        }),
      }));

      toast({
        title: "Dependencia creada",
        description: `"${dependentTask.name}" ahora depende de "${parentTask.name}"`,
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo agregar la dependencia" });
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

      setTasksByTimeline((prev) => {
        const result = { ...prev };
        for (const tlId of Object.keys(result)) {
          result[tlId] = result[tlId].map((t) => ({
            ...t,
            dependencies: t.dependencies?.filter((d) => d.id !== dependencyId),
          }));
        }
        return result;
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la dependencia" });
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
      const dependentTask = allTasks.find((t) => t.dependencies?.some((d) => d.id === dependencyId));
      const dep = dependentTask?.dependencies?.find((d) => d.id === dependencyId);

      const { error } = await supabase
        .from("gantt_task_dependencies")
        .update(updates as any)
        .eq("id", dependencyId);
      if (error) throw error;

      if (dep && dependentTask) {
        const allDeps = dependentTask.dependencies || [];
        let latestStart: Date | null = null;
        for (const d of allDeps) {
          const parentTask = allTasks.find((t) => t.id === d.depends_on_task_id);
          const dep_type = d.id === dep.id ? (updates.dep_type ?? d.dep_type ?? "end") : (d.dep_type ?? "end");
          const lag_days = d.id === dep.id ? (updates.lag_days ?? d.lag_days ?? 0) : (d.lag_days ?? 0);
          const anchorStr = dep_type === "start" ? parentTask?.start_date : parentTask?.end_date;
          if (!anchorStr) continue;
          const anchorDate = parseISO(anchorStr);
          const baseOffset = dep_type === "start" ? 0 : 1;
          const candidateStart = addDays(anchorDate, baseOffset + lag_days);
          if (!latestStart || candidateStart > latestStart) latestStart = candidateStart;
        }

        const timelineId = dependentTask.timeline_id;
        if (latestStart) {
          const duration = dependentTask.duration_days || 1;
          const newStartStr = format(latestStart, "yyyy-MM-dd");
          const newEndStr = format(addDays(latestStart, duration - 1), "yyyy-MM-dd");
          await supabase
            .from("gantt_tasks")
            .update({ start_date: newStartStr, end_date: newEndStr })
            .eq("id", dependentTask.id);

          setTasksByTimeline((prev) => ({
            ...prev,
            [timelineId]: (prev[timelineId] || []).map((t) => {
              if (t.id !== dependentTask.id) return t;
              return {
                ...t,
                start_date: newStartStr,
                end_date: newEndStr,
                dependencies: t.dependencies?.map((d) =>
                  d.id === dependencyId ? { ...d, ...updates } : d
                ),
              };
            }),
          }));
        } else {
          setTasksByTimeline((prev) => ({
            ...prev,
            [timelineId]: (prev[timelineId] || []).map((t) => ({
              ...t,
              dependencies: t.dependencies?.map((d) =>
                d.id === dependencyId ? { ...d, ...updates } : d
              ),
            })),
          }));
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
        .insert({ task_id: taskId, purchase_order_id: purchaseOrderId });
      if (error) throw error;
      toast({ title: "OC vinculada", description: "La orden de compra ha sido vinculada a la tarea" });
      await loadTimelines();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo vincular la orden de compra" });
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
      await loadTimelines();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo desvincular la orden de compra" });
    } finally {
      setSaving(false);
    }
  };

  const buildTaskTree = useCallback((flatTasks: GanttTask[]): GanttTask[] => {
    const taskMap = new Map<string, GanttTask>();
    flatTasks.forEach((task) => {
      taskMap.set(task.id, { ...task, children: [] });
    });

    const rootTasks: GanttTask[] = [];
    taskMap.forEach((task) => {
      if (task.parent_id && taskMap.has(task.parent_id)) {
        const parent = taskMap.get(task.parent_id)!;
        parent.children = parent.children || [];
        parent.children.push(task);
      } else {
        rootTasks.push(task);
      }
    });

    const sortChildren = (tasks: GanttTask[]) => {
      tasks.sort((a, b) => a.display_order - b.display_order);
      tasks.forEach((task) => {
        if (task.children && task.children.length > 0) sortChildren(task.children);
      });
    };
    sortChildren(rootTasks);

    return rootTasks;
  }, []);

  const reorderTask = async (taskId: string, newIndex: number, siblingIds: string[]) => {
    const timelineId = allTasks.find((t) => t.id === taskId)?.timeline_id;
    if (!timelineId) return;

    const orderMap = new Map(siblingIds.map((id, idx) => [id, idx]));
    setTasksByTimeline((prev) => ({
      ...prev,
      [timelineId]: (prev[timelineId] || []).map((t) =>
        orderMap.has(t.id) ? { ...t, display_order: orderMap.get(t.id)! } : t
      ),
    }));

    setSaving(true);
    try {
      const results = await Promise.all(
        siblingIds.map((id, idx) =>
          supabase.from("gantt_tasks").update({ display_order: idx }).eq("id", id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo reordenar la tarea" });
      await loadTimelines();
    } finally {
      setSaving(false);
    }
  };

  const writeTasksToTemplate = async (templateId: string, tasks: GanttTask[]) => {
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

    const idMap = new Map<string, string>();

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
          default_responsible_member_id: (t as any).responsible_member_id ?? null,
          default_origin: (t as any).origin ?? null,
        } as any)
        .select()
        .single();
      if (insErr || !insertedRow) throw insErr || new Error("No se pudo insertar tarea de plantilla");
      idMap.set(t.id, insertedRow.id);
    }

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

    const deps: { task_id: string; depends_on_task_id: string; dep_type: string; lag_days: number; lag_type: string }[] = [];
    tasks.forEach((t) => {
      (t.dependencies || []).forEach((d) => {
        const a = idMap.get(d.task_id);
        const b = idMap.get(d.depends_on_task_id);
        if (a && b) deps.push({ task_id: a, depends_on_task_id: b, dep_type: d.dep_type ?? "end", lag_days: d.lag_days ?? 0, lag_type: d.lag_type ?? "calendar" });
      });
    });
    if (deps.length > 0) {
      await supabase.from("gantt_template_dependencies").insert(deps as any);
    }
  };

  const saveAsNewTemplate = async (timelineId: string, name: string, description?: string) => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: tpl, error } = await supabase
        .from("gantt_templates")
        .insert({ name, description: description || null, created_by: user?.id, is_active: true })
        .select()
        .single();
      if (error || !tpl) throw error;
      const timelineTasks = tasksByTimeline[timelineId] || [];
      await writeTasksToTemplate(tpl.id, timelineTasks);
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

  const updateBaseTemplate = async (timelineId: string) => {
    const tl = timelines.find((t) => t.id === timelineId);
    if (!tl?.template_id) {
      toast({ variant: "destructive", title: "Sin plantilla base", description: "Este cronograma no fue creado a partir de una plantilla" });
      return false;
    }
    setSaving(true);
    try {
      const timelineTasks = tasksByTimeline[timelineId] || [];
      await writeTasksToTemplate(tl.template_id, timelineTasks);
      await supabase.from("gantt_templates").update({ updated_at: new Date().toISOString() }).eq("id", tl.template_id);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: capexBudgets, error: budgetsErr } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("budget_type", "capex");
      if (budgetsErr) throw budgetsErr;

      if (!capexBudgets || capexBudgets.length === 0) {
        toast({ variant: "destructive", title: "Sin presupuesto CAPEX", description: "Este contrato no tiene un presupuesto CAPEX para importar" });
        return null;
      }

      const budgetIds = capexBudgets.map((b) => b.id);

      const { data: lines, error: linesErr } = await supabase
        .from("budget_lines")
        .select("id, parent_id, name, display_order, is_ghost")
        .in("budget_id", budgetIds)
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      if (linesErr) throw linesErr;

      const visibleLines = (lines || []).filter((l) => !l.is_ghost);

      if (visibleLines.length === 0) {
        toast({ variant: "destructive", title: "Sin líneas", description: "El presupuesto CAPEX no tiene líneas para importar" });
        return null;
      }

      const isPriority = timelines.length === 0;

      const { data: newTimeline, error: tlErr } = await supabase
        .from("gantt_timelines")
        .insert({ contract_id: contractId, name, template_id: null, created_by: user?.id, is_priority: isPriority })
        .select()
        .single();
      if (tlErr || !newTimeline) throw tlErr || new Error("No se pudo crear la línea de tiempo");

      const idMap = new Map<string, string>();
      for (const line of visibleLines) {
        const { data: insertedTask, error: insErr } = await supabase
          .from("gantt_tasks")
          .insert({ timeline_id: newTimeline.id, parent_id: null, name: line.name, duration_days: 1, duration_type: "calendar", display_order: line.display_order ?? 0, status: "pending" })
          .select()
          .single();
        if (insErr || !insertedTask) throw insErr || new Error("No se pudo insertar tarea");
        idMap.set(line.id, insertedTask.id);
      }

      for (const line of visibleLines) {
        if (line.parent_id && idMap.has(line.parent_id)) {
          const newId = idMap.get(line.id)!;
          const newParentId = idMap.get(line.parent_id)!;
          await supabase.from("gantt_tasks").update({ parent_id: newParentId }).eq("id", newId);
        }
      }

      toast({ title: "Línea de tiempo creada", description: `Se importaron ${visibleLines.length} líneas del presupuesto CAPEX` });
      await loadTimelines();
      return newTimeline;
    } catch (error: any) {
      console.error("Error creating timeline from CAPEX:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo crear la línea de tiempo desde CAPEX" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteTimeline = async (timelineId: string) => {
    setSaving(true);
    try {
      const tl = timelines.find((t) => t.id === timelineId);
      const { error } = await supabase
        .from("gantt_timelines")
        .delete()
        .eq("id", timelineId);
      if (error) throw error;

      toast({ title: "Carta Gantt eliminada", description: "La línea de tiempo y sus tareas fueron eliminadas." });

      const remaining = timelines.filter((t) => t.id !== timelineId);
      setTimelines(remaining);
      setTasksByTimeline((prev) => {
        const next = { ...prev };
        delete next[timelineId];
        return next;
      });

      // If deleted timeline was priority and others remain, promote oldest
      if (tl?.is_priority && remaining.length > 0) {
        const oldest = remaining[remaining.length - 1]; // last = oldest after removing priority
        const { error: upErr } = await supabase
          .from("gantt_timelines")
          .update({ is_priority: true })
          .eq("id", oldest.id);
        if (!upErr) {
          setTimelines((prev) =>
            prev.map((t) => (t.id === oldest.id ? { ...t, is_priority: true } : t))
          );
        }
      }

      return true;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la Carta Gantt" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setPriorityTimeline = async (timelineId: string) => {
    setSaving(true);
    try {
      // Unset priority for all timelines of this contract
      await supabase
        .from("gantt_timelines")
        .update({ is_priority: false })
        .eq("contract_id", contractId);
      // Set priority for chosen timeline
      await supabase
        .from("gantt_timelines")
        .update({ is_priority: true })
        .eq("id", timelineId);

      setTimelines((prev) =>
        prev.map((t) => ({ ...t, is_priority: t.id === timelineId }))
      );
      toast({ title: "Cronograma prioritario actualizado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cambiar el cronograma prioritario" });
    } finally {
      setSaving(false);
    }
  };

  const renameTimeline = async (timelineId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_timelines")
        .update({ name: trimmed })
        .eq("id", timelineId);
      if (error) throw error;
      setTimelines((prev) =>
        prev.map((t) => (t.id === timelineId ? { ...t, name: trimmed } : t))
      );
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo renombrar el cronograma" });
    } finally {
      setSaving(false);
    }
  };

  return {
    timelines,
    tasksByTimeline,
    allTasks,
    buildTaskTree,
    holidays,
    templates,
    orgMembers,
    loading,
    saving,
    createTimeline,
    createTimelineFromCapex,
    deleteTimeline,
    setPriorityTimeline,
    renameTimeline,
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
    reload: loadTimelines,
  };
}
