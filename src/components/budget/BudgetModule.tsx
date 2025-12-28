import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BudgetLineTree, BudgetLine, calculateAuthorizedTotal, calculateUnauthorizedTotal, getUnauthorizedLines, getAllDescendantIds, hasDescendants } from "./BudgetLineTree";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useBudgetContext } from "./BudgetContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BudgetTemplateSelector, updateBudgetTemplatePreservingValues, getCurrentTemplateId } from "./BudgetTemplateSelector";

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
  selectedYear: number;
  ocTotal?: number;
  onRefresh?: () => void;
}

export const BudgetModule = ({ contractId, budgetType, title, selectedYear, ocTotal = 0, onRefresh }: BudgetModuleProps) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  
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
    } else {
      setLines([]);
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
  };

  const currentBudget = budgets.find((b) => b.year === selectedYear);
  const authorizedTotal = calculateAuthorizedTotal(lines);
  const unauthorizedTotal = calculateUnauthorizedTotal(lines);
  const budgetAmount = currentBudget?.amount_uf || 0;
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
        <CardTitle className="text-lg flex items-center gap-2">
          {title}
          {isClosed && (
            <div className="flex items-center gap-1 text-muted-foreground text-sm font-normal">
              <Lock className="h-4 w-4" />
              <span>Cerrado</span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentBudget ? (
          <>
            <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Autorizado</p>
                <p className="text-xl font-bold text-green-600">{formatUF(authorizedTotal)}</p>
                <BudgetSemaphore budget={authorizedTotal} consumed={ocTotal} />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Consumido (OC)</p>
                <p className="text-xl font-bold text-orange-600">{formatUF(ocTotal)}</p>
                <p className="text-sm text-muted-foreground">{formatCLP(convertUFToPesos(ocTotal))}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Disponible</p>
                {(() => {
                  const disponible = authorizedTotal - ocTotal;
                  const isSobrepasado = ocTotal > authorizedTotal;
                  return (
                    <>
                      <p className={`text-xl font-bold ${isSobrepasado ? "text-destructive" : "text-foreground"}`}>
                        {isSobrepasado ? "-" : ""}{formatUF(Math.abs(disponible))}
                        {isSobrepasado && " (Sobrepasado)"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCLP(convertUFToPesos(Math.abs(disponible)))}
                      </p>
                    </>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No Autorizado</p>
                <p className="text-xl font-bold text-yellow-600">{formatUF(unauthorizedTotal)}</p>
                <p className="text-xs text-muted-foreground">Se arrastra al próx. año</p>
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
                    const currentTemplateIdLoaded = await getCurrentTemplateId(currentBudget.id);
                    setUpdateTemplateId(currentTemplateIdLoaded || "");
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
            <p>No hay presupuesto de {title.toLowerCase()} para el año {selectedYear}</p>
            <p className="text-sm mt-2">Use "+ Nuevo Año" para crear un presupuesto.</p>
          </div>
        )}
      </CardContent>

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