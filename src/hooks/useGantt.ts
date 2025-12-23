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
  display_order: number;
  created_at: string;
  updated_at: string;
  children?: GanttTask[];
  dependencies?: GanttTaskDependency[];
  purchase_orders?: GanttTaskPurchaseOrder[];
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
  }, [loadTimeline, loadHolidays, loadTemplates]);

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

    // Load template dependencies
    const { data: templateDeps } = await supabase
      .from("gantt_template_dependencies")
      .select("*");

    // Map to track template_task_id -> new_task_id
    const taskIdMap = new Map<string, string>();

    // First pass: create all tasks without parent_id
    const tasksToInsert = templateTasks.map(tt => ({
      timeline_id: timelineId,
      template_task_id: tt.id,
      name: tt.name,
      duration_days: tt.default_duration_days || 1,
      duration_type: tt.duration_type,
      display_order: tt.display_order,
      parent_id: null as string | null,
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

      await loadTimeline();
      return data;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar la tarea",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Helper function to propagate date changes to dependent tasks
  const propagateDateChanges = async (taskId: string, newEndDate: string, processedTasks: Set<string> = new Set()) => {
    // Prevent infinite loops
    if (processedTasks.has(taskId)) return;
    processedTasks.add(taskId);

    // Find all tasks that depend on this task
    const { data: dependencies } = await supabase
      .from("gantt_task_dependencies")
      .select("task_id")
      .eq("depends_on_task_id", taskId);

    if (!dependencies || dependencies.length === 0) return;

    const parentEndDate = parseISO(newEndDate);
    const newDependentStart = addDays(parentEndDate, 1);

    for (const dep of dependencies) {
      // Get the dependent task
      const { data: dependentTask } = await supabase
        .from("gantt_tasks")
        .select("*")
        .eq("id", dep.task_id)
        .single();

      if (!dependentTask) continue;

      const duration = dependentTask.duration_days || 1;
      const newDependentEnd = addDays(newDependentStart, duration - 1);
      const newEndDateStr = format(newDependentEnd, "yyyy-MM-dd");

      // Update the dependent task
      await supabase
        .from("gantt_tasks")
        .update({
          start_date: format(newDependentStart, "yyyy-MM-dd"),
          end_date: newEndDateStr,
        })
        .eq("id", dep.task_id);

      // Recursively propagate to tasks that depend on this one
      await propagateDateChanges(dep.task_id, newEndDateStr, processedTasks);
    }
  };

  const updateTask = async (taskId: string, updates: Partial<GanttTask>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("gantt_tasks")
        .update(updates as any)
        .eq("id", taskId);

      if (error) throw error;

      // If end_date was updated, propagate changes to dependent tasks
      if (updates.end_date) {
        await propagateDateChanges(taskId, updates.end_date);
      }

      await loadTimeline();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar la tarea",
      });
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

  return {
    timeline,
    tasks,
    taskTree,
    holidays,
    templates,
    loading,
    saving,
    createTimeline,
    addTask,
    updateTask,
    deleteTask,
    addDependency,
    removeDependency,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    reload: loadTimeline,
  };
}
