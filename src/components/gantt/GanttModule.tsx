import { useEffect, useRef, useState } from "react";
import { addMonths, format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useGantt, GanttTimeline } from "@/hooks/useGantt";
import { GanttChart } from "./GanttChart";
import { GanttTaskTree } from "./GanttTaskTree";
import { GanttCompareDialog } from "./GanttCompareDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays, List, Plus, Loader2, FileStack, Save, RefreshCw,
  Trash2, ChevronDown, ChevronRight, Star, GitCompare, Database, Layers, Pencil,
} from "lucide-react";
import { exportGanttToPDF } from "./ganttExportPDF";
import { supabase } from "@/integrations/supabase/client";

interface GanttModuleProps {
  contractId: string;
}

export function GanttModule({ contractId }: GanttModuleProps) {
  const { isAdmin } = useAuth();
  const { permissions } = useUserPermissions();
  const canEdit =
    isAdmin ||
    permissions.length === 0 ||
    permissions.some((p) => p.resource === "contract_gantt");

  const {
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
    addTask,
    updateTask,
    deleteTask,
    undoDelete,
    addDependency,
    updateDependency,
    removeDependency,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    saveAsNewTemplate,
    updateBaseTemplate,
    deleteTimeline,
    setPriorityTimeline,
    renameTimeline,
    reload,
  } = useGantt(contractId);

  // ── Creation dialog ──
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState("Cronograma Principal");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [creationSource, setCreationSource] = useState<"empty" | "template" | "capex">("empty");

  // ── Per-timeline UI state ──
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editingTitleRef = useRef<HTMLInputElement>(null);

  // ── Template dialogs (one active at a time) ──
  const [saveTemplateForId, setSaveTemplateForId] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [confirmUpdateId, setConfirmUpdateId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Compare dialog ──
  const [compareOpen, setCompareOpen] = useState(false);

  // ── Rent start date ──
  const [rentStartDate, setRentStartDate] = useState<string | null>(null);

  useEffect(() => {
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
        if (!baseStr) { setRentStartDate(null); return; }
        const base = new Date(baseStr + "T00:00:00");
        const grace = version?.grace_months ?? 0;
        setRentStartDate(format(addMonths(base, grace), "yyyy-MM-dd"));
      } catch {
        if (!cancelled) setRentStartDate(null);
      }
    })();
    return () => { cancelled = true; };
  }, [contractId]);

  // Focus title input when entering edit mode
  useEffect(() => {
    if (editingTitleId) {
      setTimeout(() => editingTitleRef.current?.focus(), 50);
    }
  }, [editingTitleId]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEditTitle = (tl: GanttTimeline) => {
    setEditingTitleId(tl.id);
    setEditingTitle(tl.name);
  };

  const commitTitle = async () => {
    if (editingTitleId && editingTitle.trim()) {
      await renameTimeline(editingTitleId, editingTitle.trim());
    }
    setEditingTitleId(null);
    setEditingTitle("");
  };

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
      setNewTimelineName("Cronograma Principal");
      setSelectedTemplateId("");
      setCreationSource("empty");
    }
  };

  const handleSaveAsNew = async () => {
    if (!saveTemplateForId || !newTemplateName.trim()) return;
    const r = await saveAsNewTemplate(saveTemplateForId, newTemplateName.trim(), newTemplateDesc.trim() || undefined);
    if (r) {
      setSaveTemplateForId(null);
      setNewTemplateName("");
      setNewTemplateDesc("");
    }
  };

  const handleUpdateBase = async () => {
    if (!confirmUpdateId) return;
    const ok = await updateBaseTemplate(confirmUpdateId);
    if (ok) setConfirmUpdateId(null);
  };

  const handleDeleteTimeline = async () => {
    if (!confirmDeleteId) return;
    const ok = await deleteTimeline(confirmDeleteId);
    if (ok) setConfirmDeleteId(null);
  };

  // ── Loading ──
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ── No timelines yet ──
  if (timelines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Línea de Tiempo / Gantt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Crear Línea de Tiempo
              </Button>
            </DialogTrigger>
            <CreateTimelineDialogContent
              name={newTimelineName}
              onNameChange={setNewTimelineName}
              source={creationSource}
              onSourceChange={setCreationSource}
              templateId={selectedTemplateId}
              onTemplateIdChange={setSelectedTemplateId}
              templates={templates}
              saving={saving}
              onCancel={() => setCreateDialogOpen(false)}
              onSubmit={handleCreateTimeline}
            />
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  const confirmDeleteTl = timelines.find((t) => t.id === confirmDeleteId);
  const confirmUpdateTl = timelines.find((t) => t.id === confirmUpdateId);
  const saveTemplateTl = timelines.find((t) => t.id === saveTemplateForId);

  return (
    <div className="space-y-4">
      {/* ── Header row: title + global actions ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-5 w-5" />
          Cronogramas
          <span className="text-muted-foreground text-sm font-normal">
            ({timelines.length})
          </span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {timelines.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setCompareOpen(true)}
            >
              <GitCompare className="h-4 w-4" />
              Comparar Cronogramas
            </Button>
          )}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo Cronograma
              </Button>
            </DialogTrigger>
            <CreateTimelineDialogContent
              name={newTimelineName}
              onNameChange={setNewTimelineName}
              source={creationSource}
              onSourceChange={setCreationSource}
              templateId={selectedTemplateId}
              onTemplateIdChange={setSelectedTemplateId}
              templates={templates}
              saving={saving}
              onCancel={() => setCreateDialogOpen(false)}
              onSubmit={handleCreateTimeline}
            />
          </Dialog>
        </div>
      </div>

      {/* ── Timeline sections ── */}
      {timelines.map((tl) => {
        const tlTasks = tasksByTimeline[tl.id] || [];
        const taskTree = buildTaskTree(tlTasks);
        const isCollapsed = collapsedIds.has(tl.id);
        const baseTemplate = templates.find((t) => t.id === tl.template_id);

        return (
          <Card key={tl.id} className="overflow-hidden">
            {/* Timeline header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <button
                type="button"
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleCollapse(tl.id)}
                title={isCollapsed ? "Expandir" : "Contraer"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>

              {/* Title (editable on double-click) */}
              <div className="flex-1 min-w-0">
                {editingTitleId === tl.id ? (
                  <input
                    ref={editingTitleRef}
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitTitle();
                      if (e.key === "Escape") { setEditingTitleId(null); setEditingTitle(""); }
                    }}
                    className="text-sm font-semibold bg-transparent border-b border-primary outline-none w-full max-w-xs"
                  />
                ) : (
                  <span
                    className="text-sm font-semibold cursor-pointer hover:underline decoration-dashed"
                    onDoubleClick={() => canEdit && startEditTitle(tl)}
                    title={canEdit ? "Doble clic para renombrar" : undefined}
                  >
                    {tl.name}
                  </span>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {tl.is_priority ? (
                  <Badge className="text-xs px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white gap-1">
                    <Star className="h-2.5 w-2.5" />
                    Prioritario
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    Estudio
                  </Badge>
                )}
                {tl.source === "capex" && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1 border-blue-300 text-blue-600">
                    <Database className="h-2.5 w-2.5" />
                    Desde CAPEX
                  </Badge>
                )}
                {tl.source === "template" && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1 border-violet-300 text-violet-600">
                    <Layers className="h-2.5 w-2.5" />
                    Desde plantilla
                  </Badge>
                )}
                {tl.source === "empty" && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1 text-muted-foreground">
                    <Pencil className="h-2.5 w-2.5" />
                    Desde cero
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {tlTasks.length} tarea{tlTasks.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Admin-only: Marcar prioritario + Plantilla */}
              {isAdmin && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!tl.is_priority && timelines.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      disabled={saving}
                      onClick={() => setPriorityTimeline(tl.id)}
                      title="Marcar como Prioritario"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Marcar prioritario
                    </Button>
                  )}

                  {/* Plantilla dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" disabled={saving}>
                        <FileStack className="h-3.5 w-3.5" />
                        Plantilla
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
                      <DropdownMenuItem
                        onClick={() => {
                          setSaveTemplateForId(tl.id);
                          setNewTemplateName(tl.name);
                          setNewTemplateDesc("");
                        }}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Crear nueva plantilla desde este Gantt
                      </DropdownMenuItem>
                      {baseTemplate && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setConfirmUpdateId(tl.id)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Actualizar plantilla "{baseTemplate.name}"
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/* Eliminar: Estudio → cualquier editor; Prioritario → solo admin */}
              {canEdit && (!tl.is_priority || isAdmin) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive flex-shrink-0"
                  disabled={saving}
                  onClick={() => setConfirmDeleteId(tl.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              )}
            </div>

            {/* Timeline body */}
            {!isCollapsed && (
              <CardContent className="p-0">
                <Tabs defaultValue="chart" className="w-full">
                  <TabsList className="mx-4 my-3">
                    <TabsTrigger value="chart" className="gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Diagrama Gantt
                    </TabsTrigger>
                    <TabsTrigger value="list" className="gap-2">
                      <List className="h-4 w-4" />
                      Lista de Tareas
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="chart" className="px-4 pb-4">
                    <GanttChart
                      tasks={tlTasks}
                      taskTree={taskTree}
                      holidays={holidays}
                      orgMembers={orgMembers}
                      onUpdateTask={updateTask}
                      onAddTask={(name, parentId, opts) => addTask(tl.id, name, parentId ?? null, opts)}
                      onDeleteTask={deleteTask}
                      onUndoDelete={undoDelete}
                      onAddDependency={addDependency}
                      onRemoveDependency={removeDependency}
                      onUpdateDependency={updateDependency}
                      onReorderTask={reorderTask}
                      isAdmin={canEdit}
                      rentStartDate={rentStartDate}
                      onExportPDF={async (hideCompleted, mode, selectedParentIds) => {
                        let contractName = "Contrato";
                        try {
                          const { data } = await supabase.from("contracts").select("name").eq("id", contractId).maybeSingle();
                          if (data?.name) contractName = data.name;
                        } catch {}
                        if (mode === "all") {
                          await exportGanttToPDF(taskTree, tlTasks, holidays, { contractName, timelineName: tl.name, hideCompleted, orgMembers });
                        } else {
                          const parents = mode === "selected"
                            ? taskTree.filter((t) => selectedParentIds?.includes(t.id))
                            : taskTree;
                          for (const parent of parents) {
                            await exportGanttToPDF([parent], tlTasks, holidays, { contractName: `${contractName} — ${parent.name}`, timelineName: tl.name, hideCompleted, orgMembers });
                          }
                        }
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="list" className="px-4 pb-4">
                    <GanttTaskTree
                      tasks={taskTree}
                      allTasks={tlTasks}
                      holidays={holidays}
                      contractId={contractId}
                      onAddTask={(name, parentId, opts) => addTask(tl.id, name, parentId, opts)}
                      onUpdateTask={updateTask}
                      onDeleteTask={deleteTask}
                      onAddDependency={addDependency}
                      onRemoveDependency={removeDependency}
                      onUpdateDependency={updateDependency}
                      onLinkPurchaseOrder={linkPurchaseOrder}
                      onUnlinkPurchaseOrder={unlinkPurchaseOrder}
                      onExportPDF={async (hideCompleted, mode, selectedParentIds) => {
                        let contractName = "Contrato";
                        try {
                          const { data } = await supabase.from("contracts").select("name").eq("id", contractId).maybeSingle();
                          if (data?.name) contractName = data.name;
                        } catch {}
                        if (mode === "all") {
                          await exportGanttToPDF(taskTree, tlTasks, holidays, { contractName, timelineName: tl.name, hideCompleted, orgMembers });
                        } else {
                          const parents = mode === "selected"
                            ? taskTree.filter((t) => selectedParentIds?.includes(t.id))
                            : taskTree;
                          for (const parent of parents) {
                            await exportGanttToPDF([parent], tlTasks, holidays, { contractName: `${contractName} — ${parent.name}`, timelineName: tl.name, hideCompleted, orgMembers });
                          }
                        }
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ── Save as new template dialog ── */}
      <Dialog open={!!saveTemplateForId} onOpenChange={(o) => !o && setSaveTemplateForId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear plantilla desde "{saveTemplateTl?.name}"</DialogTitle>
            <DialogDescription>
              Se generará una nueva plantilla con la estructura actual de tareas, duraciones y dependencias.
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
            <Button variant="outline" onClick={() => setSaveTemplateForId(null)}>Cancelar</Button>
            <Button onClick={handleSaveAsNew} disabled={saving || !newTemplateName.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm update base template ── */}
      <AlertDialog open={!!confirmUpdateId} onOpenChange={(o) => !o && setConfirmUpdateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Actualizar plantilla base</AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazará el contenido de la plantilla base de <span className="font-medium">"{confirmUpdateTl?.name}"</span>. Esto no afecta a otros contratos que ya tienen su Gantt creado desde esa plantilla.
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

      {/* ── Confirm delete ── */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Carta Gantt</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Esta acción eliminará permanentemente el cronograma{" "}
                  <span className="font-medium text-foreground">"{confirmDeleteTl?.name}"</span>{" "}
                  junto con todas sus tareas, dependencias y vínculos a órdenes de compra.
                  Esta acción no se puede deshacer.
                </p>
                {confirmDeleteTl?.is_priority && timelines.length > 1 && (
                  <p className="text-amber-600 font-medium">
                    Este es el cronograma Prioritario. Al eliminarlo, el cronograma más antiguo
                    restante pasará a ser el nuevo Prioritario automáticamente.
                  </p>
                )}
              </div>
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

      {/* ── Compare dialog ── */}
      <GanttCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        timelines={timelines}
        tasksByTimeline={tasksByTimeline}
        buildTaskTree={buildTaskTree}
        orgMembers={orgMembers}
        holidays={holidays}
        onUpdateTask={updateTask}
        onAddTask={addTask}
        onDeleteTask={deleteTask}
        onUndoDelete={undoDelete}
        onAddDependency={addDependency}
        onRemoveDependency={removeDependency}
        onUpdateDependency={updateDependency}
        onReorderTask={reorderTask}
        isAdmin={canEdit}
      />
    </div>
  );
}

// ── Shared creation dialog content ─────────────────────────────────────────

interface CreateTimelineDialogContentProps {
  name: string;
  onNameChange: (v: string) => void;
  source: "empty" | "template" | "capex";
  onSourceChange: (v: "empty" | "template" | "capex") => void;
  templateId: string;
  onTemplateIdChange: (v: string) => void;
  templates: { id: string; name: string }[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function CreateTimelineDialogContent({
  name, onNameChange, source, onSourceChange, templateId, onTemplateIdChange,
  templates, saving, onCancel, onSubmit,
}: CreateTimelineDialogContentProps) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Crear Cronograma</DialogTitle>
        <DialogDescription>
          Crea un nuevo cronograma para este contrato. Puedes partir desde una plantilla predefinida.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="timeline-name">Nombre</Label>
          <Input
            id="timeline-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Cronograma Principal"
          />
        </div>
        <div className="space-y-2">
          <Label>Origen</Label>
          <Select value={source} onValueChange={(v) => onSourceChange(v as "empty" | "template" | "capex")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="empty">Empezar vacío</SelectItem>
              <SelectItem value="template">Desde una plantilla</SelectItem>
              <SelectItem value="capex">Importar desde CAPEX (Control Presupuestario)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {source === "template" && (
          <div className="space-y-2">
            <Label>Plantilla</Label>
            <Select value={templateId || ""} onValueChange={onTemplateIdChange}>
              <SelectTrigger><SelectValue placeholder="Selecciona una plantilla" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {source === "capex" && (
          <p className="text-xs text-muted-foreground">
            Se importarán todas las líneas (madre e hijas) del presupuesto CAPEX manteniendo la jerarquía. Las fechas y duraciones quedarán en blanco para que las completes.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={onSubmit}
          disabled={saving || !name.trim() || (source === "template" && !templateId)}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Crear
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
