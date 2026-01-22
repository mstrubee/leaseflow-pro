import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  maxTotal?: number;
  year?: number; // Required for OPEX master budget
  contractId?: string; // Used for OPEX local additional
}

export const MultipleLinesSelector = ({
  budgetId,
  selectedLines,
  onSelectionChange,
  formatUF,
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
      // Load OPEX master budget categories for the year
      const { data: opexData, error } = await supabase
        .from("opex_master_budget")
        .select(`
          id,
          amount_uf,
          category:opex_categories(id, name)
        `)
        .eq("year", year)
        .eq("is_closed", false);

      if (error) throw error;
      
      // Transform to BudgetLine format - OPEX lines are always leaf nodes (no children)
      const opexLines: BudgetLine[] = (opexData || []).map(item => ({
        id: item.id, // Use opex_master_budget id as line id
        name: (item.category as any)?.name || "Sin categoría",
        parent_id: null,
        amount_uf: item.amount_uf,
        status: "autorizado" as const,
        children: [] // Explicitly set empty children to mark as leaf
      }));
      
      setLines(opexLines);
      
      // Calculate available amounts for OPEX categories
      await calculateOpexAvailable(opexLines);
    } catch (error) {
      console.error("Error loading OPEX categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateOpexAvailable = async (opexLines: BudgetLine[]) => {
    const available: Record<string, number> = {};
    
    for (const line of opexLines) {
      // Get existing OCs linked to this OPEX master category
      const { data: existingOCs } = await supabase
        .from("purchase_orders")
        .select("amount_uf")
        .eq("opex_master_id", line.id)
        .is("deleted_at", null);
      
      // Get pending requests linked to this OPEX master category
      const { data: existingRequests } = await supabase
        .from("oc_requests")
        .select("amount_uf")
        .eq("opex_master_id", line.id)
        .eq("status", "pending");
      
      const usedByOC = (existingOCs || []).reduce((sum, oc) => sum + oc.amount_uf, 0);
      const usedByRequests = (existingRequests || []).reduce((sum, r) => sum + r.amount_uf, 0);
      
      // OPEX master amounts are stored as negative (expenses), so use absolute value
      const budgetAmount = Math.abs(line.amount_uf);
      available[line.id] = Math.max(0, Math.round((budgetAmount - usedByOC - usedByRequests) * 10000) / 10000);
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

    const available: Record<string, number> = {};
    
    for (const line of leafLines) {
      // Get existing OCs
      const { data: existingOCs } = await supabase
        .from("purchase_orders")
        .select("amount_uf")
        .eq("budget_line_id", line.id);
      
      // Get pending requests
      const { data: existingRequests } = await supabase
        .from("oc_requests")
        .select("amount_uf")
        .eq("budget_line_id", line.id)
        .eq("status", "pending");
      
      const usedByOC = (existingOCs || []).reduce((sum, oc) => sum + oc.amount_uf, 0);
      const usedByRequests = (existingRequests || []).reduce((sum, r) => sum + r.amount_uf, 0);
      
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
      // Add line with max available amount
      const maxAmount = availableAmounts[line.id] || 0;
      onSelectionChange([
        ...selectedLines,
        { lineId: line.id, lineName: line.name, amount: maxAmount, maxAmount }
      ]);
    } else {
      // Remove line
      onSelectionChange(selectedLines.filter(sl => sl.lineId !== line.id));
    }
  };

  const handleAmountChange = (lineId: string, amount: number) => {
    onSelectionChange(
      selectedLines.map(sl => 
        sl.lineId === lineId ? { ...sl, amount: Math.min(amount, sl.maxAmount) } : sl
      )
    );
  };

  const isLineSelected = (lineId: string) => selectedLines.some(sl => sl.lineId === lineId);
  const getLineAmount = (lineId: string) => selectedLines.find(sl => sl.lineId === lineId)?.amount || 0;

  const totalSelected = selectedLines.reduce((sum, sl) => sum + sl.amount, 0);

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
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Disp: {formatUF(available)}
              </Badge>
              {isSelected && (
                <Input
                  type="number"
                  value={getLineAmount(line.id)}
                  onChange={(e) => handleAmountChange(line.id, parseFloat(e.target.value) || 0)}
                  className="h-6 w-24 text-xs"
                  max={available}
                  step="0.01"
                />
              )}
            </div>
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
      <div className="flex items-center justify-between">
        <Label>Seleccionar Líneas Autorizadas</Label>
        <div className="text-sm">
          Total: <span className={cn("font-medium", maxTotal && totalSelected > maxTotal && "text-destructive")}>
            {formatUF(totalSelected)}
          </span>
          {maxTotal && <span className="text-muted-foreground"> / {formatUF(maxTotal)}</span>}
        </div>
      </div>
      
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
          <p className="text-xs font-medium text-muted-foreground">Líneas seleccionadas:</p>
          {selectedLines.map(sl => (
            <div key={sl.lineId} className="flex justify-between text-sm">
              <span className="truncate">{sl.lineName}</span>
              <span className="font-mono">{formatUF(sl.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
