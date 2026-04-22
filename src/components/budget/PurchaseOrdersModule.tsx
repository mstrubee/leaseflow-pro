import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, FileText, ChevronDown, ChevronRight, AlertTriangle, Paperclip, ExternalLink, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Pencil, ArrowLeft, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";
import { InvoiceList } from "./InvoiceList";
import { RepositoryFilePicker } from "./RepositoryFilePicker";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { cn } from "@/lib/utils";
import { backupOCFileToRepository } from "@/lib/repositoryBackup";
import { useSecureFileAccess } from "@/hooks/useSecureFileAccess";

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_name: string | null;
  order_date: string;
  amount_uf: number;
  amount_clp?: number | null;
  input_currency?: string;
  uf_value_at_entry?: number | null;
  description: string | null;
  attachment_url: string | null;
  year: number;
  status: string;
  budget_id: string | null;
  budget_line_id: string | null;
  budget_classification?: string | null;
  opex_category_id: string | null;
  opex_master_id?: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  // Multi-contract allocation info
  is_multi_contract?: boolean;
  allocated_amount_uf?: number;
  total_order_amount_uf?: number;
}

interface PurchaseOrdersModuleProps {
  contractId: string;
  initialYear?: number;
  refreshKey?: number;
  onRefresh?: () => void;
}

interface Budget {
  id: string;
  year: number;
  budget_type: string;
}

interface BudgetLine {
  id: string;
  name: string;
  amount_uf: number;
  budget_id: string;
  status: string;
  parent_id: string | null;
  display_order: number | null;
}

interface OpexCategory {
  id: string;
  name: string;
  display_order: number;
  supplier_category_id: string | null;
}

interface Supplier {
  id: string;
  name: string;
  category_id: string | null;
  is_generic: boolean;
  opex_category_ids?: string[];
}

interface OpexBudgetData {
  category_id: string;
  amount_uf: number;
}

