import { useState, useMemo, useEffect } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ChevronRight, ChevronDown, Search, Unlink, Link2, ChevronsDownUp, ChevronsUpDown, X, CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DepOptions = { dep_type?: "start" | "end"; lag_days?: number; lag_type?: "calendar" | "business" };

interface DependencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: GanttTask | null;
  allTasks: GanttTask[];
  onAddDependency: (taskId: string, dependsOnTaskId: string, options?: DepOptions) => Promise<void>;
  onRemoveDependency: (dependencyId: string) => Promise<void>;
  onUpdateDependency?: (dependencyId: string, updates: DepOptions) => Promise<void>;
}

interface TreeNode {
  task: GanttTask;
  children: TreeNode[];
}

export function DependencyDialog({
  open,
  onOpenChange,
  selectedTask,
  allTasks,
  onAddDependency,
  onRemoveDependency,
  onUpdateDependency,
}: DependencyDialogProps) {
  const [predecessorId, setPredecessorId] = useState<string>("");
  const [depType, setDepType] = useState<"start" | "end">("end");
  const [lag, setLag] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

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

  // Árbol jerárquico
  const tree = useMemo(() => {
    const build = (parentId: string | null): TreeNode[] =>
      (childrenOf.get(parentId) ?? []).map((task) => ({ task, children: build(task.id) }));
    return build(null);
  }, [childrenOf]);

  // Ruta jerárquica de una tarea: "Proyecto / Construcción / Instalación eléctrica"
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

  // Live task (refleja cambios tras agregar/quitar dependencias)
  const liveTask = useMemo(
    () => (selectedTask ? byId.get(selectedTask.id) ?? selectedTask : null),
    [selectedTask, byId],
  );

  // Conjuntos que NO pueden ser predecesores (evita ciclos y duplicados)
  const { forbidden, existingDepIds } = useMemo(() => {
    const forbidden = new Set<string>();
    const existingDepIds = new Set<string>();
    if (!liveTask) return { forbidden, existingDepIds };
    forbidden.add(liveTask.id);
    // descendientes (dependencia hacia abajo = ciclo)
    const collectDesc = (id: string) => {
      for (const c of childrenOf.get(id) ?? []) { forbidden.add(c.id); collectDesc(c.id); }
    };
    collectDesc(liveTask.id);
    // ancestros (dependencia hacia arriba = ciclo, el padre se calcula desde los hijos)
    let cur = liveTask.parent_id ? byId.get(liveTask.parent_id) : undefined;
    while (cur) { forbidden.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    // dependencias ya existentes
    for (const d of liveTask.dependencies ?? []) { existingDepIds.add(d.depends_on_task_id); forbidden.add(d.depends_on_task_id); }
    return { forbidden, existingDepIds };
  }, [liveTask, childrenOf, byId]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setPredecessorId("");
      setDepType("end");
      setLag(0);
      setSearch("");
      // Expandir todo por defecto para ver la estructura completa (como un explorador)
      setExpandedIds(new Set(allTasks.filter((t) => (childrenOf.get(t.id) ?? []).length > 0).map((t) => t.id)));
    }
  }, [open, allTasks, childrenOf]);

  // Búsqueda: nodos visibles = coinciden o tienen un descendiente que coincide
  const q = search.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!q) return null; // null = sin filtro
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

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const expandAll = () =>
    setExpandedIds(new Set(allTasks.filter((t) => (childrenOf.get(t.id) ?? []).length > 0).map((t) => t.id)));
  const collapseAll = () => setExpandedIds(new Set());

  const handleAdd = async () => {
    if (!liveTask || !predecessorId) return;
    setAdding(true);
    await onAddDependency(liveTask.id, predecessorId, { dep_type: depType, lag_days: lag });
    setAdding(false);
    setPredecessorId("");
    setLag(0);
    setDepType("end");
  };

  const renderNode = (node: TreeNode, level: number): JSX.Element | null => {
    if (visibleIds && !visibleIds.has(node.task.id)) return null;
    const kids = node.children;
    const hasKids = kids.length > 0;
    const isExpanded = q ? true : expandedIds.has(node.task.id);
    const isForbidden = forbidden.has(node.task.id);
    const isSelected = predecessorId === node.task.id;
    const isExisting = existingDepIds.has(node.task.id);

    return (
      <div key={node.task.id}>
        <div
          onClick={() => { if (!isForbidden) setPredecessorId(node.task.id); }}
          className={cn(
            "flex items-center gap-1.5 rounded-md pr-2 py-1.5 text-sm transition-colors",
            isForbidden ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent",
            isSelected && "bg-primary/15 ring-1 ring-primary/50 font-medium",
          )}
          style={{ paddingLeft: level * 20 + 4 }}
          title={isExisting ? "Ya es dependencia de esta tarea" : isForbidden ? "No disponible (crearía un ciclo)" : node.task.name}
        >
          {hasKids ? (
            <button
              type="button"
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
          <span className={cn("truncate", hasKids && "font-medium")}>{node.task.name}</span>
          {isExisting && <span className="ml-2 text-[10px] text-muted-foreground shrink-0">(ya es dependencia)</span>}
        </div>
        {hasKids && isExpanded && kids.map((c) => renderNode(c, level + 1))}
      </div>
    );
  };

  const currentDeps = liveTask?.dependencies ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0 text-left">
          <DialogTitle className="text-xl">
            <span className="text-foreground">{liveTask?.name ?? "Tarea"}</span>{" "}
            <span className="text-muted-foreground font-normal">depende de:</span>
          </DialogTitle>
          <DialogDescription>
            Navegá el árbol del cronograma y elegí la tarea predecesora. La jerarquía es la misma que ves en el cronograma.
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
                  className="pl-8 h-9"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={expandAll} disabled={!!q} title="Expandir todo">
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={collapseAll} disabled={!!q} title="Colapsar todo">
                <ChevronsDownUp className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {tree.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay tareas en el cronograma.</p>
              ) : (
                tree.map((n) => renderNode(n, 0))
              )}
            </div>
          </div>

          {/* Panel derecho: dependencias actuales + agregar */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Dependencias actuales ({currentDeps.length})
              </Label>
              {currentDeps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Esta tarea todavía no depende de ninguna otra.
                </p>
              ) : (
                <div className="space-y-2">
                  {currentDeps.map((dep) => (
                    <div key={dep.id} className="border rounded-md p-2.5 bg-card space-y-2">
                      <div className="flex items-start gap-2">
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{byId.get(dep.depends_on_task_id)?.name ?? "Tarea no encontrada"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{pathOf(dep.depends_on_task_id) || "—"}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => onRemoveDependency(dep.id)}
                          title="Quitar dependencia"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <Select
                          value={dep.dep_type ?? "end"}
                          onValueChange={(v) => onUpdateDependency?.(dep.id, { dep_type: v as "start" | "end" })}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
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
                      </div>
                    </div>
                  ))}
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
                      </div>
                      <button type="button" onClick={() => setPredecessorId("")} className="text-muted-foreground hover:text-foreground shrink-0" title="Deseleccionar">
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
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end">al término</SelectItem>
                    <SelectItem value="start">al inicio</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="h-9 w-20"
                  value={lag}
                  onChange={(e) => setLag(parseInt(e.target.value) || 0)}
                  title="Días de desfase (+ retrasa, − adelanta)"
                />
                <span className="text-xs text-muted-foreground">días</span>
                <Button className="ml-auto" disabled={!predecessorId || adding} onClick={handleAdd}>
                  {adding ? "Agregando..." : "Agregar"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Desfase positivo retrasa, negativo adelanta. "Al término" empieza después de que termine la otra; "al inicio" se ancla a su inicio.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
