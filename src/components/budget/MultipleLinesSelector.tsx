import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronRight, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface BudgetLine {
  id: string;
  name: string;
  parent_id: string | null;
  amount_uf: number;
  amount_clp?: number; // For OPEX lines in CLP
  status: "autorizado" | "no_autorizado";
  children?: BudgetLine[];
}

interface SelectedLine {
  lineId: string;
  lineName: string;
  amount: number;
  maxAmount: number;
}

interface MultipleLinesSelectorProps {
  budgetId: string;
  selectedLines: SelectedLine[];
  onSelectionChange: (lines: SelectedLine[]) => void;
  formatUF: (value: number) => string;
  formatCLP?: (value: number) => string; // For OPEX display in CLP
  maxTotal?: number;
  year?: number; // Required for OPEX master budget
  contractId?: string; // Used for OPEX local additional
  ufValue?: number; // Used for CLP conversion display in CAPEX lines
}

export const MultipleLinesSelector = ({
  budgetId,
  selectedLines,
  onSelectionChange,
  formatUF,
  formatCLP,
  maxTotal,
  year,
  contractId,
  ufValue
}: MultipleLinesSelectorProps) => {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [availableAmounts, setAvailableAmounts] = useState<Record<string, number>>({});
  const [isOpexMaster, setIsOpexMaster] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (budgetId === "opex_master") {
      setIsOpexMaster(true);
      loadOpexMasterCategories();
    } else {
      setIsOpexMaster(false);
      loadLines();
    }
  }, [budgetId, year]);

  const loadOpexMasterCategories = async () => {
    if (!year) return;

    setLoading(true);
    try {
      // Phase 1: fetch OPEX categories → show tree immediately
      const { data: opexData, error } = await supabase
        .from("opex_master_budget")
        .select("id, amount_uf, amount_clp, category:opex_categories(id, name)")
        .eq("year", year)
        .eq("is_closed", false);

      if (error) throw error;

      const opexLines: BudgetLine[] = (opexData || []).map(item => ({
        id: item.id,
        name: (item.category as any)?.name || "Sin categoría",
        parent_id: null,
        amount_uf: item.amount_uf,
        amount_clp: item.amount_clp || 0,
        status: "autorizado" as const,
        children: []
      }));

      setLines(opexLines);
      setLoading(false); // show lines immediately, before amounts load

      if (opexLines.length === 0) return;

      // Phase 2: available amounts in parallel (background)
      const opexIds = opexLines.map(l => l.id);
      const [ocsResult, requestsResult] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("amount_clp, opex_master_id")
          .in("opex_master_id", opexIds)
          .is("deleted_at", null),
        supabase
          .from("oc_requests")
          .select("amount_clp, opex_master_id")
          .in("opex_master_id", opexIds)
          .eq("status", "pending")
      ]);

      const available: Record<string, number> = {};
      for (const line of opexLines) {
        const usedByOC = (ocsResult.data || [])
          .filter(oc => oc.opex_master_id === line.id)
          .reduce((sum, oc) => sum + (oc.amount_clp || 0), 0);
        const usedByRequests = (requestsResult.data || [])
          .filter(r => r.opex_master_id === line.id)
          .reduce((sum, r) => sum + (r.amount_clp || 0), 0);
        const budgetAmount = Math.abs(line.amount_clp || 0);
        available[line.id] = Math.max(0, Math.round(budgetAmount - usedByOC - usedByRequests));
      }
      setAvailableAmounts(available);
    } catch (error) {
      console.error("Error loading OPEX categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLines = async () => {
    if (!budgetId || budgetId === "opex_master") return;

    setLoading(true);
    try {
      // Phase 1: fetch ALL budget lines (not just authorized) so buildTree can
      // construct the full hierarchy. A child line may be authorized while its
      // parent category is not — filtering here would orphan those children and
      // silently drop them from the tree. Authorization is enforced in renderLine.
      const { data, error } = await supabase
        .from("budget_lines")
        .select("id, name, parent_id, amount_uf, status")
        .eq("budget_id", budgetId)
        .order("display_order");

      if (error) throw error;

      const flatLines = (data || []) as BudgetLine[];
      setLines(buildTree(flatLines));
      setLoading(false); // show lines immediately, before amounts load

      // Phase 2: available amounts — only needed for authorized leaf lines
      const parentIdSet = new Set(flatLines.map(l => l.parent_id).filter(Boolean));
      const leafLines = flatLines.filter(l => !parentIdSet.has(l.id) && l.status === "autorizado");
      if (leafLines.length === 0) return;

      const leafIds = leafLines.map(l => l.id);
      const [ocsResult, requestsResult] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("amount_uf, budget_line_id")
          .in("budget_line_id", leafIds)
          .is("deleted_at", null),
        supabase
          .from("oc_requests")
          .select("amount_uf, budget_line_id")
          .in("budget_line_id", leafIds)
          .eq("status", "pending")
      ]);

      const available: Record<string, number> = {};
      for (const line of leafLines) {
        const usedByOC = (ocsResult.data || [])
          .filter(oc => oc.budget_line_id === line.id)
          .reduce((sum, oc) => sum + oc.amount_uf, 0);
        const usedByRequests = (requestsResult.data || [])
          .filter(r => r.budget_line_id === line.id)
          .reduce((sum, r) => sum + r.amount_uf, 0);
        available[line.id] = Math.max(0, Math.round((line.amount_uf - usedByOC - usedByRequests) * 10000) / 10000);
      }
      setAvailableAmounts(available);
    } catch (error) {
      console.error("Error loading lines:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (flatLines: BudgetLine[]): BudgetLine[] => {
    const map = new Map<string, BudgetLine>();
    const roots: BudgetLine[] = [];

    flatLines.forEach((line) => {
      map.set(line.id, { ...line, children: [] });
    });

    flatLines.forEach((line) => {
      const node = map.get(line.id)!;
      if (line.parent_id) {
        const parent = map.get(line.parent_id);
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Returns true if the node itself is an authorized leaf OR has at least one
  // authorized leaf descendant. Used to prune the rendered tree.
  const hasAuthorizedLeaf = (node: BudgetLine): boolean => {
    const isLeafNode = !node.children || node.children.length === 0;
    if (isLeafNode) return node.status === "autorizado";
    return node.children!.some(hasAuthorizedLeaf);
  };

  // Whether there's at least one selectable authorized line (drives empty-state message)
  const hasAuthorizedLines = useMemo(() => lines.some(hasAuthorizedLeaf), [lines]);

  // Search: compute which line IDs match and which are ancestors of matches.
  // Only authorized leaves count as "matches" — non-authorized leaves are hidden
  // so they shouldn't appear even if the name matches.
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const matchingIds = new Set<string>();
    const parentIds = new Set<string>();

    const traverse = (nodes: BudgetLine[], ancestors: string[]) => {
      for (const node of nodes) {
        const isLeafNode = !node.children || node.children.length === 0;
        if (node.name.toLowerCase().includes(q)) {
          // Leaf nodes must be authorized to count as a match
          if (!isLeafNode || node.status === "autorizado") {
            matchingIds.add(node.id);
            ancestors.forEach(id => parentIds.add(id));
          }
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children, [...ancestors, node.id]);
        }
      }
    };

    traverse(lines, []);
    return { matchingIds, parentIds };
  }, [searchQuery, lines]);

  // Auto-expand parent nodes when search reveals matches
  useEffect(() => {
    if (searchResults && searchResults.parentIds.size > 0) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        searchResults.parentIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [searchResults]);

  // Highlight the matching portion of text
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const q = query.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-foreground rounded-sm px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleLineToggle = (line: BudgetLine, checked: boolean) => {
    if (checked) {
      // Add line for imputation (amount=0 since it's set in the form, maxAmount for reference)
      const maxAmount = availableAmounts[line.id] || 0;
      onSelectionChange([
        ...selectedLines,
        { lineId: line.id, lineName: line.name, amount: 0, maxAmount }
      ]);
    } else {
      // Remove line
      onSelectionChange(selectedLines.filter(sl => sl.lineId !== line.id));
    }
  };

  const isLineSelected = (lineId: string) => selectedLines.some(sl => sl.lineId === lineId);

  const renderLine = (line: BudgetLine, level: number = 0): React.ReactNode => {
    // Hide branches that have no authorized leaves (non-authorized leaves + their
    // parent containers that only have non-authorized descendants).
    if (!hasAuthorizedLeaf(line)) return null;

    // Filter by search query — skip lines that don't match and have no matching descendants
    if (searchQuery.trim() && searchResults) {
      const visible = searchResults.matchingIds.has(line.id) || searchResults.parentIds.has(line.id);
      if (!visible) return null;
    }

    const hasChildren = line.children && line.children.length > 0;
    const isExpanded = expandedIds.has(line.id);
    const isLeaf = !hasChildren;
    const isAuthorized = line.status === "autorizado";
    const available = availableAmounts[line.id] || 0;
    const isSelected = isLineSelected(line.id);

    // Build available amount display: "$CLP (nn UF)" for CAPEX, "$CLP" for OPEX
    const availableDisplay = isOpexMaster && formatCLP
      ? formatCLP(available)
      : (formatCLP && ufValue && ufValue > 0)
        ? `${formatCLP(Math.round(available * ufValue))} (${formatUF(available)})`
        : formatUF(available);

    return (
      <div key={line.id}>
        <div
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/50",
            isSelected && "bg-primary/10"
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(line.id)} className="p-0.5">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <div className="w-4" />
          )}

          {/* Checkbox only for authorized leaf lines with available budget */}
          {isLeaf && isAuthorized && available > 0 && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => handleLineToggle(line, !!checked)}
            />
          )}

          <span className={cn("text-sm flex-1", hasChildren && "font-medium")}>
            {highlightText(line.name, searchQuery)}
          </span>

          {/* Available amount badge only for authorized leaves */}
          {isLeaf && isAuthorized && (
            <Badge variant="outline" className="text-xs">
              Disp: {availableDisplay}
            </Badge>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {line.children!.map(child => renderLine(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      <Label>Seleccionar Línea(s) de Imputación</Label>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar línea de imputación..."
          className="pl-8 h-8 text-sm"
        />
      </div>

      <ScrollArea className="h-[300px] border rounded-lg p-2">
        {hasAuthorizedLines ? (
          lines.map(line => renderLine(line))
        ) : (
          <div className="text-center py-6 space-y-1">
            <p className="text-sm text-muted-foreground">
              No hay líneas autorizadas disponibles
            </p>
            <p className="text-xs text-muted-foreground">
              El administrador debe autorizar las líneas en el presupuesto CAPEX antes de poder seleccionarlas.
            </p>
          </div>
        )}
      </ScrollArea>

      {selectedLines.length > 0 && (
        <div className="p-3 bg-muted/50 rounded-lg space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Líneas seleccionadas ({selectedLines.length}):</p>
          {selectedLines.map(sl => (
            <div key={sl.lineId} className="text-sm">
              <span className="truncate">• {sl.lineName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
