import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, AlertTriangle, RefreshCw, ChevronsUpDown, ChevronsDownUp, Download, Move, X } from "lucide-react";
import * as XLSX from "xlsx";
import { OpexConsumptionPieChart } from "./OpexConsumptionPieChart";
import { useToast } from "@/hooks/use-toast";
import { BudgetLineTree, BudgetLine, calculateAuthorizedTotal, calculateGrandTotal, calculateUnauthorizedTotal, getUnauthorizedLines, getAllDescendantIds, hasDescendants } from "./BudgetLineTree";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { useBudgetContext } from "./BudgetContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BudgetTemplateSelector, updateBudgetTemplatePreservingValues, getCurrentTemplateId } from "./BudgetTemplateSelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OCRequestDialog } from "./OCRequestDialog";
import { QuotationsManager } from "./QuotationsManager";
import { BudgetTrashPanel } from "./BudgetTrashPanel";
import { MoveLinesDialog } from "./MoveLinesDialog";

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
  contractName?: string;
  contractCebe?: string | null;
  budgetType: "capex" | "opex";
  title: string;
  selectedYear: number;
  ocTotal?: number;
  ocTotalClp?: number;
  onRefresh?: () => void;
  superficieEdificada?: number;
  readOnly?: boolean;
}

export const BudgetModule = ({ contractId, contractName = "", contractCebe, budgetType, title, selectedYear, ocTotal = 0, ocTotalClp = 0, onRefresh, superficieEdificada = 0, readOnly: forceReadOnly = false }: BudgetModuleProps) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [templatePricesMap, setTemplatePricesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  
  // Update template state
  const [showUpdateTemplateDialog, setShowUpdateTemplateDialog] = useState(false);
  const [showUpdateTemplateConfirm, setShowUpdateTemplateConfirm] = useState(false);
  const [updateTemplateId, setUpdateTemplateId] = useState("");
  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  
  // State propagation dialog
  const [showStatePropagation, setShowStatePropagation] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; newStatus: "autorizado" | "no_autorizado"; hasChildren: boolean } | null>(null);

  // Bulk-move (line selection) state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const handleToggleSelectLine = useCallback((id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedLineIds(new Set());
  }, []);

  const handleConfirmMove = useCallback(async (targetParentId: string | null) => {
    const ids = Array.from(selectedLineIds);
    console.log("[MOVE] Starting move", { ids, targetParentId });
    if (ids.length === 0) {
      toast({ variant: "destructive", title: "Sin selección", description: "No hay líneas seleccionadas para mover." });
      return;
    }
    try {
      // Fetch full snapshots of the lines being moved so we can leave a "ghost"
      // placeholder at each original position pointing to the moved line.
      const { data: originalLines, error: fetchError } = await supabase
        .from("budget_lines")
        .select("*")
        .in("id", ids);
      if (fetchError) throw fetchError;
      console.log("[MOVE] Fetched originals", originalLines?.length);

      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const movedAt = new Date().toISOString();

      // 1) Update the real lines: change parent_id + record move metadata.
      const { data: updated, error: updErr } = await supabase
        .from("budget_lines")
        .update({ parent_id: targetParentId, moved_at: movedAt, moved_by: userId })
        .in("id", ids)
        .select("id");
      if (updErr) throw updErr;
      console.log("[MOVE] Updated rows", updated?.length);
      if (!updated || updated.length === 0) {
        throw new Error("No se actualizó ninguna línea (posible problema de permisos).");
      }

      // 2) Insert ghost placeholders at the original parents — non-counting markers.
      const ghostRows = (originalLines || []).map((orig: any) => ({
        budget_id: orig.budget_id,
        parent_id: orig.parent_id, // original location
        name: orig.name,
        description: orig.description,
        amount_uf: 0,
        status: orig.status,
        display_order: orig.display_order,
        is_ghost: true,
        moved_to_line_id: orig.id,
        moved_at: movedAt,
        moved_by: userId,
      }));
      if (ghostRows.length > 0) {
        const { data: ghostData, error: ghostErr } = await supabase
          .from("budget_lines")
          .insert(ghostRows)
          .select("id");
        if (ghostErr) {
          console.error("[MOVE] Ghost insert failed", ghostErr);
          throw ghostErr;
        }
        console.log("[MOVE] Inserted ghosts", ghostData?.length);
      }

      toast({ title: "Líneas movidas", description: `Se movieron ${ids.length} línea(s) y se dejó marca en su posición original.` });
      handleExitSelectionMode();
      const budget = budgets.find((b) => b.year === selectedYear);
      if (budget) await loadLines(budget.id);
      onRefresh?.();
    } catch (err: any) {
      console.error("[MOVE] Failed", err);
      toast({ variant: "destructive", title: "Error al mover", description: err?.message || "No se pudieron mover las líneas." });
    }
  }, [selectedLineIds, budgets, selectedYear, onRefresh, handleExitSelectionMode]);

  
  // OC Dialog state
  const [showOCDialog, setShowOCDialog] = useState(false);
  const [ocBudgetLineId, setOcBudgetLineId] = useState("");
  const [ocLineName, setOcLineName] = useState("");
  const [ocLineAvailable, setOcLineAvailable] = useState(0);
  const [ocLineBudget, setOcLineBudget] = useState(0);
  const [loadingLineAvailable, setLoadingLineAvailable] = useState(false);
  const [ocForm, setOcForm] = useState({
    order_number: "",
    supplier_name: "",
    description: "",
    amount: "",
    currency: "UF"
  });
  const [creatingOC, setCreatingOC] = useState(false);

  // Invoice Dialog state  
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceBudgetLineId, setInvoiceBudgetLineId] = useState("");
  const [invoiceLineName, setInvoiceLineName] = useState("");
  const [lineOCs, setLineOCs] = useState<{ id: string; order_number: string; supplier_name: string | null; amount_uf: number; amount_clp?: number | null }[]>([]);
  const [loadingLineOCs, setLoadingLineOCs] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().split('T')[0],
    amount: "",
    currency: "UF",
    purchase_order_id: ""
  });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Line Details Dialog state
  const [showLineDetailsDialog, setShowLineDetailsDialog] = useState(false);
  const [lineDetailsId, setLineDetailsId] = useState("");
  const [lineDetailsName, setLineDetailsName] = useState("");
  const [lineDetailsOCs, setLineDetailsOCs] = useState<{
    id: string;
    order_number: string;
    supplier_name: string | null;
    amount_uf: number;
    amount_clp?: number | null;
    status: string;
    invoices: { id: string; invoice_number: string; amount_uf: number; amount_clp?: number | null; invoice_date: string }[];
    credit_notes: { id: string; credit_note_number: string; amount_uf: number; amount_clp?: number | null; invoice_id: string }[];
  }[]>([]);
  const [lineDetailsRequests, setLineDetailsRequests] = useState<{
    id: string;
    request_number: string;
    amount_uf: number;
    amount_clp?: number | null;
    status: string;
    supplier_name: string | null;
    request_date: string;
  }[]>([]);
  const [loadingLineDetails, setLoadingLineDetails] = useState(false);
  
  // Global expand/collapse state
  const [globalExpandState, setGlobalExpandState] = useState<"expanded" | "collapsed" | null>(null);
  
  // Centralized expansion state: tracks which lines are expanded
  // Using a "collapsed set" approach: all lines are expanded by default, this set tracks collapsed ones
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  // collapsedIds is passed directly to the tree - no need to compute expandedIds
  
  const handleToggleExpand = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  // Handle global expand/collapse
  const handleExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
    setGlobalExpandState("expanded");
    setTimeout(() => setGlobalExpandState(null), 100);
  }, []);
  
  const handleCollapseAll = useCallback(() => {
    const collectIds = (items: BudgetLine[]): string[] => {
      const ids: string[] = [];
      items.forEach(item => {
        ids.push(item.id);
        if (item.children?.length) ids.push(...collectIds(item.children));
      });
      return ids;
    };
    setCollapsedIds(new Set(collectIds(lines)));
    setGlobalExpandState("collapsed");
    setTimeout(() => setGlobalExpandState(null), 100);
  }, [lines]);

  // Debounced onRefresh
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      onRefresh?.();
    }, 500);
  }, [onRefresh]);
  
  // OC Request Dialog state
  const [showOCRequestDialog, setShowOCRequestDialog] = useState(false);
  const [ocRequestLineId, setOcRequestLineId] = useState("");
  const [ocRequestLineName, setOcRequestLineName] = useState("");
  const [ocRequestLineAvailable, setOcRequestLineAvailable] = useState(0);
  const [ocRequestLineBudget, setOcRequestLineBudget] = useState(0);
  
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos, ufValue } = useBudgetContext();

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
        .is("deleted_at", null)
        .order("display_order");

      if (error) throw error;
      const flatLines = (data || []) as BudgetLine[];
      setLines(buildTree(flatLines));
      
      // Fetch template prices for lines with template_line_id
      const templateLineIds = flatLines
        .filter(l => l.template_line_id)
        .map(l => ({ lineId: l.id, templateId: l.template_line_id! }));
      
      if (templateLineIds.length > 0) {
        const uniqueTemplateIds = [...new Set(templateLineIds.map(m => m.templateId))];
        const { data: templateData } = await supabase
          .from("budget_template_lines")
          .select("id, default_amount_uf")
          .in("id", uniqueTemplateIds);
        
        if (templateData) {
          const tMap: Record<string, number> = {};
          templateData.forEach(t => { tMap[t.id] = t.default_amount_uf || 0; });
          const pricesMap: Record<string, number> = {};
          templateLineIds.forEach(m => { pricesMap[m.lineId] = tMap[m.templateId] ?? 0; });
          setTemplatePricesMap(pricesMap);
        }
      } else {
        setTemplatePricesMap({});
      }
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

    // Detect "authorize a surcharge" — fold its amount into the base line
    if (data.status === "autorizado") {
      // Locate the line in the current tree
      const findInTree = (items: BudgetLine[]): BudgetLine | null => {
        for (const it of items) {
          if (it.id === id) return it;
          if (it.children?.length) {
            const f = findInTree(it.children);
            if (f) return f;
          }
        }
        return null;
      };
      const surchargeLine = findInTree(lines);
      if (surchargeLine?.is_surcharge && surchargeLine.surcharge_parent_line_id && !surchargeLine.merged_into_line_id) {
        const baseLine = findInTree(lines)
          ? (function findById(items: BudgetLine[]): BudgetLine | null {
              for (const it of items) {
                if (it.id === surchargeLine.surcharge_parent_line_id) return it;
                if (it.children?.length) {
                  const f = findById(it.children);
                  if (f) return f;
                }
              }
              return null;
            })(lines)
          : null;
        if (baseLine) {
          try {
            const surchargeUf = surchargeLine.amount_uf || 0;
            const baseAmount = baseLine.amount_uf || 0;
            const baseQty = baseLine.quantity || 1;
            const newBaseAmount = baseAmount + surchargeUf;
            const newUnitPrice = baseQty > 0 ? newBaseAmount / baseQty : (baseLine.unit_price || 0);
            const originalSnapshot = baseLine.original_amount_uf ?? baseAmount;

            // Update base line (snapshot original first time)
            const { error: e1 } = await supabase
              .from("budget_lines")
              .update({
                amount_uf: newBaseAmount,
                unit_price: newUnitPrice,
                original_amount_uf: originalSnapshot,
              })
              .eq("id", baseLine.id);
            if (e1) throw e1;

            // Mark surcharge as merged + authorized
            const { error: e2 } = await supabase
              .from("budget_lines")
              .update({
                status: "autorizado",
                merged_into_line_id: baseLine.id,
              })
              .eq("id", id);
            if (e2) throw e2;

            toast({ title: "Adicional autorizado", description: "El monto se sumó a la línea original" });
            if (budget) await loadLines(budget.id);
            debouncedRefresh();
            return;
          } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
            if (budget) loadLines(budget.id);
            return;
          }
        }
      }
    }

    // 1. Optimistic UI: update local state immediately
    setLines(prev => {
      const updateInTree = (items: BudgetLine[]): BudgetLine[] => {
        let changed = false;
        const result = items.map(item => {
          if (item.id === id) {
            changed = true;
            return { ...item, ...data };
          }
          if (item.children?.length) {
            const newChildren = updateInTree(item.children);
            if (newChildren !== item.children) {
              changed = true;
              return { ...item, children: newChildren };
            }
          }
          return item;
        });
        return changed ? result : items;
      };
      return updateInTree(prev);
    });

    // 2. Background DB update (non-blocking for UI)
    try {
      const { error } = await supabase.from("budget_lines").update(data).eq("id", id);
      if (error) throw error;
      
      // 3. Recalculate percentage lines in background, update local state only
      if (budget && (data.amount_uf !== undefined || data.quantity !== undefined || data.unit_price !== undefined || data.currency !== undefined)) {
        recalcPercentageLinesLocally(budget.id);
        // Debounced refresh for parent dashboard
        debouncedRefresh();
      } else {
        debouncedRefresh();
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      // Revert: reload from DB on error
      if (budget) loadLines(budget.id);
    }
  };

  // Recalculate percentage lines and update both DB and local state without full reload
  const recalcPercentageLinesLocally = async (budgetId: string) => {
    try {
      // Flatten local tree instead of fetching from DB (optimistic state is already applied)
      const flattenTree = (items: BudgetLine[]): BudgetLine[] => {
        const result: BudgetLine[] = [];
        items.forEach(item => {
          result.push(item);
          if (item.children?.length) result.push(...flattenTree(item.children));
        });
        return result;
      };
      const allFlatLines = flattenTree(lines);
      if (allFlatLines.length === 0) return;
      
      const percentageLines = allFlatLines.filter(l => l.calc_type === "percentage" && l.calc_source_line_id);
      if (percentageLines.length === 0) return;

      const lineMap = new Map(allFlatLines.map(l => [l.id, l]));
      
      const calcSubtotal = (parentId: string): number => {
        const children = allFlatLines.filter(l => l.parent_id === parentId);
        return children.reduce((sum, child) => {
          const childChildren = allFlatLines.filter(l => l.parent_id === child.id);
          if (childChildren.length > 0) {
            const sub = calcSubtotal(child.id);
            const mult = child.quantity || 1;
            return sum + (sub * mult);
          }
          return sum + (child.amount_uf || 0);
        }, 0);
      };

      const updates: { id: string; newAmount: number }[] = [];
      const updatePromises = percentageLines.map(pLine => {
        const sourceLine = lineMap.get(pLine.calc_source_line_id!);
        if (!sourceLine) return null;
        
        const sourceChildren = allFlatLines.filter(l => l.parent_id === sourceLine.id);
        let sourceSubtotal: number;
        if (sourceChildren.length > 0) {
          sourceSubtotal = calcSubtotal(sourceLine.id);
          const srcMult = sourceLine.quantity || 1;
          sourceSubtotal = sourceSubtotal * srcMult;
        } else {
          sourceSubtotal = sourceLine.amount_uf || 0;
        }
        
        const newAmount = (sourceSubtotal * (pLine.calc_percentage || 0)) / 100;
        if (Math.abs(newAmount - (pLine.amount_uf || 0)) > 0.001) {
          updates.push({ id: pLine.id, newAmount });
          return supabase.from("budget_lines").update({ amount_uf: newAmount }).eq("id", pLine.id);
        }
        return null;
      }).filter(Boolean);
      
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }
      
      // Update local state with new percentage amounts (no full reload)
      if (updates.length > 0) {
        setLines(prev => {
          const updateInTree = (items: BudgetLine[]): BudgetLine[] => {
            let changed = false;
            const result = items.map(item => {
              const upd = updates.find(u => u.id === item.id);
              if (upd) {
                changed = true;
                return { ...item, amount_uf: upd.newAmount };
              }
              if (item.children?.length) {
                const newChildren = updateInTree(item.children);
                if (newChildren !== item.children) {
                  changed = true;
                  return { ...item, children: newChildren };
                }
              }
              return item;
            });
            return changed ? result : items;
          };
          return updateInTree(prev);
        });
      }
    } catch (error) {
      console.error("Error recalculating percentage lines:", error);
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
      onRefresh?.();
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

    // Ghost lines (movement markers) can ONLY be deleted by admins
    const targetLine = lines.find((l) => l.id === id);
    if (targetLine?.is_ghost && !isAdmin) {
      toast({
        variant: "destructive",
        title: "No autorizado",
        description: "Solo un administrador puede eliminar marcas de movimiento.",
      });
      return;
    }

    try {
      // Get current user for audit
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get all descendant IDs to soft-delete them too
      const descendantIds = getAllDescendantIds(lines, id);
      const allIdsToDelete = [id, ...descendantIds];
      
      // Soft delete: update deleted_at and deleted_by
      const { error } = await supabase
        .from("budget_lines")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id || null
        })
        .in("id", allIdsToDelete);
        
      if (error) throw error;
      
      toast({ 
        title: "Línea(s) eliminada(s)", 
        description: `${allIdsToDelete.length} línea(s) movida(s) a la papelera` 
      });
      
      if (budget) loadLines(budget.id);
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Handle opening OC Request dialog from budget line
  const handleCreateOCRequestFromLine = async (budgetLineId: string, lineName: string) => {
    setOcRequestLineId(budgetLineId);
    setOcRequestLineName(lineName);
    
    // Find the line recursively
    const findLine = (items: BudgetLine[]): BudgetLine | null => {
      for (const item of items) {
        if (item.id === budgetLineId) return item;
        if (item.children?.length) {
          const found = findLine(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    const budgetLine = findLine(lines);
    const lineAmount = budgetLine?.amount_uf || 0;
    setOcRequestLineBudget(lineAmount);
    
    // Calculate available (budget - existing OCs - existing requests)
    try {
      const [{ data: existingOCs }, { data: existingRequests }] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("amount_uf")
          .eq("budget_line_id", budgetLineId)
          .eq("year", selectedYear),
        supabase
          .from("oc_requests")
          .select("amount_uf")
          .eq("budget_line_id", budgetLineId)
          .eq("year", selectedYear)
          .eq("status", "pending")
      ]);
      
      const usedByOC = (existingOCs || []).reduce((sum, oc) => sum + oc.amount_uf, 0);
      const usedByRequests = (existingRequests || []).reduce((sum, r) => sum + r.amount_uf, 0);
      setOcRequestLineAvailable(lineAmount - usedByOC - usedByRequests);
    } catch (error) {
      console.error("Error calculating available:", error);
      setOcRequestLineAvailable(lineAmount);
    }
    
    setShowOCRequestDialog(true);
  };

  // Export budget lines to Excel
  const handleExportExcel = () => {
    if (!lines.length || !currentBudget) return;

    const flatRows: Record<string, any>[] = [];
    const flattenLines = (items: BudgetLine[], level = 0) => {
      for (const line of items) {
        flatRows.push({
          "Línea": "  ".repeat(level) + line.name,
          "Cantidad": line.quantity ?? "",
          "Unidad": line.unit_type ?? "",
          "P. Unitario (UF)": line.unit_price ?? "",
          "Total (UF)": line.amount_uf ?? 0,
          "Total (CLP)": Math.round((line.amount_uf ?? 0) * ufValue),
          "Estado": line.status ?? "",
        });
        if (line.children?.length) {
          flattenLines(line.children, level + 1);
        }
      }
    };

    flattenLines(lines);

    // Totals row
    const totalUF = lines.reduce((s, l) => s + (l.amount_uf ?? 0), 0);
    flatRows.push({
      "Línea": "TOTAL",
      "Cantidad": "",
      "Unidad": "",
      "P. Unitario (UF)": "",
      "Total (UF)": totalUF,
      "Total (CLP)": Math.round(totalUF * ufValue),
      "Estado": "",
    });

    const ws = XLSX.utils.json_to_sheet(flatRows);
    ws["!cols"] = [
      { wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");
    const fileName = `${contractName || "Contrato"} - ${title} ${currentBudget.year}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };


  const handleCreateOCFromLine = async (budgetLineId: string, lineName: string) => {
    setOcBudgetLineId(budgetLineId);
    setOcLineName(lineName);
    setOcForm({
      order_number: "",
      supplier_name: "",
      description: lineName,
      amount: "",
      currency: "UF"
    });
    setShowOCDialog(true);
    setLoadingLineAvailable(true);
    
    try {
      // Find the line recursively
      const findLine = (items: BudgetLine[]): BudgetLine | null => {
        for (const item of items) {
          if (item.id === budgetLineId) return item;
          if (item.children?.length) {
            const found = findLine(item.children);
            if (found) return found;
          }
        }
        return null;
      };
      
      const budgetLine = findLine(lines);
      const lineAmount = budgetLine?.amount_uf || 0;
      setOcLineBudget(lineAmount);
      
      // Get existing OCs for this line to calculate used amount
      const { data: existingOCs } = await supabase
        .from("purchase_orders")
        .select("amount_uf")
        .eq("budget_line_id", budgetLineId)
        .eq("year", selectedYear);
      
      const usedAmount = (existingOCs || []).reduce((sum, oc) => sum + oc.amount_uf, 0);
      setOcLineAvailable(lineAmount - usedAmount);
    } catch (error) {
      console.error("Error calculating available amount:", error);
      setOcLineAvailable(0);
    } finally {
      setLoadingLineAvailable(false);
    }
  };

  // Handle creating OC
  const handleCreateOC = async () => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget) return;

    const amount = parseFloat(ocForm.amount) || 0;
    let amountUf = amount;

    if (ocForm.currency === "CLP" && ufValue > 0) {
      amountUf = amount / ufValue;
    }

    // Validate that the OC doesn't exceed available amount
    if (amountUf > ocLineAvailable + 0.01) {
      toast({ 
        variant: "destructive", 
        title: "Monto excede disponible", 
        description: `El monto de la OC (${formatCLP(convertUFToPesos(amountUf))}) supera el disponible de la línea (${formatCLP(convertUFToPesos(ocLineAvailable))})` 
      });
      return;
    }

    setCreatingOC(true);
    try {
      let amountClp = 0;

      if (ocForm.currency === "CLP" && ufValue > 0) {
        amountClp = amount;
      } else {
        amountClp = amount * ufValue;
      }

      const { error } = await supabase.from("purchase_orders").insert({
        contract_id: contractId,
        budget_id: budget.id,
        budget_line_id: ocBudgetLineId,
        order_number: ocForm.order_number,
        supplier_name: ocForm.supplier_name,
        description: ocForm.description,
        amount_uf: amountUf,
        amount_clp: amountClp,
        input_currency: ocForm.currency,
        uf_value_at_entry: ufValue,
        year: selectedYear,
        status: "abierta"
      });

      if (error) throw error;

      toast({ title: "OC creada", description: `Orden de compra ${ocForm.order_number} creada exitosamente` });
      setShowOCDialog(false);
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingOC(false);
    }
  };

  // Handle opening Invoice dialog from budget line
  const handleCreateInvoiceFromLine = async (budgetLineId: string, lineName: string) => {
    setInvoiceBudgetLineId(budgetLineId);
    setInvoiceLineName(lineName);
    setInvoiceForm({
      invoice_number: "",
      invoice_date: new Date().toISOString().split('T')[0],
      amount: "",
      currency: "UF",
      purchase_order_id: ""
    });
    setShowInvoiceDialog(true);
    
    // Load existing OCs for this budget line
    setLoadingLineOCs(true);
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, supplier_name, amount_uf, amount_clp")
        .eq("budget_line_id", budgetLineId)
        .eq("year", selectedYear)
        .order("order_date", { ascending: false });

      if (error) throw error;
      setLineOCs(data || []);
    } catch (error) {
      console.error("Error loading OCs for line:", error);
      setLineOCs([]);
    } finally {
      setLoadingLineOCs(false);
    }
  };

  // Handle creating Invoice - must select existing OC
  const handleCreateInvoice = async () => {
    if (!invoiceForm.purchase_order_id) {
      toast({ variant: "destructive", title: "Error", description: "Debe seleccionar una Orden de Compra" });
      return;
    }

    setCreatingInvoice(true);
    try {
      const amount = parseFloat(invoiceForm.amount) || 0;
      let amountUf = amount;
      let amountClp = 0;

      if (invoiceForm.currency === "CLP" && ufValue > 0) {
        amountUf = amount / ufValue;
        amountClp = amount;
      } else {
        amountClp = amount * ufValue;
      }

      // Create the invoice with selected OC
      const { error } = await supabase.from("invoices").insert({
        purchase_order_id: invoiceForm.purchase_order_id,
        invoice_number: invoiceForm.invoice_number,
        invoice_date: invoiceForm.invoice_date,
        amount_uf: amountUf,
        amount_clp: amountClp,
        input_currency: invoiceForm.currency,
        uf_value_at_entry: ufValue,
        reception_status: "pendiente"
      });

      if (error) throw error;

      toast({ title: "Factura registrada", description: `Factura ${invoiceForm.invoice_number} creada exitosamente` });
      setShowInvoiceDialog(false);
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingInvoice(false);
    }
  };

  // Handler to view line details (OCs, invoices, credit notes, requests)
  const handleViewLineDetails = async (budgetLineId: string, lineName: string) => {
    setLineDetailsId(budgetLineId);
    setLineDetailsName(lineName);
    setShowLineDetailsDialog(true);
    setLoadingLineDetails(true);

    try {
      // Fetch OCs for this budget line
      const { data: ocs, error: ocsError } = await supabase
        .from("purchase_orders")
        .select("id, order_number, supplier_name, amount_uf, amount_clp, uf_value_at_entry, status")
        .eq("budget_line_id", budgetLineId)
        .order("order_date", { ascending: false });

      if (ocsError) throw ocsError;

      // Fetch OC Requests for this line
      const { data: requests } = await supabase
        .from("oc_requests")
        .select("id, request_number, amount_uf, amount_clp, uf_value_at_entry, status, supplier_name, request_date")
        .eq("budget_line_id", budgetLineId)
        .order("created_at", { ascending: false });
      
      setLineDetailsRequests((requests || []) as any);

      // For each OC, fetch invoices and credit notes
      const ocsWithDetails = await Promise.all(
        (ocs || []).map(async (oc) => {
          const { data: invoices } = await supabase
            .from("invoices")
            .select("id, invoice_number, amount_uf, amount_clp, uf_value_at_entry, invoice_date")
            .eq("purchase_order_id", oc.id)
            .order("invoice_date", { ascending: false });

          const { data: creditNotes } = await supabase
            .from("credit_notes")
            .select("id, credit_note_number, amount_uf, amount_clp, uf_value_at_entry, invoice_id")
            .eq("purchase_order_id", oc.id)
            .order("credit_note_date", { ascending: false });

          return {
            ...oc,
            invoices: invoices || [],
            credit_notes: creditNotes || [],
          };
        })
      );

      setLineDetailsOCs(ocsWithDetails);
    } catch (error) {
      console.error("Error loading line details:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los detalles" });
    } finally {
      setLoadingLineDetails(false);
    }
  };

  const handleUpdateTemplate = async () => {
    const budget = budgets.find((b) => b.year === selectedYear);
    if (!budget || !updateTemplateId) return;

    setUpdatingTemplate(true);
    try {
      // Use the new function that preserves user values
      const success = await updateBudgetTemplatePreservingValues(updateTemplateId, budget.id, contractId);
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
  const authorizedTotal = calculateAuthorizedTotal(lines, templatePricesMap, ufValue);
  const unauthorizedTotal = calculateUnauthorizedTotal(lines, templatePricesMap, ufValue);
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
                <p className="text-xl font-bold text-green-600">{formatCLP(convertUFToPesos(authorizedTotal))}</p>
                <p className="text-xs text-muted-foreground">{formatUF(authorizedTotal)}</p>
                <BudgetSemaphore budget={convertUFToPesos(authorizedTotal)} consumed={ocTotalClp} />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Consumido (OC)</p>
                <p className="text-xl font-bold text-orange-600">{formatCLP(ocTotalClp)}</p>
                <p className="text-xs text-muted-foreground">{formatUF(ocTotal)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Disponible</p>
                {(() => {
                  const disponibleClp = convertUFToPesos(authorizedTotal) - ocTotalClp;
                  const disponibleUf = authorizedTotal - ocTotal;
                  const isSobrepasado = ocTotalClp > convertUFToPesos(authorizedTotal);
                  return (
                    <>
                      <p className={`text-xl font-bold ${isSobrepasado ? "text-destructive" : "text-foreground"}`}>
                        {isSobrepasado ? "-" : ""}{formatCLP(Math.abs(disponibleClp))}
                        {isSobrepasado && " (Sobrepasado)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isSobrepasado ? "-" : ""}{formatUF(Math.abs(disponibleUf))}
                      </p>
                    </>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No Autorizado</p>
                <p className="text-xl font-bold text-yellow-600">{formatCLP(convertUFToPesos(unauthorizedTotal))}</p>
                <p className="text-xs text-muted-foreground">{formatUF(unauthorizedTotal)}</p>
                <p className="text-xs text-muted-foreground">Se arrastra al próx. año</p>
              </div>
            </div>

            {unauthorizedCount > 0 && !isClosed && !forceReadOnly && (
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-700">Ítems pendientes de autorización</AlertTitle>
                <AlertDescription className="text-yellow-600">
                  {unauthorizedCount} ítem(s) no autorizado(s) por {formatCLP(convertUFToPesos(unauthorizedTotal))}. 
                  Al cerrar el año, estos se arrastrarán automáticamente al año siguiente.
                </AlertDescription>
              </Alert>
            )}

            {currentBudget && (
              <div className="flex justify-end gap-2">
                {!isClosed && !forceReadOnly && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExpandAll}
                      className="gap-1"
                      title="Expandir todas las líneas"
                    >
                      <ChevronsUpDown className="h-4 w-4" />
                      Expandir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCollapseAll}
                      className="gap-1"
                      title="Colapsar todas las líneas"
                    >
                      <ChevronsDownUp className="h-4 w-4" />
                      Colapsar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={async () => {
                        const currentTemplateIdLoaded = await getCurrentTemplateId(currentBudget.id);
                        setUpdateTemplateId(currentTemplateIdLoaded || "");
                        setShowUpdateTemplateDialog(true);
                      }}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Actualizar Plantilla
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Descargar Excel
                </Button>
                {!isClosed && !forceReadOnly && (
                  selectionMode ? (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowMoveDialog(true)}
                        disabled={selectedLineIds.size === 0}
                        className="gap-2"
                      >
                        <Move className="h-4 w-4" />
                        Mover ({selectedLineIds.size})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExitSelectionMode}
                        className="gap-2"
                      >
                        <X className="h-4 w-4" />
                        Cancelar selección
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectionMode(true)}
                      className="gap-2"
                      title="Seleccionar líneas para mover a otra línea madre"
                    >
                      <Move className="h-4 w-4" />
                      Seleccionar líneas
                    </Button>
                  )
                )}
                {superficieEdificada > 0 && (
                  <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-medium">Total:</span>
                    <span>{formatCLP(convertUFToPesos(calculateGrandTotal(lines, templatePricesMap, ufValue)) / superficieEdificada)} /m²</span>
                    <span>·</span>
                    <span>{formatUF(calculateGrandTotal(lines, templatePricesMap, ufValue) / superficieEdificada)} /m²</span>
                  </div>
                )}
              </div>
            )}

            <BudgetLineTree
              lines={lines}
              onAddLine={handleAddLine}
              onUpdateLine={handleUpdateLine}
              onDeleteLine={handleDeleteLine}
              onCreateOC={handleCreateOCFromLine}
              onCreateOCRequest={handleCreateOCRequestFromLine}
              onCreateInvoice={handleCreateInvoiceFromLine}
              onViewLineDetails={handleViewLineDetails}
              readOnly={isClosed || forceReadOnly}
              compactView={forceReadOnly}
              globalExpandState={globalExpandState}
              templatePricesMap={templatePricesMap}
              collapsedIds={collapsedIds}
              onToggleExpand={handleToggleExpand}
              superficieEdificada={superficieEdificada}
              selectionMode={selectionMode}
              selectedIds={selectedLineIds}
              onToggleSelect={handleToggleSelectLine}
              onReload={() => currentBudget && loadLines(currentBudget.id)}
            />

            <MoveLinesDialog
              open={showMoveDialog}
              onOpenChange={setShowMoveDialog}
              lines={lines}
              selectedIds={Array.from(selectedLineIds)}
              onConfirm={handleConfirmMove}
            />

            {/* Trash Panel - shows deleted lines and audit history */}
            {currentBudget && !forceReadOnly && (
              <div className="mt-4">
                <BudgetTrashPanel 
                  budgetId={currentBudget.id} 
                  onRestore={() => loadLines(currentBudget.id)} 
                />
              </div>
            )}
          </>
        ) : budgetType === "opex" ? (
          <OpexConsumptionPieChart contractId={contractId} year={selectedYear} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay presupuesto de {title.toLowerCase()} para el año {selectedYear}</p>
            <p className="text-sm mt-2">Use "+ Nuevo Año CAPEX" para crear un presupuesto.</p>
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

      {/* Dialog: Create OC from Budget Line */}
      <Dialog open={showOCDialog} onOpenChange={setShowOCDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Orden de Compra</DialogTitle>
            <DialogDescription>
              Nueva OC para: <strong>{ocLineName}</strong>
            </DialogDescription>
          </DialogHeader>
          
          {/* Available amount info */}
          <div className="p-3 rounded-md bg-muted/50 border">
            {loadingLineAvailable ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculando disponible...
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Presupuesto de línea:</span>
                  <div className="text-right">
                    <span className="font-medium">{formatCLP(convertUFToPesos(ocLineBudget))}</span>
                    <span className="text-xs text-muted-foreground ml-1">({formatUF(ocLineBudget)})</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disponible para OC:</span>
                  <div className="text-right">
                    <span className={`font-semibold ${ocLineAvailable <= 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                      {formatCLP(convertUFToPesos(ocLineAvailable))}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">({formatUF(ocLineAvailable)})</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oc_number">Número de OC *</Label>
              <Input
                id="oc_number"
                value={ocForm.order_number}
                onChange={(e) => setOcForm({ ...ocForm, order_number: e.target.value })}
                placeholder="Ej: OC-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc_supplier">Proveedor</Label>
              <Input
                id="oc_supplier"
                value={ocForm.supplier_name}
                onChange={(e) => setOcForm({ ...ocForm, supplier_name: e.target.value })}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oc_description">Titulo</Label>
              <Input
                id="oc_description"
                value={ocForm.description}
                onChange={(e) => setOcForm({ ...ocForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="oc_amount">Monto *</Label>
                <Input
                  id="oc_amount"
                  type="number"
                  value={ocForm.amount}
                  onChange={(e) => setOcForm({ ...ocForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oc_currency">Moneda</Label>
                <Select value={ocForm.currency} onValueChange={(val) => setOcForm({ ...ocForm, currency: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOCDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateOC} 
              disabled={creatingOC || !ocForm.order_number || !ocForm.amount || ocLineAvailable <= 0 || loadingLineAvailable}
            >
              {creatingOC && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear OC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create Invoice from Budget Line */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Factura</DialogTitle>
            <DialogDescription>
              Nueva factura para: <strong>{invoiceLineName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* OC Selection */}
            <div className="space-y-2">
              <Label htmlFor="inv_oc">Orden de Compra *</Label>
              {loadingLineOCs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando OC...
                </div>
              ) : lineOCs.length === 0 ? (
                <div className="p-3 border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 rounded-md">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    No hay órdenes de compra asociadas a esta línea. 
                    Primero debe crear una OC para poder registrar facturas.
                  </p>
                </div>
              ) : (
                <Select 
                  value={invoiceForm.purchase_order_id} 
                  onValueChange={(val) => setInvoiceForm({ ...invoiceForm, purchase_order_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione una OC" />
                  </SelectTrigger>
                  <SelectContent>
                    {lineOCs.map((oc) => (
                      <SelectItem key={oc.id} value={oc.id}>
                        {oc.order_number} - {oc.supplier_name || "Sin proveedor"} ({formatCLP(oc.amount_clp || Math.round(convertUFToPesos(oc.amount_uf)))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv_number">Número de Factura *</Label>
              <Input
                id="inv_number"
                value={invoiceForm.invoice_number}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                placeholder="Ej: F-001"
                disabled={lineOCs.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv_date">Fecha</Label>
              <Input
                id="inv_date"
                type="date"
                value={invoiceForm.invoice_date}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                disabled={lineOCs.length === 0}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv_amount">Monto *</Label>
                <Input
                  id="inv_amount"
                  type="number"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                  placeholder="0.00"
                  disabled={lineOCs.length === 0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv_currency">Moneda</Label>
                <Select 
                  value={invoiceForm.currency} 
                  onValueChange={(val) => setInvoiceForm({ ...invoiceForm, currency: val })}
                  disabled={lineOCs.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateInvoice} 
              disabled={creatingInvoice || !invoiceForm.invoice_number || !invoiceForm.amount || !invoiceForm.purchase_order_id || lineOCs.length === 0}
            >
              {creatingInvoice && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar Factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Line Details - OCs, Invoices, Credit Notes */}
      <Dialog open={showLineDetailsDialog} onOpenChange={setShowLineDetailsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Línea: {lineDetailsName}</DialogTitle>
            <DialogDescription>
              Órdenes de compra, facturas y notas de crédito asociadas
            </DialogDescription>
          </DialogHeader>
          
          {loadingLineDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Cargando...</span>
            </div>
          ) : lineDetailsOCs.length === 0 && lineDetailsRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay órdenes de compra ni solicitudes asociadas a esta línea.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* OC Requests Section */}
              {lineDetailsRequests.length > 0 && (
                <div className="border rounded-lg p-4 space-y-2 bg-purple-50/50 dark:bg-purple-950/20">
                  <h4 className="font-medium text-sm text-purple-700 dark:text-purple-300">
                    Solicitudes de OC ({lineDetailsRequests.length})
                  </h4>
                  {lineDetailsRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{req.request_number}</span>
                        <Badge variant={req.status === "converted" ? "default" : "secondary"}
                          className={req.status === "converted" ? "bg-green-500" : "bg-yellow-500"}>
                          {req.status === "converted" ? "Convertida" : "Pendiente"}
                        </Badge>
                      </div>
                      <span className="font-mono">{formatCLP(req.amount_clp || Math.round(convertUFToPesos(req.amount_uf)))}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* OCs Section */}
              {lineDetailsOCs.map((oc) => {
                const totalInvoicedClp = oc.invoices.reduce((sum, inv) => sum + (inv.amount_clp || Math.round(convertUFToPesos(inv.amount_uf))), 0);
                const totalCreditNotesClp = oc.credit_notes.reduce((sum, cn) => sum + (cn.amount_clp || Math.round(convertUFToPesos(cn.amount_uf))), 0);
                const netInvoicedClp = totalInvoicedClp - totalCreditNotesClp;
                
                return (
                  <div key={oc.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{oc.order_number}</span>
                        <span className="text-sm text-muted-foreground">
                          {oc.supplier_name || "Sin proveedor"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatCLP(oc.amount_clp || Math.round(convertUFToPesos(oc.amount_uf)))}</span>
                        <Badge 
                          variant={
                            oc.status === "cerrada" ? "default" : 
                            oc.status === "descuadrada" ? "destructive" : 
                            "secondary"
                          }
                          className={oc.status === "cerrada" ? "bg-blue-500" : oc.status === "abierta" ? "bg-green-500" : ""}
                        >
                          {oc.status === "cerrada" ? "Cerrada" : oc.status === "descuadrada" ? "Sobrepasado" : "OK"}
                        </Badge>
                      </div>
                    </div>

                    {/* Invoices */}
                    {oc.invoices.length > 0 && (
                      <div className="pl-4 border-l-2 border-green-200">
                        <p className="text-xs font-medium text-green-700 mb-1">Facturas</p>
                        <div className="space-y-1">
                          {oc.invoices.map((inv) => {
                            const invCreditNotes = oc.credit_notes.filter(cn => cn.invoice_id === inv.id);
                            return (
                              <div key={inv.id} className="text-sm flex items-center justify-between py-1">
                                <span>{inv.invoice_number}</span>
                                <div className="flex items-center gap-4">
                                  <span className="text-muted-foreground text-xs">
                                    {new Date(inv.invoice_date).toLocaleDateString("es-CL")}
                                  </span>
                                  <span className="font-mono">{formatCLP(inv.amount_clp || Math.round(convertUFToPesos(inv.amount_uf)))}</span>
                                  {invCreditNotes.length > 0 && (
                                    <span className="text-xs text-red-600">
                                      - {formatCLP(invCreditNotes.reduce((s, c) => s + (c.amount_clp || Math.round(convertUFToPesos(c.amount_uf))), 0))} NC
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Credit Notes Summary */}
                    {oc.credit_notes.length > 0 && (
                      <div className="pl-4 border-l-2 border-red-200">
                        <p className="text-xs font-medium text-red-700 mb-1">Notas de Crédito</p>
                        <div className="space-y-1">
                          {oc.credit_notes.map((cn) => (
                            <div key={cn.id} className="text-sm flex items-center justify-between py-1">
                              <span>{cn.credit_note_number}</span>
                              <span className="font-mono text-red-600">-{formatCLP(cn.amount_clp || Math.round(convertUFToPesos(cn.amount_uf)))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="flex justify-end gap-6 pt-2 border-t text-sm">
                      <div className="text-muted-foreground">
                        Facturado: <span className="font-medium text-foreground">{formatCLP(totalInvoicedClp)}</span>
                      </div>
                      {totalCreditNotesClp > 0 && (
                        <div className="text-muted-foreground">
                          NC: <span className="font-medium text-red-600">-{formatCLP(totalCreditNotesClp)}</span>
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        Neto: <span className="font-medium text-foreground">{formatCLP(netInvoicedClp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quotations Section */}
          <div className="border-t pt-4">
            <QuotationsManager
              budgetLineId={lineDetailsId}
              contractId={contractId}
              lineName={lineDetailsName}
              projectName={contractName}
              ufValue={ufValue}
              formatUF={formatUF}
              onRefresh={onRefresh}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLineDetailsDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OC Request Dialog */}
      <OCRequestDialog
        open={showOCRequestDialog}
        onOpenChange={setShowOCRequestDialog}
        contractId={contractId}
        contractName={contractName}
        contractCebe={contractCebe}
        budgetId={currentBudget?.id || ""}
        budgetLineId={ocRequestLineId}
        lineName={ocRequestLineName}
        lineAvailable={ocRequestLineAvailable}
        lineBudget={ocRequestLineBudget}
        year={selectedYear}
        ufValue={ufValue}
        formatUF={formatUF}
        onSuccess={onRefresh}
      />
    </Card>
  );
};