import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, ChevronDown, ChevronRight, Loader2, GripVertical, CalendarDays, Link, User } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface GanttTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface GanttTemplateTask {
  id: string;
  template_id: string;
  parent_id: string | null;
  name: string;
  default_duration_days: number;
  duration_type: "calendar" | "business";
  display_order: number;
  default_responsible_member_id: string | null;
  children?: GanttTemplateTask[];
}

interface GanttTemplateDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  lag_days: number;
  lag_type: string;
}

interface OrgMember {
  id: string;
  name: string;
  position: string | null;
}

interface GanttTemplateManagerProps {
  defaultCollapsed?: boolean;
}

export function GanttTemplateManager({ defaultCollapsed = false }: GanttTemplateManagerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<GanttTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<GanttTemplate | null>(null);
  const [tasks, setTasks] = useState<GanttTemplateTask[]>([]);
  const [dependencies, setDependencies] = useState<GanttTemplateDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);

  // Dialog states
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [dependencyDialogOpen, setDependencyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GanttTemplate | null>(null);
  const [editingTask, setEditingTask] = useState<GanttTemplateTask | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedTaskForDep, setSelectedTaskForDep] = useState<GanttTemplateTask | null>(null);
  const [mismatchDialog, setMismatchDialog] = useState<{
    task: GanttTemplateTask;
    childrenSum: number;
  } | null>(null);

  // Form states
  const [templateForm, setTemplateForm] = useState({ name: "", description: "" });
  const [taskForm, setTaskForm] = useState({
    name: "",
    default_duration_days: 1,
    duration_type: "calendar" as "calendar" | "business",
    default_responsible_member_id: null as string | null,
  });

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("gantt_templates")
      .select("*")
      .order("name");
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar las plantillas" });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, [toast]);

  const loadTemplateTasks = useCallback(async (templateId: string) => {
    const { data: tasksData } = await supabase
      .from("gantt_template_tasks")
      .select("*")
      .eq("template_id", templateId)
      .order("display_order");

    const { data: depsData } = await supabase
      .from("gantt_template_dependencies")
      .select("*");

    setTasks((tasksData || []) as GanttTemplateTask[]);
    setDependencies(depsData || []);
  }, []);

  useEffect(() => {
    loadTemplates();
    (async () => {
      const { data } = await supabase
        .from("org_members")
        .select("id, name, position")
        .order("display_order", { ascending: true });
      setOrgMembers((data as OrgMember[]) || []);
    })();
  }, [loadTemplates]);

  useEffect(() => {
    if (selectedTemplate) {
      loadTemplateTasks(selectedTemplate.id);
    } else {
      setTasks([]);
      setDependencies([]);
    }
  }, [selectedTemplate, loadTemplateTasks]);

  // Build tree from flat tasks
  const buildTaskTree = (flatTasks: GanttTemplateTask[]): GanttTemplateTask[] => {
    const taskMap = new Map<string, GanttTemplateTask>();
    flatTasks.forEach(task => {
      taskMap.set(task.id, { ...task, children: [] });
    });

    const rootTasks: GanttTemplateTask[] = [];
    taskMap.forEach(task => {
      if (task.parent_id && taskMap.has(task.parent_id)) {
        const parent = taskMap.get(task.parent_id)!;
        parent.children = parent.children || [];
        parent.children.push(task);
      } else {
        rootTasks.push(task);
      }
    });

    const sortChildren = (tasks: GanttTemplateTask[]) => {
      tasks.sort((a, b) => a.display_order - b.display_order);
      tasks.forEach(task => {
        if (task.children && task.children.length > 0) {
          sortChildren(task.children);
        }
      });
    };
    sortChildren(rootTasks);

    return rootTasks;
  };

  const taskTree = buildTaskTree(tasks);

  // Calculate sum of direct children durations for a task
  const getChildrenDurationSum = (task: GanttTemplateTask): number | null => {
    if (!task.children || task.children.length === 0) return null;
    return task.children.reduce((sum, child) => sum + (child.default_duration_days || 0), 0);
  };

  const handleFixMismatch = async () => {
    if (!mismatchDialog || !selectedTemplate) return;
    setSaving(true);
    try {
      await supabase
        .from("gantt_template_tasks")
        .update({ default_duration_days: mismatchDialog.childrenSum })
        .eq("id", mismatchDialog.task.id);
      toast({ title: "Duración actualizada" });
      setMismatchDialog(null);
      loadTemplateTasks(selectedTemplate.id);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar" });
    } finally {
      setSaving(false);
    }
  };

  // Template CRUD
  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      if (editingTemplate) {
        await supabase
          .from("gantt_templates")
          .update({ name: templateForm.name, description: templateForm.description || null })
          .eq("id", editingTemplate.id);
        toast({ title: "Plantilla actualizada" });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase
          .from("gantt_templates")
          .insert({
            name: templateForm.name,
            description: templateForm.description || null,
            created_by: user?.id,
          });
        toast({ title: "Plantilla creada" });
      }
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      setTemplateForm({ name: "", description: "" });
      loadTemplates();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la plantilla" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await supabase.from("gantt_templates").delete().eq("id", selectedTemplate.id);
      toast({ title: "Plantilla eliminada" });
      setSelectedTemplate(null);
      setDeleteDialogOpen(false);
      loadTemplates();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la plantilla" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (template: GanttTemplate) => {
    await supabase
      .from("gantt_templates")
      .update({ is_active: !template.is_active })
      .eq("id", template.id);
    loadTemplates();
  };

  // Task CRUD
  const handleSaveTask = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      if (editingTask) {
        await supabase
          .from("gantt_template_tasks")
          .update({
            name: taskForm.name,
            default_duration_days: taskForm.default_duration_days,
            duration_type: taskForm.duration_type,
            default_responsible_member_id: taskForm.default_responsible_member_id,
          })
          .eq("id", editingTask.id);
      } else {
        const siblings = tasks.filter(t => t.parent_id === selectedParentId);
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(t => t.display_order)) : -1;

        await supabase.from("gantt_template_tasks").insert({
          template_id: selectedTemplate.id,
          parent_id: selectedParentId,
          name: taskForm.name,
          default_duration_days: taskForm.default_duration_days,
          duration_type: taskForm.duration_type,
          default_responsible_member_id: taskForm.default_responsible_member_id,
          display_order: maxOrder + 1,
        });
      }
      setTaskDialogOpen(false);
      setEditingTask(null);
      setSelectedParentId(null);
      setTaskForm({ name: "", default_duration_days: 1, duration_type: "calendar", default_responsible_member_id: null });
      loadTemplateTasks(selectedTemplate.id);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la tarea" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedTemplate) return;
    await supabase.from("gantt_template_tasks").delete().eq("id", taskId);
    loadTemplateTasks(selectedTemplate.id);
  };

  const handleAddDependency = async (taskId: string, dependsOnId: string) => {
    await supabase.from("gantt_template_dependencies").insert({
      task_id: taskId,
      depends_on_task_id: dependsOnId,
      lag_days: 0,
      lag_type: "calendar",
    });
    if (selectedTemplate) loadTemplateTasks(selectedTemplate.id);
  };

  const handleRemoveDependency = async (depId: string) => {
    await supabase.from("gantt_template_dependencies").delete().eq("id", depId);
    if (selectedTemplate) loadTemplateTasks(selectedTemplate.id);
  };

  const openEditTemplate = (template: GanttTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, description: template.description || "" });
    setTemplateDialogOpen(true);
  };

  const openAddTask = (parentId: string | null = null) => {
    setEditingTask(null);
    setSelectedParentId(parentId);
    setTaskForm({ name: "", default_duration_days: 1, duration_type: "calendar", default_responsible_member_id: null });
    setTaskDialogOpen(true);
  };

  const openEditTask = (task: GanttTemplateTask) => {
    setEditingTask(task);
    setTaskForm({
      name: task.name,
      default_duration_days: task.default_duration_days,
      duration_type: task.duration_type,
      default_responsible_member_id: task.default_responsible_member_id ?? null,
    });
    setTaskDialogOpen(true);
  };

  const openDependencies = (task: GanttTemplateTask) => {
    setSelectedTaskForDep(task);
    setDependencyDialogOpen(true);
  };

  const renderTask = (task: GanttTemplateTask, level: number = 0) => {
    const hasChildren = task.children && task.children.length > 0;
    const taskDeps = dependencies.filter(d => d.task_id === task.id);

    const childrenSum = getChildrenDurationSum(task);
    const hasMismatch = childrenSum !== null && childrenSum !== task.default_duration_days;

    return (
      <div key={task.id}>
        <Collapsible defaultOpen={level < 2}>
          <div
            className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded transition-colors border-b"
            style={{ marginLeft: level * 16 }}
          >
            {hasChildren ? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <ChevronDown className="h-4 w-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
                </Button>
              </CollapsibleTrigger>
            ) : (
              <span className="w-6" />
            )}

            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{task.name}</span>
                <Badge
                  variant="outline"
                  className={`text-xs cursor-pointer ${hasMismatch ? "border-destructive text-destructive bg-destructive/10" : ""}`}
                  onClick={() => {
                    if (hasMismatch && childrenSum !== null) {
                      setMismatchDialog({ task, childrenSum });
                    }
                  }}
                  title={hasMismatch ? `Suma de subtareas: ${childrenSum} días. Clic para corregir.` : undefined}
                >
                  {task.default_duration_days} días {task.duration_type === "business" ? "háb." : "corr."}
                  {hasMismatch && ` (≠${childrenSum})`}
                </Badge>
                {taskDeps.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Link className="h-3 w-3 mr-1" />
                    {taskDeps.length} dep.
                    {taskDeps.some(d => d.lag_days !== 0) && (
                      <span className="ml-1">
                        ({taskDeps.map(d => `${d.lag_days > 0 ? "+" : ""}${d.lag_days}d`).join(", ")})
                      </span>
                    )}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAddTask(task.id)} title="Agregar subtarea">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTask(task)} title="Editar">
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDependencies(task)} title="Dependencias">
                <Link className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTask(task.id)} title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {hasChildren && (
            <CollapsibleContent>
              {task.children!.map((child) => renderTask(child, level + 1))}
            </CollapsibleContent>
          )}
        </Collapsible>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <CollapsibleCard
        title="Plantillas de Línea de Tiempo (Gantt)"
        description="Crea y gestiona plantillas reutilizables para líneas de tiempo de proyectos"
        icon={<CalendarDays className="h-5 w-5 text-violet-500" />}
        defaultOpen={!defaultCollapsed}
        headerActions={
          <Button onClick={() => { setEditingTemplate(null); setTemplateForm({ name: "", description: "" }); setTemplateDialogOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Plantilla
          </Button>
        }
      >
          {templates.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No hay plantillas creadas aún.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedTemplate?.id === template.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        <Badge variant={template.is_active ? "default" : "secondary"}>
                          {template.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleToggleActive(template); }}>
                        {template.is_active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditTemplate(template); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); setSelectedTemplate(template); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </CollapsibleCard>

      {/* Tasks section */}
      {selectedTemplate && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Tareas de: {selectedTemplate.name}</CardTitle>
                <CardDescription>
                  Define la estructura de tareas para esta plantilla
                </CardDescription>
              </div>
              <Button onClick={() => openAddTask(null)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Tarea Madre
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {taskTree.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No hay tareas aún. Agrega las líneas madre predefinidas como: Contrato, Proyectos, Permisos, Construcción, etc.
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {taskTree.map((task) => renderTask(task))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Nombre de la plantilla"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Descripción opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveTemplate} disabled={saving || !templateForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask ? "Editar Tarea" : "Nueva Tarea"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={taskForm.name}
                onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="Nombre de la tarea"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duración por defecto (días)</Label>
                <Input
                  type="number"
                  min={1}
                  value={taskForm.default_duration_days}
                  onChange={(e) => setTaskForm({ ...taskForm, default_duration_days: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de días</Label>
                <Select
                  value={taskForm.duration_type}
                  onValueChange={(v) => setTaskForm({ ...taskForm, duration_type: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendar">Corridos</SelectItem>
                    <SelectItem value="business">Hábiles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveTask} disabled={saving || !taskForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dependency Dialog */}
      <Dialog open={dependencyDialogOpen} onOpenChange={setDependencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dependencias de: {selectedTaskForDep?.name}</DialogTitle>
            <DialogDescription>
              Define qué tareas deben completarse antes de esta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Current dependencies */}
            {selectedTaskForDep && dependencies.filter(d => d.task_id === selectedTaskForDep.id).length > 0 && (
              <div className="space-y-2">
                <Label>Dependencias actuales</Label>
                <div className="space-y-2">
                  {dependencies
                    .filter(d => d.task_id === selectedTaskForDep.id)
                    .map((dep) => {
                      const depTask = tasks.find(t => t.id === dep.depends_on_task_id);
                      return (
                        <div key={dep.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <span className="flex-1 truncate">{depTask?.name || "Tarea"}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Desfase:</span>
                            <Input
                              type="number"
                              className="h-7 w-20 text-xs"
                              value={dep.lag_days}
                              onChange={async (e) => {
                                const val = parseInt(e.target.value) || 0;
                                await supabase
                                  .from("gantt_template_dependencies")
                                  .update({ lag_days: val })
                                  .eq("id", dep.id);
                                if (selectedTemplate) loadTemplateTasks(selectedTemplate.id);
                              }}
                              title="Días de desfase (+ retrasa, − adelanta)"
                            />
                            <span className="text-xs text-muted-foreground">días</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleRemoveDependency(dep.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Desfase positivo (+) agrega días después del término. Negativo (−) resta días.
                </p>
              </div>
            )}

            {/* Add dependency */}
            <div className="space-y-2">
              <Label>Agregar dependencia</Label>
              <Select
                onValueChange={(taskId) => {
                  if (selectedTaskForDep) handleAddDependency(selectedTaskForDep.id, taskId);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tarea..." />
                </SelectTrigger>
                <SelectContent>
                  {tasks
                    .filter(t => t.id !== selectedTaskForDep?.id && !dependencies.some(d => d.task_id === selectedTaskForDep?.id && d.depends_on_task_id === t.id))
                    .map((task) => (
                      <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setDependencyDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la plantilla y todas sus tareas asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duration mismatch confirmation */}
      <AlertDialog open={!!mismatchDialog} onOpenChange={(open) => { if (!open) setMismatchDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discrepancia de duración</AlertDialogTitle>
            <AlertDialogDescription>
              La tarea "{mismatchDialog?.task.name}" tiene una duración de{" "}
              <strong>{mismatchDialog?.task.default_duration_days} días</strong>, pero la suma de sus subtareas es{" "}
              <strong>{mismatchDialog?.childrenSum} días</strong>.
              <br /><br />
              ¿Deseas actualizar la duración de la tarea madre a {mismatchDialog?.childrenSum} días?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mantener actual</AlertDialogCancel>
            <AlertDialogAction onClick={handleFixMismatch}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Cambiar a ${mismatchDialog?.childrenSum} días`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
