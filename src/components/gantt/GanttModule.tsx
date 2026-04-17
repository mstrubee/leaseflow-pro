import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useGantt } from "@/hooks/useGantt";
import { GanttChart } from "./GanttChart";
import { GanttTaskTree } from "./GanttTaskTree";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, List, Plus, Loader2, FileStack, Save, RefreshCw, Trash2 } from "lucide-react";
import { exportGanttToPDF } from "./ganttExportPDF";
import { supabase } from "@/integrations/supabase/client";

interface GanttModuleProps {
  contractId: string;
}

export function GanttModule({ contractId }: GanttModuleProps) {
  const { isAdmin } = useAuth();
  const {
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
    saveAsNewTemplate,
    updateBaseTemplate,
    deleteTimeline,
    reload,
  } = useGantt(contractId);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState("Línea de Tiempo Principal");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const handleDeleteTimeline = async () => {
    const ok = await deleteTimeline();
    if (ok) setConfirmDeleteOpen(false);
  };

  const baseTemplate = templates.find((t) => t.id === timeline?.template_id);

  const handleCreateTimeline = async () => {
    const result = await createTimeline(
      newTimelineName,
      selectedTemplateId || undefined
    );
    if (result) {
      setCreateDialogOpen(false);
      setNewTimelineName("Línea de Tiempo Principal");
      setSelectedTemplateId("");
    }
  };

  const handleSaveAsNew = async () => {
    if (!newTemplateName.trim()) return;
    const r = await saveAsNewTemplate(newTemplateName.trim(), newTemplateDesc.trim() || undefined);
    if (r) {
      setSaveTemplateOpen(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
    }
  };

  const handleUpdateBase = async () => {
    const ok = await updateBaseTemplate();
    if (ok) setConfirmUpdateOpen(false);
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

  // No timeline yet - show creation option
  if (!timeline) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Línea de Tiempo / Gantt
          </CardTitle>
          <CardDescription>
            Crea una línea de tiempo para planificar y hacer seguimiento del proyecto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Crear Línea de Tiempo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Línea de Tiempo</DialogTitle>
                <DialogDescription>
                  Crea una nueva línea de tiempo para este contrato. Puedes partir desde una plantilla predefinida.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="timeline-name">Nombre</Label>
                  <Input
                    id="timeline-name"
                    value={newTimelineName}
                    onChange={(e) => setNewTimelineName(e.target.value)}
                    placeholder="Línea de Tiempo Principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plantilla (opcional)</Label>
                  <Select
                    value={selectedTemplateId || "none"}
                    onValueChange={(value) => setSelectedTemplateId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin plantilla - empezar vacío" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin plantilla</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateTimeline}
                  disabled={saving || !newTimelineName.trim()}
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {timeline.name}
            </CardTitle>
            <CardDescription>
              Línea de tiempo del proyecto con {tasks.length} tareas
              {baseTemplate && <> · Plantilla base: <span className="font-medium">{baseTemplate.name}</span></>}
            </CardDescription>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" disabled={saving}>
                    <FileStack className="h-4 w-4" />
                    Plantilla
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
                  <DropdownMenuItem
                    onClick={() => {
                      setNewTemplateName(timeline.name);
                      setNewTemplateDesc("");
                      setSaveTemplateOpen(true);
                    }}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Crear nueva plantilla desde este Gantt
                  </DropdownMenuItem>
                  {baseTemplate && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setConfirmUpdateOpen(true)}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Actualizar plantilla "{baseTemplate.name}"
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Save as new template dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear plantilla desde este cronograma</DialogTitle>
            <DialogDescription>
              Se generará una nueva plantilla en Administración con la estructura actual de tareas, duraciones y dependencias.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Nombre de la plantilla</Label>
              <Input id="tpl-name" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Descripción (opcional)</Label>
              <Textarea id="tpl-desc" value={newTemplateDesc} onChange={(e) => setNewTemplateDesc(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveAsNew} disabled={saving || !newTemplateName.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm update base template */}
      <AlertDialog open={confirmUpdateOpen} onOpenChange={setConfirmUpdateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actualizar plantilla base</AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazará el contenido de la plantilla <span className="font-medium">"{baseTemplate?.name}"</span> con la estructura actual de este cronograma. Esta acción no afecta a otros contratos que ya hayan creado su Gantt desde esta plantilla, pero sí cambiará la base para futuros usos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateBase} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Actualizar plantilla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CardContent>
        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="chart" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Diagrama Gantt
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              Lista de Tareas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <GanttChart
              tasks={tasks}
              taskTree={taskTree}
              holidays={holidays}
              onUpdateTask={updateTask}
              onAddTask={addTask}
              onDeleteTask={deleteTask}
              onAddDependency={addDependency}
              onRemoveDependency={removeDependency}
              onReorderTask={reorderTask}
              isAdmin={isAdmin}
              onExportPDF={async (hideCompleted) => {
                let contractName = "Contrato";
                try {
                  const { data } = await supabase.from("contracts").select("name").eq("id", contractId).maybeSingle();
                  if (data?.name) contractName = data.name;
                } catch {}
                await exportGanttToPDF(taskTree, tasks, holidays, {
                  contractName,
                  timelineName: timeline.name,
                  hideCompleted,
                });
              }}
            />
          </TabsContent>

          <TabsContent value="list">
            <GanttTaskTree
              tasks={taskTree}
              allTasks={tasks}
              holidays={holidays}
              contractId={contractId}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onAddDependency={addDependency}
              onRemoveDependency={removeDependency}
              onLinkPurchaseOrder={linkPurchaseOrder}
              onUnlinkPurchaseOrder={unlinkPurchaseOrder}
              onExportPDF={async (hideCompleted) => {
                let contractName = "Contrato";
                try {
                  const { data } = await supabase.from("contracts").select("name").eq("id", contractId).maybeSingle();
                  if (data?.name) contractName = data.name;
                } catch {}
                await exportGanttToPDF(taskTree, tasks, holidays, {
                  contractName,
                  timelineName: timeline.name,
                  hideCompleted,
                });
              }}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
