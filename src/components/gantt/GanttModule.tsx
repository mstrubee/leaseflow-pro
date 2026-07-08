import { useEffect, useState } from "react";
import { addMonths, format } from "date-fns";
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
import { CalendarDays, List, Plus, Loader2, FileStack, Save, RefreshCw, Trash2, Database, ArrowDownToLine } from "lucide-react";
import { exportGanttToPDF } from "./ganttExportPDF";
import { downloadGanttFullExport } from "@/lib/ganttFullExport";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface GanttModuleProps {
  contractId?: string;
  serviceContractId?: string;
}

export function GanttModule({ contractId, serviceContractId }: GanttModuleProps) {
  const { isAdmin, hasPermission } = useAuth();
  const { toast } = useToast();
  const canEdit = isAdmin || hasPermission("contract_gantt", "edit");
  // Usuarios que solo pueden VER: pueden reprogramar y marcar completado,
  // pero no editar plazos ni estructura de tareas.
  const canInteract = canEdit || hasPermission("contract_gantt", "view");
  const {
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
    addTask,
    updateTask,
    deleteTask,
    undoDelete,
    addDependency,
    updateDependency,
    removeDependency,
    discardTask,
    restoreTask,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    saveAsNewTemplate,
    syncTemplateFromTimeline,
    applyTemplateUpdates,
    deleteTimeline,
    reload,
  } = useGantt(contractId ?? null, serviceContractId);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState("Línea de Tiempo Principal");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [creationSource, setCreationSource] = useState<"empty" | "template" | "capex">("empty");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [syncTemplateDialogOpen, setSyncTemplateDialogOpen] = useState(false);
  const [syncTargetTemplateId, setSyncTargetTemplateId] = useState<string>("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rentStartDate, setRentStartDate] = useState<string | null>(null);
  const [exportingFull, setExportingFull] = useState(false);

  const handleExportFull = async () => {
    setExportingFull(true);
    try {
      await downloadGanttFullExport();
      toast({ title: "Exportación completa", description: "Se descargó el JSON unificado de cronogramas." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error de exportación", description: e?.message || String(e) });
    } finally {
      setExportingFull(false);
    }
  };

  useEffect(() => {
    if (!contractId) { setRentStartDate(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: contract } = await supabase
          .from("contracts")
          .select("signed_date")
          .eq("id", contractId)
          .maybeSingle();
        const { data: version } = await supabase
          .from("contract_versions")
          .select("effective_date, grace_months")
          .eq("contract_id", contractId)
          .eq("is_current", true)
          .maybeSingle();
        if (cancelled) return;
        const baseStr = version?.effective_date || contract?.signed_date;
        if (!baseStr) {
          setRentStartDate(null);
          return;
        }
        const base = new Date(baseStr + "T00:00:00");
        const grace = version?.grace_months ?? 0;
        const start = addMonths(base, grace);
        setRentStartDate(format(start, "yyyy-MM-dd"));
      } catch {
        if (!cancelled) setRentStartDate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const handleDeleteTimeline = async () => {
    const ok = await deleteTimeline();
    if (ok) setConfirmDeleteOpen(false);
  };

  const baseTemplate = templates.find((t) => t.id === timeline?.template_id);

  const handleCreateTimeline = async () => {
    let result = null;
    if (creationSource === "capex") {
      result = await createTimelineFromCapex(newTimelineName);
    } else if (creationSource === "template" && selectedTemplateId) {
      result = await createTimeline(newTimelineName, selectedTemplateId);
    } else {
      result = await createTimeline(newTimelineName);
    }
    if (result) {
      setCreateDialogOpen(false);
      setNewTimelineName("Línea de Tiempo Principal");
      setSelectedTemplateId("");
      setCreationSource("empty");
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

  // Actualiza la plantilla base con este cronograma, preservando los vínculos
  // de los cronogramas ya derivados (solo dependencias y plazos).
  const handleUpdateBase = async () => {
    if (!timeline?.template_id) return;
    const r = await syncTemplateFromTimeline(timeline.template_id);
    if (r) setConfirmUpdateOpen(false);
  };

  // Actualiza este cronograma (derivado) trayendo dependencias y plazos de su plantilla base.
  const handleApplyFromTemplate = async () => {
    const ok = await applyTemplateUpdates();
    if (ok) setConfirmApplyOpen(false);
  };

  // Para un cronograma origen (sin plantilla base): elegir qué plantilla actualizar.
  const handleSyncPickedTemplate = async () => {
    if (!syncTargetTemplateId) return;
    const r = await syncTemplateFromTimeline(syncTargetTemplateId);
    if (r) { setSyncTemplateDialogOpen(false); setSyncTargetTemplateId(""); }
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
                  <Label>Origen</Label>
                  <Select
                    value={creationSource}
                    onValueChange={(v) => setCreationSource(v as "empty" | "template" | "capex")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empty">Empezar vacío</SelectItem>
                      <SelectItem value="template">Desde una plantilla</SelectItem>
                      {!serviceContractId && (
                        <SelectItem value="capex">Importar desde CAPEX (Control Presupuestario)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {creationSource === "template" && (
                  <div className="space-y-2">
                    <Label>Plantilla</Label>
                    <Select
                      value={selectedTemplateId || ""}
                      onValueChange={(value) => setSelectedTemplateId(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una plantilla" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {creationSource === "capex" && (
                  <p className="text-xs text-muted-foreground">
                    Se importarán todas las líneas (madre e hijas) del presupuesto CAPEX manteniendo la jerarquía. Las fechas y duraciones quedarán en blanco para que las completes.
                  </p>
                )}
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
                  disabled={saving || !newTimelineName.trim() || (creationSource === "template" && !selectedTemplateId)}
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
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={saving || exportingFull}
                onClick={handleExportFull}
                title="Exporta todos los cronogramas y plantillas en un único JSON para migración"
              >
                {exportingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                Exportar JSON
              </Button>
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
                  {baseTemplate ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setConfirmUpdateOpen(true)}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Actualizar plantilla "{baseTemplate.name}" con este cronograma
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setConfirmApplyOpen(true)}>
                        <ArrowDownToLine className="h-4 w-4 mr-2" />
                        Actualizar este cronograma desde "{baseTemplate.name}"
                      </DropdownMenuItem>
                    </>
                  ) : (
                    templates.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setSyncTargetTemplateId(""); setSyncTemplateDialogOpen(true); }}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Actualizar una plantilla con este cronograma…
                        </DropdownMenuItem>
                      </>
                    )
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

      {/* Confirm update base template (con este cronograma) */}
      <AlertDialog open={confirmUpdateOpen} onOpenChange={setConfirmUpdateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actualizar plantilla con este cronograma</AlertDialogTitle>
            <AlertDialogDescription>
              Se sincronizarán las <span className="font-medium">dependencias y plazos</span> de este cronograma hacia la plantilla <span className="font-medium">"{baseTemplate?.name}"</span>, conservando los vínculos de los cronogramas ya creados desde ella. Luego, cada uno de esos cronogramas podrá traer estos cambios con el botón "Actualizar este cronograma desde la plantilla".
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

      {/* Confirm apply template -> this timeline */}
      <AlertDialog open={confirmApplyOpen} onOpenChange={setConfirmApplyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actualizar cronograma desde la plantilla</AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazarán las <span className="font-medium">dependencias y plazos</span> de este cronograma con los de la plantilla <span className="font-medium">"{baseTemplate?.name}"</span> y se recalcularán las fechas. No se modifican el avance, el estado ni las notas de las tareas. Las tareas o dependencias agregadas manualmente que no provienen de la plantilla se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyFromTemplate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Actualizar cronograma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pick a template to update (para cronograma origen sin plantilla base) */}
      <Dialog open={syncTemplateDialogOpen} onOpenChange={setSyncTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar una plantilla con este cronograma</DialogTitle>
            <DialogDescription>
              Este cronograma no está vinculado a una plantilla. Elige a qué plantilla llevar sus dependencias y plazos. El emparejamiento se hace por nombre de tarea, conservando los vínculos de los cronogramas ya derivados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Plantilla a actualizar</Label>
            <Select value={syncTargetTemplateId} onValueChange={setSyncTargetTemplateId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar plantilla..." /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncTemplateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSyncPickedTemplate} disabled={saving || !syncTargetTemplateId}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Actualizar plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete timeline */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Carta Gantt</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la línea de tiempo <span className="font-medium">"{timeline.name}"</span> junto con todas sus tareas, dependencias y vínculos a órdenes de compra. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTimeline}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar Carta Gantt
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
              orgMembers={orgMembers}
              onUpdateTask={updateTask}
              onAddTask={addTask}
              onDeleteTask={deleteTask}
              onUndoDelete={undoDelete}
              onAddDependency={addDependency}
              onRemoveDependency={removeDependency}
              onUpdateDependency={updateDependency}
              onDiscardTask={discardTask}
              onRestoreTask={restoreTask}
              onReorderTask={reorderTask}
              isAdmin={canEdit}
              canReprogram={canInteract}
              canComplete={canInteract}
              rentStartDate={rentStartDate}
              onExportPDF={async (hideCompleted, mode, selectedParentIds) => {
                let contractName = "Contrato";
                try {
                  const { data } = await supabase.from("contracts").select("name").eq("id", contractId).maybeSingle();
                  if (data?.name) contractName = data.name;
                } catch {}
                if (mode === "all") {
                  await exportGanttToPDF(taskTree, tasks, holidays, {
                    contractName,
                    timelineName: timeline.name,
                    hideCompleted,
                    orgMembers,
                  });
                } else {
                  const parents = mode === "selected"
                    ? taskTree.filter(t => selectedParentIds?.includes(t.id))
                    : taskTree;
                  for (const parent of parents) {
                    await exportGanttToPDF([parent], tasks, holidays, {
                      contractName: `${contractName} — ${parent.name}`,
                      timelineName: timeline.name,
                      hideCompleted,
                      orgMembers,
                    });
                  }
                }
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
              onUpdateDependency={updateDependency}
              onDiscardTask={discardTask}
              onRestoreTask={restoreTask}
              onLinkPurchaseOrder={linkPurchaseOrder}
              onUnlinkPurchaseOrder={unlinkPurchaseOrder}
              onExportPDF={async (hideCompleted, mode, selectedParentIds) => {
                let contractName = "Contrato";
                try {
                  const { data } = await supabase.from("contracts").select("name").eq("id", contractId).maybeSingle();
                  if (data?.name) contractName = data.name;
                } catch {}
                if (mode === "all") {
                  await exportGanttToPDF(taskTree, tasks, holidays, {
                    contractName,
                    timelineName: timeline.name,
                    hideCompleted,
                    orgMembers,
                  });
                } else {
                  const parents = mode === "selected"
                    ? taskTree.filter(t => selectedParentIds?.includes(t.id))
                    : taskTree;
                  for (const parent of parents) {
                    await exportGanttToPDF([parent], tasks, holidays, {
                      contractName: `${contractName} — ${parent.name}`,
                      timelineName: timeline.name,
                      hideCompleted,
                      orgMembers,
                    });
                  }
                }
              }}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
