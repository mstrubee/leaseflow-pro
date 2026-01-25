import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  X,
  FileText,
  Receipt,
  Trash2,
  ExternalLink,
  ShoppingCart,
  DollarSign,
  FileCheck,
  AlertCircle,
  ClipboardList,
  Download,
  CheckCircle2,
  Plus,
  Edit,
  Layers,
  Pencil,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { CentralizedOrderCreator } from "@/components/budget/CentralizedOrderCreator";
import { OCRequestViewDialog } from "@/components/budget/OCRequestViewDialog";
import { ConvertOCRequestDialog } from "@/components/budget/ConvertOCRequestDialog";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  amount_uf: number;
  reception_status: string;
}

interface ContractAllocation {
  contract_id: string;
  contract_name: string;
  amount_uf: number;
  amount_clp: number;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  description: string | null;
  amount_uf: number;
  status: string;
  budget_classification: string | null;
  created_at: string;
  order_date: string;
  contract_id: string;
  budget_line_id: string | null;
  opex_category_id: string | null;
  supplier_name: string | null;
  contract_name?: string;
  budget_line_name?: string;
  opex_category_name?: string;
  invoices: Invoice[];
  invoices_count?: number;
  invoices_total?: number;
  year?: number;
  is_multi_contract?: boolean;
  allocations?: ContractAllocation[];
}

interface OCRequest {
  id: string;
  request_number: string;
  request_date: string;
  line_name: string;
  project_name: string;
  description: string | null;
  amount_uf: number;
  amount_clp?: number;
  status: string;
  supplier_id: string | null;
  supplier_name: string | null;
  contract_id: string;
  budget_id?: string | null;
  opex_master_id?: string | null;
  year: number;
  converted_oc_id: string | null;
  is_multi_contract?: boolean;
  allocations?: ContractAllocation[];
  quotation_url?: string | null;
  quotation_file_name?: string | null;
}

interface Contract {
  id: string;
  name: string;
}

interface OpexCategory {
  id: string;
  name: string;
}

interface ChartData {
  name: string;
  value: number;
  id: string;
  color: string;
}

// Grouped order for display - combines multiple orders with the same order_number
interface GroupedOrder {
  order_number: string;
  description: string | null;
  supplier_name: string | null;
  order_date: string;
  budget_classification: string | null;
  opex_category_name: string | null;
  budget_line_name: string | null;
  total_amount_uf: number;
  total_invoices_count: number;
  total_invoices_amount: number;
  status: string;
  year: number;
  is_multi_contract: boolean;
  orders: PurchaseOrder[]; // Individual orders that make up this group
  contracts: { contract_id: string; contract_name: string; amount_uf: number; order_id: string }[];
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
];

const PurchaseOrdersDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { ufValue } = useEconomicIndicators();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  
  // Centralized creator dialogs
  const [showRequestCreator, setShowRequestCreator] = useState(false);
  const [showOrderCreator, setShowOrderCreator] = useState(false);
  const [ocRequests, setOcRequests] = useState<OCRequest[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [opexCategories, setOpexCategories] = useState<OpexCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("oc");

  // Edit dialog for OC requests
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  
  // Convert dialog for OC requests
  const [convertingRequest, setConvertingRequest] = useState<OCRequest | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showEditRequestDialog, setShowEditRequestDialog] = useState(false);

  // Expanded rows for multi-contract items
  const [expandedMultiRequests, setExpandedMultiRequests] = useState<Set<string>>(new Set());
  const [expandedMultiOrders, setExpandedMultiOrders] = useState<Set<string>>(new Set());
  
  // Separate expansion states for invoices and contract breakdown
  const [expandedInvoiceSections, setExpandedInvoiceSections] = useState<Set<string>>(new Set());
  const [expandedContractSections, setExpandedContractSections] = useState<Set<string>>(new Set());

  // Invoice dialog states
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<PurchaseOrder | null>(null);
  const [selectedGroupedOrder, setSelectedGroupedOrder] = useState<GroupedOrder | null>(null);
  const [newInvoiceData, setNewInvoiceData] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    amount: "",
    currency: "UF" as "UF" | "CLP",
  });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<"create" | "edit">("create");
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Credit note dialog states
  const [showCreditNoteDialog, setShowCreditNoteDialog] = useState(false);
  const [selectedInvoiceForCreditNote, setSelectedInvoiceForCreditNote] = useState<Invoice | null>(null);
  const [newCreditNoteData, setNewCreditNoteData] = useState({
    credit_note_number: "",
    credit_note_date: new Date().toISOString().split("T")[0],
    amount: "",
    currency: "UF" as "UF" | "CLP",
    reason: "",
  });
  const [creatingCreditNote, setCreatingCreditNote] = useState(false);

  // Edit OC dialog states
  const [showEditOCDialog, setShowEditOCDialog] = useState(false);
  const [editingOCData, setEditingOCData] = useState({
    order_number: "",
    description: "",
    supplier_name: "",
    order_date: "",
    opex_category_id: "" as string | null,
  });
  const [editingOCId, setEditingOCId] = useState<string | null>(null);
  const [updatingOC, setUpdatingOC] = useState(false);

  // Credit notes storage
  const [creditNotes, setCreditNotes] = useState<Map<string, { id: string; credit_note_number: string; amount_uf: number; invoice_id: string; }[]>>(new Map());

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [contractFilter, setContractFilter] = useState("todos");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [classificationFilter, setClassificationFilter] = useState("todos");
  const [amountFilter, setAmountFilter] = useState("todos");
  const [requestStatusFilter, setRequestStatusFilter] = useState("todos");

  // Chart-based filters
  const [chartContractFilter, setChartContractFilter] = useState<string | null>(null);
  const [chartCategoryFilter, setChartCategoryFilter] = useState<string | null>(null);

  // Collapse state per contract
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Selection for deletion
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConfirmDeleteDialog, setShowConfirmDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Available years
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    orders.forEach(o => {
      if (o.year) years.add(o.year);
    });
    ocRequests.forEach(r => {
      if (r.year) years.add(r.year);
    });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    years.add(currentYear - 1);
    years.add(currentYear + 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [orders, ocRequests]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load contracts
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      setContracts(contractsData || []);

      // Load OPEX categories
      const { data: categoriesData } = await supabase
        .from("opex_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");
      setOpexCategories(categoriesData || []);

      // Load purchase orders with related data and invoices
      const { data: ordersData } = await supabase
        .from("purchase_orders")
        .select(`
          id,
          order_number,
          description,
          amount_uf,
          status,
          budget_classification,
          created_at,
          order_date,
          year,
          contract_id,
          budget_line_id,
          opex_category_id,
          supplier_name,
          is_multi_contract,
          contracts!inner(name),
          budget_lines(name),
          opex_categories(name),
          invoices(id, invoice_number, invoice_date, amount_uf, reception_status, deleted_at)
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      // Load multi-contract allocations for purchase orders
      const { data: orderAllocationsData } = await supabase
        .from("purchase_order_contract_allocations")
        .select("purchase_order_id, contract_id, amount_uf, amount_clp, contracts(name)");

      const orderAllocationsMap = new Map<string, ContractAllocation[]>();
      (orderAllocationsData || []).forEach((alloc: any) => {
        const existing = orderAllocationsMap.get(alloc.purchase_order_id) || [];
        existing.push({
          contract_id: alloc.contract_id,
          contract_name: alloc.contracts?.name || "Sin nombre",
          amount_uf: alloc.amount_uf || 0,
          amount_clp: alloc.amount_clp || 0,
        });
        orderAllocationsMap.set(alloc.purchase_order_id, existing);
      });

      const processedOrders = (ordersData || []).map((order: any) => {
        const validInvoices = (order.invoices || []).filter((inv: any) => !inv.deleted_at);
        return {
          ...order,
          contract_name: order.contracts?.name || "Sin contrato",
          budget_line_name: order.budget_lines?.name || null,
          opex_category_name: order.opex_categories?.name || null,
          invoices: validInvoices,
          invoices_count: validInvoices.length,
          invoices_total: validInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_uf || 0), 0),
          allocations: orderAllocationsMap.get(order.id) || [],
        };
      });

      setOrders(processedOrders);

      // Load credit notes for all invoices
      const { data: creditNotesData } = await supabase
        .from("credit_notes")
        .select("id, credit_note_number, amount_uf, invoice_id, purchase_order_id")
        .is("deleted_at", null);

      const creditNotesMap = new Map<string, { id: string; credit_note_number: string; amount_uf: number; invoice_id: string; }[]>();
      (creditNotesData || []).forEach((cn: any) => {
        const existing = creditNotesMap.get(cn.purchase_order_id) || [];
        existing.push({
          id: cn.id,
          credit_note_number: cn.credit_note_number,
          amount_uf: cn.amount_uf,
          invoice_id: cn.invoice_id,
        });
        creditNotesMap.set(cn.purchase_order_id, existing);
      });
      setCreditNotes(creditNotesMap);

      // Load OC requests
      const { data: requestsData } = await supabase
        .from("oc_requests")
        .select("*")
        .order("created_at", { ascending: false });

      // Load multi-contract allocations for requests
      const { data: requestAllocationsData } = await supabase
        .from("oc_request_contract_allocations")
        .select("oc_request_id, contract_id, amount_uf, amount_clp, contracts(name)");

      const requestAllocationsMap = new Map<string, ContractAllocation[]>();
      (requestAllocationsData || []).forEach((alloc: any) => {
        const existing = requestAllocationsMap.get(alloc.oc_request_id) || [];
        existing.push({
          contract_id: alloc.contract_id,
          contract_name: alloc.contracts?.name || "Sin nombre",
          amount_uf: alloc.amount_uf || 0,
          amount_clp: alloc.amount_clp || 0,
        });
        requestAllocationsMap.set(alloc.oc_request_id, existing);
      });

      const processedRequests = (requestsData || []).map((req: any) => ({
        ...req,
        allocations: requestAllocationsMap.get(req.id) || [],
      }));

      setOcRequests(processedRequests as unknown as OCRequest[]);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle multi-contract expansion
  const toggleMultiRequest = (requestId: string) => {
    setExpandedMultiRequests((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  const toggleMultiOrder = (orderId: string) => {
    setExpandedMultiOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Handle opening edit dialog
  const handleEditRequest = (requestId: string) => {
    setEditingRequestId(requestId);
    setShowEditRequestDialog(true);
  };

  // Handle opening convert dialog
  const handleConvertRequest = (req: OCRequest) => {
    setConvertingRequest(req);
    setShowConvertDialog(true);
  };

  // Chart data for contracts
  const contractChartData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => o.year === yearNum);
    
    const contractMap = new Map<string, { name: string; amount: number }>();
    filtered.forEach(order => {
      const existing = contractMap.get(order.contract_id) || { name: order.contract_name || "", amount: 0 };
      existing.amount += order.amount_uf || 0;
      contractMap.set(order.contract_id, existing);
    });

    return Array.from(contractMap.entries())
      .map(([id, data], index) => ({
        id,
        name: data.name,
        value: data.amount,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [orders, yearFilter]);

  // Chart data for categories - detect OPEX orders more robustly
  const categoryChartData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    // Include orders that have opex_category_id OR budget_classification === "OPEX"
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      (o.opex_category_id || o.budget_classification === "OPEX")
    );
    
    const categoryMap = new Map<string, { name: string; amount: number }>();
    filtered.forEach(order => {
      const catId = order.opex_category_id || "sin_categoria";
      const catName = order.opex_category_name || "Sin categoría";
      const existing = categoryMap.get(catId) || { name: catName, amount: 0 };
      existing.amount += order.amount_uf || 0;
      categoryMap.set(catId, existing);
    });

    return Array.from(categoryMap.entries())
      .map(([id, data], index) => ({
        id,
        name: data.name,
        value: data.amount,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [orders, yearFilter]);

  // Chart data for OPEX by company (empresa)
  const companyChartData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    // Filter OPEX orders
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      (o.opex_category_id || o.budget_classification === "OPEX")
    );
    
    const companyMap = new Map<string, { name: string; amount: number }>();
    filtered.forEach(order => {
      // Extract company from contract name (before " - " if present)
      const contractName = order.contract_name || "Sin empresa";
      const companyName = contractName.includes(" - ") 
        ? contractName.split(" - ")[0] 
        : contractName;
      const existing = companyMap.get(companyName) || { name: companyName, amount: 0 };
      existing.amount += order.amount_uf || 0;
      companyMap.set(companyName, existing);
    });

    return Array.from(companyMap.entries())
      .map(([id, data], index) => ({
        id,
        name: data.name,
        value: data.amount,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [orders, yearFilter]);

  // Summary calculations
  const summaryData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    let filtered = orders.filter(o => o.year === yearNum);

    const totalOC = filtered.reduce((sum, o) => sum + (o.amount_uf || 0), 0);
    const totalFacturado = filtered.reduce((sum, o) => sum + (o.invoices_total || 0), 0);
    const sinFacturar = totalOC - totalFacturado;
    
    // Count unique order numbers (unique OCs)
    const uniqueOrderNumbers = new Set(filtered.map(o => o.order_number));
    
    // Count unique contracts/locales with OCs
    const uniqueContracts = new Set(filtered.map(o => o.contract_id));

    return {
      totalOC,
      totalFacturado,
      sinFacturar,
      countOC: uniqueOrderNumbers.size, // Unique OC count
      countLocales: uniqueContracts.size, // Unique locales with OC
      countFacturas: filtered.reduce((sum, o) => sum + (o.invoices_count || 0), 0),
    };
  }, [orders, yearFilter]);

  // Group orders by order_number - each unique order_number appears once
  const groupedOrdersByNumber = useMemo((): GroupedOrder[] => {
    const yearNum = parseInt(yearFilter);
    let filtered = orders.filter(o => o.year === yearNum);

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.order_number?.toLowerCase().includes(term) ||
          o.description?.toLowerCase().includes(term) ||
          o.contract_name?.toLowerCase().includes(term) ||
          o.supplier_name?.toLowerCase().includes(term)
      );
    }

    // Apply dropdown filters
    if (contractFilter !== "todos") {
      filtered = filtered.filter((o) => o.contract_id === contractFilter);
    }

    if (classificationFilter !== "todos") {
      filtered = filtered.filter((o) => o.budget_classification === classificationFilter);
    }

    if (categoryFilter !== "todos") {
      filtered = filtered.filter((o) => o.opex_category_id === categoryFilter);
    }

    if (amountFilter !== "todos") {
      filtered = filtered.filter((o) => {
        const amount = o.amount_uf || 0;
        switch (amountFilter) {
          case "0-100": return amount <= 100;
          case "100-500": return amount > 100 && amount <= 500;
          case "500-1000": return amount > 500 && amount <= 1000;
          case "1000+": return amount > 1000;
          default: return true;
        }
      });
    }

    // Apply chart-based filters
    if (chartContractFilter) {
      filtered = filtered.filter((o) => o.contract_id === chartContractFilter);
    }

    if (chartCategoryFilter) {
      filtered = filtered.filter((o) => o.opex_category_id === chartCategoryFilter);
    }

    // Group by order_number
    const orderNumberMap = new Map<string, PurchaseOrder[]>();
    filtered.forEach((order) => {
      const existing = orderNumberMap.get(order.order_number) || [];
      existing.push(order);
      orderNumberMap.set(order.order_number, existing);
    });

    // Convert to GroupedOrder array
    const result: GroupedOrder[] = [];
    orderNumberMap.forEach((ordersList, orderNumber) => {
      const firstOrder = ordersList[0];
      const isMulti = ordersList.length > 1;
      
      // Calculate totals
      const totalAmount = ordersList.reduce((sum, o) => sum + (o.amount_uf || 0), 0);
      const totalInvoicesCount = ordersList.reduce((sum, o) => sum + (o.invoices_count || 0), 0);
      const totalInvoicesAmount = ordersList.reduce((sum, o) => sum + (o.invoices_total || 0), 0);
      
      // Determine overall status
      let status = "abierta";
      if (totalInvoicesAmount >= totalAmount) {
        status = "cerrada";
      } else if (totalInvoicesAmount > totalAmount) {
        status = "descuadrada";
      }

      // Build contracts list
      const contracts = ordersList.map(o => ({
        contract_id: o.contract_id,
        contract_name: o.contract_name || "Sin contrato",
        amount_uf: o.amount_uf || 0,
        order_id: o.id,
      }));

      result.push({
        order_number: orderNumber,
        description: firstOrder.description,
        supplier_name: firstOrder.supplier_name,
        order_date: firstOrder.order_date,
        budget_classification: firstOrder.budget_classification,
        opex_category_name: firstOrder.opex_category_name,
        budget_line_name: firstOrder.budget_line_name,
        total_amount_uf: totalAmount,
        total_invoices_count: totalInvoicesCount,
        total_invoices_amount: totalInvoicesAmount,
        status,
        year: firstOrder.year || yearNum,
        is_multi_contract: isMulti,
        orders: ordersList,
        contracts,
      });
    });

    // Sort by order_date descending
    return result.sort((a, b) => {
      if (!a.order_date && !b.order_date) return 0;
      if (!a.order_date) return 1;
      if (!b.order_date) return -1;
      return b.order_date.localeCompare(a.order_date);
    });
  }, [orders, searchTerm, contractFilter, yearFilter, categoryFilter, classificationFilter, amountFilter, chartContractFilter, chartCategoryFilter]);

  const toggleContract = (contractId: string) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
      }
      return next;
    });
  };

  const toggleOrderInvoices = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedMultiOrders(new Set(groupedOrdersByNumber.filter(g => g.is_multi_contract).map(g => g.order_number)));
  };

  const collapseAll = () => {
    setExpandedMultiOrders(new Set());
    setExpandedOrders(new Set());
  };

  const clearFilters = () => {
    setSearchTerm("");
    setContractFilter("todos");
    setCategoryFilter("todos");
    setClassificationFilter("todos");
    setAmountFilter("todos");
    setRequestStatusFilter("todos");
    setChartContractFilter(null);
    setChartCategoryFilter(null);
  };

  const hasActiveFilters =
    searchTerm ||
    contractFilter !== "todos" ||
    categoryFilter !== "todos" ||
    classificationFilter !== "todos" ||
    amountFilter !== "todos" ||
    requestStatusFilter !== "todos" ||
    chartContractFilter ||
    chartCategoryFilter;

  // Filtered OC Requests
  const filteredRequests = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    let filtered = ocRequests.filter(r => r.year === yearNum);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.request_number?.toLowerCase().includes(term) ||
        r.description?.toLowerCase().includes(term) ||
        r.project_name?.toLowerCase().includes(term) ||
        r.supplier_name?.toLowerCase().includes(term)
      );
    }

    if (contractFilter !== "todos") {
      filtered = filtered.filter(r => r.contract_id === contractFilter);
    }

    if (requestStatusFilter !== "todos") {
      filtered = filtered.filter(r => r.status === requestStatusFilter);
    }

    return filtered;
  }, [ocRequests, yearFilter, searchTerm, contractFilter, requestStatusFilter]);

  // OC Request summary
  const requestSummary = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const yearRequests = ocRequests.filter(r => r.year === yearNum);
    const pending = yearRequests.filter(r => r.status === "pending");
    const converted = yearRequests.filter(r => r.status === "converted");
    
    return {
      total: yearRequests.length,
      totalAmount: yearRequests.reduce((sum, r) => sum + (r.amount_uf || 0), 0),
      pending: pending.length,
      pendingAmount: pending.reduce((sum, r) => sum + (r.amount_uf || 0), 0),
      converted: converted.length,
      convertedAmount: converted.reduce((sum, r) => sum + (r.amount_uf || 0), 0),
    };
  }, [ocRequests, yearFilter]);

  // Toggle request selection
  const toggleRequestSelection = (requestId: string) => {
    setSelectedRequests(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  // Delete selected requests
  const handleDeleteSelectedRequests = async () => {
    if (selectedRequests.size === 0) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("oc_requests")
        .delete()
        .in("id", Array.from(selectedRequests));

      if (error) throw error;

      toast.success(`${selectedRequests.size} solicitudes eliminadas`);
      setSelectedRequests(new Set());
      setShowConfirmDeleteDialog(false);
      setShowDeleteDialog(false);
      loadData();
    } catch (error) {
      console.error("Error deleting requests:", error);
      toast.error("Error al eliminar las solicitudes");
    } finally {
      setDeleting(false);
    }
  };

  // Export requests to Excel
  const exportRequestsToExcel = () => {
    const yearNum = parseInt(yearFilter);
    const data = filteredRequests.map(r => ({
      "Número Solicitud": r.request_number,
      "Fecha": r.request_date,
      "Proyecto": r.project_name,
      "Línea": r.line_name,
      "Descripción": r.description || "",
      "Monto UF": r.amount_uf.toFixed(2),
      "Proveedor": r.supplier_name || "",
      "Estado": r.status === "pending" ? "Pendiente" : "Convertida",
    }));

    // Build CSV
    const headers = Object.keys(data[0] || {});
    const csvContent = [
      headers.join(","),
      ...data.map(row => headers.map(h => `"${(row as any)[h] || ""}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solicitudes_oc_${yearNum}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Solicitudes exportadas a Excel");
  };

  // Selection handlers
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const selectAllInGroup = (orders: PurchaseOrder[]) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      orders.forEach((o) => next.add(o.id));
      return next;
    });
  };

  const deselectAllInGroup = (orders: PurchaseOrder[]) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      orders.forEach((o) => next.delete(o.id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedOrders.size === 0) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id })
        .in("id", Array.from(selectedOrders));

      if (error) throw error;

      toast.success(`${selectedOrders.size} OC eliminadas correctamente`);
      setSelectedOrders(new Set());
      setShowConfirmDeleteDialog(false);
      setShowDeleteDialog(false);
      loadData();
    } catch (error) {
      console.error("Error deleting orders:", error);
      toast.error("Error al eliminar las órdenes");
    } finally {
      setDeleting(false);
    }
  };

  const handleChartClick = (data: ChartData, type: "contract" | "category") => {
    if (type === "contract") {
      if (chartContractFilter === data.id) {
        setChartContractFilter(null);
      } else {
        setChartContractFilter(data.id);
        setChartCategoryFilter(null);
      }
    } else {
      if (chartCategoryFilter === data.id) {
        setChartCategoryFilter(null);
      } else {
        setChartCategoryFilter(data.id);
        setChartContractFilter(null);
      }
    }
  };

  const formatUF = (value: number) => {
    return `${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  // Handle opening invoice dialog for grouped order (handles multi-contract)
  const handleOpenInvoiceDialogForGroup = (groupedOrder: GroupedOrder) => {
    setSelectedGroupedOrder(groupedOrder);
    setSelectedOrderForInvoice(groupedOrder.orders[0]);
    setInvoiceMode("create");
    setEditingInvoiceId(null);
    setNewInvoiceData({
      invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0],
      amount: "",
      currency: "UF",
    });
    setShowInvoiceDialog(true);
  };

  // Handle create/edit invoice - for multi-contract, distributes proportionally
  const handleSaveInvoice = async () => {
    if (!selectedGroupedOrder || !newInvoiceData.invoice_number || !newInvoiceData.amount) {
      toast.error("Complete todos los campos requeridos");
      return;
    }

    setCreatingInvoice(true);
    try {
      const inputAmount = parseFloat(newInvoiceData.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (newInvoiceData.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = inputAmount * ufValue;
      } else {
        amountCLP = inputAmount;
        amountUF = inputAmount / ufValue;
      }

      if (invoiceMode === "edit" && editingInvoiceId) {
        // Update existing invoice
        const { error } = await supabase
          .from("invoices")
          .update({
            invoice_number: newInvoiceData.invoice_number,
            invoice_date: newInvoiceData.invoice_date,
            amount_uf: amountUF,
            amount_clp: amountCLP,
            input_currency: newInvoiceData.currency,
            uf_value_at_entry: ufValue,
          })
          .eq("id", editingInvoiceId);

        if (error) throw error;
        toast.success("Factura actualizada correctamente");
      } else {
        // Create new invoice - for multi-contract, distribute proportionally
        if (selectedGroupedOrder.is_multi_contract && selectedGroupedOrder.orders.length > 1) {
          // Calculate total amount of all orders
          const totalOrderAmount = selectedGroupedOrder.total_amount_uf;
          
          // Distribute invoice proportionally to each order
          const invoiceInserts = selectedGroupedOrder.orders.map(order => {
            const proportion = order.amount_uf / totalOrderAmount;
            const proportionalAmountUF = amountUF * proportion;
            const proportionalAmountCLP = amountCLP * proportion;
            
            return {
              purchase_order_id: order.id,
              invoice_number: newInvoiceData.invoice_number,
              invoice_date: newInvoiceData.invoice_date,
              amount_uf: proportionalAmountUF,
              amount_clp: proportionalAmountCLP,
              input_currency: newInvoiceData.currency,
              uf_value_at_entry: ufValue,
            };
          });

          const { error } = await supabase.from("invoices").insert(invoiceInserts);
          if (error) throw error;
          toast.success(`Factura distribuida proporcionalmente en ${selectedGroupedOrder.orders.length} contratos`);
        } else {
          // Single contract - insert to first order
          const { error } = await supabase.from("invoices").insert({
            purchase_order_id: selectedGroupedOrder.orders[0].id,
            invoice_number: newInvoiceData.invoice_number,
            invoice_date: newInvoiceData.invoice_date,
            amount_uf: amountUF,
            amount_clp: amountCLP,
            input_currency: newInvoiceData.currency,
            uf_value_at_entry: ufValue,
          });

          if (error) throw error;
          toast.success("Factura agregada correctamente");
        }
      }

      setShowInvoiceDialog(false);
      setSelectedOrderForInvoice(null);
      setSelectedGroupedOrder(null);
      loadData();
    } catch (error: any) {
      console.error("Error saving invoice:", error);
      toast.error("Error al guardar la factura: " + error.message);
    } finally {
      setCreatingInvoice(false);
    }
  };

  // Handle edit invoice
  const handleEditInvoice = (invoice: Invoice, groupedOrder: GroupedOrder) => {
    setSelectedGroupedOrder(groupedOrder);
    setInvoiceMode("edit");
    setEditingInvoiceId(invoice.id);
    setNewInvoiceData({
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      amount: invoice.amount_uf.toString(),
      currency: "UF",
    });
    setShowInvoiceDialog(true);
  };

  // Handle delete invoice
  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      // Delete associated credit notes first
      await supabase.from("credit_notes").delete().eq("invoice_id", invoiceId);
      // Delete the invoice
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
      toast.success("Factura eliminada");
      loadData();
    } catch (error: any) {
      toast.error("Error al eliminar: " + error.message);
    }
  };

  // Handle open credit note dialog - for multi-contract, we pass the groupedOrder to distribute
  const handleOpenCreditNoteDialog = (invoice: Invoice | null, groupedOrder: GroupedOrder) => {
    setSelectedInvoiceForCreditNote(invoice);
    setSelectedGroupedOrder(groupedOrder);
    setNewCreditNoteData({
      credit_note_number: "",
      credit_note_date: new Date().toISOString().split("T")[0],
      amount: "",
      currency: "UF",
      reason: "",
    });
    setShowCreditNoteDialog(true);
  };

  // Handle create credit note - for multi-contract, distributes proportionally
  const handleCreateCreditNote = async () => {
    if (!selectedGroupedOrder || !newCreditNoteData.credit_note_number || !newCreditNoteData.amount) {
      toast.error("Complete todos los campos requeridos");
      return;
    }

    setCreatingCreditNote(true);
    try {
      const inputAmount = parseFloat(newCreditNoteData.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (newCreditNoteData.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = inputAmount * ufValue;
      } else {
        amountCLP = inputAmount;
        amountUF = inputAmount / ufValue;
      }

      // For multi-contract orders, distribute credit note proportionally
      if (selectedGroupedOrder.is_multi_contract && selectedGroupedOrder.orders.length > 1) {
        const totalOrderAmount = selectedGroupedOrder.total_amount_uf;
        
        // Get all invoices from all orders in this group
        const allInvoices = selectedGroupedOrder.orders.flatMap((order) => 
          order.invoices.map(inv => ({ ...inv, order_id: order.id, order_amount_uf: order.amount_uf }))
        );
        
        if (allInvoices.length === 0) {
          throw new Error("No hay facturas asociadas a esta OC");
        }

        // Distribute credit note proportionally to each order/invoice
        const creditNoteInserts = selectedGroupedOrder.orders
          .filter(order => order.invoices.length > 0)
          .map(order => {
            const proportion = order.amount_uf / totalOrderAmount;
            const proportionalAmountUF = amountUF * proportion;
            const proportionalAmountCLP = amountCLP * proportion;
            
            // Use the first invoice of each order
            const invoiceForOrder = order.invoices[0];
            
            return {
              purchase_order_id: order.id,
              invoice_id: invoiceForOrder.id,
              credit_note_number: newCreditNoteData.credit_note_number,
              credit_note_date: newCreditNoteData.credit_note_date,
              amount_uf: proportionalAmountUF,
              amount_clp: proportionalAmountCLP,
              input_currency: newCreditNoteData.currency,
              uf_value_at_entry: ufValue,
              reason: newCreditNoteData.reason || null,
            };
          });

        if (creditNoteInserts.length === 0) {
          throw new Error("No se encontraron facturas para distribuir la nota de crédito");
        }

        const { error } = await supabase.from("credit_notes").insert(creditNoteInserts);
        if (error) throw error;
        toast.success(`Nota de crédito distribuida proporcionalmente en ${creditNoteInserts.length} contratos`);
      } else {
        // Single contract - insert to the selected invoice or first available
        let invoiceId: string;
        let purchaseOrderId: string;

        if (selectedInvoiceForCreditNote) {
          invoiceId = selectedInvoiceForCreditNote.id;
          const { data: invoiceData } = await supabase
            .from("invoices")
            .select("purchase_order_id")
            .eq("id", selectedInvoiceForCreditNote.id)
            .single();
          if (!invoiceData) throw new Error("Factura no encontrada");
          purchaseOrderId = invoiceData.purchase_order_id;
        } else {
          // Find first invoice from the order
          const firstInvoice = selectedGroupedOrder.orders[0].invoices[0];
          if (!firstInvoice) throw new Error("No hay facturas asociadas a esta OC");
          invoiceId = firstInvoice.id;
          purchaseOrderId = selectedGroupedOrder.orders[0].id;
        }

        const { error } = await supabase.from("credit_notes").insert({
          purchase_order_id: purchaseOrderId,
          invoice_id: invoiceId,
          credit_note_number: newCreditNoteData.credit_note_number,
          credit_note_date: newCreditNoteData.credit_note_date,
          amount_uf: amountUF,
          amount_clp: amountCLP,
          input_currency: newCreditNoteData.currency,
          uf_value_at_entry: ufValue,
          reason: newCreditNoteData.reason || null,
        });

        if (error) throw error;
        toast.success("Nota de crédito agregada");
      }

      setShowCreditNoteDialog(false);
      setSelectedInvoiceForCreditNote(null);
      setSelectedGroupedOrder(null);
      loadData();
    } catch (error: any) {
      toast.error("Error al crear nota de crédito: " + error.message);
    } finally {
      setCreatingCreditNote(false);
    }
  };

  // Handle delete credit note
  const handleDeleteCreditNote = async (creditNoteId: string) => {
    try {
      const { error } = await supabase.from("credit_notes").delete().eq("id", creditNoteId);
      if (error) throw error;
      toast.success("Nota de crédito eliminada");
      loadData();
    } catch (error: any) {
      toast.error("Error al eliminar: " + error.message);
    }
  };

  // Handle edit OC
  const handleOpenEditOCDialog = (groupedOrder: GroupedOrder) => {
    setEditingOCId(groupedOrder.orders[0].id);
    setEditingOCData({
      order_number: groupedOrder.order_number,
      description: groupedOrder.description || "",
      supplier_name: groupedOrder.supplier_name || "",
      order_date: groupedOrder.order_date || "",
      opex_category_id: groupedOrder.orders[0].opex_category_id || "",
    });
    setShowEditOCDialog(true);
  };

  // Handle update OC
  const handleUpdateOC = async () => {
    if (!editingOCId) return;
    
    setUpdatingOC(true);
    try {
      // Find all orders with same order_number to update them all
      const originalOrder = orders.find(o => o.id === editingOCId);
      if (!originalOrder) throw new Error("OC no encontrada");

      const ordersToUpdate = orders.filter(o => o.order_number === originalOrder.order_number);
      
      for (const order of ordersToUpdate) {
        const { error } = await supabase
          .from("purchase_orders")
          .update({
            order_number: editingOCData.order_number,
            description: editingOCData.description || null,
            supplier_name: editingOCData.supplier_name || null,
            order_date: editingOCData.order_date || null,
            opex_category_id: editingOCData.opex_category_id || null,
          })
          .eq("id", order.id);

        if (error) throw error;
      }

      toast.success("OC actualizada correctamente");
      setShowEditOCDialog(false);
      setEditingOCId(null);
      loadData();
    } catch (error: any) {
      toast.error("Error al actualizar OC: " + error.message);
    } finally {
      setUpdatingOC(false);
    }
  };

  // Get OC status with percentages
  const getOCStatusInfo = (groupedOrder: GroupedOrder) => {
    const orderCreditNotes = groupedOrder.orders.flatMap(o => creditNotes.get(o.id) || []);
    const totalCreditNotesAmount = orderCreditNotes.reduce((sum, cn) => sum + cn.amount_uf, 0);
    const netInvoiced = groupedOrder.total_invoices_amount - totalCreditNotesAmount;
    const percentage = groupedOrder.total_amount_uf > 0 ? (netInvoiced / groupedOrder.total_amount_uf) * 100 : 0;
    
    let status: "abierta" | "cerrada" | "sobrepasada" = "abierta";
    if (netInvoiced > groupedOrder.total_amount_uf + 0.01) {
      status = "sobrepasada";
    } else if (Math.abs(netInvoiced - groupedOrder.total_amount_uf) < 0.01) {
      status = "cerrada";
    }

    return {
      status,
      percentage,
      netInvoiced,
      totalCreditNotes: totalCreditNotesAmount,
      pending: groupedOrder.total_amount_uf - netInvoiced,
    };
  };

  const totalOrders = groupedOrdersByNumber.length;
  const totalAmount = groupedOrdersByNumber.reduce(
    (sum, g) => sum + g.total_amount_uf,
    0
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Órdenes de Compra</h1>
                <p className="text-sm text-muted-foreground">
                  Vista consolidada de todas las órdenes de compra y facturas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && selectedOrders.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar ({selectedOrders.size})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowRequestCreator(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Solicitud OC
              </Button>
              <Button size="sm" onClick={() => setShowOrderCreator(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Nueva OC
              </Button>
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronsUpDown className="h-4 w-4 mr-1" />
                Expandir
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Colapsar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Year Filter */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Año:</span>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[120px]">
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
        </div>

        {/* Summary Cards - Ordered: Total OC, Locales con OC, Monto Total ($/UF), Facturado, Sin Facturar */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Total OC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryData.countOC}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Locales con OC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryData.countLocales}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Monto Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${Math.round(summaryData.totalOC * ufValue).toLocaleString("es-CL")}</div>
              <p className="text-xs text-muted-foreground">{formatUF(summaryData.totalOC)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Total Facturado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${Math.round(summaryData.totalFacturado * ufValue).toLocaleString("es-CL")}</div>
              <p className="text-xs text-muted-foreground">{formatUF(summaryData.totalFacturado)} • {summaryData.countFacturas} facturas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Sin Facturar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">${Math.round(summaryData.sinFacturar * ufValue).toLocaleString("es-CL")}</div>
              <p className="text-xs text-muted-foreground">{formatUF(summaryData.sinFacturar)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Interactive Charts - Bar chart full width, two pie charts in second column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar Chart - OC por Local */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>OC por Local</span>
                {chartContractFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setChartContractFilter(null)}>
                    <X className="h-4 w-4 mr-1" />
                    Limpiar filtro
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contractChartData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Sin datos para el año {yearFilter}</p>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={contractChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        type="number" 
                        tickFormatter={(value) => `${value.toFixed(0)} UF`}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={100}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 12)}...` : value}
                      />
                      <Tooltip
                        formatter={(value: number) => formatUF(value)}
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar 
                        dataKey="value" 
                        onClick={(data) => handleChartClick(data, "contract")}
                        style={{ cursor: "pointer" }}
                      >
                        {contractChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color}
                            opacity={chartContractFilter && chartContractFilter !== entry.id ? 0.3 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Two Pie Charts stacked */}
          <div className="flex flex-col gap-4">
            {/* Pie Chart - OPEX por Categoría */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>OPEX por Categoría</span>
                  {chartCategoryFilter && (
                    <Button variant="ghost" size="sm" onClick={() => setChartCategoryFilter(null)}>
                      <X className="h-3 w-3 mr-1" />
                      Limpiar
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {categoryChartData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">Sin datos OPEX</p>
                ) : (
                  <div className="h-[130px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="30%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={45}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          onClick={(data) => handleChartClick(data, "category")}
                          style={{ cursor: "pointer" }}
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                              opacity={chartCategoryFilter && chartCategoryFilter !== entry.id ? 0.3 : 1}
                              stroke={chartCategoryFilter === entry.id ? "hsl(var(--primary))" : "transparent"}
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatUF(value)}
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "11px",
                          }}
                        />
                        <Legend
                          layout="vertical"
                          align="right"
                          verticalAlign="middle"
                          wrapperStyle={{ fontSize: "10px", right: 0 }}
                          formatter={(value) => (
                            <span className="text-[10px]">{value.length > 12 ? `${value.substring(0, 12)}...` : value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pie Chart - OPEX por Empresa */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">OPEX por Empresa</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {companyChartData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">Sin datos OPEX</p>
                ) : (
                  <div className="h-[130px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={companyChartData}
                          cx="30%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={45}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {companyChartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatUF(value)}
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "11px",
                          }}
                        />
                        <Legend
                          layout="vertical"
                          align="right"
                          verticalAlign="middle"
                          wrapperStyle={{ fontSize: "10px", right: 0 }}
                          formatter={(value) => (
                            <span className="text-[10px]">{value.length > 12 ? `${value.substring(0, 12)}...` : value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por OC, descripción, local o proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los locales</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="CAPEX">CAPEX</SelectItem>
                  <SelectItem value="OPEX">OPEX</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las categorías</SelectItem>
                  {opexCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={amountFilter} onValueChange={setAmountFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Monto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los montos</SelectItem>
                  <SelectItem value="0-100">0 - 100 UF</SelectItem>
                  <SelectItem value="100-500">100 - 500 UF</SelectItem>
                  <SelectItem value="500-1000">500 - 1.000 UF</SelectItem>
                  <SelectItem value="1000+">+1.000 UF</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
            
            {(chartContractFilter || chartCategoryFilter) && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filtro del gráfico:</span>
                {chartContractFilter && (
                  <Badge variant="secondary">
                    Local: {contracts.find(c => c.id === chartContractFilter)?.name}
                    <button className="ml-1" onClick={() => setChartContractFilter(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {chartCategoryFilter && (
                  <Badge variant="secondary">
                    Categoría: {opexCategories.find(c => c.id === chartCategoryFilter)?.name}
                    <button className="ml-1" onClick={() => setChartCategoryFilter(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for OC and Requests */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="oc" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Órdenes de Compra ({groupedOrdersByNumber.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Solicitudes de OC ({requestSummary.total})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="oc">
            {/* Orders List - Grouped by order_number */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : groupedOrdersByNumber.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No se encontraron órdenes de compra para el año {yearFilter}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isAdmin && <TableHead className="w-[40px]"></TableHead>}
                        <TableHead>Nº OC</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Monto Total (UF)</TableHead>
                        <TableHead className="text-center">Facturas</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedOrdersByNumber.map((groupedOrder) => {
                        const isInvoicesExpanded = expandedInvoiceSections.has(groupedOrder.order_number);
                        const isContractsExpanded = expandedContractSections.has(groupedOrder.order_number);
                        const hasInvoices = groupedOrder.total_invoices_count > 0;
                        const allOrderIds = groupedOrder.orders.map(o => o.id);
                        const allSelected = allOrderIds.every(id => selectedOrders.has(id));
                        const statusInfo = getOCStatusInfo(groupedOrder);

                        return (
                          <>
                            <TableRow key={groupedOrder.order_number} className="hover:bg-muted/30">
                              {isAdmin && (
                                <TableCell>
                                  <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedOrders(prev => {
                                          const next = new Set(prev);
                                          allOrderIds.forEach(id => next.add(id));
                                          return next;
                                        });
                                      } else {
                                        setSelectedOrders(prev => {
                                          const next = new Set(prev);
                                          allOrderIds.forEach(id => next.delete(id));
                                          return next;
                                        });
                                      }
                                    }}
                                  />
                                </TableCell>
                              )}
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  {groupedOrder.order_number}
                                  {groupedOrder.is_multi_contract && (
                                    <Badge variant="outline" className="text-[10px] gap-1">
                                      <Layers className="h-3 w-3" />
                                      {groupedOrder.contracts.length} Locales
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[150px] truncate">
                                {groupedOrder.description || "-"}
                              </TableCell>
                              <TableCell className="max-w-[120px] truncate">
                                {groupedOrder.supplier_name || "-"}
                              </TableCell>
                              <TableCell>
                                {groupedOrder.budget_classification ? (
                                  <Badge
                                    variant={groupedOrder.budget_classification === "CAPEX" ? "default" : "secondary"}
                                  >
                                    {groupedOrder.budget_classification}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">OPEX</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {groupedOrder.opex_category_name || groupedOrder.budget_line_name || "-"}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatUF(groupedOrder.total_amount_uf)}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Receipt className="h-3 w-3 text-muted-foreground" />
                                  <span>{groupedOrder.total_invoices_count}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    statusInfo.status === "cerrada"
                                      ? "default"
                                      : statusInfo.status === "sobrepasada"
                                      ? "destructive"
                                      : "outline"
                                  }
                                  className="gap-1"
                                >
                                  {statusInfo.status === "abierta" && `${statusInfo.percentage.toFixed(0)}%`}
                                  {statusInfo.status === "cerrada" && "Cerrada"}
                                  {statusInfo.status === "sobrepasada" && (
                                    <>
                                      <AlertTriangle className="h-3 w-3" />
                                      {statusInfo.percentage.toFixed(0)}%
                                    </>
                                  )}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {groupedOrder.order_date ? format(parseISO(groupedOrder.order_date), "dd/MM/yy", { locale: es }) : "-"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEditOCDialog(groupedOrder)}
                                    className="h-7 w-7 p-0"
                                    title="Editar OC"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenInvoiceDialogForGroup(groupedOrder)}
                                    className="h-7 w-7 p-0"
                                    title="Agregar Factura"
                                  >
                                    <Receipt className="h-3.5 w-3.5" />
                                  </Button>
                                  {hasInvoices && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenCreditNoteDialog(null, groupedOrder)}
                                      className="h-7 w-7 p-0"
                                      title="Agregar Nota de Crédito"
                                    >
                                      <CreditCard className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {/* Expandable toggles */}
                                  {hasInvoices && (
                                    <Button
                                      variant={isInvoicesExpanded ? "secondary" : "ghost"}
                                      size="sm"
                                      onClick={() => {
                                        setExpandedInvoiceSections(prev => {
                                          const next = new Set(prev);
                                          if (next.has(groupedOrder.order_number)) {
                                            next.delete(groupedOrder.order_number);
                                          } else {
                                            next.add(groupedOrder.order_number);
                                          }
                                          return next;
                                        });
                                      }}
                                      className="h-7 px-2 gap-1 text-xs"
                                      title="Ver facturas"
                                    >
                                      <FileCheck className="h-3 w-3" />
                                      {isInvoicesExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </Button>
                                  )}
                                  {groupedOrder.is_multi_contract && (
                                    <Button
                                      variant={isContractsExpanded ? "secondary" : "ghost"}
                                      size="sm"
                                      onClick={() => {
                                        setExpandedContractSections(prev => {
                                          const next = new Set(prev);
                                          if (next.has(groupedOrder.order_number)) {
                                            next.delete(groupedOrder.order_number);
                                          } else {
                                            next.add(groupedOrder.order_number);
                                          }
                                          return next;
                                        });
                                      }}
                                      className="h-7 px-2 gap-1 text-xs"
                                      title="Ver desglose por contrato"
                                    >
                                      <Layers className="h-3 w-3" />
                                      {isContractsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </Button>
                                  )}
                                  {!groupedOrder.is_multi_contract && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => navigate(`/contracts/${groupedOrder.orders[0].contract_id}?section=ordenes-compra&returnTo=purchase-orders`)}
                                      className="h-7 w-7 p-0"
                                      title="Ver contrato"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* Invoices expanded section */}
                            {isInvoicesExpanded && (() => {
                              const allInvoices = groupedOrder.orders.flatMap((order) => 
                                order.invoices.map(inv => ({ ...inv, contract_name: order.contract_name, order_id: order.id, order_amount_uf: order.amount_uf }))
                              );
                              const allCreditNotes = groupedOrder.orders.flatMap(o => creditNotes.get(o.id) || []);

                              return (
                                <TableRow className="bg-green-50/30 dark:bg-green-950/10">
                                  <TableCell colSpan={isAdmin ? 11 : 10} className="py-3 px-4">
                                    <div className="space-y-3">
                                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                        <Receipt className="h-4 w-4" />
                                        Facturas y Notas de Crédito ({allInvoices.length})
                                      </p>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            {groupedOrder.is_multi_contract && <TableHead className="text-xs">Contrato</TableHead>}
                                            <TableHead className="text-xs">Nº Factura</TableHead>
                                            <TableHead className="text-xs">Fecha</TableHead>
                                            <TableHead className="text-xs text-right">Monto (UF)</TableHead>
                                            <TableHead className="text-xs">Notas Crédito</TableHead>
                                            <TableHead className="text-xs">Estado</TableHead>
                                            <TableHead className="text-xs">Acciones</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {allInvoices.map((invoice) => {
                                            const invoiceCreditNotes = allCreditNotes.filter(cn => cn.invoice_id === invoice.id);
                                            const creditNotesTotal = invoiceCreditNotes.reduce((sum, cn) => sum + cn.amount_uf, 0);
                                            
                                            return (
                                              <TableRow key={invoice.id}>
                                                {groupedOrder.is_multi_contract && (
                                                  <TableCell className="text-sm py-1.5">
                                                    {invoice.contract_name}
                                                  </TableCell>
                                                )}
                                                <TableCell className="text-sm py-1.5">
                                                  <div className="flex items-center gap-2">
                                                    <Receipt className="h-3 w-3 text-primary" />
                                                    {invoice.invoice_number}
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-sm py-1.5">
                                                  {format(parseISO(invoice.invoice_date), "dd MMM yyyy", { locale: es })}
                                                </TableCell>
                                                <TableCell className="text-sm py-1.5 text-right font-medium">
                                                  {formatUF(invoice.amount_uf)}
                                                </TableCell>
                                                <TableCell className="py-1.5">
                                                  {invoiceCreditNotes.length > 0 ? (
                                                    <div className="space-y-1">
                                                      {invoiceCreditNotes.map((cn) => (
                                                        <div key={cn.id} className="flex items-center gap-1">
                                                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                                                            NC {cn.credit_note_number}: -{formatUF(cn.amount_uf)}
                                                          </Badge>
                                                          <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-5 w-5 p-0 text-destructive"
                                                            onClick={() => handleDeleteCreditNote(cn.id)}
                                                          >
                                                            <Trash2 className="h-3 w-3" />
                                                          </Button>
                                                        </div>
                                                      ))}
                                                      <p className="text-xs text-muted-foreground">
                                                        Neto: {formatUF(invoice.amount_uf - creditNotesTotal)}
                                                      </p>
                                                    </div>
                                                  ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                  )}
                                                </TableCell>
                                                <TableCell className="py-1.5">
                                                  <Badge
                                                    variant={invoice.reception_status === "recibido" ? "default" : "secondary"}
                                                    className="text-xs"
                                                  >
                                                    {invoice.reception_status}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell className="py-1.5">
                                                  <div className="flex items-center gap-1">
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => handleOpenCreditNoteDialog(invoice, groupedOrder)}
                                                      className="h-6 px-1.5"
                                                      title="Agregar Nota de Crédito"
                                                    >
                                                      <CreditCard className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => handleEditInvoice(invoice, groupedOrder)}
                                                      className="h-6 px-1.5"
                                                      title="Editar Factura"
                                                    >
                                                      <Pencil className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => handleDeleteInvoice(invoice.id)}
                                                      className="h-6 px-1.5 text-destructive"
                                                      title="Eliminar Factura"
                                                    >
                                                      <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                      {/* Summary */}
                                      <div className="flex items-center gap-4 text-sm pt-2 border-t">
                                        <span className="text-muted-foreground">
                                          Total OC: <span className="font-medium text-foreground">{formatUF(groupedOrder.total_amount_uf)}</span>
                                        </span>
                                        <span className="text-muted-foreground">
                                          Facturado: <span className="font-medium text-green-600">{formatUF(groupedOrder.total_invoices_amount)}</span>
                                        </span>
                                        {statusInfo.totalCreditNotes > 0 && (
                                          <span className="text-muted-foreground">
                                            NC: <span className="font-medium text-blue-600">-{formatUF(statusInfo.totalCreditNotes)}</span>
                                          </span>
                                        )}
                                        <span className="text-muted-foreground">
                                          Pendiente: <span className={`font-medium ${statusInfo.pending < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                            {formatUF(statusInfo.pending)}
                                          </span>
                                        </span>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })()}

                            {/* Contracts breakdown expanded section */}
                            {isContractsExpanded && groupedOrder.is_multi_contract && (
                              <TableRow className="bg-blue-50/30 dark:bg-blue-950/10">
                                <TableCell colSpan={isAdmin ? 11 : 10} className="py-3 px-4">
                                  <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                      <Layers className="h-4 w-4" />
                                      Desglose por Contrato ({groupedOrder.contracts.length} locales)
                                    </p>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Contrato</TableHead>
                                          <TableHead className="text-xs text-right">Monto OC (UF)</TableHead>
                                          <TableHead className="text-xs text-right">Facturado (UF)</TableHead>
                                          <TableHead className="text-xs text-right">% Facturado</TableHead>
                                          <TableHead className="text-xs text-right">Pendiente (UF)</TableHead>
                                          <TableHead className="text-xs">Acciones</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {groupedOrder.orders.map((order) => {
                                          // For multi-contract orders, calculate proportional amounts based on group percentage
                                          // This ensures all lines show the same percentage as the group total
                                          const groupPercentage = statusInfo.percentage;
                                          const proportionalInvoiced = (order.amount_uf * groupPercentage) / 100;
                                          const proportionalPending = order.amount_uf - proportionalInvoiced;
                                          
                                          return (
                                            <TableRow key={order.id}>
                                              <TableCell className="text-sm py-1.5 font-medium">
                                                {order.contract_name}
                                              </TableCell>
                                              <TableCell className="text-sm py-1.5 text-right">
                                                {formatUF(order.amount_uf)}
                                              </TableCell>
                                              <TableCell className="text-sm py-1.5 text-right text-green-600">
                                                {formatUF(proportionalInvoiced)}
                                              </TableCell>
                                              <TableCell className="text-sm py-1.5 text-right">
                                                <Badge 
                                                  variant={groupPercentage >= 100 ? "default" : "outline"}
                                                  className={groupPercentage > 100 ? "bg-red-500" : groupPercentage === 100 ? "bg-blue-500" : ""}
                                                >
                                                  {groupPercentage.toFixed(0)}%
                                                </Badge>
                                              </TableCell>
                                              <TableCell className={`text-sm py-1.5 text-right ${proportionalPending < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                                {formatUF(proportionalPending)}
                                              </TableCell>
                                              <TableCell className="py-1.5">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => navigate(`/contracts/${order.contract_id}?section=ordenes-compra&returnTo=purchase-orders`)}
                                                  className="h-6 px-2 text-xs"
                                                >
                                                  <ExternalLink className="h-3 w-3 mr-1" />
                                                  Ver Local
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="requests">
            {/* OC Requests Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Total Solicitudes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{requestSummary.total}</div>
                  <p className="text-xs text-muted-foreground">{formatUF(requestSummary.totalAmount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Pendientes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">{requestSummary.pending}</div>
                  <p className="text-xs text-muted-foreground">{formatUF(requestSummary.pendingAmount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Convertidas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{requestSummary.converted}</div>
                  <p className="text-xs text-muted-foreground">{formatUF(requestSummary.convertedAmount)}</p>
                </CardContent>
              </Card>
              <Card className="flex items-center justify-center">
                <CardContent className="py-4">
                  <Button onClick={exportRequestsToExcel} variant="outline" className="gap-2" disabled={filteredRequests.length === 0}>
                    <Download className="h-4 w-4" />
                    Exportar Excel
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Status Filter for Requests */}
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por número, descripción o proyecto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={contractFilter} onValueChange={setContractFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Proyecto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los proyectos</SelectItem>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={requestStatusFilter} onValueChange={setRequestStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                      <SelectItem value="converted">Convertidas</SelectItem>
                    </SelectContent>
                  </Select>
                  {isAdmin && selectedRequests.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar ({selectedRequests.size})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Requests Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No se encontraron solicitudes de OC para el año {yearFilter}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isAdmin && <TableHead className="w-[40px]"></TableHead>}
                        <TableHead>Nº Solicitud</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Proyecto</TableHead>
                        <TableHead>Línea</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-right">Monto (UF)</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((req) => {
                        // Detect multi-contract by allocations presence (more robust than flag alone)
                        const isMulti = req.allocations && req.allocations.length > 0;
                        const isMultiExpanded = expandedMultiRequests.has(req.id);

                        return (
                          <>
                            <TableRow 
                              key={req.id}
                              className={isMulti ? "cursor-pointer hover:bg-muted/30" : ""}
                              onClick={() => isMulti && toggleMultiRequest(req.id)}
                            >
                              {isAdmin && (
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedRequests.has(req.id)}
                                    onCheckedChange={() => toggleRequestSelection(req.id)}
                                  />
                                </TableCell>
                              )}
                              <TableCell className="font-medium font-mono text-xs">
                                <div className="flex items-center gap-2">
                                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                  {req.request_number}
                                  {isMulti && (
                                    <Badge variant="outline" className="text-[10px] gap-1">
                                      <Layers className="h-3 w-3" />
                                      Centralizado
                                    </Badge>
                                  )}
                                  {isMulti && (
                                    isMultiExpanded ? 
                                      <ChevronDown className="h-3 w-3 text-muted-foreground" /> : 
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(parseISO(req.request_date), "dd MMM yyyy", { locale: es })}
                              </TableCell>
                              <TableCell className="max-w-[120px] truncate">{req.project_name}</TableCell>
                              <TableCell className="max-w-[120px] truncate">{req.line_name}</TableCell>
                              <TableCell className="max-w-[150px] truncate">{req.description || "-"}</TableCell>
                              <TableCell className="max-w-[100px] truncate">{req.supplier_name || "-"}</TableCell>
                              <TableCell className="text-right font-medium">{formatUF(req.amount_uf)}</TableCell>
                              <TableCell>
                                <Badge variant={req.status === "pending" ? "secondary" : "default"}>
                                  {req.status === "pending" ? "Pendiente" : "Convertida"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {req.status === "pending" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditRequest(req.id)}
                                        className="h-7 px-2"
                                        title="Editar solicitud"
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => handleConvertRequest(req)}
                                        className="h-7 px-2 gap-1"
                                        title="Convertir a OC"
                                      >
                                        <ShoppingCart className="h-3 w-3" />
                                        Crear OC
                                      </Button>
                                    </>
                                  )}
                                  {isMulti ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => toggleMultiRequest(req.id)}
                                      className="h-7 px-2 gap-1"
                                      title="Ver contratos asignados"
                                    >
                                      <Layers className="h-3 w-3" />
                                      {isMultiExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => navigate(`/contracts/${req.contract_id}?section=ordenes-compra&returnTo=purchase-orders`)}
                                      className="h-7 px-2"
                                      title="Ver contrato"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* Multi-contract allocations for requests */}
                            {isMulti && isMultiExpanded && (
                              <TableRow className="bg-blue-50/50 dark:bg-blue-950/20">
                                <TableCell colSpan={isAdmin ? 10 : 9} className="py-2 px-4">
                                  <div className="pl-8">
                                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                                      <Layers className="h-4 w-4" />
                                      Asignación por Contrato:
                                    </p>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Contrato</TableHead>
                                          <TableHead className="text-xs text-right">Monto (UF)</TableHead>
                                          <TableHead className="text-xs text-right">Monto (CLP)</TableHead>
                                          <TableHead className="text-xs">Acciones</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {req.allocations?.map((alloc) => (
                                          <TableRow key={alloc.contract_id}>
                                            <TableCell className="text-sm py-1 font-medium">
                                              {alloc.contract_name}
                                            </TableCell>
                                            <TableCell className="text-sm py-1 text-right">
                                              {formatUF(alloc.amount_uf)}
                                            </TableCell>
                                            <TableCell className="text-sm py-1 text-right">
                                              ${Math.round(alloc.amount_clp).toLocaleString("es-CL")}
                                            </TableCell>
                                            <TableCell className="py-1">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigate(`/contracts/${alloc.contract_id}?section=ordenes-compra&returnTo=purchase-orders`);
                                                }}
                                                className="h-6 px-2 text-xs"
                                              >
                                                <ExternalLink className="h-3 w-3 mr-1" />
                                                Ver Contrato
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* First Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar órdenes de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar {selectedOrders.size} orden(es) de compra.
              Esta acción marcará las OC como eliminadas y no serán visibles en los listados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteDialog(false);
                setShowConfirmDeleteDialog(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Delete Confirmation Dialog */}
      <AlertDialog open={showConfirmDeleteDialog} onOpenChange={setShowConfirmDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">Esta es una confirmación final.</span>
              <br /><br />
              Se eliminarán permanentemente {selectedOrders.size} orden(es) de compra.
              <br /><br />
              ¿Estás completamente seguro de que deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Sí, eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Centralized Order Creators */}
      <CentralizedOrderCreator
        open={showRequestCreator}
        onOpenChange={setShowRequestCreator}
        mode="request"
        year={parseInt(yearFilter)}
        ufValue={ufValue}
        onSuccess={loadData}
      />
      <CentralizedOrderCreator
        open={showOrderCreator}
        onOpenChange={setShowOrderCreator}
        mode="order"
        year={parseInt(yearFilter)}
        ufValue={ufValue}
        onSuccess={loadData}
      />

      {/* Edit OC Request Dialog */}
      <OCRequestViewDialog
        open={showEditRequestDialog}
        onOpenChange={setShowEditRequestDialog}
        requestId={editingRequestId}
        formatUF={formatUF}
        onRefresh={loadData}
        readOnly={false}
        ufValue={ufValue}
      />

      {/* Convert OC Request Dialog */}
      <ConvertOCRequestDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        request={convertingRequest}
        ufValue={ufValue}
        formatUF={formatUF}
        onSuccess={loadData}
      />

      {/* Invoice Creation Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Agregar Factura
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrderForInvoice && (
            <div className="space-y-4">
              {/* Order info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">OC:</span>
                  <span className="text-sm font-medium">{selectedOrderForInvoice.order_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Contrato:</span>
                  <span className="text-sm font-medium">{selectedOrderForInvoice.contract_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Monto OC:</span>
                  <span className="text-sm font-bold">{formatUF(selectedOrderForInvoice.amount_uf)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Facturado:</span>
                  <span className="text-sm font-medium text-green-600">{formatUF(selectedOrderForInvoice.invoices_total || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pendiente:</span>
                  <span className="text-sm font-medium text-orange-600">
                    {formatUF((selectedOrderForInvoice.amount_uf || 0) - (selectedOrderForInvoice.invoices_total || 0))}
                  </span>
                </div>
              </div>

              {/* Invoice form */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invoice_number">Número de Factura *</Label>
                  <Input
                    id="invoice_number"
                    placeholder="Ej: 12345"
                    value={newInvoiceData.invoice_number}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, invoice_number: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invoice_date">Fecha de Factura</Label>
                  <Input
                    id="invoice_date"
                    type="date"
                    value={newInvoiceData.invoice_date}
                    onChange={(e) => setNewInvoiceData({ ...newInvoiceData, invoice_date: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice_amount">Monto *</Label>
                    <Input
                      id="invoice_amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newInvoiceData.amount}
                      onChange={(e) => setNewInvoiceData({ ...newInvoiceData, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice_currency">Moneda</Label>
                    <Select
                      value={newInvoiceData.currency}
                      onValueChange={(v) => setNewInvoiceData({ ...newInvoiceData, currency: v as "UF" | "CLP" })}
                    >
                      <SelectTrigger id="invoice_currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UF">UF</SelectItem>
                        <SelectItem value="CLP">CLP ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview converted amount */}
                {newInvoiceData.amount && (
                  <div className="text-xs text-muted-foreground text-right">
                    {newInvoiceData.currency === "UF" ? (
                      <span>≈ ${Math.round(parseFloat(newInvoiceData.amount) * ufValue).toLocaleString("es-CL")} CLP</span>
                    ) : (
                      <span>≈ {(parseFloat(newInvoiceData.amount) / ufValue).toFixed(2)} UF</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)} disabled={creatingInvoice}>
              Cancelar
            </Button>
            <Button onClick={handleSaveInvoice} disabled={creatingInvoice || !newInvoiceData.invoice_number || !newInvoiceData.amount}>
              {creatingInvoice ? "Guardando..." : invoiceMode === "edit" ? "Actualizar Factura" : "Agregar Factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Note Dialog */}
      <Dialog open={showCreditNoteDialog} onOpenChange={setShowCreditNoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Agregar Nota de Crédito
            </DialogTitle>
          </DialogHeader>
          
          {selectedInvoiceForCreditNote && (
            <div className="space-y-4">
              {/* Invoice info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Factura:</span>
                  <span className="text-sm font-medium">{selectedInvoiceForCreditNote.invoice_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Monto Factura:</span>
                  <span className="text-sm font-bold">{formatUF(selectedInvoiceForCreditNote.amount_uf)}</span>
                </div>
              </div>

              {/* Credit note form */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cn_number">Número de Nota de Crédito *</Label>
                  <Input
                    id="cn_number"
                    placeholder="Ej: NC-12345"
                    value={newCreditNoteData.credit_note_number}
                    onChange={(e) => setNewCreditNoteData({ ...newCreditNoteData, credit_note_number: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cn_date">Fecha</Label>
                  <Input
                    id="cn_date"
                    type="date"
                    value={newCreditNoteData.credit_note_date}
                    onChange={(e) => setNewCreditNoteData({ ...newCreditNoteData, credit_note_date: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cn_amount">Monto *</Label>
                    <Input
                      id="cn_amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newCreditNoteData.amount}
                      onChange={(e) => setNewCreditNoteData({ ...newCreditNoteData, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cn_currency">Moneda</Label>
                    <Select
                      value={newCreditNoteData.currency}
                      onValueChange={(v) => setNewCreditNoteData({ ...newCreditNoteData, currency: v as "UF" | "CLP" })}
                    >
                      <SelectTrigger id="cn_currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UF">UF</SelectItem>
                        <SelectItem value="CLP">CLP ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cn_reason">Razón (opcional)</Label>
                  <Input
                    id="cn_reason"
                    placeholder="Motivo de la nota de crédito"
                    value={newCreditNoteData.reason}
                    onChange={(e) => setNewCreditNoteData({ ...newCreditNoteData, reason: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreditNoteDialog(false)} disabled={creatingCreditNote}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateCreditNote} 
              disabled={creatingCreditNote || !newCreditNoteData.credit_note_number || !newCreditNoteData.amount}
            >
              {creatingCreditNote ? "Guardando..." : "Agregar Nota de Crédito"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit OC Dialog */}
      <Dialog open={showEditOCDialog} onOpenChange={setShowEditOCDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Orden de Compra
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="oc_number">Número de OC</Label>
              <Input
                id="oc_number"
                value={editingOCData.order_number}
                onChange={(e) => setEditingOCData({ ...editingOCData, order_number: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="oc_description">Descripción</Label>
              <Input
                id="oc_description"
                value={editingOCData.description}
                onChange={(e) => setEditingOCData({ ...editingOCData, description: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="oc_supplier">Proveedor</Label>
              <Input
                id="oc_supplier"
                value={editingOCData.supplier_name}
                onChange={(e) => setEditingOCData({ ...editingOCData, supplier_name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="oc_date">Fecha</Label>
              <Input
                id="oc_date"
                type="date"
                value={editingOCData.order_date}
                onChange={(e) => setEditingOCData({ ...editingOCData, order_date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="oc_category">Categoría OPEX</Label>
              <Select
                value={editingOCData.opex_category_id || "none"}
                onValueChange={(v) => setEditingOCData({ ...editingOCData, opex_category_id: v === "none" ? null : v })}
              >
                <SelectTrigger id="oc_category">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {opexCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowEditOCDialog(false)} disabled={updatingOC}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateOC} disabled={updatingOC || !editingOCData.order_number}>
              {updatingOC ? "Guardando..." : "Actualizar OC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseOrdersDashboard;
