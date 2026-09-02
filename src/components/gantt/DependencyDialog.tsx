import { useState, useMemo, useEffect, useRef } from "react";
import { format, parseISO } from "date-fns";
import { GanttTask } from "@/hooks/useGantt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronRight, ChevronDown, Search, Unlink, Link2, ChevronsDownUp, ChevronsUpDown, X, CornerDownRight,
  ListChecks, Zap, Loader2, Sparkles, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusDot } from "./TaskStatusActions";

type DepOptions = { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" };

interface DependencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: GanttTask | null;
  allTasks: GanttTask[];
  onAddDependency: (taskId: string, dependsOnTaskId: string, options?: DepOptions) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onUpdateDependency?: (dependencyId: string, updates: DepOptions) => Promise<void>;
  onUpdateTask?: (taskId: string, updates: Partial<GanttTask>) => Promise<void>;
}

interface TreeNode {
  task: GanttTask;
  children: TreeNode[];
}

// Fila de dependencia en edición local (borrador): no se persiste hasta Guardar.
interface DraftDep {
  id: string;
  depends_on_task_id: string;
  dep_type: "start" | "end";
  lag_days: number;
  lag_type: "calendar" | "business";
  isNew?: boolean;
}

const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

// Campo de "días de desfase". Usa un input de TEXTO con estado propio (no
// type=number) porque en Safari el .select() no funciona sobre inputs
// numéricos, así que el 0 por defecto no se reemplazaba al escribir. Con
// estado de texto local el campo puede quedar vacío mientras se escribe y
// acepta el signo negativo; el valor numérico se emite al padre en cada
// cambio válido y se re-sincroniza al perder el foco.
function LagInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={className}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Permitir vacío o solo "-" mientras se escribe; solo enteros con signo.
        if (raw === "" || raw === "-" || /^-?\d+$/.test(raw)) {
          setText(raw);
          const n = parseInt(raw, 10);
          onChange(Number.isNaN(n) ? 0 : n);
        }
      }}
      onBlur={() => {
        focused.current = false;
        setText(String(value));
      }}
      title="Días de desfase (+ retrasa, − adelanta)"
    />
  );
}

