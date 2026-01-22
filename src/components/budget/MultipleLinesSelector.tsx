import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
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
}

export const MultipleLinesSelector = ({
  budgetId,
  selectedLines,
  onSelectionChange,
  formatUF,
  formatCLP,
  maxTotal,
  year,
  contractId
}: MultipleLinesSelectorProps) => {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [availableAmounts, setAvailableAmounts] = useState<Record<string, number>>({});
  const [isOpexMaster, setIsOpexMaster] = useState(false);

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
      // Load OPEX master budget categories for the year - using amount_clp for OPEX
      const { data: opexData, error } = await supabase
        .from("opex_master_budget")
        .select(`
          id,
          amount_uf,
          amount_clp,
          category:opex_categories(id, name)
        `)
        .eq("year", year)
        .eq("is_closed", false);

      if (error) throw error;
      
      // Transform to BudgetLine format - OPEX lines are always leaf nodes (no children)
      // Store amount_clp for OPEX budget tracking
      const opexLines: BudgetLine[] = (opexData || []).map(item => ({
        id: item.id, // Use opex_master_budget id as line id
        name: (item.category as any)?.name || "Sin categoría",
        parent_id: null,
        amount_uf: item.amount_uf,
        amount_clp: item.amount_clp || 0, // OPEX budget in CLP
        status: "autorizado" as const,
        children: [] // Explicitly set empty children to mark as leaf
      }));
      
      setLines(opexLines);
      
      // Calculate available amounts for OPEX categories (in CLP)
      await calculateOpexAvailable(opexLines);
    } catch (error) {
      console.error("Error loading OPEX categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateOpexAvailable = async (opexLines: BudgetLine[]) => {
    if (opexLines.length === 0) {
      setAvailableAmounts({});
      return;
    }
    
    const opexIds = opexLines.map(l => l.id);
    
    // Batch query: Get all OCs for all OPEX lines at once - use amount_clp for OPEX
    const { data: allOCs } = await supabase
      .from("purchase_orders")
      .select("amount_clp, opex_master_id")
      .in("opex_master_id", opexIds)
      .is("deleted_at", null);
    
    // Batch query: Get all pending requests for all OPEX lines at once - use amount_clp for OPEX
    const { data: allRequests } = await supabase
      .from("oc_requests")
      .select("amount_clp, opex_master_id")
      .in("opex_master_id", opexIds)
      .eq("status", "pending");
    
    const available: Record<string, number> = {};
    
    for (const line of opexLines) {
      const usedByOC = (allOCs || [])
        .filter(oc => oc.opex_master_id === line.id)
        .reduce((sum, oc) => sum + (oc.amount_clp || 0), 0);
      const usedByRequests = (allRequests || [])
        .filter(r => r.opex_master_id === line.id)
        .reduce((sum, r) => sum + (r.amount_clp || 0), 0);
      
      // OPEX master amounts are stored as negative (expenses), so use absolute value
      // Available is calculated in CLP for OPEX
      const budgetAmount = Math.abs(line.amount_clp || 0);
      available[line.id] = Math.max(0, Math.round(budgetAmount - usedByOC - usedByRequests));
    }
    
    setAvailableAmounts(available);
  };

  const loadLines = async () => {
    if (!budgetId || budgetId === "opex_master") return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("id, name, parent_id, amount_uf, status")
        .eq("budget_id", budgetId)
        .eq("status", "autorizado")
        .order("display_order");

      if (error) throw error;
      
      // Cast the data properly
      const typedData = (data || []) as BudgetLine[];
      
      // Build tree
      const tree = buildTree(typedData);
      setLines(tree);
      
      // Calculate available amounts (budget - existing OCs)
      await calculateAvailable(typedData);
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

  const calculateAvailable = async (flatLines: BudgetLine[]) => {
    const leafLines = flatLines.filter(l => {
      const hasChildren = flatLines.some(c => c.parent_id === l.id);
      return !hasChildren;
    });

    if (leafLines.length === 0) {
      setAvailableAmounts({});
      return;
    }
    
    const leafIds = leafLines.map(l => l.id);
    
    // Batch query: Get all OCs for all leaf lines at once
    const { data: allOCs } = await supabase
      .from("purchase_orders")
      .select("amount_uf, budget_line_id")
      .in("budget_line_id", leafIds)
      .is("deleted_at", null);
    
    // Batch query: Get all pending requests for all leaf lines at once
    const { data: allRequests } = await supabase
      .from("oc_requests")
      .select("amount_uf, budget_line_id")
      .in("budget_line_id", leafIds)
      .eq("status", "pending");

    const available: Record<string, number> = {};
    
    for (const line of leafLines) {
      const usedByOC = (allOCs || [])
        .filter(oc => oc.budget_line_id === line.id)
        .reduce((sum, oc) => sum + oc.amount_uf, 0);
      const usedByRequests = (allRequests || [])
        .filter(r => r.budget_line_id === line.id)
        .reduce((sum, r) => sum + r.amount_uf, 0);
      
      available[line.id] = Math.max(0, Math.round((line.amount_uf - usedByOC - usedByRequests) * 10000) / 10000);
    }
    
    setAvailableAmounts(available);
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
    const hasChildren = line.children && line.children.length > 0;
    const isExpanded = expandedIds.has(line.id);
    const isLeaf = !hasChildren;
    const available = availableAmounts[line.id] || 0;
    const isSelected = isLineSelected(line.id);

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

          {isLeaf && available > 0 && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => handleLineToggle(line, !!checked)}
            />
          )}

          <span className={cn("text-sm flex-1", hasChildren && "font-medium")}>
            {line.name}
          </span>

          {isLeaf && (
            <Badge variant="outline" className="text-xs">
              Disp: {isOpexMaster && formatCLP 
                ? formatCLP(available) 
                : formatUF(available)}
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
      
      <ScrollArea className="h-[300px] border rounded-lg p-2">
        {lines.length > 0 ? (
          lines.map(line => renderLine(line))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay líneas autorizadas disponibles
          </p>
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
