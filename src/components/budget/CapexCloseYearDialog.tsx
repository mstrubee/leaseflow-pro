import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";

interface CarryoverLine {
  id: string;
  name: string;
  amount_uf: number;
  consumed_uf: number;
  available_uf: number;
  supplier_id: string | null;
  supplier_name: string | null;
  category_id: string | null;
  parent_id: string | null;
  display_order: number;
  description: string | null;
  template_line_id: string | null;
  quantity: number | null;
  unit_type: string | null;
  currency: string | null;
  unit_price: number | null;
}

interface CapexCloseYearDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  year: number;
  onSuccess: () => void;
}

export const CapexCloseYearDialog = ({ open, onOpenChange, contractId, year, onSuccess }: CapexCloseYearDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [carryoverLines, setCarryoverLines] = useState<CarryoverLine[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    if (open) {
      loadCarryoverLines();
    }
  }, [open]);

  const loadCarryoverLines = async () => {
    setLoading(true);
    try {
      // Get CAPEX budget for this year
      const { data: budget } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("year", year)
        .eq("budget_type", "capex")
        .maybeSingle();

      if (!budget) {
        setCarryoverLines([]);
        return;
      }

      // Get all authorized budget lines (leaf nodes only - no parent lines)
      const { data: allLines } = await supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budget.id)
        .eq("status", "autorizado")
        .is("deleted_at", null)
        .order("display_order");

      if (!allLines || allLines.length === 0) {
        setCarryoverLines([]);
        return;
      }

      // Find leaf lines (lines that are NOT parent of any other line)
      const parentIds = new Set(allLines.filter(l => l.parent_id).map(l => l.parent_id!));
      const leafLines = allLines.filter(l => !parentIds.has(l.id));

      // Get OC consumption per budget line via purchase_order_budget_lines
      const lineIds = leafLines.map(l => l.id);
      
      const { data: ocAssociations } = await supabase
        .from("purchase_order_budget_lines")
        .select("budget_line_id, amount_uf, purchase_order_id")
        .in("budget_line_id", lineIds);

      // Filter out deleted purchase orders
      let validOcAmounts: Record<string, number> = {};
      if (ocAssociations && ocAssociations.length > 0) {
        const poIds = [...new Set(ocAssociations.map(a => a.purchase_order_id))];
        const { data: validPOs } = await supabase
          .from("purchase_orders")
          .select("id")
          .in("id", poIds)
          .is("deleted_at", null);
        
        const validPoIds = new Set((validPOs || []).map(p => p.id));
        
        for (const assoc of ocAssociations) {
          if (validPoIds.has(assoc.purchase_order_id)) {
            validOcAmounts[assoc.budget_line_id] = (validOcAmounts[assoc.budget_line_id] || 0) + (assoc.amount_uf || 0);
          }
        }
      }

      // Also check direct budget_line_id on purchase_orders (legacy)
      const { data: directOCs } = await supabase
        .from("purchase_orders")
        .select("id, budget_line_id, amount_uf")
        .in("budget_line_id", lineIds)
        .is("deleted_at", null);

      for (const oc of (directOCs || [])) {
        if (oc.budget_line_id && !validOcAmounts[oc.budget_line_id]) {
          // Only count if not already counted via junction table
          const alreadyCounted = ocAssociations?.some(a => a.purchase_order_id === oc.id && a.budget_line_id === oc.budget_line_id);
          if (!alreadyCounted) {
            validOcAmounts[oc.budget_line_id] = (validOcAmounts[oc.budget_line_id] || 0) + (oc.amount_uf || 0);
          }
        }
      }

      // Build carryover lines with available balance
      const result: CarryoverLine[] = [];
      for (const line of leafLines) {
        const consumed = validOcAmounts[line.id] || 0;
        const available = line.amount_uf - consumed;
        if (available > 0.001) { // Small threshold for floating point
          result.push({
            id: line.id,
            name: line.name,
            amount_uf: line.amount_uf,
            consumed_uf: consumed,
            available_uf: available,
            supplier_id: line.supplier_id,
            supplier_name: line.supplier_name,
            category_id: line.category_id,
            parent_id: line.parent_id,
            display_order: line.display_order,
            description: line.description,
            template_line_id: line.template_line_id,
            quantity: line.quantity,
            unit_type: line.unit_type,
            currency: line.currency,
            unit_price: line.unit_price,
          });
        }
      }

      setCarryoverLines(result);
      // Pre-select all
      setSelectedIds(new Set(result.map(l => l.id)));
    } catch (error) {
      console.error("Error loading carryover lines:", error);
      toast({ variant: "destructive", title: "Error", description: "Error al cargar líneas" });
    } finally {
      setLoading(false);
    }
  };

  const toggleLine = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === carryoverLines.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(carryoverLines.map(l => l.id)));
    }
  };

  const handleCloseYear = async () => {
    setClosing(true);
    try {
      const nextYear = year + 1;

      // 1. Close CAPEX budget for this year
      await supabase
        .from("contract_budgets")
        .update({ is_closed: true, closed_at: new Date().toISOString() })
        .eq("contract_id", contractId)
        .eq("year", year)
        .eq("budget_type", "capex");

      // 2. If lines selected, create them in next year
      if (selectedIds.size > 0) {
        // Ensure next year CAPEX budget exists
        let { data: nextBudget } = await supabase
          .from("contract_budgets")
          .select("id")
          .eq("contract_id", contractId)
          .eq("year", nextYear)
          .eq("budget_type", "capex")
          .maybeSingle();

        if (!nextBudget) {
          const { data: created } = await supabase
            .from("contract_budgets")
            .insert({
              contract_id: contractId,
              year: nextYear,
              budget_type: "capex",
              amount_uf: 0,
            })
            .select("id")
            .single();
          nextBudget = created;
        }

        if (nextBudget) {
          const selectedLines = carryoverLines.filter(l => selectedIds.has(l.id));
          
          const newLines = selectedLines.map((line, idx) => ({
            budget_id: nextBudget!.id,
            name: line.name,
            description: `Traspasada (${year})`,
            amount_uf: line.available_uf,
            status: "autorizado" as const,
            display_order: idx + 1,
            supplier_id: line.supplier_id,
            supplier_name: line.supplier_name,
            category_id: line.category_id,
            quantity: line.quantity,
            unit_type: line.unit_type,
            currency: line.currency,
            unit_price: line.unit_price,
          }));

          await supabase.from("budget_lines").insert(newLines);
        }
      }

      toast({ title: "CAPEX cerrado", description: `CAPEX ${year} cerrado. ${selectedIds.size} línea(s) traspasada(s) a ${nextYear}.` });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error closing CAPEX year:", error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setClosing(false);
    }
  };

  const totalSelected = carryoverLines
    .filter(l => selectedIds.has(l.id))
    .reduce((sum, l) => sum + l.available_uf, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Cerrar CAPEX {year}
          </DialogTitle>
          <DialogDescription>
            Seleccione las líneas autorizadas con saldo disponible que desea traspasar al año {year + 1}.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700">Atención</AlertTitle>
          <AlertDescription className="text-amber-600">
            Una vez cerrado, no podrá modificar el presupuesto CAPEX del año {year}. Las líneas seleccionadas se crearán en {year + 1} como "Traspasada ({year})" con su proveedor asociado.
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : carryoverLines.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" onClick={toggleAll}>
                <Checkbox
                  checked={selectedIds.size === carryoverLines.length}
                  onCheckedChange={toggleAll}
                />
                Seleccionar todas ({carryoverLines.length})
              </label>
              <span className="text-sm text-muted-foreground">
                Total a traspasar: <span className="font-semibold text-foreground">{formatUF(totalSelected)}</span>
              </span>
            </div>

            <div className="border rounded-lg divide-y max-h-[40vh] overflow-y-auto">
              {carryoverLines.map(line => (
                <div
                  key={line.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleLine(line.id)}
                >
                  <Checkbox
                    checked={selectedIds.has(line.id)}
                    onCheckedChange={() => toggleLine(line.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{line.name}</p>
                    {line.supplier_name && (
                      <p className="text-xs text-muted-foreground">Proveedor: {line.supplier_name}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{formatUF(line.available_uf)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCLP(convertUFToPesos(line.available_uf))}
                    </p>
                    {line.consumed_uf > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Consumido: {formatUF(line.consumed_uf)} de {formatUF(line.amount_uf)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No hay líneas autorizadas con saldo disponible para traspasar.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCloseYear} disabled={closing}>
            {closing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cerrar CAPEX {year}
            {selectedIds.size > 0 && ` y traspasar ${selectedIds.size} línea(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
