import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { ChevronRight, Folder, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "./BudgetLineTree";

interface MoveLinesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: BudgetLine[]; // full tree
  selectedIds: string[]; // lines being moved
  onConfirm: (targetParentId: string | null) => void | Promise<void>;
}

interface FlatNode {
  id: string;
  name: string;
  depth: number;
  path: string;
}

// Collect all descendant ids of a line (including itself) — used to exclude
// invalid destinations (cannot move a line into itself or its own subtree).
const collectSubtreeIds = (line: BudgetLine, acc: Set<string>) => {
  acc.add(line.id);
  line.children?.forEach((c) => collectSubtreeIds(c, acc));
};

const flattenParents = (lines: BudgetLine[], depth: number, parentPath: string, acc: FlatNode[]) => {
  // Sort same way as the tree (display_order)
  const sorted = [...lines].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  sorted.forEach((line) => {
    // Skip ghosts and merged surcharges — they aren't valid move destinations
    if (line.is_ghost || line.merged_into_line_id) return;
    const path = parentPath ? `${parentPath} › ${line.name}` : line.name;
    acc.push({ id: line.id, name: line.name, depth, path });
    if (line.children?.length) {
      flattenParents(line.children, depth + 1, path, acc);
    }
  });
};

export const MoveLinesDialog = ({ open, onOpenChange, lines, selectedIds, onConfirm }: MoveLinesDialogProps) => {
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null); // null = root
  const [submitting, setSubmitting] = useState(false);

  // Build set of forbidden destinations: each selected line + all its descendants
  // (cannot move a line into itself or any of its children — would create a cycle).
  const forbiddenIds = useMemo(() => {
    const forbidden = new Set<string>();
    const findAndCollect = (items: BudgetLine[]) => {
      items.forEach((item) => {
        if (selectedIds.includes(item.id)) {
          collectSubtreeIds(item, forbidden);
        } else if (item.children?.length) {
          findAndCollect(item.children);
        }
      });
    };
    findAndCollect(lines);
    return forbidden;
  }, [lines, selectedIds]);

  const flatNodes = useMemo(() => {
    const acc: FlatNode[] = [];
    flattenParents(lines, 0, "", acc);
    return acc.filter((n) => !forbiddenIds.has(n.id));
  }, [lines, forbiddenIds]);

  const filteredNodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return flatNodes;
    return flatNodes.filter((n) => n.path.toLowerCase().includes(term));
  }, [flatNodes, search]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(targetId);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Mover {selectedIds.length} línea{selectedIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Selecciona la línea madre de destino. Las líneas se moverán con todos sus hijos, OCs y facturas asociadas. Los totales se recalcularán automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <Input
            placeholder="Buscar línea madre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <ScrollArea className="flex-1 border rounded-md">
            <div className="p-1">
              {/* Root option */}
              <button
                type="button"
                onClick={() => setTargetId(null)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded text-sm text-left hover:bg-accent transition-colors",
                  targetId === null && "bg-accent font-medium"
                )}
              >
                <Home className="h-4 w-4 text-muted-foreground" />
                <span>Raíz del presupuesto (sin línea madre)</span>
              </button>

              {filteredNodes.length === 0 && (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  No hay líneas madre disponibles
                </div>
              )}

              {filteredNodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setTargetId(node.id)}
                  className={cn(
                    "w-full flex items-center gap-1 px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors",
                    targetId === node.id && "bg-accent font-medium"
                  )}
                  style={{ paddingLeft: `${node.depth * 14 + 8}px` }}
                >
                  {node.depth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                  <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{node.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>

          {targetId !== null && (
            <div className="text-xs text-muted-foreground">
              Destino: <span className="font-medium text-foreground">
                {flatNodes.find((n) => n.id === targetId)?.path}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Moviendo..." : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
