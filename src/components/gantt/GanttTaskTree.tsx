import { useState, useMemo, useEffect, useRef } from "react";
import { GanttTask, GanttTaskDependency } from "@/hooks/useGantt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, ChevronDown, ChevronRight, Trash2, Edit, Link, Unlink,
  Calendar, FileText, Loader2, ShoppingCart, CheckCircle2, Eye, EyeOff, FileDown,
  ChevronsDownUp, ChevronsUpDown
} from "lucide-react";
import { formatGanttDate, calculateEndDate, calculateStartDate } from "@/lib/ganttDateUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DependencyDialog } from "./DependencyDialog";

interface GanttTaskTreeProps {
  tasks: GanttTask[];
  allTasks: GanttTask[];
  holidays: Array<{ date: string; name: string }>;
  contractId?: string | null;
  onAddTask: (name: string, parentId: string | null, options?: Partial<GanttTask>) => Promise<any>;
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string, options?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onUpdateDependency?: (dependencyId: string, updates: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onLinkPurchaseOrder: (taskId: string, purchaseOrderId: string) => Promise<void>;
  onUnlinkPurchaseOrder: (linkId: string) => Promise<void>;
  onExportPDF?: (hideCompleted: boolean, mode: "all" | "separate" | "selected", selectedParentIds?: string[]) => void;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManageDeps?: boolean;
}

export function GanttTaskTree({
  tasks,
  allTasks,
  holidays,
  contractId,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onAddDependency,
  onRemoveDependency,
  onUpdateDependency,
  onLinkPurchaseOrder,
  onUnlinkPurchaseOrder,
  onExportPDF,
  canAdd = true,
  canEdit = true,
  canDelete = true,
  canManageDeps = true,
}: GanttTaskTreeProps) {
  const [hideCompleted, setHideCompleted] = useState(false);

  const allParentTaskIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (list: GanttTask[]) => {
      list.forEach((t) => {
        if (t.children && t.children.length > 0) {
          ids.push(t.id);
          collect(t.children);
        }
      });
    };
    collect(tasks);
    return ids;
  }, [tasks]);

  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set());
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current && allParentTaskIds.length > 0) {
      didInitRef.current = true;
    }
  }, [allParentTaskIds]);

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const allExpanded = allParentTaskIds.length > 0 && allParentTaskIds.every((id) => expandedTasks.has(id));

  const toggleCompleted = async (task: GanttTask) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    await onUpdateTask(task.id, { status: newStatus as any, progress: newStatus === "completed" ? 100 : 0 });
  };

  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [dependencyDialogOpen, setDependencyDialogOpen] = useState(false);
  const [poDialogOpen, setPODialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"all" | "separate" | "selected">("all");
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const [newTaskName, setNewTaskName] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    duration_days: 1,
    duration_type: "calendar" as "calendar" | "business",
    has_lag: false,
    lag_days: 0,
    lag_type: "calendar" as "calendar" | "business",
    progress: 0,
    status: "pending" as string,
    notes: "",
  });

  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  const handleAddTaskClick = (parentId: string | null = null) => {
    setSelectedParentId(parentId);
    setNewTaskName("");
    setAddTaskDialogOpen(true);
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return;
    setSaving(true);
    await onAddTask(newTaskName.trim(), selectedParentId);
    setSaving(false);
    setAddTaskDialogOpen(false);
  };

  const handleEditClick = (task: GanttTask) => {
    setSelectedTask(task);
    setEditForm({
      name: task.name,
      start_date: task.start_date || "",
      end_date: task.end_date || "",
      duration_days: task.duration_days,
      duration_type: task.duration_type,
      has_lag: task.has_lag,
      lag_days: task.lag_days,
      lag_type: task.lag_type,
      progress: task.progress,
      status: task.status,
      notes: task.notes || "",
    });
    setEditTaskDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTask) return;
    setSaving(true);

    let updates: Partial<GanttTask> = {
      name: editForm.name,
      duration_days: editForm.duration_days,
      duration_type: editForm.duration_type,
      has_lag: editForm.has_lag,
      lag_days: editForm.lag_days,
      lag_type: editForm.lag_type,
      progress: editForm.progress,
      status: editForm.status as any,
      notes: editForm.notes || null,
    };

    // El plazo cambió respecto a la tarea original: el término debe recalcularse
    // desde el inicio + nuevo plazo (así un plazo 0 deja término = inicio), en vez
    // de conservar la fecha de término que quedó cargada del valor anterior.
    const durationChanged =
      editForm.duration_days !== selectedTask.duration_days ||
      editForm.duration_type !== selectedTask.duration_type;

    // Calculate dates
    if (editForm.start_date && !editForm.end_date) {
      const endDate = calculateEndDate(
        editForm.start_date,
        editForm.duration_days,
        editForm.duration_type,
        holidays
      );
      updates.start_date = editForm.start_date;
      updates.end_date = format(endDate, "yyyy-MM-dd");
    } else if (editForm.end_date && !editForm.start_date) {
      const startDate = calculateStartDate(
        editForm.end_date,
        editForm.duration_days,
        editForm.duration_type,
        holidays
      );
      updates.start_date = format(startDate, "yyyy-MM-dd");
      updates.end_date = editForm.end_date;
    } else if (editForm.start_date && editForm.end_date && durationChanged) {
      const endDate = calculateEndDate(
        editForm.start_date,
        editForm.duration_days,
        editForm.duration_type,
        holidays
      );
      updates.start_date = editForm.start_date;
      updates.end_date = format(endDate, "yyyy-MM-dd");
    } else if (editForm.start_date && editForm.end_date) {
      updates.start_date = editForm.start_date;
      updates.end_date = editForm.end_date;
    }

    await onUpdateTask(selectedTask.id, updates);
    setSaving(false);
    setEditTaskDialogOpen(false);
  };

  const handleDependencyClick = (task: GanttTask) => {
    setSelectedTask(task);
    setDependencyDialogOpen(true);
  };

  const handlePOClick = async (task: GanttTask) => {
    setSelectedTask(task);
    if (contractId) {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, order_number, amount_uf, supplier_name")
        .eq("contract_id", contractId)
        .order("order_date", { ascending: false });
      setPurchaseOrders(data || []);
    } else {
      setPurchaseOrders([]);
    }
    setPODialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendiente", variant: "secondary" },
      in_progress: { label: "En Progreso", variant: "default" },
      completed: { label: "Completada", variant: "outline" },
      delayed: { label: "Retrasada", variant: "destructive" },
    };
    const info = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const renderTask = (task: GanttTask, level: number = 0) => {
    if (hideCompleted && task.status === "completed") return null;
    const hasChildren = task.children && task.children.length > 0;
    const isCompleted = task.status === "completed";

    const isExpanded = expandedTasks.has(task.id);
    return (
      <div key={task.id}>
        <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(task.id)}>
          <div
            className={cn(
              "flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded transition-colors border-b",
              level > 0 && "ml-4",
              isCompleted && "bg-muted/30"
            )}
            style={{ marginLeft: level * 16 }}
          >
            {hasChildren ? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            ) : (
              <span className="w-6" />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("font-medium truncate", isCompleted && "line-through text-muted-foreground")}>{task.name}</span>
                {getStatusBadge(task.status)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatGanttDate(task.start_date)} - {formatGanttDate(task.end_date)}
                </span>
                <span className={task.duration_days === 0 ? "text-amber-600 font-medium" : undefined}>
                  {task.duration_days === 0
                    ? "Sin plazo (no consume tiempo)"
                    : `${task.duration_days} días ${task.duration_type === "business" ? "háb." : "corr."}`}
                </span>
                <span>{task.progress}%</span>
                {task.dependencies && task.dependencies.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Link className="h-3 w-3" />
                    {task.dependencies.length} dep.
                  </span>
                )}
                {task.purchase_orders && task.purchase_orders.length > 0 && (
                  <span className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    {task.purchase_orders.length} OC
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => toggleCompleted(task)}
                  title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
                >
                  <CheckCircle2 className={cn("h-4 w-4", isCompleted ? "text-primary" : "text-muted-foreground")} />
                </Button>
              )}
              {canAdd && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleAddTaskClick(task.id)}
                  title="Agregar subtarea"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleEditClick(task)}
                  title="Editar"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              {canManageDeps && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDependencyClick(task)}
                  title="Dependencias"
                >
                  <Link className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handlePOClick(task)}
                title="Órdenes de Compra"
              >
                <ShoppingCart className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onDeleteTask(task.id)}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Tareas</h3>
        <div className="flex items-center gap-2">
          {allParentTaskIds.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedTasks(new Set())}
                title="Colapsar todo"
              >
                <ChevronsDownUp className="h-4 w-4 mr-2" />
                Colapsar todo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedTasks(new Set(allParentTaskIds))}
                title="Expandir todo"
              >
                <ChevronsUpDown className="h-4 w-4 mr-2" />
                Expandir todo
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHideCompleted((v) => !v)}
            title={hideCompleted ? "Mostrar completadas" : "Ocultar completadas"}
          >
            {hideCompleted ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {hideCompleted ? "Mostrar completadas" : "Ocultar completadas"}
          </Button>
          {onExportPDF && (
            <Button variant="outline" size="sm" onClick={() => { setExportMode("all"); setExportSelectedIds(new Set()); setExportDialogOpen(true); }}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          )}
          {canAdd && (
            <Button onClick={() => handleAddTaskClick(null)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Tarea Madre
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg">
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No hay tareas aún. Haz clic en "Agregar Tarea Madre" para comenzar.
          </div>
        ) : (
          <div className="divide-y">
            {tasks.map((task) => renderTask(task))}
          </div>
        )}
      </div>

      {/* Add Task Dialog */}
      <Dialog open={addTaskDialogOpen} onOpenChange={setAddTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedParentId ? "Agregar Subtarea" : "Agregar Tarea Madre"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la tarea</Label>
              <Input
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="Nombre de la tarea"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddTask} disabled={saving || !newTaskName.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={editTaskDialogOpen} onOpenChange={setEditTaskDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <Input
                  type="date"
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha Término</Label>
                <Input
                  type="date"
                  value={editForm.end_date}
                  onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plazo (días)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.duration_days}
                  onChange={(e) => setEditForm({ ...editForm, duration_days: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de días</Label>
                <Select
                  value={editForm.duration_type}
                  onValueChange={(v) => setEditForm({ ...editForm, duration_type: v as any })}
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

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="has_lag"
                  checked={editForm.has_lag}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, has_lag: !!checked })}
                />
                <Label htmlFor="has_lag">Aplicar desfase respecto a dependencia</Label>
              </div>
              {editForm.has_lag && (
                <div className="grid grid-cols-2 gap-4 mt-2 ml-6">
                  <div className="space-y-2">
                    <Label>Días de desfase</Label>
                    <Input
                      type="number"
                      value={editForm.lag_days}
                      onChange={(e) => setEditForm({ ...editForm, lag_days: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={editForm.lag_type}
                      onValueChange={(v) => setEditForm({ ...editForm, lag_type: v as any })}
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
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Progreso (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editForm.progress}
                  onChange={(e) => setEditForm({ ...editForm, progress: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En Progreso</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="delayed">Retrasada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Notas opcionales"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dependency Dialog (modal XL con explorador jerárquico) */}
      <DependencyDialog
        open={dependencyDialogOpen}
        onOpenChange={setDependencyDialogOpen}
        selectedTask={selectedTask}
        allTasks={allTasks}
        onAddDependency={onAddDependency}
        onRemoveDependency={onRemoveDependency}
        onUpdateDependency={onUpdateDependency}
      />

      {/* Purchase Orders Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPODialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Órdenes de Compra: {selectedTask?.name}</DialogTitle>
            <DialogDescription>
              Vincula órdenes de compra a esta tarea.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Current linked POs */}
            {selectedTask?.purchase_orders && selectedTask.purchase_orders.length > 0 && (
              <div className="space-y-2">
                <Label>OCs vinculadas</Label>
                <div className="space-y-2">
                  {selectedTask.purchase_orders.map((po) => (
                    <div
                      key={po.id}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div>
                        <span className="font-medium">
                          {po.purchase_order?.order_number || "OC"}
                        </span>
                        <span className="text-sm text-muted-foreground ml-2">
                          UF {po.purchase_order?.amount_uf?.toLocaleString("es-CL")}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onUnlinkPurchaseOrder(po.id)}
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new PO */}
            <div className="space-y-2">
              <Label>Vincular OC</Label>
              <Select
                onValueChange={(poId) => {
                  if (selectedTask) {
                    onLinkPurchaseOrder(selectedTask.id, poId);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar OC..." />
                </SelectTrigger>
                <SelectContent>
                  {purchaseOrders
                    .filter(
                      (po) =>
                        !selectedTask?.purchase_orders?.some(
                          (linked) => linked.purchase_order_id === po.id
                        )
                    )
                    .map((po) => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.order_number} - UF {po.amount_uf?.toLocaleString("es-CL")}
                        {po.supplier_name && ` (${po.supplier_name})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPODialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export PDF dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar cronograma PDF</DialogTitle>
          </DialogHeader>

          <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as typeof exportMode)} className="gap-3 py-2">
            <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setExportMode("all")}>
              <RadioGroupItem value="all" id="tree-exp-all" className="mt-0.5" />
              <Label htmlFor="tree-exp-all" className="cursor-pointer flex flex-col gap-0.5">
                <span className="font-medium">Todo el cronograma</span>
                <span className="text-xs text-muted-foreground">Un PDF con todas las líneas del cronograma</span>
              </Label>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setExportMode("separate")}>
              <RadioGroupItem value="separate" id="tree-exp-sep" className="mt-0.5" />
              <Label htmlFor="tree-exp-sep" className="cursor-pointer flex flex-col gap-0.5">
                <span className="font-medium">PDF por línea padre</span>
                <span className="text-xs text-muted-foreground">Un PDF separado por cada línea padre, incluyendo sus hijas y descendientes</span>
              </Label>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setExportMode("selected")}>
              <RadioGroupItem value="selected" id="tree-exp-sel" className="mt-0.5" />
              <Label htmlFor="tree-exp-sel" className="cursor-pointer flex flex-col gap-0.5">
                <span className="font-medium">Líneas padre seleccionadas</span>
                <span className="text-xs text-muted-foreground">Elige qué líneas padre exportar, con sus hijas y descendientes</span>
              </Label>
            </div>
          </RadioGroup>

          {exportMode === "selected" && (
            <div className="border rounded-lg max-h-52 overflow-y-auto">
              <div className="p-2 border-b bg-muted/40 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Líneas padre</span>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => setExportSelectedIds(new Set(tasks.map(t => t.id)))}>
                  Seleccionar todas
                </button>
              </div>
              {tasks.map(parent => (
                <label key={parent.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 cursor-pointer">
                  <Checkbox
                    checked={exportSelectedIds.has(parent.id)}
                    onCheckedChange={(checked) =>
                      setExportSelectedIds(prev => { const n = new Set(prev); checked ? n.add(parent.id) : n.delete(parent.id); return n; })
                    }
                  />
                  <span className="text-sm truncate">{parent.name}</span>
                </label>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={exportMode === "selected" && exportSelectedIds.size === 0}
              onClick={() => {
                setExportDialogOpen(false);
                onExportPDF?.(hideCompleted, exportMode, exportMode === "selected" ? Array.from(exportSelectedIds) : undefined);
              }}
            >
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
