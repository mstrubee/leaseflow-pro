import { useState, useEffect, useCallback } from "react";
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
    const { data } = await supabase
      .from("org_members")
      .select("id, name, position")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
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
    const { data } = await supabase
      .from("gantt_templates")
      .select("*")
      .eq("is_active", true)
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

  // Helper function to propagate date changes to dependent tasks.
  // Returns a map of taskId -> partial updates so caller can patch local state without a full reload.
  const propagateDateChanges = async (
    taskId: string,
    newEndDate: string,
    processedTasks: Set<string> = new Set(),
    accumulator: Map<string, Partial<GanttTask>> = new Map()
  ): Promise<Map<string, Partial<GanttTask>>> => {
    if (processedTasks.has(taskId)) return accumulator;
    processedTasks.add(taskId);

    const { data: dependencies } = await supabase
      .from("gantt_task_dependencies")
      .select("task_id")
      .eq("depends_on_task_id", taskId);

    if (!dependencies || dependencies.length === 0) return accumulator;

    const parentEndDate = parseISO(newEndDate);
    const newDependentStart = addDays(parentEndDate, 1);

    for (const dep of dependencies) {
      const { data: dependentTask } = await supabase
        .from("gantt_tasks")
        .select("*")
        .eq("id", dep.task_id)
        .single();

      if (!dependentTask) continue;

      const duration = dependentTask.duration_days || 1;
      const newDependentEnd = addDays(newDependentStart, duration - 1);
      const newStartStr = format(newDependentStart, "yyyy-MM-dd");
      const newEndStr = format(newDependentEnd, "yyyy-MM-dd");

      await supabase
        .from("gantt_tasks")
        .update({ start_date: newStartStr, end_date: newEndStr })
        .eq("id", dep.task_id);

      accumulator.set(dep.task_id, { start_date: newStartStr, end_date: newEndStr });

      await propagateDateChanges(dep.task_id, newEndStr, processedTasks, accumulator);
    }

    return accumulator;
  };

  const updateTask = async (
    taskId: string,
    updates: Partial<GanttTask>,
    options?: { skipPropagation?: boolean; breakDependencies?: boolean }
  ) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_tasks")
        .update(updates as any)
        .eq("id", taskId);

      if (error) throw error;

      // If user chose to break dependencies, remove this task's incoming dependencies
      if (options?.breakDependencies) {
        await supabase
          .from("gantt_task_dependencies")
          .delete()
          .eq("task_id", taskId);
      }

      // Optimistic local update — avoids full reload that would collapse rows / lose UI state
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                ...updates,
                ...(options?.breakDependencies ? { dependencies: [] } : {}),
              }
            : t
        )
      );

      // If end_date was updated and propagation not skipped, propagate to dependent tasks
      if (updates.end_date && !options?.skipPropagation) {
        const propagated = await propagateDateChanges(taskId, updates.end_date);
        if (propagated.size > 0) {
          setTasks((prev) =>
            prev.map((t) => (propagated.has(t.id) ? { ...t, ...propagated.get(t.id)! } : t))
          );
        }
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

  const deleteTask = async (taskId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;

      toast({
        title: "Tarea eliminada",
        description: "La tarea ha sido eliminada",
      });

      await loadTimeline();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la tarea",
      });
    } finally {
      setSaving(false);
    }
  };

  const addDependency = async (taskId: string, dependsOnTaskId: string) => {
    setSaving(true);
    try {
      // Get both tasks to calculate new dates
      const dependentTask = tasks.find(t => t.id === taskId);
      const parentTask = tasks.find(t => t.id === dependsOnTaskId);
      
      if (!dependentTask || !parentTask) {
        throw new Error("Tarea no encontrada");
      }

      // Create the dependency
      const { error } = await supabase
        .from("gantt_task_dependencies")
        .insert({
          task_id: taskId,
          depends_on_task_id: dependsOnTaskId,
        });

      if (error) throw error;

      // Update dependent task dates based on parent's end date
      if (parentTask.end_date) {
        const parentEndDate = parseISO(parentTask.end_date);
        // Dependent task starts the day after parent ends
        const newStartDate = addDays(parentEndDate, 1);
        const duration = dependentTask.duration_days || 1;
        const newEndDate = addDays(newStartDate, duration - 1);

        await supabase
          .from("gantt_tasks")
          .update({
            start_date: format(newStartDate, "yyyy-MM-dd"),
            end_date: format(newEndDate, "yyyy-MM-dd"),
          })
          .eq("id", taskId);
      }

      toast({
        title: "Dependencia creada",
        description: `"${dependentTask.name}" ahora depende de "${parentTask.name}"`,
      });

      await loadTimeline();
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

      await loadTimeline();
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
    setSaving(true);
    try {
      // Update display_order for all affected siblings
      const updates = siblingIds.map((id, idx) => ({
        id,
        display_order: idx,
      }));

      for (const update of updates) {
        await supabase
          .from("gantt_tasks")
          .update({ display_order: update.display_order })
          .eq("id", update.id);
      }

      await loadTimeline();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo reordenar la tarea",
      });
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
        })
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
    const deps: { task_id: string; depends_on_task_id: string }[] = [];
    tasks.forEach((t) => {
      (t.dependencies || []).forEach((d) => {
        const a = idMap.get(d.task_id);
        const b = idMap.get(d.depends_on_task_id);
        if (a && b) deps.push({ task_id: a, depends_on_task_id: b });
      });
    });
    if (deps.length > 0) {
      await supabase.from("gantt_template_dependencies").insert(
        deps.map((d) => ({ ...d, lag_days: 0, lag_type: "calendar" }))
      );
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
    deleteTimeline,
    addTask,
    updateTask,
    deleteTask,
    addDependency,
    removeDependency,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    saveAsNewTemplate,
    updateBaseTemplate,
    reload: loadTimeline,
  };
}