export const PurchaseOrdersModule = ({ contractId, initialYear, refreshKey, onRefresh }: PurchaseOrdersModuleProps) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [opexCategories, setOpexCategories] = useState<OpexCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [opexMasterBudget, setOpexMasterBudget] = useState<OpexBudgetData[]>([]);
  const [orderInvoiceData, setOrderInvoiceData] = useState<Record<string, { totalInvoiced: number; totalCreditNotes: number; totalInvoicedCLP: number; totalCreditNotesCLP: number }>>({});
  const selectedYear = initialYear ?? new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateSupplierDialog, setShowCreateSupplierDialog] = useState(false);
  const [pendingOrderData, setPendingOrderData] = useState<typeof newOrder | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [deleteOrder, setDeleteOrder] = useState<PurchaseOrder | null>(null);
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);
  
  // Sorting and filtering state
  const [sortColumn, setSortColumn] = useState<string>("order_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [newOrder, setNewOrder] = useState({
    order_number: "",
    supplier_name: "",
    supplier_id: "",
    order_date: getTodayDate(),
    amount: "",
    currency: "CLP" as "UF" | "CLP",
    budget_type: "capex" as "capex" | "opex",
    budget_line_ids: [] as string[], // Changed to array for multiple selection
    opex_category_id: "",
    attachment_url: "",
    attachment_name: "",
  });
  
  // File upload states
  const [ocFile, setOcFile] = useState<File | null>(null);
  const [editOcFile, setEditOcFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  
  const [editFormData, setEditFormData] = useState({
    order_number: "",
    supplier_name: "",
    order_date: "",
    amount: "",
    currency: "CLP" as "UF" | "CLP",
    budget_type: "capex" as "capex" | "opex",
    budget_line_ids: [] as string[], // Changed to array for multiple selection
    opex_category_id: "",
    attachment_url: "",
    attachment_name: "",
  });
  
  const { toast } = useToast();
  const { openFile } = useSecureFileAccess();
  const { formatUF, formatCLP, convertUFToPesos, convertPesosToUF, ufValue } = useBudgetContext();

  useEffect(() => {
    loadOrders();
    loadBudgets();
    loadBudgetLines();
    loadOpexCategories();
    loadSuppliers();
    loadOpexMasterBudget();
  }, [contractId, selectedYear, refreshKey]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      // Get direct orders for this contract (these are the "official" records for this contract)
      const { data: directData, error: directError } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", selectedYear)
        .is("deleted_at", null)
        .order("order_date", { ascending: false });

      if (directError) throw directError;

      // For multi-contract orders, we need to get the allocated amount from allocations table
      // instead of using the direct PO amount_uf
      const directOrders = directData || [];
      const directIds = directOrders.map(o => o.id);
      const directOrderNumbers = new Set(directOrders.map(o => o.order_number));

      // Get allocations for these direct orders to get proper allocated amounts
      let allocationsMap: Record<string, { amount_uf: number; amount_clp: number | null }> = {};
      if (directIds.length > 0) {
        const { data: allocForDirect } = await supabase
          .from("purchase_order_contract_allocations")
          .select("purchase_order_id, amount_uf, amount_clp")
          .in("purchase_order_id", directIds)
          .eq("contract_id", contractId);
        
        for (const alloc of (allocForDirect || [])) {
          allocationsMap[alloc.purchase_order_id] = {
            amount_uf: alloc.amount_uf,
            amount_clp: alloc.amount_clp ?? null,
          };
        }
      }

      // Build final list from direct orders, using allocation amounts for multi-contract
      const allOrders: PurchaseOrder[] = directOrders.map(order => {
        const allocation = allocationsMap[order.id];
        if (order.is_multi_contract && allocation) {
          return {
            ...order,
            allocated_amount_uf: allocation.amount_uf,
            total_order_amount_uf: order.amount_uf,
            amount_uf: allocation.amount_uf, // Display allocated amount
            amount_clp: allocation.amount_clp ?? order.amount_clp,
          };
        }
        return order;
      });

      // Also check for legacy allocations (orders from other contracts with allocations to this one)
      // This handles cases where an order's contract_id is different but has an allocation here
      const { data: legacyAllocations, error: legacyError } = await supabase
        .from("purchase_order_contract_allocations")
        .select(`
          purchase_order_id,
          amount_uf,
          amount_clp,
          purchase_orders!inner(
            id, order_number, supplier_name, order_date, amount_uf,
            description, attachment_url, year, status, budget_id,
            budget_line_id, opex_category_id, deleted_at, deleted_by, is_multi_contract
          )
        `)
        .eq("contract_id", contractId);

      if (!legacyError && legacyAllocations) {
        const addedIds = new Set(allOrders.map(o => o.id));
        
        for (const alloc of legacyAllocations) {
          const order = alloc.purchase_orders as any;
          // Only add if: not already in our list, correct year, not deleted, 
          // AND doesn't have same order_number as existing (prevents duplicates from edits)
          if (order && 
              !addedIds.has(order.id) && 
              !directOrderNumbers.has(order.order_number) &&
              order.year === selectedYear && 
              !order.deleted_at) {
            allOrders.push({
              ...order,
              is_multi_contract: true,
              allocated_amount_uf: alloc.amount_uf,
              total_order_amount_uf: order.amount_uf,
              amount_uf: alloc.amount_uf,
              amount_clp: alloc.amount_clp ?? order.amount_clp,
            });
            addedIds.add(order.id);
          }
        }
      }

      // Sort by order_date descending
      allOrders.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());

      setOrders(allOrders);

      // Load invoice and credit note data for each order
      if (allOrders.length > 0) {
        const orderIds = allOrders.map(o => o.id);
        
        const { data: invoicesData } = await supabase
          .from("invoices")
          .select("purchase_order_id, amount_uf, amount_clp")
          .in("purchase_order_id", orderIds)
          .is("deleted_at", null);

        const { data: creditNotesData } = await supabase
          .from("credit_notes")
          .select("purchase_order_id, amount_uf, amount_clp")
          .in("purchase_order_id", orderIds)
          .is("deleted_at", null);

        const invoiceDataMap: Record<string, { totalInvoiced: number; totalCreditNotes: number; totalInvoicedCLP: number; totalCreditNotesCLP: number }> = {};
        
        orderIds.forEach(orderId => {
          const orderInvoices = (invoicesData || []).filter(inv => inv.purchase_order_id === orderId);
          const orderCreditNotes = (creditNotesData || []).filter(cn => cn.purchase_order_id === orderId);
          
          invoiceDataMap[orderId] = {
            totalInvoiced: orderInvoices.reduce((sum, inv) => sum + inv.amount_uf, 0),
            totalCreditNotes: orderCreditNotes.reduce((sum, cn) => sum + cn.amount_uf, 0),
            totalInvoicedCLP: orderInvoices.reduce((sum, inv) => sum + (inv.amount_clp ?? Math.round(convertUFToPesos(inv.amount_uf))), 0),
            totalCreditNotesCLP: orderCreditNotes.reduce((sum, cn) => sum + (cn.amount_clp ?? Math.round(convertUFToPesos(cn.amount_uf))), 0),
          };
        });
        
        setOrderInvoiceData(invoiceDataMap);
      }
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadBudgets = async () => {
    try {
      const { data, error } = await supabase
        .from("contract_budgets")
        .select("id, year, budget_type")
        .eq("contract_id", contractId)
        .eq("year", selectedYear);

      if (error) throw error;
      setBudgets(data || []);
    } catch (error) {
      console.error("Error loading budgets:", error);
    }
  };

  const loadBudgetLines = async () => {
    try {
      // Get all CAPEX budgets for this contract and year
      const { data: budgetData, error: budgetError } = await supabase
        .from("contract_budgets")
        .select("id")
        .eq("contract_id", contractId)
        .eq("year", selectedYear)
        .eq("budget_type", "capex");

      if (budgetError) throw budgetError;

      if (budgetData && budgetData.length > 0) {
        const budgetIds = budgetData.map(b => b.id);
        
        // Load ALL budget lines (parents + children) so the hierarchical picker
        // can render parents above their children even when the parent itself
        // has amount_uf = 0 (totals are usually rolled up from leaves).
        const { data: linesData, error: linesError } = await supabase
          .from("budget_lines")
          .select("id, name, amount_uf, budget_id, status, parent_id, display_order")
          .in("budget_id", budgetIds)
          .is("deleted_at", null);

        if (linesError) throw linesError;

        setBudgetLines(linesData || []);
      } else {
        setBudgetLines([]);
      }
    } catch (error) {
      console.error("Error loading budget lines:", error);
    }
  };

  const loadOpexCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("opex_categories")
        .select("id, name, display_order, supplier_category_id")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setOpexCategories(data || []);
    } catch (error) {
      console.error("Error loading OPEX categories:", error);
    }
  };

  const loadSuppliers = async () => {
    try {
      // Load suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("id, name, category_id, is_generic")
        .order("name", { ascending: true });

      if (suppliersError) throw suppliersError;

      // Load supplier-opex category relationships
      const { data: opexRelations, error: relationsError } = await supabase
        .from("supplier_opex_categories")
        .select("supplier_id, opex_category_id");

      if (relationsError) throw relationsError;

      // Merge opex_category_ids into suppliers
      const suppliersWithOpex = (suppliersData || []).map(supplier => ({
        ...supplier,
        opex_category_ids: (opexRelations || [])
          .filter(rel => rel.supplier_id === supplier.id)
          .map(rel => rel.opex_category_id)
      }));

      setSuppliers(suppliersWithOpex);
    } catch (error) {
      console.error("Error loading suppliers:", error);
    }
  };

  const loadOpexMasterBudget = async () => {
    try {
      const { data, error } = await supabase
        .from("opex_master_budget")
        .select("category_id, amount_uf")
        .eq("year", selectedYear);

      if (error) throw error;
      setOpexMasterBudget(data || []);
    } catch (error) {
      console.error("Error loading OPEX master budget:", error);
    }
  };

  // Get suppliers for a specific OPEX category - uses many-to-many relationship
  const getSuppliersForOpexCategory = (opexCategoryId: string) => {
    const category = opexCategories.find(c => c.id === opexCategoryId);
    if (!category) return [];
    
    // Get suppliers that:
    // 1. Have this opex_category_id in their opex_category_ids array
    // 2. Are generic (available for all)
    // 3. Have matching supplier_category_id (legacy support)
    return suppliers.filter(s => 
      s.is_generic ||
      (s.opex_category_ids && s.opex_category_ids.includes(opexCategoryId)) ||
      (category.supplier_category_id && s.category_id === category.supplier_category_id)
    );
  };

  // Calculate consumed OPEX budget for a category
  const getOpexConsumedForCategory = (opexCategoryId: string) => {
    return orders
      .filter(order => order.opex_category_id === opexCategoryId)
      .reduce((sum, order) => sum + order.amount_uf, 0);
  };

  // Get available OPEX budget for a category (always positive or 0)
  // Note: opex_master_budget stores amounts as negative (expenses), so we use absolute value
  const getAvailableOpexForCategory = (opexCategoryId: string) => {
    const budgetEntry = opexMasterBudget.find(b => b.category_id === opexCategoryId);
    if (!budgetEntry) return 0;
    const budgetAmount = Math.abs(budgetEntry.amount_uf); // Convert negative to positive
    const consumed = getOpexConsumedForCategory(opexCategoryId);
    const available = budgetAmount - consumed;
    return Math.max(0, available); // Always return positive or 0
  };

  // Validate OPEX amount against category budget
  // Note: opex_master_budget stores amounts as negative (expenses), so we use absolute value
  const validateOpexAmount = (opexCategoryId: string, amount: number, excludeOrderId?: string) => {
    const budgetEntry = opexMasterBudget.find(b => b.category_id === opexCategoryId);
    if (!budgetEntry) {
      // No budget defined for this category - allow (no limit)
      return { valid: true, message: "", available: Infinity };
    }
    
    const budgetAmount = Math.abs(budgetEntry.amount_uf); // Convert negative to positive
    
    // Calculate consumed excluding the current order being edited
    const consumed = orders
      .filter(order => order.opex_category_id === opexCategoryId && order.id !== excludeOrderId)
      .reduce((sum, order) => sum + order.amount_uf, 0);
    
    const available = budgetAmount - consumed;
    const displayAvailable = Math.max(0, available);
    
    if (amount > available) {
      return { 
        valid: false, 
        message: `Excede OPEX Disponible. Disponible: ${formatCLP(convertUFToPesos(displayAvailable))}`,
        available: displayAvailable
      };
    }
    
    return { valid: true, message: "", available: displayAvailable };
  };

  // Check if category is "Otros"
  const isOtrosCategory = (opexCategoryId: string) => {
    const category = opexCategories.find(c => c.id === opexCategoryId);
    return category?.name.toLowerCase() === "otros";
  };

  // Handle create supplier dialog
  const handleOpenCreateSupplier = () => {
    setPendingOrderData({ ...newOrder });
    setShowNewDialog(false);
    setShowCreateSupplierDialog(true);
  };

  const handleSupplierCreated = async () => {
    await loadSuppliers();
    setShowCreateSupplierDialog(false);
    if (pendingOrderData) {
      setNewOrder(pendingOrderData);
      setShowNewDialog(true);
    }
    setPendingOrderData(null);
  };

  const handleCancelCreateSupplier = () => {
    setShowCreateSupplierDialog(false);
    if (pendingOrderData) {
      setNewOrder(pendingOrderData);
      setShowNewDialog(true);
    }
    setPendingOrderData(null);
  };

  // Get authorized budget lines for selected budget type
  const getAuthorizedLinesForBudgetType = (budgetType: string) => {
    const budget = budgets.find(b => b.budget_type === budgetType);
    if (!budget) return [];
    return budgetLines.filter(line => line.budget_id === budget.id);
  };

  // Order lines hierarchically: parents first, children indented underneath.
  // Returns flat list with depth metadata so the picker can render an indented tree
  // while still allowing selection of any node (madre or hija).
  const getHierarchicalLinesForBudgetType = (budgetType: string): Array<{ id: string; name: string; amount_uf: number; budget_id: string; status: string; parent_id: string | null; depth: number; hasChildren: boolean }> => {
    const lines = getAuthorizedLinesForBudgetType(budgetType);
    const byId = new Map(lines.map(l => [l.id, l]));
    const childrenOf = new Map<string | null, typeof lines>();
    lines.forEach(l => {
      // Treat parents not present in the visible set as roots
      const key = l.parent_id && byId.has(l.parent_id) ? l.parent_id : null;
      const arr = childrenOf.get(key) ?? [];
      arr.push(l);
      childrenOf.set(key, arr);
    });
    const result: Array<{ id: string; name: string; amount_uf: number; budget_id: string; status: string; parent_id: string | null; depth: number; hasChildren: boolean }> = [];
    const walk = (parentKey: string | null, depth: number) => {
      const items = (childrenOf.get(parentKey) ?? []).slice().sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      items.forEach(item => {
        const hasChildren = (childrenOf.get(item.id) ?? []).length > 0;
        result.push({ ...item, depth, hasChildren });
        walk(item.id, depth + 1);
      });
    };
    walk(null, 0);
    return result;
  };

  // Returns all descendant ids for a given budget line within the same budget type.
  // Used to cascade checkbox selection: picking a parent line auto-selects its children.
  const getDescendantIds = (lineId: string, budgetType: string): string[] => {
    const lines = getAuthorizedLinesForBudgetType(budgetType);
    const childrenOf = new Map<string, string[]>();
    lines.forEach(l => {
      if (l.parent_id) {
        const arr = childrenOf.get(l.parent_id) ?? [];
        arr.push(l.id);
        childrenOf.set(l.parent_id, arr);
      }
    });
    const out: string[] = [];
    const visit = (id: string) => {
      (childrenOf.get(id) ?? []).forEach(childId => {
        out.push(childId);
        visit(childId);
      });
    };
    visit(lineId);
    return out;
  };

  // Calculate total OCs for a budget line
  const getTotalOCsForBudgetLine = (budgetLineId: string) => {
    return orders
      .filter(order => order.budget_line_id === budgetLineId)
      .reduce((sum, order) => sum + order.amount_uf, 0);
  };

  // Get available budget for a line
  const getAvailableBudgetForLine = (budgetLineId: string) => {
    const line = budgetLines.find(l => l.id === budgetLineId);
    if (!line) return 0;
    const usedBudget = getTotalOCsForBudgetLine(budgetLineId);
    return line.amount_uf - usedBudget;
  };

  // Validate OC amount against budget line
  const validateOCAmount = (budgetLineId: string, amount: number, excludeOrderId?: string) => {
    const line = budgetLines.find(l => l.id === budgetLineId);
    if (!line) return { valid: false, message: "Línea de presupuesto no encontrada" };
    
    let usedBudget = orders
      .filter(order => order.budget_line_id === budgetLineId && order.id !== excludeOrderId)
      .reduce((sum, order) => sum + order.amount_uf, 0);
    
    const remainingBudget = line.amount_uf - usedBudget;
    
    if (amount > remainingBudget) {
      return { 
        valid: false, 
        message: `OC supera el Presupuesto. Disponible: ${formatCLP(convertUFToPesos(remainingBudget))}. Solicitar Autorización a Gerencia`,
        exceedsBy: amount - remainingBudget
      };
    }
    
    return { valid: true, message: "" };
  };

  const handleCreateOrder = async () => {
    try {
      const inputAmount = parseFloat(newOrder.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (newOrder.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = ufValue > 0 ? convertUFToPesos(inputAmount) : 0;
      } else {
        amountCLP = inputAmount;
        amountUF = ufValue > 0 ? convertPesosToUF(inputAmount) : 0;
      }

      // Validate against budget lines (CAPEX) - check each selected line
      if (newOrder.budget_type === "capex" && newOrder.budget_line_ids.length > 0) {
        // For now, validate total amount against sum of available in selected lines
        const totalAvailable = newOrder.budget_line_ids.reduce((sum, lineId) => {
          return sum + getAvailableBudgetForLine(lineId);
        }, 0);
        
        if (amountUF > totalAvailable) {
          setBudgetWarning(`OC supera el Presupuesto disponible. Disponible total: ${formatCLP(convertUFToPesos(totalAvailable))}`);
          return;
        }
      }

      // Validate against OPEX category budget
      if (newOrder.budget_type === "opex" && newOrder.opex_category_id) {
        const validation = validateOpexAmount(newOrder.opex_category_id, amountUF);
        if (!validation.valid) {
          setBudgetWarning(validation.message);
          return;
        }
      }

      // Find budget for selected type and year
      const budget = budgets.find(b => b.budget_type === newOrder.budget_type);
      const selectedLines = budgetLines.filter(l => newOrder.budget_line_ids.includes(l.id));
      const selectedOpexCategory = opexCategories.find(c => c.id === newOrder.opex_category_id);
      
      // Description: use line names for CAPEX, category name for OPEX
      const description = newOrder.budget_type === "capex" 
        ? selectedLines.map(l => l.name).join(", ") || null 
        : selectedOpexCategory?.name || null;

      // For backwards compatibility, use first line id for budget_line_id column
      const primaryBudgetLineId = newOrder.budget_line_ids.length > 0 ? newOrder.budget_line_ids[0] : null;

      const { data: createdOrder, error } = await supabase.from("purchase_orders").insert({
        contract_id: contractId,
        order_number: newOrder.order_number,
        supplier_name: newOrder.supplier_name || null,
        order_date: newOrder.order_date,
        amount_uf: amountUF,
        amount_clp: amountCLP,
        input_currency: newOrder.currency,
        uf_value_at_entry: ufValue,
        description: description,
        year: selectedYear,
        budget_id: budget?.id || null,
        budget_line_id: newOrder.budget_type === "capex" ? primaryBudgetLineId : null,
        opex_category_id: newOrder.budget_type === "opex" ? (newOrder.opex_category_id || null) : null,
        attachment_url: null,
        budget_classification: newOrder.budget_type === "capex" ? "CAPEX" : "OPEX",
      }).select().single();

      if (error) throw error;

      // Save multiple budget line associations
      if (createdOrder && newOrder.budget_type === "capex" && newOrder.budget_line_ids.length > 0) {
        const amountPerLine = amountUF / newOrder.budget_line_ids.length;
        const lineInserts = newOrder.budget_line_ids.map(lineId => ({
          purchase_order_id: createdOrder.id,
          budget_line_id: lineId,
          amount_uf: amountPerLine,
        }));
        
        await supabase.from("purchase_order_budget_lines").insert(lineInserts);
      }

      // Upload OC file to Drive if selected
      if (ocFile && createdOrder) {
        setUploadingFile(true);
        try {
          const result = await backupOCFileToRepository(contractId, ocFile, newOrder.order_number);
          if (result.success) {
            // Get the Drive URL from repository_files
            const { data: fileRecord } = await supabase
              .from("repository_files")
              .select("url")
              .eq("id", result.fileId)
              .single();

            if (fileRecord?.url) {
              await supabase
                .from("purchase_orders")
                .update({ attachment_url: fileRecord.url })
                .eq("id", createdOrder.id);
            }
            toast({ title: "Archivo subido", description: "El archivo OC se guardó en Drive" });
          } else {
            toast({ 
              variant: "default", 
              title: "OC creada", 
              description: `Advertencia: ${result.error || "El archivo no pudo subirse. Puede adjuntarlo después."}` 
            });
          }
        } catch (fileError: any) {
          console.error("Error uploading OC file:", fileError);
          toast({ 
            variant: "default", 
            title: "OC creada", 
            description: "Advertencia: El archivo no pudo subirse. Puede adjuntarlo después." 
          });
        } finally {
          setUploadingFile(false);
        }
      }

      toast({ title: "OC creada", description: `Orden de compra ${newOrder.order_number} creada` });
      setShowNewDialog(false);
      setNewOrder({ 
        order_number: "", 
        supplier_name: "", 
        supplier_id: "",
        order_date: getTodayDate(), 
        amount: "", 
        currency: "CLP", 
        budget_type: "capex",
        budget_line_ids: [],
        opex_category_id: "",
        attachment_url: "",
        attachment_name: "",
      });
      setOcFile(null);
      setBudgetWarning(null);
      loadOrders();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const getBudgetTypeLabel = (type: string) => {
    return type === "capex" ? "Capex" : "Opex";
  };

  const getBudgetTypeForOrder = (order: PurchaseOrder) => {
    const isOpex = order.opex_master_id || order.opex_category_id || order.budget_classification === "OPEX";
    if (isOpex) return "Opex";
    if (order.budget_classification === "CAPEX" || order.budget_line_id) return "Capex";
    const budget = budgets.find(b => b.id === order.budget_id);
    if (budget) return getBudgetTypeLabel(budget.budget_type);
    return "Capex";
  };

  const toggleExpanded = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const getStatusBadge = (order: PurchaseOrder) => {
    // Calculate real status based on invoices and credit notes
    const data = orderInvoiceData[order.id];
    if (!data) {
      // Fallback to database status if no data loaded yet
      const status = order.status;
      switch (status) {
        case "cerrada":
          return <Badge className="bg-blue-500">Cerrada</Badge>;
        case "descuadrada":
          return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sobrepasado</Badge>;
        default:
          return <Badge className="bg-green-500">OK</Badge>;
      }
    }

    // Net invoiced for THIS specific purchase_order row (its own invoices)
    const netInvoicedCLP = data.totalInvoicedCLP - data.totalCreditNotesCLP;
    const orderAmountCLP = order.amount_clp ?? (
      order.uf_value_at_entry && order.uf_value_at_entry > 0
        ? order.amount_uf * order.uf_value_at_entry
        : convertUFToPesos(order.amount_uf)
    );

    if (netInvoicedCLP > orderAmountCLP + 1) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Sobrepasado</Badge>;
    } else if (Math.abs(netInvoicedCLP - orderAmountCLP) <= 1) {
      return <Badge className="bg-blue-500">Cerrada</Badge>;
    } else {
      const percentage = orderAmountCLP > 0 ? (netInvoicedCLP / orderAmountCLP) * 100 : 0;
      return <Badge className="bg-green-500">OK ({percentage.toFixed(0)}%)</Badge>;
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, order: PurchaseOrder) => {
    e.stopPropagation();
    setDeleteOrder(order);
    setDeleteStep(1);
  };

  const handleEditClick = async (e: React.MouseEvent, order: PurchaseOrder) => {
    e.stopPropagation();
    setEditOrder(order);
    const budget = budgets.find(b => b.id === order.budget_id);
    
    // Fetch the full order data to get amount_clp and attachment_url
    const { data: fullOrder } = await supabase
      .from("purchase_orders")
      .select("amount_clp, input_currency, attachment_url")
      .eq("id", order.id)
      .single();
    
    // Default to CLP display - use stored CLP amount if available
    const displayAmount = fullOrder?.amount_clp || Math.round(order.amount_uf * ufValue);
    const attachmentUrl = fullOrder?.attachment_url || order.attachment_url || "";
    
    // Load existing budget line associations
    const { data: existingLineAssocs } = await supabase
      .from("purchase_order_budget_lines")
      .select("budget_line_id")
      .eq("purchase_order_id", order.id);
    
    const lineIds = existingLineAssocs?.map(a => a.budget_line_id) || [];
    // Fallback to single budget_line_id if no associations exist
    const budgetLineIds = lineIds.length > 0 ? lineIds : (order.budget_line_id ? [order.budget_line_id] : []);
    
    setEditFormData({
      order_number: order.order_number,
      supplier_name: order.supplier_name || "",
      order_date: order.order_date,
      amount: displayAmount.toString(),
      currency: "CLP",
      budget_type: (budget?.budget_type || "capex") as "capex" | "opex",
      budget_line_ids: budgetLineIds,
      opex_category_id: order.opex_category_id || "",
      attachment_url: attachmentUrl,
      attachment_name: attachmentUrl ? "Archivo adjunto" : "",
    });
    setEditOcFile(null); // Reset any previously selected file
    setShowEditDialog(true);
  };

  const handleUpdateOrder = async () => {
    if (!editOrder) return;
    
    try {
      const inputAmount = parseFloat(editFormData.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (editFormData.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = ufValue > 0 ? convertUFToPesos(inputAmount) : 0;
      } else {
        amountCLP = inputAmount;
        amountUF = ufValue > 0 ? convertPesosToUF(inputAmount) : 0;
      }

      // Validate against budget lines (CAPEX) - check total available
      if (editFormData.budget_type === "capex" && editFormData.budget_line_ids.length > 0) {
        const totalAvailable = editFormData.budget_line_ids.reduce((sum, lineId) => {
          // Calculate available excluding current order
          const line = budgetLines.find(l => l.id === lineId);
          if (!line) return sum;
          const usedByOthers = orders
            .filter(o => o.budget_line_id === lineId && o.id !== editOrder.id)
            .reduce((s, o) => s + o.amount_uf, 0);
          return sum + (line.amount_uf - usedByOthers);
        }, 0);
        
        if (amountUF > totalAvailable) {
          setBudgetWarning(`OC supera el Presupuesto disponible. Disponible total: ${formatUF(totalAvailable)}`);
          return;
        }
      }

      // Find budget for selected type and year
      const budget = budgets.find(b => b.budget_type === editFormData.budget_type);
      const selectedLines = budgetLines.filter(l => editFormData.budget_line_ids.includes(l.id));

      // Update description based on budget type
      const selectedOpexCategory = opexCategories.find(c => c.id === editFormData.opex_category_id);
      const description = editFormData.budget_type === "capex" 
        ? selectedLines.map(l => l.name).join(", ") || null 
        : selectedOpexCategory?.name || null;

      let newAttachmentUrl = editFormData.attachment_url || null;

      // Upload new OC file to Drive if selected
      if (editOcFile) {
        setUploadingFile(true);
        try {
          const result = await backupOCFileToRepository(contractId, editOcFile, editFormData.order_number);
          if (result.success) {
            const { data: fileRecord } = await supabase
              .from("repository_files")
              .select("url")
              .eq("id", result.fileId)
              .single();

            if (fileRecord?.url) {
              newAttachmentUrl = fileRecord.url;
            }
            toast({ title: "Archivo subido", description: "El archivo OC se guardó en Drive" });
          } else {
            toast({ 
              variant: "default", 
              title: "Advertencia", 
              description: result.error || "El archivo no pudo subirse." 
            });
          }
        } catch (fileError: any) {
          console.error("Error uploading OC file:", fileError);
          toast({ variant: "default", title: "Advertencia", description: "El archivo no pudo subirse." });
        } finally {
          setUploadingFile(false);
        }
      }

      // For backwards compatibility, use first line id for budget_line_id column
      const primaryBudgetLineId = editFormData.budget_line_ids.length > 0 ? editFormData.budget_line_ids[0] : null;

      const { error } = await supabase
        .from("purchase_orders")
        .update({
          order_number: editFormData.order_number,
          supplier_name: editFormData.supplier_name || null,
          order_date: editFormData.order_date,
          amount_uf: amountUF,
          amount_clp: amountCLP,
          input_currency: editFormData.currency,
          uf_value_at_entry: ufValue,
          description: description,
          budget_id: budget?.id || null,
          budget_line_id: editFormData.budget_type === "capex" ? primaryBudgetLineId : null,
          opex_category_id: editFormData.budget_type === "opex" ? (editFormData.opex_category_id || null) : null,
          attachment_url: newAttachmentUrl,
          budget_classification: editFormData.budget_type === "capex" ? "CAPEX" : "OPEX",
        })
        .eq("id", editOrder.id);

      if (error) throw error;
      
      // Update budget line associations
      if (editFormData.budget_type === "capex") {
        // Delete existing associations
        await supabase
          .from("purchase_order_budget_lines")
          .delete()
          .eq("purchase_order_id", editOrder.id);
        
        // Insert new associations
        if (editFormData.budget_line_ids.length > 0) {
          const amountPerLine = amountUF / editFormData.budget_line_ids.length;
          const lineInserts = editFormData.budget_line_ids.map(lineId => ({
            purchase_order_id: editOrder.id,
            budget_line_id: lineId,
            amount_uf: amountPerLine,
          }));
          
          await supabase.from("purchase_order_budget_lines").insert(lineInserts);
        }
      }

      toast({ title: "OC actualizada", description: `Orden de compra ${editFormData.order_number} actualizada` });
      setShowEditDialog(false);
      setEditOrder(null);
      setEditOcFile(null);
      setBudgetWarning(null);
      loadOrders();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }

    if (!deleteOrder) return;

    try {
      const now = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      // Soft delete all credit notes for this order
      const { error: creditNoteError } = await supabase
        .from("credit_notes")
        .update({ deleted_at: now, deleted_by: userId })
        .eq("purchase_order_id", deleteOrder.id)
        .is("deleted_at", null);
      
      if (creditNoteError) {
        console.error("Error soft deleting credit notes:", creditNoteError);
        throw creditNoteError;
      }

      // Soft delete all invoices for this order
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({ deleted_at: now, deleted_by: userId })
        .eq("purchase_order_id", deleteOrder.id)
        .is("deleted_at", null);
      
      if (invoiceError) {
        console.error("Error soft deleting invoices:", invoiceError);
        throw invoiceError;
      }
      
      // Soft delete the order
      const { error } = await supabase
        .from("purchase_orders")
        .update({ deleted_at: now, deleted_by: userId })
        .eq("id", deleteOrder.id);
      
      if (error) {
        console.error("Error soft deleting purchase order:", error);
        throw error;
      }

      toast({ title: "OC enviada a eliminados", description: `Orden de compra ${deleteOrder.order_number} movida a eliminados` });
      setDeleteOrder(null);
      setDeleteStep(1);
      await loadOrders();
      onRefresh?.();
    } catch (error: any) {
      console.error("Soft delete error:", error);
      toast({ variant: "destructive", title: "Error al eliminar", description: error.message });
    }
  };

  const totalOC = orders.reduce((sum, o) => sum + o.amount_uf, 0);
  const totalOCClp = orders.reduce(
    (sum, o) => sum + (o.amount_clp ?? Math.round(o.amount_uf * ufValue)),
    0
  );

  // Handler for multi-contract OC warning
  const handleMultiContractWarning = (order: PurchaseOrder) => {
    toast({ 
      title: "OC Multilocal",
      description: "Esta OC es multilocal. Solo se puede gestionar desde la Central de OC.",
    });
    // Navigate to central OC management with search for this order
    window.location.href = `/purchase-orders?search=${encodeURIComponent(order.order_number)}`;
  };

  // Sorting handler
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Get sort icon
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Apply filters and sorting
  const filteredAndSortedOrders = React.useMemo(() => {
    let result = [...orders];

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      const lowerValue = value.toLowerCase();
      result = result.filter(order => {
        switch (key) {
          case "order_number":
            return order.order_number.toLowerCase().includes(lowerValue);
          case "order_date":
            return new Date(order.order_date).toLocaleDateString("es-CL").includes(lowerValue);
          case "supplier_name":
            return (order.supplier_name || "").toLowerCase().includes(lowerValue);
          case "type":
            return getBudgetTypeForOrder(order).toLowerCase().includes(lowerValue);
          case "description":
            return (order.description || "").toLowerCase().includes(lowerValue);
          case "amount":
            return order.amount_uf.toString().includes(lowerValue);
          case "status":
            return order.status.toLowerCase().includes(lowerValue);
          default:
            return true;
        }
      });
    });

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortColumn) {
        case "order_number":
          aVal = a.order_number;
          bVal = b.order_number;
          break;
        case "order_date":
          aVal = new Date(a.order_date).getTime();
          bVal = new Date(b.order_date).getTime();
          break;
        case "supplier_name":
          aVal = a.supplier_name || "";
          bVal = b.supplier_name || "";
          break;
        case "type":
          aVal = getBudgetTypeForOrder(a);
          bVal = getBudgetTypeForOrder(b);
          break;
        case "description":
          aVal = a.description || "";
          bVal = b.description || "";
          break;
        case "amount":
          aVal = a.amount_uf;
          bVal = b.amount_uf;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }
      
      if (typeof aVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [orders, filters, sortColumn, sortDirection, budgets]);

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  // Column header with sort only
  const ColumnHeader = ({ column, label, className }: { column: string; label: string; className?: string }) => (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 -ml-2 font-medium hover:bg-accent"
        onClick={() => handleSort(column)}
      >
        {label}
        {getSortIcon(column)}
      </Button>
    </TableHead>
  );

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
          <FileText className="h-5 w-5" />
          Órdenes de Compra y Facturas - {selectedYear}
        </CardTitle>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva OC
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total OC {selectedYear}</span>
          <div className="text-right">
            <p className="font-bold">{formatCLP(totalOCClp)}</p>
            <p className="text-xs text-muted-foreground">{formatUF(totalOC)}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-4 p-3 bg-muted/20 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={clearAllFilters}>
                <X className="h-3 w-3 mr-1" />
                Limpiar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nº OC</label>
              <Input
                placeholder="Buscar..."
                className="h-8 text-sm"
                value={filters.order_number || ""}
                onChange={(e) => setFilters({ ...filters, order_number: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input
                placeholder="Buscar..."
                className="h-8 text-sm"
                value={filters.order_date || ""}
                onChange={(e) => setFilters({ ...filters, order_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Proveedor</label>
              <Input
                placeholder="Buscar..."
                className="h-8 text-sm"
                value={filters.supplier_name || ""}
                onChange={(e) => setFilters({ ...filters, supplier_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select
                value={filters.type || "all"}
                onValueChange={(v) => setFilters({ ...filters, type: v === "all" ? "" : v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="capex">Capex</SelectItem>
                  <SelectItem value="opex">Opex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Descripción</label>
              <Input
                placeholder="Buscar..."
                className="h-8 text-sm"
                value={filters.description || ""}
                onChange={(e) => setFilters({ ...filters, description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Monto</label>
              <Input
                placeholder="Buscar..."
                className="h-8 text-sm"
                value={filters.amount || ""}
                onChange={(e) => setFilters({ ...filters, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Estado</label>
              <Select
                value={filters.status || "all"}
                onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="abierta">OK</SelectItem>
                  <SelectItem value="cerrada">Cerrada</SelectItem>
                  <SelectItem value="descuadrada">Sobrepasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay órdenes de compra para {selectedYear}</p>
        ) : filteredAndSortedOrders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay resultados para los filtros aplicados</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <ColumnHeader column="order_number" label="Nº OC" />
                <ColumnHeader column="order_date" label="Fecha" />
                <ColumnHeader column="supplier_name" label="Proveedor" />
                <ColumnHeader column="type" label="Tipo" />
                <ColumnHeader column="description" label="Descripción" />
                <ColumnHeader column="amount" label="Monto" className="text-right" />
                <ColumnHeader column="status" label="Estado" />
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedOrders.map((order) => (
                <React.Fragment key={order.id}>
                  <TableRow 
                    className={cn("cursor-pointer hover:bg-accent/50", expandedOrders.has(order.id) && "bg-accent/30")}
                    onClick={() => toggleExpanded(order.id)}
                  >
                    <TableCell>
                      {expandedOrders.has(order.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {order.order_number}
                        {order.attachment_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openFile(order.attachment_url);
                            }}
                          >
                            <Paperclip className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(order.order_date).toLocaleDateString("es-CL")}</TableCell>
                    <TableCell>{order.supplier_name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {getBudgetTypeForOrder(order)}
                          </Badge>
                          {order.is_multi_contract && (
                            <Badge variant="secondary" className="text-[9px] px-1">
                              Multi
                            </Badge>
                          )}
                        </div>
                        {getBudgetTypeForOrder(order) === "Capex" && !order.budget_line_id && (
                          <span className="text-[10px] text-destructive font-medium">sin línea</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-32 truncate" title={order.description || ""}>
                      {order.description || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex flex-col items-end">
                        <span>{formatCLP(order.amount_clp || Math.round(order.amount_uf * ufValue))}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatUF(order.amount_uf)}
                        </span>
                        {order.is_multi_contract && order.total_order_amount_uf && (
                          <span className="text-[10px] text-muted-foreground">
                            (Total: {formatCLP(Math.round(order.total_order_amount_uf * ufValue))})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(order)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={(e) => order.is_multi_contract ? handleMultiContractWarning(order) : handleEditClick(e, order)}
                          title={order.is_multi_contract ? "OC Multilocal - gestionar desde Central de OC" : "Editar OC"}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => order.is_multi_contract ? handleMultiContractWarning(order) : handleDeleteClick(e, order)}
                          title={order.is_multi_contract ? "OC Multilocal - gestionar desde Central de OC" : "Eliminar OC"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedOrders.has(order.id) && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/20 p-4">
                        <InvoiceList purchaseOrder={order} onUpdate={() => { loadOrders(); onRefresh?.(); }} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showNewDialog} onOpenChange={(open) => { setShowNewDialog(open); if (!open) setBudgetWarning(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Nueva Orden de Compra</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº OC</Label>
                <Input value={newOrder.order_number} onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input 
                  type="date" 
                  value={newOrder.order_date} 
                  min={`${selectedYear}-01-01`}
                  max={`${selectedYear}-12-31`}
                  onChange={(e) => setNewOrder({ ...newOrder, order_date: e.target.value })} 
                />
                <p className="text-xs text-muted-foreground">Solo fechas del año {selectedYear}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Presupuesto</Label>
              <Select 
                value={newOrder.budget_type} 
                onValueChange={(v) => setNewOrder({ ...newOrder, budget_type: v as "capex" | "opex", budget_line_ids: [], opex_category_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capex">CAPEX</SelectItem>
                  <SelectItem value="opex">OPEX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newOrder.budget_type === "capex" ? (
              <div className="space-y-2">
                <Label>Líneas de Presupuesto CAPEX * (selección múltiple)</Label>
                <div className="border rounded-md p-2 max-h-72 overflow-y-auto space-y-1">
                  {getHierarchicalLinesForBudgetType("capex").length === 0 ? (
                    <p className="text-xs text-amber-600 p-2">No hay líneas autorizadas para CAPEX</p>
                  ) : (
                    getHierarchicalLinesForBudgetType("capex").map((line) => {
                      const available = getAvailableBudgetForLine(line.id);
                      const isSelected = newOrder.budget_line_ids.includes(line.id);
                      return (
                        <label
                          key={line.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent",
                            isSelected && "bg-accent",
                            line.hasChildren && "font-medium"
                          )}
                          style={{ paddingLeft: `${line.depth * 18 + 8}px` }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newIds = e.target.checked
                                ? [...newOrder.budget_line_ids, line.id]
                                : newOrder.budget_line_ids.filter(id => id !== line.id);
                              setNewOrder({ ...newOrder, budget_line_ids: newIds });
                            }}
                            className="h-4 w-4"
                          />
                          <span className="flex-1 truncate">
                            {line.hasChildren && <span className="text-muted-foreground mr-1">▸</span>}
                            {line.name}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            (Disp: {formatCLP(convertUFToPesos(available))})
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {newOrder.budget_line_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {newOrder.budget_line_ids.length} línea(s) seleccionada(s) - Disponible total: {formatCLP(
                      convertUFToPesos(newOrder.budget_line_ids.reduce((sum, id) => sum + getAvailableBudgetForLine(id), 0))
                    )}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Categoría OPEX *</Label>
                  <Select 
                    value={newOrder.opex_category_id} 
                    onValueChange={(v) => setNewOrder({ ...newOrder, opex_category_id: v, supplier_id: "", supplier_name: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione una categoría OPEX" />
                    </SelectTrigger>
                    <SelectContent>
                      {opexCategories.map((category) => {
                        const available = getAvailableOpexForCategory(category.id);
                        const budgetEntry = opexMasterBudget.find(b => b.category_id === category.id);
                        return (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>{category.name}</span>
                              {budgetEntry && (
                                <span className="text-xs text-muted-foreground">
                                  (Disponible: {formatCLP(convertUFToPesos(available))})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {opexCategories.length === 0 && (
                    <p className="text-xs text-amber-600">No hay categorías OPEX configuradas</p>
                  )}
                  {newOrder.opex_category_id && (
                    <p className="text-xs text-muted-foreground">
                      Presupuesto disponible: {formatCLP(convertUFToPesos(getAvailableOpexForCategory(newOrder.opex_category_id)))}
                    </p>
                  )}
                </div>
                
                {/* Supplier selection for OPEX */}
                {newOrder.opex_category_id && (
                  <div className="space-y-2">
                    <Label>Proveedor *</Label>
                    <Select 
                      value={newOrder.supplier_id} 
                      onValueChange={(v) => {
                        if (v === "__create_new__") {
                          handleOpenCreateSupplier();
                          return;
                        }
                        const supplier = suppliers.find(s => s.id === v);
                        setNewOrder({ ...newOrder, supplier_id: v, supplier_name: supplier?.name || "" });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {getSuppliersForOpexCategory(newOrder.opex_category_id).length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted">
                              Sugeridos para esta categoría
                            </div>
                            {getSuppliersForOpexCategory(newOrder.opex_category_id).map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                                {supplier.is_generic && <span className="text-xs text-muted-foreground ml-2">(Genérico)</span>}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted">
                          Todos los proveedores
                        </div>
                        {suppliers
                          .filter(s => !getSuppliersForOpexCategory(newOrder.opex_category_id).some(suggested => suggested.id === s.id))
                          .map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        <SelectItem value="__create_new__" className="text-primary">
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Crear Nuevo Proveedor
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Supplier for CAPEX - show all suppliers */}
            {newOrder.budget_type === "capex" && (
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select 
                  value={newOrder.supplier_id} 
                  onValueChange={(v) => {
                    if (v === "__create_new__") {
                      handleOpenCreateSupplier();
                      return;
                    }
                    const supplier = suppliers.find(s => s.id === v);
                    setNewOrder({ ...newOrder, supplier_id: v, supplier_name: supplier?.name || "" });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.is_generic && <span className="text-xs text-muted-foreground ml-2">(Genérico)</span>}
                      </SelectItem>
                    ))}
                    <SelectItem value="__create_new__" className="text-primary">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Crear Nuevo Proveedor
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step={newOrder.currency === "UF" ? "0.01" : "1"} 
                  value={newOrder.amount} 
                  onChange={(e) => setNewOrder({ ...newOrder, amount: e.target.value })} 
                  className="flex-1"
                />
                <Select value={newOrder.currency} onValueChange={(v) => setNewOrder({ ...newOrder, currency: v as "UF" | "CLP" })}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newOrder.amount && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivalente: {newOrder.currency === "CLP" 
                    ? formatUF(convertPesosToUF(parseFloat(newOrder.amount))) 
                    : formatCLP(convertUFToPesos(parseFloat(newOrder.amount)))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Archivo OC (PDF)</Label>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    // Validate file type
                    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
                      toast({ variant: "destructive", title: "Error", description: "Solo se permiten archivos PDF" });
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      return;
                    }
                    
                    // Validate file size (20MB max)
                    if (file.size > 20 * 1024 * 1024) {
                      toast({ variant: "destructive", title: "Error", description: "El archivo no puede superar 20MB" });
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      return;
                    }
                    
                    setOcFile(file);
                    setNewOrder({ ...newOrder, attachment_name: file.name });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
                {ocFile ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <FileText className="h-4 w-4 text-red-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ocFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(ocFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOcFile(null);
                        setNewOrder({ ...newOrder, attachment_name: "" });
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 w-full justify-center border-dashed"
                  >
                    <Upload className="h-4 w-4" />
                    Click para subir archivo OC (PDF)
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  El archivo se guardará en Google Drive (carpeta OC del contrato)
                </p>
              </div>
            </div>

            {budgetWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">{budgetWarning}</p>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowNewDialog(false); setBudgetWarning(null); }}>Cancelar</Button>
            <Button 
              onClick={handleCreateOrder}
              disabled={
                !newOrder.order_number || 
                (newOrder.budget_type === "capex" && newOrder.budget_line_ids.length === 0) ||
                (newOrder.budget_type === "opex" && !newOrder.opex_category_id)
              }
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Edit Order Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setBudgetWarning(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Editar Orden de Compra</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº OC</Label>
                <Input value={editFormData.order_number} onChange={(e) => setEditFormData({ ...editFormData, order_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input 
                  type="date" 
                  value={editFormData.order_date} 
                  min={`${selectedYear}-01-01`}
                  max={`${selectedYear}-12-31`}
                  onChange={(e) => setEditFormData({ ...editFormData, order_date: e.target.value })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Presupuesto</Label>
              <Select 
                value={editFormData.budget_type} 
                onValueChange={(v) => setEditFormData({ ...editFormData, budget_type: v as "capex" | "opex", budget_line_ids: [] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capex">CAPEX</SelectItem>
                  <SelectItem value="opex">OPEX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editFormData.budget_type === "capex" ? (
              <div className="space-y-2">
                <Label>Líneas de Presupuesto CAPEX * (selección múltiple)</Label>
                <div className="border rounded-md p-2 max-h-72 overflow-y-auto space-y-1">
                  {getHierarchicalLinesForBudgetType("capex").length === 0 ? (
                    <p className="text-xs text-amber-600 p-2">No hay líneas autorizadas para CAPEX</p>
                  ) : (
                    getHierarchicalLinesForBudgetType("capex").map((line) => {
                      const usedByOthers = orders
                        .filter(o => o.budget_line_id === line.id && o.id !== editOrder?.id)
                        .reduce((sum, o) => sum + o.amount_uf, 0);
                      const available = line.amount_uf - usedByOthers;
                      const isSelected = editFormData.budget_line_ids.includes(line.id);
                      return (
                        <label
                          key={line.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent",
                            isSelected && "bg-accent",
                            line.hasChildren && "font-medium"
                          )}
                          style={{ paddingLeft: `${line.depth * 18 + 8}px` }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newIds = e.target.checked
                                ? [...editFormData.budget_line_ids, line.id]
                                : editFormData.budget_line_ids.filter(id => id !== line.id);
                              setEditFormData({ ...editFormData, budget_line_ids: newIds });
                            }}
                            className="h-4 w-4"
                          />
                          <span className="flex-1 truncate">
                            {line.hasChildren && <span className="text-muted-foreground mr-1">▸</span>}
                            {line.name}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            (Disp: {formatCLP(convertUFToPesos(available))})
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {editFormData.budget_line_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {editFormData.budget_line_ids.length} línea(s) seleccionada(s)
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Categoría OPEX *</Label>
                  <Select 
                    value={editFormData.opex_category_id} 
                    onValueChange={(v) => setEditFormData({ ...editFormData, opex_category_id: v, supplier_name: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione una categoría OPEX" />
                    </SelectTrigger>
                    <SelectContent>
                      {opexCategories.map((category) => {
                        const available = getAvailableOpexForCategory(category.id);
                        const budgetEntry = opexMasterBudget.find(b => b.category_id === category.id);
                        return (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>{category.name}</span>
                              {budgetEntry && (
                                <span className="text-xs text-muted-foreground">
                                  (Disponible: {formatCLP(convertUFToPesos(available))})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {editFormData.opex_category_id && (
                    <p className="text-xs text-muted-foreground">
                      Presupuesto disponible: {formatCLP(convertUFToPesos(getAvailableOpexForCategory(editFormData.opex_category_id)))}
                    </p>
                  )}
                </div>

                {/* Supplier selection for OPEX edit */}
                {editFormData.opex_category_id && (
                  <div className="space-y-2">
                    <Label>Proveedor *</Label>
                    <Select 
                      value={suppliers.find(s => s.name === editFormData.supplier_name)?.id || ""}
                      onValueChange={(v) => {
                        const supplier = suppliers.find(s => s.id === v);
                        setEditFormData({ ...editFormData, supplier_name: supplier?.name || "" });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {getSuppliersForOpexCategory(editFormData.opex_category_id).length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted">
                              Sugeridos para esta categoría
                            </div>
                            {getSuppliersForOpexCategory(editFormData.opex_category_id).map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                                {supplier.is_generic && <span className="text-xs text-muted-foreground ml-2">(Genérico)</span>}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground bg-muted">
                          Todos los proveedores
                        </div>
                        {suppliers
                          .filter(s => !getSuppliersForOpexCategory(editFormData.opex_category_id).some(suggested => suggested.id === s.id))
                          .map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Supplier for CAPEX edit - show all suppliers */}
            {editFormData.budget_type === "capex" && (
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input value={editFormData.supplier_name} onChange={(e) => setEditFormData({ ...editFormData, supplier_name: e.target.value })} />
            </div>
            )}
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step={editFormData.currency === "UF" ? "0.01" : "1"} 
                  value={editFormData.amount} 
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })} 
                  className="flex-1"
                />
                <Select value={editFormData.currency} onValueChange={(v) => setEditFormData({ ...editFormData, currency: v as "UF" | "CLP" })}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editFormData.amount && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivalente: {editFormData.currency === "CLP" 
                    ? formatUF(convertPesosToUF(parseFloat(editFormData.amount))) 
                    : formatCLP(convertUFToPesos(parseFloat(editFormData.amount)))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Archivo OC (PDF)</Label>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  ref={editFileInputRef}
                  className="hidden"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
                      toast({ variant: "destructive", title: "Error", description: "Solo se permiten archivos PDF" });
                      if (editFileInputRef.current) editFileInputRef.current.value = '';
                      return;
                    }
                    
                    if (file.size > 20 * 1024 * 1024) {
                      toast({ variant: "destructive", title: "Error", description: "El archivo no puede superar 20MB" });
                      if (editFileInputRef.current) editFileInputRef.current.value = '';
                      return;
                    }
                    
                    setEditOcFile(file);
                    setEditFormData({ ...editFormData, attachment_name: file.name });
                    if (editFileInputRef.current) editFileInputRef.current.value = '';
                  }}
                />
                
                {/* Show existing file if no new file selected */}
                {editFormData.attachment_url && !editOcFile && (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <FileText className="h-4 w-4 text-red-500" />
                    <span className="text-sm flex-1 truncate">{editFormData.attachment_name || "Archivo adjunto"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void openFile(editFormData.attachment_url)}
                      className="h-7 w-7 p-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* Show new file to upload */}
                {editOcFile && (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{editOcFile.name}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Nuevo archivo (se subirá al guardar)</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditOcFile(null);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => editFileInputRef.current?.click()}
                  className="flex items-center gap-2 w-full justify-center border-dashed"
                >
                  <Upload className="h-4 w-4" />
                  {editFormData.attachment_url || editOcFile ? "Reemplazar archivo" : "Subir archivo PDF"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  El archivo se guardará en Google Drive (carpeta OC del contrato)
                </p>
              </div>
            </div>

            {budgetWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">{budgetWarning}</p>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditOcFile(null); setBudgetWarning(null); }}>Cancelar</Button>
            <Button 
              onClick={handleUpdateOrder}
              disabled={
                !editFormData.order_number || 
                uploadingFile ||
                (editFormData.budget_type === "capex" && editFormData.budget_line_ids.length === 0) ||
                (editFormData.budget_type === "opex" && !editFormData.opex_category_id)
              }
            >
              {uploadingFile ? "Subiendo archivo..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation - Step 1 */}
      <AlertDialog open={deleteOrder !== null && deleteStep === 1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Orden de Compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Está a punto de eliminar la OC <strong>{deleteOrder?.order_number}</strong> del proveedor{" "}
              <strong>{deleteOrder?.supplier_name || "Sin nombre"}</strong> por un monto de{" "}
              <strong>{formatCLP(deleteOrder?.amount_clp || Math.round(convertUFToPesos(deleteOrder?.amount_uf || 0)))}</strong>.
              <br /><br />
              Esta acción también eliminará todas las facturas y notas de crédito asociadas a esta orden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteOrder(null); setDeleteStep(1); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation - Step 2 */}
      <AlertDialog open={deleteOrder !== null && deleteStep === 2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Confirmar Eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>¿Está completamente seguro?</strong>
              <br /><br />
              Esta acción NO se puede deshacer. Se eliminarán permanentemente:
              <ul className="list-disc ml-4 mt-2">
                <li>La orden de compra {deleteOrder?.order_number}</li>
                <li>Todas las facturas asociadas</li>
                <li>Todas las notas de crédito asociadas</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteOrder(null); setDeleteStep(1); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Supplier Dialog */}
      <Dialog open={showCreateSupplierDialog} onOpenChange={setShowCreateSupplierDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCancelCreateSupplier}
                className="p-0 h-auto"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver
              </Button>
              Crear Nuevo Proveedor
            </DialogTitle>
            <DialogDescription>
              Complete los datos del proveedor. Una vez creado, podrá seleccionarlo en la orden de compra.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <SupplierForm
              onSave={handleSupplierCreated}
              onCancel={handleCancelCreateSupplier}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