export function DependencyDialog({
  open,
  onOpenChange,
  selectedTask,
  allTasks,
  onAddDependency,
  onRemoveDependency,
  onUpdateDependency,
  onUpdateTask,
}: DependencyDialogProps) {
  // --- Borrador local: nada de esto se persiste hasta que el usuario confirma Guardar ---
  const [draftDeps, setDraftDeps] = useState<DraftDep[]>([]);
  const [originalDeps, setOriginalDeps] = useState<DraftDep[]>([]);
  const [draftJoinMode, setDraftJoinMode] = useState<"all" | "any">("all");
  const [originalJoinMode, setOriginalJoinMode] = useState<"all" | "any">("all");
  const [pendingAction, setPendingAction] = useState<null | "save" | "discard">(null);
  const [committing, setCommitting] = useState(false);

  const [predecessorId, setPredecessorId] = useState<string>("");
  const [depType, setDepType] = useState<"start" | "end">("end");
  const [lag, setLag] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  // Mapas base
  const byId = useMemo(() => {
    const m = new Map<string, GanttTask>();
    for (const t of allTasks) m.set(t.id, t);
    return m;
  }, [allTasks]);

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, GanttTask[]>();
    for (const t of allTasks) {
      const key = t.parent_id ?? null;
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return m;
  }, [allTasks]);

  const tree = useMemo(() => {
    const build = (parentId: string | null): TreeNode[] =>
      (childrenOf.get(parentId) ?? []).map((task) => ({ task, children: build(task.id) }));
    return build(null);
  }, [childrenOf]);

  const pathOf = (id: string | null | undefined): string => {
    const segs: string[] = [];
    let cursor = id ? byId.get(id) : undefined;
    let guard = 0;
    while (cursor && guard < 100) {
      segs.unshift(cursor.name);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
      guard++;
    }
    return segs.join("  /  ");
  };

  /** "12/03/2026 → 20/03/2026" — fechas efectivas de la tarea, para decidir con contexto al elegir una predecesora. */
  const datesOf = (task: GanttTask | undefined | null): string => {
    if (!task?.start_date || !task?.end_date) return "sin fechas";
    return `${format(parseISO(task.start_date), "dd/MM/yyyy")} → ${format(parseISO(task.end_date), "dd/MM/yyyy")}`;
  };

  const taskId = selectedTask?.id ?? null;

  // Reinicia el borrador SOLO cuando se abre para una tarea (no en cada re-render
  // del padre mientras el diálogo está abierto, para no pisar la edición en curso).
  useEffect(() => {
    if (open && selectedTask) {
      const initial: DraftDep[] = (selectedTask.dependencies ?? []).map((d) => ({
        id: d.id,
        depends_on_task_id: d.depends_on_task_id,
        dep_type: d.dep_type ?? "end",
        lag_days: d.lag_days ?? 0,
        lag_type: d.lag_type ?? "calendar",
      }));
      setDraftDeps(initial);
      setOriginalDeps(initial);
      setDraftJoinMode(selectedTask.dependency_join_mode ?? "all");
      setOriginalJoinMode(selectedTask.dependency_join_mode ?? "all");
      setPredecessorId("");
      setDepType("end");
      setLag(0);
      setSearch("");
      setPendingAction(null);
      const parentIds = allTasks.filter((t) => (childrenOf.get(t.id) ?? []).length > 0).map((t) => t.id);
      setExpandedIds(new Set(parentIds));
      const firstRoot = (childrenOf.get(null) ?? [])[0]?.id ?? null;
      setFocusedId(firstRoot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  // Conjuntos que NO pueden ser predecesores (evita ciclos y duplicados en el borrador)
  const { forbidden, draftDepIds } = useMemo(() => {
    const forbidden = new Set<string>();
    const draftDepIds = new Set(draftDeps.map((d) => d.depends_on_task_id));
    if (!taskId) return { forbidden, draftDepIds };
    forbidden.add(taskId);
    const collectDesc = (id: string) => {
      for (const c of childrenOf.get(id) ?? []) { forbidden.add(c.id); collectDesc(c.id); }
    };
    collectDesc(taskId);
    const self = byId.get(taskId);
    let cur = self?.parent_id ? byId.get(self.parent_id) : undefined;
    while (cur) { forbidden.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    for (const id of draftDepIds) forbidden.add(id);
    return { forbidden, draftDepIds };
  }, [taskId, childrenOf, byId, draftDeps]);

  const q = search.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!q) return null;
    const matches = (t: GanttTask) => t.name.toLowerCase().includes(q);
    const visible = new Set<string>();
    const walk = (node: TreeNode): boolean => {
      const childVisible = node.children.map(walk).some(Boolean);
      const self = matches(node.task);
      if (self || childVisible) visible.add(node.task.id);
      return self || childVisible;
    };
    tree.forEach(walk);
    return visible;
  }, [q, tree]);

  // Lista plana de nodos actualmente visibles, en orden de despliegue — usada
  // para la navegación con flechas (siguiente/anterior/padre/primer hijo).
  const visibleFlat = useMemo(() => {
    const out: { id: string; level: number; hasKids: boolean }[] = [];
    const walk = (nodes: TreeNode[], level: number) => {
      for (const n of nodes) {
        if (visibleIds && !visibleIds.has(n.task.id)) continue;
        const hasKids = n.children.length > 0;
        out.push({ id: n.task.id, level, hasKids });
        const isExpanded = q ? true : expandedIds.has(n.task.id);
        if (hasKids && isExpanded) walk(n.children, level + 1);
      }
    };
    walk(tree, 0);
    return out;
  }, [tree, visibleIds, expandedIds, q]);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const expandAll = () =>
    setExpandedIds(new Set(allTasks.filter((t) => (childrenOf.get(t.id) ?? []).length > 0).map((t) => t.id)));
  const collapseAll = () => setExpandedIds(new Set());

  const moveFocus = (id: string) => {
    setFocusedId(id);
    rowRefs.current.get(id)?.focus();
  };

  const handleTreeKeyDown = (e: React.KeyboardEvent, node: { id: string; level: number; hasKids: boolean }) => {
    const idx = visibleFlat.findIndex((n) => n.id === node.id);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visibleFlat[idx + 1];
      if (next) moveFocus(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visibleFlat[idx - 1];
      if (prev) moveFocus(prev.id);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (node.hasKids && !q && !expandedIds.has(node.id)) {
        toggleExpand(node.id);
      } else {
        const next = visibleFlat[idx + 1];
        if (next && next.level > node.level) moveFocus(next.id);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (node.hasKids && !q && expandedIds.has(node.id)) {
        toggleExpand(node.id);
      } else {
        for (let i = idx - 1; i >= 0; i--) {
          if (visibleFlat[i].level < node.level) { moveFocus(visibleFlat[i].id); break; }
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!forbidden.has(node.id)) setPredecessorId(node.id);
    }
  };

  // Agrega la predecesora elegida al borrador (no persiste todavía).
  const handleAddToDraft = () => {
    if (!predecessorId) return;
    setDraftDeps((prev) => [
      ...prev,
      { id: `draft-${crypto.randomUUID()}`, depends_on_task_id: predecessorId, dep_type: depType, lag_days: lag, lag_type: "calendar", isNew: true },
    ]);
    setPredecessorId("");
    setDepType("end");
    setLag(0);
  };

  const handleRemoveFromDraft = (id: string) => setDraftDeps((prev) => prev.filter((d) => d.id !== id));

  const handleUpdateDraft = (id: string, updates: Partial<Pick<DraftDep, "dep_type" | "lag_days" | "lag_type">>) =>
    setDraftDeps((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));

  // ¿Hay cambios sin guardar respecto al estado original de la tarea?
  const isDirty = useMemo(() => {
    if (draftJoinMode !== originalJoinMode) return true;
    if (draftDeps.length !== originalDeps.length) return true;
    const origById = new Map(originalDeps.map((d) => [d.id, d]));
    for (const d of draftDeps) {
      const o = origById.get(d.id);
      if (!o) return true;
      if (o.dep_type !== d.dep_type || o.lag_days !== d.lag_days || o.lag_type !== d.lag_type) return true;
    }
    return false;
  }, [draftDeps, originalDeps, draftJoinMode, originalJoinMode]);

  // Todo intento de cerrar (Cancelar, cruz, Esc) pasa por acá: si hay cambios
  // sin guardar, pide confirmación; si no, cierra directo. Clic afuera NO pasa
  // por acá — está bloqueado por completo más abajo (onInteractOutside).
  const requestClose = () => {
    if (isDirty) setPendingAction("discard");
    else onOpenChange(false);
  };

  const handleConfirmDiscard = () => {
    setPendingAction(null);
    onOpenChange(false);
  };

  const handleConfirmSave = async () => {
    if (!taskId) return;
    setCommitting(true);
    try {
      const origById = new Map(originalDeps.map((d) => [d.id, d]));
      const draftById = new Map(draftDeps.map((d) => [d.id, d]));
      const removed = originalDeps.filter((d) => !draftById.has(d.id));
      const added = draftDeps.filter((d) => !origById.has(d.id));
      const updated = draftDeps.filter((d) => {
        const o = origById.get(d.id);
        return !!o && (o.dep_type !== d.dep_type || o.lag_days !== d.lag_days || o.lag_type !== d.lag_type);
      });

      for (const d of removed) await onRemoveDependency(d.id);
      for (const d of added) await onAddDependency(taskId, d.depends_on_task_id, { dep_type: d.dep_type, lag_days: d.lag_days, lag_type: d.lag_type });
      for (const d of updated) await onUpdateDependency?.(d.id, { dep_type: d.dep_type, lag_days: d.lag_days, lag_type: d.lag_type });
      if (draftJoinMode !== originalJoinMode) await onUpdateTask?.(taskId, { dependency_join_mode: draftJoinMode });

      setPendingAction(null);
      setCommitting(false);
      onOpenChange(false);
    } catch {
      setCommitting(false);
      setPendingAction(null);
    }
  };

  const renderNode = (node: TreeNode, level: number): JSX.Element | null => {
    if (visibleIds && !visibleIds.has(node.task.id)) return null;
    const kids = node.children;
    const hasKids = kids.length > 0;
    const isExpanded = q ? true : expandedIds.has(node.task.id);
    const isForbidden = forbidden.has(node.task.id);
    const isSelected = predecessorId === node.task.id;
    const isExisting = draftDepIds.has(node.task.id) && !isSelected;

    return (
      <div key={node.task.id}>
        <div
          ref={(el) => { if (el) rowRefs.current.set(node.task.id, el); else rowRefs.current.delete(node.task.id); }}
          role="treeitem"
          aria-expanded={hasKids ? isExpanded : undefined}
          aria-selected={isSelected}
          aria-disabled={isForbidden}
          tabIndex={focusedId === node.task.id ? 0 : -1}
          onFocus={() => setFocusedId(node.task.id)}
          onKeyDown={(e) => handleTreeKeyDown(e, { id: node.task.id, level, hasKids })}
          onClick={() => { if (!isForbidden) { setPredecessorId(node.task.id); moveFocus(node.task.id); } }}
          className={cn(
            "flex items-center gap-1.5 rounded-md pr-2 py-1.5 text-sm transition-colors",
            FOCUS_RING,
            isForbidden ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent",
            isSelected && "bg-primary/15 ring-1 ring-primary/50 font-medium",
          )}
          style={{ paddingLeft: level * 20 + 4 }}
          title={isExisting ? "Ya es dependencia de esta tarea" : isForbidden ? "No disponible (crearía un ciclo)" : node.task.name}
        >
          {hasKids ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.task.id); }}
              className="p-0.5 hover:bg-muted rounded shrink-0"
              disabled={!!q}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-[18px] shrink-0 flex justify-center text-muted-foreground/40">
              <CornerDownRight className="h-3 w-3" />
            </span>
          )}
          <span className={cn("truncate", hasKids && "font-medium", node.task.status === "discarded" && "line-through text-muted-foreground")}>{node.task.name}</span>
          {node.task.status === "discarded" && <StatusDot status="discarded" className="shrink-0" />}
          {!isForbidden && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/80 shrink-0 whitespace-nowrap">
              {datesOf(node.task)}
            </span>
          )}
          {isExisting && <span className="ml-2 text-[10px] text-muted-foreground shrink-0">(ya es dependencia)</span>}
        </div>
        {hasKids && isExpanded && kids.map((c) => renderNode(c, level + 1))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
      <DialogContent
        className="max-w-[90vw] w-[90vw] h-[85vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          // Con el overlay de confirmación abierto, Esc vuelve a la opción segura
          // (Volver/Continuar editando) en vez de disparar el cierre del diálogo.
          if (pendingAction !== null) { e.preventDefault(); setPendingAction(null); }
        }}
      >
        {/* Wrapper "relative" separado del DialogContent: éste ya trae "fixed"
            para centrarse en pantalla, y agregar "relative" directo ahí hace que
            tailwind-merge descarte "fixed" (mismo grupo de utilidad "position"),
            rompiendo el centrado del modal. El overlay de confirmación de abajo
            se posiciona relativo a ESTE div, no al DialogContent. */}
        <div className="relative flex flex-col h-full min-h-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0 text-left">
          <DialogTitle className="text-xl">
            <span className="text-foreground">{selectedTask?.name ?? "Tarea"}</span>{" "}
            <span className="text-muted-foreground font-normal">depende de:</span>
          </DialogTitle>
          <DialogDescription>
            Navegá el árbol del cronograma y elegí la tarea predecesora. Los cambios se aplican recién al presionar Guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_minmax(340px,440px)]">
          {/* Explorador jerárquico */}
          <div className="flex flex-col min-h-0 lg:border-r">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tarea en el árbol..."
                  className={cn("pl-8 h-9", FOCUS_RING)}
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={expandAll} disabled={!!q} title="Expandir todo" className={FOCUS_RING}>
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={collapseAll} disabled={!!q} title="Colapsar todo" className={FOCUS_RING}>
                <ChevronsDownUp className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2" role="tree" aria-label="Árbol de tareas del cronograma">
              {tree.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay tareas en el cronograma.</p>
              ) : (
                tree.map((n) => renderNode(n, 0))
              )}
            </div>
          </div>

          {/* Panel derecho: dependencias actuales (borrador) + agregar */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Modo de evaluación: solo tiene efecto con 2+ dependencias en el borrador */}
              {draftDeps.length >= 2 && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Inicio de la tarea
                  </Label>
                  <div className="grid grid-cols-2 rounded-lg border p-1 gap-1 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => setDraftJoinMode("all")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        FOCUS_RING,
                        draftJoinMode === "all"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                      )}
                    >
                      <ListChecks className="h-4 w-4" />
                      Esperar todas
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftJoinMode("any")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        FOCUS_RING,
                        draftJoinMode === "any"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                      )}
                    >
                      <Zap className="h-4 w-4" />
                      Primera que finalice
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {draftJoinMode === "all"
                      ? "Comienza cuando terminen TODAS sus dependencias (la fecha más tardía)."
                      : "Comienza apenas termine CUALQUIERA de sus dependencias (la fecha más temprana)."}
                  </p>
                </div>
              )}

              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Dependencias ({draftDeps.length})
              </Label>
              {draftDeps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Esta tarea todavía no depende de ninguna otra.
                </p>
              ) : (
                <div className="space-y-2">
                  {draftDeps.map((dep) => {
                    const target = byId.get(dep.depends_on_task_id);
                    const isGhost = target?.status === "discarded";
                    return (
                    <div key={dep.id} className={cn("border rounded-md p-2.5 bg-card space-y-2", isGhost && "border-dashed bg-muted/20 opacity-60")}>
                      <div className="flex items-start gap-2">
                        <Link2 className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", isGhost ? "text-muted-foreground/50" : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate flex items-center gap-1.5", isGhost && "text-muted-foreground line-through")}>
                            {target?.name ?? "Tarea no encontrada"}
                            {dep.isNew && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-normal text-primary bg-primary/10 rounded px-1.5 py-0.5">
                                <Sparkles className="h-2.5 w-2.5" /> nueva
                              </span>
                            )}
                            {isGhost && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-normal not-italic text-muted-foreground bg-muted rounded px-1.5 py-0.5 no-underline">
                                <Ban className="h-2.5 w-2.5" /> descartada — no cuenta en el cálculo
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{pathOf(dep.depends_on_task_id) || "—"}</p>
                          <p className="text-[11px] text-muted-foreground/80 truncate">{datesOf(target)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("h-7 w-7 text-destructive shrink-0", FOCUS_RING)}
                          onClick={() => handleRemoveFromDraft(dep.id)}
                          title="Quitar dependencia"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <Select
                          value={dep.dep_type}
                          onValueChange={(v) => handleUpdateDraft(dep.id, { dep_type: v as "start" | "end" })}
                        >
                          <SelectTrigger className={cn("h-8 w-32 text-xs", FOCUS_RING)}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="end">al término</SelectItem>
                            <SelectItem value="start">al inicio</SelectItem>
                          </SelectContent>
                        </Select>
                        <LagInput
                          className={cn("h-8 w-20 text-xs", FOCUS_RING)}
                          value={dep.lag_days}
                          onChange={(n) => handleUpdateDraft(dep.id, { lag_days: n })}
                        />
                        <span className="text-xs text-muted-foreground">días</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Barra de agregar (sticky abajo) */}
            <div className="border-t p-4 shrink-0 space-y-3 bg-muted/20">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nueva dependencia</Label>
                <div className={cn(
                  "mt-1 rounded-md border px-3 py-2 text-sm min-h-[3.25rem] flex items-center",
                  predecessorId ? "bg-background" : "bg-muted/40 text-muted-foreground",
                )}>
                  {predecessorId ? (
                    <div className="flex items-start gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{byId.get(predecessorId)?.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{pathOf(predecessorId)}</p>
                        <p className="text-[11px] text-muted-foreground/80 truncate">{datesOf(byId.get(predecessorId))}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPredecessorId("")}
                        className={cn("text-muted-foreground hover:text-foreground shrink-0 rounded", FOCUS_RING)}
                        title="Deseleccionar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    "Elegí una tarea del árbol de la izquierda..."
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={depType} onValueChange={(v) => setDepType(v as "start" | "end")}>
                  <SelectTrigger className={cn("h-9 w-36", FOCUS_RING)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end">al término</SelectItem>
                    <SelectItem value="start">al inicio</SelectItem>
                  </SelectContent>
                </Select>
                <LagInput
                  className={cn("h-9 w-20", FOCUS_RING)}
                  value={lag}
                  onChange={(n) => setLag(n)}
                />
                <span className="text-xs text-muted-foreground">días</span>
                <Button className={cn("ml-auto", FOCUS_RING)} disabled={!predecessorId} onClick={handleAddToDraft}>
                  Agregar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Desfase positivo retrasa, negativo adelanta. "Al término" empieza después de que termine la otra; "al inicio" se ancla a su inicio.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 sm:justify-between">
          <span className="text-xs text-muted-foreground self-center">
            {isDirty ? "Hay cambios sin guardar." : "Sin cambios pendientes."}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={requestClose} className={FOCUS_RING}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => (isDirty ? setPendingAction("save") : onOpenChange(false))} className={FOCUS_RING}>
              Guardar
            </Button>
          </div>
        </DialogFooter>

        {/* Confirmación de Guardar/Cancelar — overlay simple DENTRO del mismo
            modal (no un segundo Dialog/AlertDialog de Radix): dos modales de
            Radix montados a la vez y cerrándose en el mismo tick dejaban
            `pointer-events` del body trabado, congelando toda la página. */}
        {pendingAction !== null && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-[2px] rounded-lg"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dep-confirm-title"
          >
            <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl space-y-4 mx-4">
              <div className="space-y-1.5">
                <h2 id="dep-confirm-title" className="text-lg font-semibold">
                  {pendingAction === "save" ? "¿Desea guardar los cambios realizados en las dependencias?" : "Existen cambios sin guardar."}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {pendingAction === "save"
                    ? "Se actualizarán las dependencias de esta tarea y se recalculará el cronograma."
                    : "¿Desea descartarlos?"}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                {pendingAction === "save" ? (
                  <>
                    <Button type="button" variant="outline" disabled={committing} onClick={() => setPendingAction(null)} className={FOCUS_RING} autoFocus>
                      Volver
                    </Button>
                    <Button type="button" onClick={handleConfirmSave} disabled={committing} className={FOCUS_RING}>
                      {committing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Guardar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => setPendingAction(null)} className={FOCUS_RING} autoFocus>
                      Continuar editando
                    </Button>
                    <Button type="button" onClick={handleConfirmDiscard} className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90", FOCUS_RING)}>
                      Descartar cambios
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
