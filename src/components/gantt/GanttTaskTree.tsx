import { useState } from "react";
import { GanttTask, GanttTaskDependency } from "@/hooks/useGantt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, ChevronDown, ChevronRight, Trash2, Edit, Link, Unlink, 
  Calendar, FileText, Loader2, ShoppingCart, CheckCircle2, Eye, EyeOff, FileDown
} from "lucide-react";
import { formatGanttDate, calculateEndDate, calculateStartDate } from "@/lib/ganttDateUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

function AddDependencyForm({
  selectedTask,
  allTasks,
  onAdd,
}: {
  selectedTask: GanttTask | null;
  allTasks: GanttTask[];
  onAdd: (taskId: string, dep_type: "start" | "end", lag_days: number) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const [depType, setDepType] = useState<"start" | "end">("end");
  const [lag, setLag] = useState(0);

  const options = allTasks
    .filter(
      (t) =>
        t.id !== selectedTask?.id &&
        !selectedTask?.dependencies?.some((d) => d.depends_on_task_id === t.id)
    )
    .map((t) => ({ value: t.id, label: t.name }));

  return (
    <div className="space-y-2">
      <Label>Agregar dependencia</Label>
      <SearchableSelect
        value={taskId}
        onValueChange={setTaskId}
        placeholder="Seleccionar tarea..."
        searchPlaceholder="Buscar tarea..."
        emptyMessage="Sin tareas disponibles."
        options={options}
      />
      <div className="flex items-center gap-2">
        <Select value={depType} onValueChange={(v) => setDepType(v as "start" | "end")}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="end">al término</SelectItem>
            <SelectItem value="start">al inicio</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          className="h-9 w-24"
          value={lag}
          onChange={(e) => setLag(parseInt(e.target.value) || 0)}
          title="Días de desfase (+ retrasa, − adelanta)"
        />
        <span className="text-xs text-muted-foreground">días</span>
        <Button
          size="sm"
          disabled={!taskId}
          onClick={() => {
            if (!taskId) return;
            onAdd(taskId, depType, lag);
            setTaskId("");
            setLag(0);
            setDepType("end");
          }}
        >
          Agregar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Desfase positivo retrasa, negativo adelanta el inicio.
      </p>
    </div>
  );
}

interface GanttTaskTreeProps {
  tasks: GanttTask[];
  allTasks: GanttTask[];
  holidays: Array<{ date: string; name: string }>;
  contractId: string;
  onAddTask: (name: string, parentId: string | null, options?: Partial<GanttTask>) => Promise<any>;
  onUpdateTask: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddDependency: (taskId: string, dependsOnTaskId: string, options?: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onUpdateDependency?: (dependencyId: string, updates: { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" }) => Promise<void>;
  onLinkPurchaseOrder: (taskId: string, purchaseOrderId: string) => Promise<void>;
  onUnlinkPurchaseOrder: (linkId: string) => Promise<void>;
  onExportPDF?: (hideCompleted: boolean) => void;
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
}: GanttTaskTreeProps) {
  const [hideCompleted, setHideCompleted] = useState(false);

  const toggleCompleted = async (task: GanttTask) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    await onUpdateTask(task.id, { status: newStatus as any, progress: newStatus === "completed" ? 100 : 0 });
  };

  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false);
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [dependencyDialogOpen, setDependencyDialogOpen] = useState(false);
  const [poDialogOpen, setPODialogOpen] = useState(false);
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
    // Load available purchase orders for this contract
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, order_number, amount_uf, supplier_name")
      .eq("contract_id", contractId)
      .order("order_date", { ascending: false });
    setPurchaseOrders(data || []);
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

    return (
      <div key={task.id}>
        <Collapsible defaultOpen={level < 2}>
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
                  <ChevronDown className="h-4 w-4 transition-transform [[data-state=closed]_&]:-rotate-90" />
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
                <span>
                  {task.duration_days} días {task.duration_type === "business" ? "háb." : "corr."}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => toggleCompleted(task)}
                title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
              >
                <CheckCircle2 className={cn("h-4 w-4", isCompleted ? "text-primary" : "text-muted-foreground")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleAddTaskClick(task.id)}
                title="Agregar subtarea"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleEditClick(task)}
                title="Editar"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleDependencyClick(task)}
                title="Dependencias"
              >
                <Link className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handlePOClick(task)}
                title="Órdenes de Compra"
              >
                <ShoppingCart className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteTask(task.id)}
                title="Eliminar"
              >
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Tareas</h3>
        <div className="flex items-center gap-2">
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
            <Button variant="outline" size="sm" onClick={() => onExportPDF(hideCompleted)}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          )}
          <Button onClick={() => handleAddTaskClick(null)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Agregar Tarea Madre
          </Button>
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
                  min={1}
                  value={editForm.duration_days}
                  onChange={(e) => setEditForm({ ...editForm, duration_days: parseInt(e.target.value) || 1 })}
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

      {/* Dependency Dialog */}
      <Dialog open={dependencyDialogOpen} onOpenChange={setDependencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dependencias de: {selectedTask?.name}</DialogTitle>
            <DialogDescription>
              Define qué tareas deben completarse (o iniciarse) antes de esta, con desfase opcional en días.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Current dependencies */}
            {selectedTask?.dependencies && selectedTask.dependencies.length > 0 && (
              <div className="space-y-2">
                <Label>Dependencias actuales</Label>
                <div className="space-y-2">
                  {selectedTask.dependencies.map((dep) => {
                    const depTask = allTasks.find((t) => t.id === dep.depends_on_task_id);
                    return (
                      <div
                        key={dep.id}
                        className="flex items-center gap-2 p-2 bg-muted rounded"
                      >
                        <span className="flex-1 truncate text-sm">{depTask?.name || "Tarea no encontrada"}</span>
                        <Select
                          value={dep.dep_type ?? "end"}
                          onValueChange={(v) => onUpdateDependency?.(dep.id, { dep_type: v as "start" | "end" })}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="end">al término</SelectItem>
                            <SelectItem value="start">al inicio</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="h-8 w-20 text-xs"
                          defaultValue={dep.lag_days ?? 0}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== (dep.lag_days ?? 0)) onUpdateDependency?.(dep.id, { lag_days: val });
                          }}
                          title="Días de desfase (+ retrasa, − adelanta)"
                        />
                        <span className="text-xs text-muted-foreground">días</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onRemoveDependency(dep.id)}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Desfase: positivo retrasa, negativo adelanta. "Al término" empieza después de que termine la otra; "al inicio" se ancla al inicio de la otra.
                </p>
              </div>
            )}

            {/* Add new dependency */}
            <AddDependencyForm
              selectedTask={selectedTask}
              allTasks={allTasks}
              onAdd={(taskId, dep_type, lag_days) =>
                onAddDependency(selectedTask!.id, taskId, { dep_type, lag_days })
              }
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setDependencyDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
