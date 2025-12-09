import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BudgetLineTree, BudgetLine } from "./BudgetLineTree";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useBudgetContext } from "./BudgetContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Budget {
  id: string;
  contract_id: string;
  year: number;
  budget_type: string;
  amount_uf: number;
  is_closed: boolean;
}

interface BudgetModuleProps {
  contractId: string;
  budgetType: "inversion_inicial" | "capex";
  title: string;
}

export const BudgetModule = ({ contractId, budgetType, title }: BudgetModuleProps) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBudgetDialog, setShowNewBudgetDialog] = useState(false);
  const [newBudgetYear, setNewBudgetYear] = useState(new Date().getFullYear());
  const [newBudgetAmount, setNewBudgetAmount] = useState("");
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    loadBudgets();
  }, [contractId, budgetType]);

  useEffect(() => {
    if (budgets.length > 0) {
      const budget = budgets.find((b) => b.year === selectedYear);
      if (budget) {
        loadLines(budget.id);
      } else {
        setLines([]);
      }
    }
  }, [selectedYear, budgets]);

  const loadBudgets = async () => {
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("*")
        .eq("contract_id", contractId)
        .eq("budget_type", budgetType)
        .order("year", { ascending: false });

      if (error) throw error;
      setBudgets(data || []);
      
      if (data && data.length > 0) {
        setSelectedYear(data[0].year);
      }
    } catch (error) {
      console.error("Error loading budgets:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLines = async (budgetId: string) => {
    try {
      const { data, error } = await supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budgetId)
        .order("display_order");

      if (error) throw error;
      setLines(buildTree((data || []) as BudgetLine[]));
    } catch (error) {
      console.error("Error loading lines:", error);
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

  const handleCreateBudget = async () => {
    try {
      const { error } = await supabase.from("contract_budgets").insert({
        contract_id: contractId,
        year: newBudgetYear,
        budget_type: budgetType,
        amount_uf: parseFloat(newBudgetAmount) || 0,
      });

      if (error) throw error;

      toast({ title: "Presupuesto creado", description: `Presupuesto ${newBudgetYear} creado exitosamente` });
      setShowNewBudgetDialog(false);
      setNewBudgetAmount("");
      loadBudgets();
      setSelectedYear(newBudgetYear);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleAddLine = async (parentId: string | null) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget) return;

    try {
      const { error } = await supabase.from("budget_lines").insert({
        budget_id: budget.id,
        parent_id: parentId,
        name: "Nueva línea",
        amount_uf: 0,
        status: "pendiente",
      });

      if (error) throw error;
      loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleUpdateLine = async (id: string, data: Partial<BudgetLine>) => {
    try {
      const { error } = await supabase.from("budget_lines").update(data).eq("id", id);
      if (error) throw error;
      
      const budget = budgets.find((b) => b.year === selectedYear);
      if (budget) loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteLine = async (id: string) => {
    try {
      const { error } = await supabase.from("budget_lines").delete().eq("id", id);
      if (error) throw error;
      
      const budget = budgets.find((b) => b.year === selectedYear);
      if (budget) loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const calculateTotal = (items: BudgetLine[]): number => {
    return items.reduce((sum, item) => {
      if (item.children && item.children.length > 0) {
        return sum + calculateTotal(item.children);
      }
      return sum + (item.amount_uf || 0);
    }, 0);
  };

  const currentBudget = budgets.find((b) => b.year === selectedYear);
  const totalConsumed = calculateTotal(lines);
  const budgetAmount = currentBudget?.amount_uf || 0;
  const availableYears = [...new Set(budgets.map((b) => b.year))].sort((a, b) => b - a);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">{title}</CardTitle>
        <div className="flex items-center gap-3">
          {currentBudget?.is_closed && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span className="text-sm">Cerrado</span>
            </div>
          )}
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowNewBudgetDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Año
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentBudget ? (
          <>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Presupuesto {selectedYear}</p>
                <p className="text-xl font-bold">{formatUF(budgetAmount)}</p>
                <p className="text-sm text-muted-foreground">{formatCLP(convertUFToPesos(budgetAmount))}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-sm text-muted-foreground">Consumido</p>
                <p className="text-xl font-bold">{formatUF(totalConsumed)}</p>
                <BudgetSemaphore budget={budgetAmount} consumed={totalConsumed} />
              </div>
              <div className="space-y-1 text-right">
                <p className="text-sm text-muted-foreground">Disponible</p>
                <p className="text-xl font-bold">{formatUF(budgetAmount - totalConsumed)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCLP(convertUFToPesos(budgetAmount - totalConsumed))}
                </p>
              </div>
            </div>

            <BudgetLineTree
              lines={lines}
              onAddLine={handleAddLine}
              onUpdateLine={handleUpdateLine}
              onDeleteLine={handleDeleteLine}
            />
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay presupuesto para el año seleccionado</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowNewBudgetDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Crear Presupuesto
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={showNewBudgetDialog} onOpenChange={setShowNewBudgetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Presupuesto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Año</Label>
              <Input
                type="number"
                value={newBudgetYear}
                onChange={(e) => setNewBudgetYear(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Monto (UF)</Label>
              <Input
                type="number"
                step="0.01"
                value={newBudgetAmount}
                onChange={(e) => setNewBudgetAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBudgetDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBudget}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
