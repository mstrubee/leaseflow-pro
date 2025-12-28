import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Lock, Calendar, ArrowRightCircle, AlertTriangle, FileText, Trash2, RefreshCw, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BudgetLineTree, BudgetLine, calculateAuthorizedTotal, calculateUnauthorizedTotal, getUnauthorizedLines, getAllDescendantIds, hasDescendants } from "./BudgetLineTree";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useBudgetContext } from "./BudgetContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BudgetTemplateSelector, applyBudgetTemplate, updateBudgetTemplatePreservingValues, getCurrentTemplateId } from "./BudgetTemplateSelector";

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
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [closeCurrentYearOnCreate, setCloseCurrentYearOnCreate] = useState(false);
  const [previousYearData, setPreviousYearData] = useState<{
    hasPreviousYear: boolean;
    pendingOCs: Array<{
      id: string;
      order_number: string;
      amount_uf: number;
      invoiced_amount: number;
      pending_balance: number;
    }>;
    totalPending: number;
  }>({ hasPreviousYear: false, pendingOCs: [], totalPending: 0 });
  
  // Delete budget state
  const [showDeleteBudgetDialog1, setShowDeleteBudgetDialog1] = useState(false);
  const [showDeleteBudgetDialog2, setShowDeleteBudgetDialog2] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState(false);
  
  // Update template state
  const [showUpdateTemplateDialog, setShowUpdateTemplateDialog] = useState(false);
  const [showUpdateTemplateConfirm, setShowUpdateTemplateConfirm] = useState(false);
  const [updateTemplateId, setUpdateTemplateId] = useState("");
  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  
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

  // Check for pending OCs from previous year when year changes
  const checkPreviousYearPendingOCs = async (targetYear: number) => {
    const previousYear = targetYear - 1;
    
    // Check if there's a budget from the previous year
    const previousBudget = budgets.find(b => b.year === previousYear);
    if (!previousBudget) {
      setPreviousYearData({ hasPreviousYear: false, pendingOCs: [], totalPending: 0 });
      return;
    }

    // Get OCs from previous year budget
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("id, order_number, amount_uf")
      .eq("contract_id", contractId)
      .eq("budget_id", previousBudget.id)
      .eq("year", previousYear);

    if (!orders || orders.length === 0) {
      setPreviousYearData({ hasPreviousYear: true, pendingOCs: [], totalPending: 0 });
      return;
    }

    // Calculate invoiced amounts for each OC
    const pendingOCs: Array<{
      id: string;
      order_number: string;
      amount_uf: number;
      invoiced_amount: number;
      pending_balance: number;
    }> = [];

    for (const order of orders) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("amount_uf")
        .eq("purchase_order_id", order.id);

      const invoicedAmount = (invoices || []).reduce((acc, inv) => acc + (inv.amount_uf || 0), 0);
      const pendingBalance = order.amount_uf - invoicedAmount;

      if (pendingBalance > 0) {
        pendingOCs.push({
          id: order.id,
          order_number: order.order_number,
          amount_uf: order.amount_uf,
          invoiced_amount: invoicedAmount,
          pending_balance: pendingBalance,
        });
      }
    }

    const totalPending = pendingOCs.reduce((acc, oc) => acc + oc.pending_balance, 0);
    setPreviousYearData({ hasPreviousYear: true, pendingOCs, totalPending });
  };

  const handleCreateBudget = async () => {
    // Validate template is selected
    if (!selectedTemplateId || selectedTemplateId === "none") {
      toast({ variant: "destructive", title: "Error", description: "Debe seleccionar una plantilla" });
      return;
    }

    // Check if budget already exists for this year and type
    const existingBudget = budgets.find(b => b.year === newBudgetYear);
    if (existingBudget) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: `Ya existe un presupuesto de ${title} para el año ${newBudgetYear}. Seleccione otro año.` 
      });
      return;
    }

    setApplyingTemplate(true);
    try {
      const { data: newBudget, error } = await supabase.from("contract_budgets").insert({
        contract_id: contractId,
        year: newBudgetYear,
        budget_type: budgetType,
        amount_uf: parseFloat(newBudgetAmount) || 0,
      }).select().single();

      if (error) throw error;

      // Apply template (mandatory)
      const success = await applyBudgetTemplate(selectedTemplateId, newBudget.id);
      if (!success) {
        toast({ variant: "destructive", title: "Error", description: "Error al aplicar la plantilla" });
      }

      // If close current year is checked and there are pending OCs, create carryover records
      if (closeCurrentYearOnCreate && previousYearData.pendingOCs.length > 0) {
        const previousYear = newBudgetYear - 1;
        const previousBudget = budgets.find(b => b.year === previousYear);
        
        // Mark previous budget as closed
        if (previousBudget && !previousBudget.is_closed) {
          await supabase
            .from("contract_budgets")
            .update({ is_closed: true, closed_at: new Date().toISOString() })
            .eq("id", previousBudget.id);
        }

        // Create carryover records for pending OCs
        const { data: userData } = await supabase.auth.getUser();
        for (const oc of previousYearData.pendingOCs) {
          await supabase.from("budget_carryover").insert({
            contract_id: contractId,
            source_year: previousYear,
            target_year: newBudgetYear,
            budget_type: budgetType,
            purchase_order_id: oc.id,
            amount_uf: oc.pending_balance,
            created_by: userData?.user?.id,
            notes: `Arrastre automático OC ${oc.order_number} - Saldo pendiente de facturación`,
          });
        }

        toast({ 
          title: "Presupuesto creado con arrastre", 
          description: `Se arrastraron ${previousYearData.pendingOCs.length} OC(s) con saldo pendiente de ${formatUF(previousYearData.totalPending)}` 
        });
      } else {
        toast({ title: "Presupuesto creado", description: `Presupuesto ${title} ${newBudgetYear} creado exitosamente` });
      }

      setShowNewBudgetDialog(false);
      setNewBudgetAmount("");
      setSelectedTemplateId("");
      setCloseCurrentYearOnCreate(false);
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

        // 4. Copiar ítems no autorizados al año siguiente (including new fields)
        for (const line of unauthorizedLines) {
          await supabase.from("budget_lines").insert({
            budget_id: nextBudget!.id,
            parent_id: null, // Se agregan como líneas madre en el nuevo año
            name: `[Arrastre ${selectedYear}] ${line.name}`,
            description: line.description,
            amount_uf: line.amount_uf,
            status: "no_autorizado",
            quantity: line.quantity || 0,
            unit_type: line.unit_type || "m2",
            currency: line.currency || "UF",
            unit_price: line.unit_price || 0,
            template_line_id: line.template_line_id,
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
        quantity: 0,
        unit_type: "m2",
        currency: "UF",
        unit_price: 0,
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

  const handleDeleteBudget = async () => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget) return;

    setDeletingBudget(true);
    try {
      // First delete all budget lines
      const { error: linesError } = await supabase
        .from("budget_lines")
        .delete()
        .eq("budget_id", budget.id);
      
      if (linesError) throw linesError;

      // Delete budget reassignments related to this budget
      await supabase
        .from("budget_reassignments")
        .delete()
        .or(`source_budget_id.eq.${budget.id},target_budget_id.eq.${budget.id}`);

      // Delete the budget itself
      const { error: budgetError } = await supabase
        .from("contract_budgets")
        .delete()
        .eq("id", budget.id);
      
      if (budgetError) throw budgetError;

      toast({
        title: "Presupuesto eliminado",
        description: `El presupuesto de ${title} ${selectedYear} ha sido eliminado`,
      });
      
      setShowDeleteBudgetDialog2(false);
      loadBudgets();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setDeletingBudget(false);
    }
  }

  const handleUpdateTemplate = async () => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget || !updateTemplateId) return;

    setUpdatingTemplate(true);
    try {
      // Use the new function that preserves user values
      const success = await updateBudgetTemplatePreservingValues(updateTemplateId, budget.id);
      if (!success) {
        throw new Error("Error al aplicar la plantilla");
      }

      toast({
        title: "Plantilla actualizada",
        description: "La estructura del presupuesto ha sido actualizada. Los valores existentes se han conservado.",
      });
      
      setShowUpdateTemplateConfirm(false);
      setShowUpdateTemplateDialog(false);
      setUpdateTemplateId("");
      loadLines(budget.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUpdatingTemplate(false);
    }
  }

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
            <>
              <Button variant="outline" size="sm" onClick={() => setShowDeleteBudgetDialog1(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCloseYearDialog(true)}>
                <Calendar className="h-4 w-4 mr-1" />
                Cerrar Año
              </Button>
            </>
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

            {!isClosed && currentBudget && (
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    // Pre-load the current template ID
                    const currentTemplateId = await getCurrentTemplateId(currentBudget.id);
                    setUpdateTemplateId(currentTemplateId || "");
                    setShowUpdateTemplateDialog(true);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualizar Plantilla
                </Button>
              </div>
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
      <Dialog open={showNewBudgetDialog} onOpenChange={(open) => {
        setShowNewBudgetDialog(open);
        if (open) {
          // When dialog opens, check for pending OCs from previous year
          checkPreviousYearPendingOCs(newBudgetYear);
        } else {
          setCloseCurrentYearOnCreate(false);
        }
      }}>
        <DialogContent className="max-w-lg">
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
                onChange={(e) => {
                  const year = parseInt(e.target.value);
                  setNewBudgetYear(year);
                  checkPreviousYearPendingOCs(year);
                }}
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
            
            {/* Close year option */}
            {previousYearData.hasPreviousYear && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="closeYear"
                    checked={closeCurrentYearOnCreate}
                    onCheckedChange={(checked) => setCloseCurrentYearOnCreate(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="closeYear" className="font-medium cursor-pointer">
                      ¿Cerrar año {newBudgetYear - 1}?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Al cerrar el año, se arrastrarán las OC con saldo pendiente de facturación.
                    </p>
                  </div>
                </div>
                
                {closeCurrentYearOnCreate && previousYearData.pendingOCs.length > 0 && (
                  <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                    <RotateCcw className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-700">Arrastre de Presupuesto</AlertTitle>
                    <AlertDescription className="text-amber-600 space-y-2">
                      <p>{previousYearData.pendingOCs.length} OC(s) con saldo pendiente por {formatUF(previousYearData.totalPending)}</p>
                      <div className="max-h-24 overflow-y-auto text-xs space-y-1">
                        {previousYearData.pendingOCs.map(oc => (
                          <div key={oc.id} className="flex justify-between">
                            <span>OC {oc.order_number}</span>
                            <span>{formatUF(oc.pending_balance)}</span>
                          </div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                
                {closeCurrentYearOnCreate && previousYearData.pendingOCs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay OC con saldo pendiente de facturación en el año {newBudgetYear - 1}.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBudgetDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateBudget} 
              disabled={applyingTemplate || !selectedTemplateId || selectedTemplateId === "none"}
            >
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

      {/* AlertDialog: Primera confirmación de eliminación */}
      <AlertDialog open={showDeleteBudgetDialog1} onOpenChange={setShowDeleteBudgetDialog1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar presupuesto?</AlertDialogTitle>
            <AlertDialogDescription>
              Está a punto de eliminar el presupuesto de {title} para el año {selectedYear}. 
              Esta acción eliminará todas las líneas y datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowDeleteBudgetDialog1(false);
                setShowDeleteBudgetDialog2(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Segunda confirmación de eliminación */}
      <AlertDialog open={showDeleteBudgetDialog2} onOpenChange={setShowDeleteBudgetDialog2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Confirmación Final</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold">Esta acción es IRREVERSIBLE.</p>
              <p>Se eliminarán permanentemente:</p>
              <ul className="list-disc list-inside ml-4">
                <li>El presupuesto de {title} {selectedYear}</li>
                <li>Todas las líneas presupuestarias ({lines.length} líneas)</li>
                <li>Todo el historial de reasignaciones</li>
              </ul>
              <p className="font-semibold mt-2">¿Está completamente seguro?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteBudget}
              disabled={deletingBudget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBudget && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sí, eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Actualizar Plantilla */}
      <Dialog open={showUpdateTemplateDialog} onOpenChange={setShowUpdateTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar Plantilla - {title}</DialogTitle>
            <DialogDescription>
              Seleccione una nueva plantilla para reemplazar la estructura actual del presupuesto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <BudgetTemplateSelector
              budgetType={budgetType}
              value={updateTemplateId}
              onChange={setUpdateTemplateId}
              label="Seleccionar plantilla"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUpdateTemplateDialog(false);
              setUpdateTemplateId("");
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                setShowUpdateTemplateDialog(false);
                setShowUpdateTemplateConfirm(true);
              }}
              disabled={!updateTemplateId}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmación de actualización de plantilla */}
      <AlertDialog open={showUpdateTemplateConfirm} onOpenChange={setShowUpdateTemplateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-600">⚠️ Confirmar Actualización de Plantilla</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>¿Está seguro de reemplazar el presupuesto actual por esta plantilla?</p>
              <p className="font-semibold">Todos los montos se reiniciarán a 0.</p>
              <p className="text-sm text-muted-foreground">
                Las líneas actuales serán eliminadas y reemplazadas por la estructura de la nueva plantilla.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowUpdateTemplateConfirm(false);
              setUpdateTemplateId("");
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUpdateTemplate}
              disabled={updatingTemplate}
            >
              {updatingTemplate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sí, reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
