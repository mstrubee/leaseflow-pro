import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Lock, Calendar, ArrowRightCircle, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BudgetLineTree, BudgetLine, calculateAuthorizedTotal, calculateUnauthorizedTotal, getUnauthorizedLines, getAllDescendantIds, hasDescendants } from "./BudgetLineTree";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useBudgetContext } from "./BudgetContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BudgetTemplateSelector, applyBudgetTemplate } from "./BudgetTemplateSelector";

interface Budget {
  id: string;
  contract_id: string;
  year: number;
  budget_type: string;
  amount_uf: number;
  is_closed: boolean;
  closed_at: string | null;
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
  const [showCloseYearDialog, setShowCloseYearDialog] = useState(false);
  const [closingYear, setClosingYear] = useState(false);
  const [newBudgetYear, setNewBudgetYear] = useState(new Date().getFullYear());
  const [newBudgetAmount, setNewBudgetAmount] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("none");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  
  // State propagation dialog
  const [showStatePropagation, setShowStatePropagation] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; newStatus: "autorizado" | "no_autorizado"; hasChildren: boolean } | null>(null);
  
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
    setApplyingTemplate(true);
    try {
      const { data: newBudget, error } = await supabase.from("contract_budgets").insert({
        contract_id: contractId,
        year: newBudgetYear,
        budget_type: budgetType,
        amount_uf: parseFloat(newBudgetAmount) || 0,
      }).select().single();

      if (error) throw error;

      // Apply template if selected
      if (selectedTemplateId && selectedTemplateId !== "none") {
        const success = await applyBudgetTemplate(selectedTemplateId, newBudget.id);
        if (!success) {
          toast({ variant: "destructive", title: "Error", description: "Error al aplicar la plantilla" });
        }
      }

      toast({ title: "Presupuesto creado", description: `Presupuesto ${title} ${newBudgetYear} creado exitosamente` });
      setShowNewBudgetDialog(false);
      setNewBudgetAmount("");
      setSelectedTemplateId("none");
      loadBudgets();
      setSelectedYear(newBudgetYear);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleCloseYear = async () => {
    const currentBudget = budgets.find((b) => b.year === selectedYear);
    if (!currentBudget) return;

    setClosingYear(true);
    try {
      // 1. Marcar el presupuesto actual como cerrado
      await supabase
        .from("contract_budgets")
        .update({ is_closed: true, closed_at: new Date().toISOString() })
        .eq("id", currentBudget.id);

      // 2. Obtener ítems no autorizados
      const unauthorizedLines = getUnauthorizedLines(lines);
      
      if (unauthorizedLines.length > 0) {
        // 3. Crear o obtener presupuesto del año siguiente
        const nextYear = selectedYear + 1;
        let nextBudget = budgets.find((b) => b.year === nextYear);
        
        if (!nextBudget) {
          const { data: newBudget, error: createError } = await supabase
            .from("contract_budgets")
            .insert({
              contract_id: contractId,
              year: nextYear,
              budget_type: budgetType,
              amount_uf: 0,
            })
            .select()
            .single();
          
          if (createError) throw createError;
          nextBudget = newBudget;
        }

        // 4. Copiar ítems no autorizados al año siguiente
        for (const line of unauthorizedLines) {
          await supabase.from("budget_lines").insert({
            budget_id: nextBudget!.id,
            parent_id: null, // Se agregan como líneas madre en el nuevo año
            name: `[Arrastre ${selectedYear}] ${line.name}`,
            description: line.description,
            amount_uf: line.amount_uf,
            status: "no_autorizado",
          });

          // Registrar la reasignación
          await supabase.from("budget_reassignments").insert({
            source_budget_id: currentBudget.id,
            target_budget_id: nextBudget!.id,
            budget_line_id: line.id,
            amount_uf: line.amount_uf,
            notes: `Arrastre automático por cierre de año ${selectedYear}`,
          });
        }
      }

      toast({ 
        title: "Año cerrado", 
        description: unauthorizedLines.length > 0 
          ? `${unauthorizedLines.length} ítem(s) no autorizados arrastrados al ${selectedYear + 1}`
          : "Año cerrado exitosamente" 
      });
      setShowCloseYearDialog(false);
      loadBudgets();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setClosingYear(false);
    }
  };

  const handleAddLine = async (parentId: string | null) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget || budget.is_closed) return;

    try {
      const { error } = await supabase.from("budget_lines").insert({
        budget_id: budget.id,
        parent_id: parentId,
        name: "Nueva línea",
        amount_uf: 0,
        status: "no_autorizado",
      });

      if (error) throw error;
      loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleUpdateLine = async (id: string, data: Partial<BudgetLine>) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (budget?.is_closed) return;

    // Check if this is a status change and the line has children
    if (data.status) {
      const hasChildren = hasDescendantsCheck(id);
      if (hasChildren) {
        setPendingStatusChange({ id, newStatus: data.status, hasChildren: true });
        setShowStatePropagation(true);
        return;
      }
    }

    await applyLineUpdate(id, data);
  };

  const hasDescendantsCheck = (lineId: string): boolean => {
    return hasDescendants(lines, lineId);
  };

  const applyLineUpdate = async (id: string, data: Partial<BudgetLine>) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    try {
      const { error } = await supabase.from("budget_lines").update(data).eq("id", id);
      if (error) throw error;
      
      if (budget) loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleConfirmStatusPropagation = async (applyToChildren: boolean) => {
    if (!pendingStatusChange) return;
    
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget) return;

    try {
      // Update the parent line
      await supabase.from("budget_lines").update({ status: pendingStatusChange.newStatus }).eq("id", pendingStatusChange.id);

      // If apply to children, update all descendants
      if (applyToChildren) {
        const descendantIds = getAllDescendantIds(lines, pendingStatusChange.id);
        if (descendantIds.length > 0) {
          await supabase
            .from("budget_lines")
            .update({ status: pendingStatusChange.newStatus })
            .in("id", descendantIds);
        }
      }

      loadLines(budget.id);
      toast({ 
        title: "Estado actualizado", 
        description: applyToChildren 
          ? "Estado aplicado a la línea y todas sus sublíneas" 
          : "Estado aplicado solo a la línea seleccionada"
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setShowStatePropagation(false);
      setPendingStatusChange(null);
    }
  };

  const handleDeleteLine = async (id: string) => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (budget?.is_closed) return;

    try {
      const { error } = await supabase.from("budget_lines").delete().eq("id", id);
      if (error) throw error;
      
      if (budget) loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const currentBudget = budgets.find((b) => b.year === selectedYear);
  const authorizedTotal = calculateAuthorizedTotal(lines);
  const unauthorizedTotal = calculateUnauthorizedTotal(lines);
  const budgetAmount = currentBudget?.amount_uf || 0;
  const availableYears = [...new Set(budgets.map((b) => b.year))].sort((a, b) => b - a);
  const isClosed = currentBudget?.is_closed || false;
  const unauthorizedCount = getUnauthorizedLines(lines).length;

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
          {isClosed && (
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
          {!isClosed && currentBudget && (
            <Button variant="outline" size="sm" onClick={() => setShowCloseYearDialog(true)}>
              <Calendar className="h-4 w-4 mr-1" />
              Cerrar Año
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowNewBudgetDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Año
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentBudget ? (
          <>
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Presupuesto {selectedYear}</p>
                <p className="text-xl font-bold">{formatUF(budgetAmount)}</p>
                <p className="text-sm text-muted-foreground">{formatCLP(convertUFToPesos(budgetAmount))}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Autorizado</p>
                <p className="text-xl font-bold text-green-600">{formatUF(authorizedTotal)}</p>
                <BudgetSemaphore budget={budgetAmount} consumed={authorizedTotal} />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No Autorizado</p>
                <p className="text-xl font-bold text-yellow-600">{formatUF(unauthorizedTotal)}</p>
                <p className="text-xs text-muted-foreground">Se arrastra al próx. año</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Disponible</p>
                <p className="text-xl font-bold">{formatUF(budgetAmount - authorizedTotal)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCLP(convertUFToPesos(budgetAmount - authorizedTotal))}
                </p>
              </div>
            </div>

            {unauthorizedCount > 0 && !isClosed && (
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-700">Ítems pendientes de autorización</AlertTitle>
                <AlertDescription className="text-yellow-600">
                  {unauthorizedCount} ítem(s) no autorizado(s) por {formatUF(unauthorizedTotal)}. 
                  Al cerrar el año, estos se arrastrarán automáticamente al año siguiente.
                </AlertDescription>
              </Alert>
            )}

            <BudgetLineTree
              lines={lines}
              onAddLine={handleAddLine}
              onUpdateLine={handleUpdateLine}
              onDeleteLine={handleDeleteLine}
              readOnly={isClosed}
            />
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay presupuesto de {title.toLowerCase()} para el año seleccionado</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowNewBudgetDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Crear Presupuesto
            </Button>
          </div>
        )}
      </CardContent>

      {/* Dialog: Nuevo presupuesto */}
      <Dialog open={showNewBudgetDialog} onOpenChange={setShowNewBudgetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Presupuesto - {title}</DialogTitle>
            <DialogDescription>
              Este presupuesto es independiente y no afecta otros tipos de presupuesto.
            </DialogDescription>
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
            <BudgetTemplateSelector
              budgetType={budgetType}
              value={selectedTemplateId}
              onChange={setSelectedTemplateId}
              label="Cargar plantilla tipo"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBudgetDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBudget} disabled={applyingTemplate}>
              {applyingTemplate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar año */}
      <Dialog open={showCloseYearDialog} onOpenChange={setShowCloseYearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Año {selectedYear} - {title}</DialogTitle>
            <DialogDescription>
              Esta acción cerrará el presupuesto de {title.toLowerCase()} para el año {selectedYear}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Presupuesto</p>
                <p className="font-bold">{formatUF(budgetAmount)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Autorizado</p>
                <p className="font-bold text-green-600">{formatUF(authorizedTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Disponible</p>
                <p className="font-bold">{formatUF(budgetAmount - authorizedTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">% Ejecutado</p>
                <p className="font-bold">{budgetAmount > 0 ? ((authorizedTotal / budgetAmount) * 100).toFixed(1) : 0}%</p>
              </div>
            </div>

            {unauthorizedCount > 0 && (
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                <ArrowRightCircle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-700">Arrastre automático</AlertTitle>
                <AlertDescription className="text-yellow-600">
                  {unauthorizedCount} ítem(s) no autorizado(s) por {formatUF(unauthorizedTotal)} serán 
                  arrastrados al presupuesto de {title.toLowerCase()} del año {selectedYear + 1}.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseYearDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCloseYear} disabled={closingYear}>
              {closingYear ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Cerrar Año
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Propagación de estado */}
      <AlertDialog open={showStatePropagation} onOpenChange={setShowStatePropagation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar estado de línea</AlertDialogTitle>
            <AlertDialogDescription>
              Esta línea tiene sublíneas dependientes. ¿Desea aplicar el estado "{pendingStatusChange?.newStatus === "autorizado" ? "Autorizado" : "No Autorizado"}" a todas las subcategorías?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowStatePropagation(false);
              setPendingStatusChange(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmStatusPropagation(false)}>
              Solo esta línea
            </AlertDialogAction>
            <AlertDialogAction onClick={() => handleConfirmStatusPropagation(true)}>
              Aplicar a todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
