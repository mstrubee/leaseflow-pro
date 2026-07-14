import { useEffect, useState } from "react";
import { addMonths, format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useGantt, type GanttTask } from "@/hooks/useGantt";
import { GanttChart } from "./GanttChart";
import { GanttTaskTree } from "./GanttTaskTree";
import { CapexLineSelector, getAllCapexLineIds, type CapexSelectionMode } from "./CapexLineSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, List, Plus, Loader2, FileStack, Save, RefreshCw, Trash2, Database, ArrowDownToLine, Star, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { exportGanttToPDF } from "./ganttExportPDF";
import { downloadGanttFullExport } from "@/lib/ganttFullExport";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface GanttModuleProps {
  contractId?: string;
  serviceContractId?: string;
  // "maintenance" renderiza la subsección "Cronogramas de Mantenciones" —
  // un cronograma aparte, independiente del principal del contrato.
  category?: "general" | "maintenance";
}

export function GanttModule({ contractId, serviceContractId, category = "general" }: GanttModuleProps) {
  const isMaintenance = category === "maintenance";
  const { isAdmin, hasPermission } = useAuth();
  const { toast } = useToast();
  const canEdit = isAdmin || hasPermission("contract_gantt", "edit");
  // Usuarios que solo pueden VER: pueden reprogramar y marcar completado,
  // pero no editar plazos ni estructura de tareas.
  const canInteract = canEdit || hasPermission("contract_gantt", "view");
  const {
    timeline,
    timelines,
    selectTimeline,
    setPriorityTimeline,
    tasks,
    taskTree,
    holidays,
    templates,
    orgMembers,
    loading,
    saving,
    capexLines,
    capexLinesLoading,
    loadCapexLines,
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
    getDescendantCount,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    saveAsNewTemplate,
    syncTemplateFromTimeline,
    applyTemplateUpdates,
    deleteTimeline,
    reload,
  } = useGantt(contractId ?? null, serviceContractId, category);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState(
    isMaintenance ? "Cronograma de Mantenciones" : "Línea de Tiempo Principal"
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [creationSource, setCreationSource] = useState<"empty" | "template" | "capex">("empty");
  const [capexScope, setCapexScope] = useState<"all" | "select">("all");
  const [capexMode, setCapexMode] = useState<CapexSelectionMode>("hierarchy");
  const [selectedCapexLineIds, setSelectedCapexLineIds] = useState<Set<string>>(new Set());
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
  // Filtro por año/mes — solo para "Cronogramas de Mantenciones": permite ver
  // qué tareas están vigentes en un período puntual sin perder el historial
  // (las tareas de otros meses siguen existiendo, solo se ocultan de la vista).
  const [filterYear, setFilterYear] = useState<number | "all">("all");
  const [filterMonth, setFilterMonth] = useState<number | "all">("all");

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

  // Al elegir CAPEX como origen, cargar sus líneas para poder elegir cuáles
  // importar (o simplemente mostrar el mensaje de "sin presupuesto").
  useEffect(() => {
    if (creationSource !== "capex" || !contractId) return;
    loadCapexLines();
  }, [creationSource, contractId, loadCapexLines]);

  // Por defecto, al activar la selección manual parte con todo marcado
  // (el usuario desmarca lo que no quiere importar).
  useEffect(() => {
    if (capexScope === "select") setSelectedCapexLineIds(getAllCapexLineIds(capexLines));
  }, [capexScope, capexLines]);

  const handleDeleteTimeline = async () => {
    const ok = await deleteTimeline();
    if (ok) setConfirmDeleteOpen(false);
  };

  const baseTemplate = templates.find((t) => t.id === timeline?.template_id);

  // Solo para Mantenciones: ¿la tarea (hoja) está vigente en el año/mes elegido?
  // Las tareas madre no se evalúan directamente — se conservan si alguna
  // descendiente aplica, para no romper la jerarquía visualmente.
  const taskInPeriod = (t: GanttTask): boolean => {
    if (filterYear === "all" && filterMonth === "all") return true;
    if (!t.start_date || !t.end_date) return false;
    const year = filterYear === "all" ? null : filterYear;
    const month = filterMonth === "all" ? null : filterMonth; // 1-12
    const periodStart = new Date(year ?? parseISO(t.start_date).getFullYear(), month ? month - 1 : 0, 1);
    const periodEnd = year && month
      ? new Date(year, month, 0)
      : year
        ? new Date(year, 11, 31)
        : new Date(parseISO(t.end_date).getFullYear(), month ? month : 11, month ? 0 : 31);
    const taskStart = parseISO(t.start_date);
    const taskEnd = parseISO(t.end_date);
    return taskStart <= periodEnd && taskEnd >= periodStart;
  };

  const filterTreeByPeriod = (nodes: GanttTask[]): GanttTask[] => {
    if (filterYear === "all" && filterMonth === "all") return nodes;
    const result: GanttTask[] = [];
    for (const n of nodes) {
      const children = n.children ? filterTreeByPeriod(n.children) : undefined;
      const hasMatchingChildren = !!children && children.length > 0;
      const selfMatches = !n.children?.length && taskInPeriod(n);
      if (!selfMatches && !hasMatchingChildren) continue;
      result.push({ ...n, children });
    }
    return result;
  };

  const filteredTaskTree = isMaintenance ? filterTreeByPeriod(taskTree) : taskTree;

  const handleCreateTimeline = async () => {
    let result = null;
    if (creationSource === "capex") {
      const lineIds = capexScope === "select" ? Array.from(selectedCapexLineIds) : undefined;
      result = await createTimelineFromCapex(newTimelineName, lineIds);
    } else if (creationSource === "template" && selectedTemplateId) {
      result = await createTimeline(newTimelineName, selectedTemplateId);
    } else {
      result = await createTimeline(newTimelineName);
    }
    if (result) {
      setCreateDialogOpen(false);
      setNewTimelineName("");
      setSelectedTemplateId("");
      setCreationSource("empty");
      setCapexScope("all");
      setSelectedCapexLineIds(new Set());
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

  // Diálogo de creación compartido: se usa tanto cuando no hay cronogramas
  // como para agregar cronogramas adicionales al contrato.
  const handleCreateDialogOpenChange = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      setCreationSource("empty");
      setCapexScope("all");
      setSelectedCapexLineIds(new Set());
    }
  };

  const createTimelineDialog = (
    <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{timelines.length > 0 ? "Nuevo cronograma" : "Crear Línea de Tiempo"}</DialogTitle>
          <DialogDescription>
            {timelines.length > 0
              ? "Crea un cronograma adicional para este contrato. El principal se mantiene sin cambios."
              : "Crea una nueva línea de tiempo para este contrato. Puedes partir desde una plantilla predefinida."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="timeline-name">Nombre</Label>
            <Input
              id="timeline-name"
              value={newTimelineName}
              onChange={(e) => setNewTimelineName(e.target.value)}
              placeholder={timelines.length > 0 ? "Ej: Escenario alternativo" : "Línea de Tiempo Principal"}
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
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Las fechas y duraciones quedarán en blanco para que las completes.
              </p>
              <div className="space-y-2">
                <Label>Líneas a importar</Label>
                <Select value={capexScope} onValueChange={(v) => setCapexScope(v as "all" | "select")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las líneas</SelectItem>
                    <SelectItem value="select">Seleccionar líneas específicas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {capexScope === "select" && (
                capexLinesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando líneas del presupuesto…
                  </div>
                ) : capexLines.length === 0 ? (
                  <p className="text-sm text-destructive">
                    Este contrato no tiene un presupuesto CAPEX con líneas para importar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Select value={capexMode} onValueChange={(v) => setCapexMode(v as CapexSelectionMode)}>
                        <SelectTrigger className="h-8 w-[220px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hierarchy" className="text-xs">Con jerarquía (arrastra hijas)</SelectItem>
                          <SelectItem value="line" className="text-xs">Línea a línea</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setSelectedCapexLineIds(getAllCapexLineIds(capexLines))}
                        >
                          Seleccionar todas
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setSelectedCapexLineIds(new Set())}
                        >
                          Ninguna
                        </Button>
                      </div>
                    </div>
                    <CapexLineSelector
                      lines={capexLines}
                      selectedIds={selectedCapexLineIds}
                      onChange={setSelectedCapexLineIds}
                      mode={capexMode}
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedCapexLineIds.size} de {capexLines.length} líneas seleccionadas
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleCreateDialogOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreateTimeline}
            disabled={
              saving ||
              !newTimelineName.trim() ||
              (creationSource === "template" && !selectedTemplateId) ||
              (creationSource === "capex" && capexScope === "select" && selectedCapexLineIds.size === 0)
            }
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Subsección "Cronogramas de Mantenciones": un cronograma aparte para el
  // mismo contrato, independiente del principal — solo se renderiza desde la
  // instancia "general" (evita anidar recursivamente sobre sí misma), y solo
  // para contratos de arriendo (no aplica a contratos de servicio).
  const maintenanceSection = !isMaintenance && contractId && !serviceContractId && (
    <CollapsibleCard
      title="Cronogramas de Mantenciones"
      description="Cronograma de mantenciones de este local, independiente del cronograma principal del contrato."
      icon={<Wrench className="h-5 w-5 text-amber-500" />}
      defaultOpen={false}
    >
      <GanttModule contractId={contractId} category="maintenance" />
    </CollapsibleCard>
  );

  // No timeline yet - show creation option
  if (!timeline) {
    return (
      <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isMaintenance ? <Wrench className="h-5 w-5 text-amber-500" /> : <CalendarDays className="h-5 w-5" />}
            {isMaintenance ? "Cronogramas de Mantenciones" : "Línea de Tiempo / Gantt"}
          </CardTitle>
          <CardDescription>
            {isMaintenance
              ? "Cronograma de mantenciones de este local, independiente del cronograma principal del contrato."
              : "Crea una línea de tiempo para planificar y hacer seguimiento del proyecto"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {isMaintenance ? "Crear Cronograma de Mantenciones" : "Crear Línea de Tiempo"}
          </Button>
          {createTimelineDialog}
        </CardContent>
      </Card>
      {maintenanceSection}
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 flex-wrap">
              {isMaintenance ? <Wrench className="h-5 w-5 text-amber-500" /> : <CalendarDays className="h-5 w-5" />}
              {timeline.name}
              {isMaintenance && (
                <Badge variant="outline" className="gap-1 text-xs font-medium border-amber-300 text-amber-700 bg-amber-50">
                  <Wrench className="h-3 w-3" />
                  Mantenciones
                </Badge>
              )}
              {timeline.is_priority && (
                <Badge variant="secondary" className="gap-1 text-xs font-medium">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  Principal
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Línea de tiempo del proyecto con {tasks.length} tareas
              {baseTemplate && <> · Plantilla base: <span className="font-medium">{baseTemplate.name}</span></>}
            </CardDescription>
            {timelines.length > 1 && (
              <div className="mt-2">
                <Select value={timeline.id} onValueChange={selectTimeline}>
                  <SelectTrigger className="h-8 w-[300px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timelines.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.name}{t.is_priority ? " ★ Principal" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!isMaintenance && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={saving}
                onClick={() => {
                  setNewTimelineName("");
                  setCreateDialogOpen(true);
                }}
                title="Crear un cronograma adicional para este contrato"
              >
                <Plus className="h-4 w-4" />
                Nuevo cronograma
              </Button>
              )}
              {!isMaintenance && isAdmin && !timeline.is_priority && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={saving}
                  onClick={() => setPriorityTimeline(timeline.id)}
                  title="Convertir este cronograma en el principal del contrato"
                >
                  <Star className="h-4 w-4" />
                  Hacer principal
                </Button>
              )}
              {!isMaintenance && isAdmin && (
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
              )}
              {!isMaintenance && isAdmin && (
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
              )}
              {(isAdmin || !timeline.is_priority) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => setConfirmDeleteOpen(true)}
                  title={timeline.is_priority ? "Eliminar el cronograma principal (solo administradores)" : "Eliminar este cronograma"}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      {createTimelineDialog}

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
              {timeline.is_priority && (
                <span className="block mt-2 font-medium text-destructive">
                  Este es el cronograma principal del contrato. Al eliminarlo, el contrato quedará sin cronograma principal hasta que un administrador designe uno nuevo con "Hacer principal".
                </span>
              )}
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
        {isMaintenance && (() => {
          const currentYear = new Date().getFullYear();
          const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);
          const monthNames = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
          ];
          return (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Filtrar por período:</span>
              <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(v === "all" ? "all" : parseInt(v))}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue placeholder="Año" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los años</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(v === "all" ? "all" : parseInt(v))}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {monthNames.map((m, idx) => (
                    <SelectItem key={m} value={String(idx + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterYear !== "all" || filterMonth !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterYear("all"); setFilterMonth("all"); }}>
                  Limpiar filtro
                </Button>
              )}
            </div>
          );
        })()}
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
              taskTree={filteredTaskTree}
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
              getDescendantCount={getDescendantCount}
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
              tasks={filteredTaskTree}
              allTasks={tasks}
              holidays={holidays}
              contractId={contractId}
              onAddTask={addTask}
              onUpdateTask={async (taskId, updates) => { await updateTask(taskId, updates); }}
              onDeleteTask={deleteTask}
              onAddDependency={addDependency}
              onRemoveDependency={removeDependency}
              onUpdateDependency={updateDependency}
              onDiscardTask={discardTask}
              onRestoreTask={restoreTask}
              getDescendantCount={getDescendantCount}
              onLinkPurchaseOrder={linkPurchaseOrder}
              onUnlinkPurchaseOrder={unlinkPurchaseOrder}
              canAdd={canEdit}
              canEdit={canEdit}
              canDelete={canEdit}
              canManageDeps={canEdit || hasPermission("gantt_dependencias", "edit")}
              canComplete={canInteract}
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
    {maintenanceSection}
    </div>
  );
}
