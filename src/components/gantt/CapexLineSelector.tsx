import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapexBudgetLine } from "@/hooks/useGantt";

export type CapexSelectionMode = "line" | "hierarchy";

interface LineNode extends CapexBudgetLine {
  children: LineNode[];
}

function buildTree(flat: CapexBudgetLine[]): LineNode[] {
  const map = new Map<string, LineNode>();
  flat.forEach((line) => map.set(line.id, { ...line, children: [] }));
  const roots: LineNode[] = [];
  flat.forEach((line) => {
    const node = map.get(line.id)!;
    const parent = line.parent_id ? map.get(line.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

function collectIds(node: LineNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

interface CapexLineSelectorProps {
  lines: CapexBudgetLine[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  mode: CapexSelectionMode;
}

export function CapexLineSelector({ lines, selectedIds, onChange, mode }: CapexLineSelectorProps) {
  const tree = useMemo(() => buildTree(lines), [lines]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLine = (node: LineNode) => {
    const next = new Set(selectedIds);
    const willSelect = !selectedIds.has(node.id);
    // Modo "con jerarquía": la línea clickeada arrastra a todas sus
    // descendientes (hijas, nietas, etc.) al mismo estado. Modo "línea a
    // línea": solo afecta a la línea clickeada.
    const affectedIds = mode === "hierarchy" ? collectIds(node) : [node.id];
    affectedIds.forEach((id) => (willSelect ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  const renderNode = (node: LineNode, depth: number) => {
    const isCollapsed = collapsed.has(node.id);
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1.5 py-1 hover:bg-muted/50 rounded px-1"
          style={{ paddingLeft: depth * 20 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapse(node.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Checkbox
            checked={selectedIds.has(node.id)}
            onCheckedChange={() => toggleLine(node)}
          />
          <span
            className={cn(
              "text-sm truncate",
              hasChildren && "font-medium",
              !selectedIds.has(node.id) && "text-muted-foreground"
            )}
          >
            {node.name}
          </span>
        </div>
        {hasChildren && !isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="max-h-64 overflow-y-auto border rounded-md p-1">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}

export function getAllCapexLineIds(lines: CapexBudgetLine[]): Set<string> {
  return new Set(lines.map((l) => l.id));
}
