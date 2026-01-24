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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
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

  // Chart data for categories
  const categoryChartData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => o.year === yearNum && o.opex_category_id);
    
    const categoryMap = new Map<string, { name: string; amount: number }>();
    filtered.forEach(order => {
      if (order.opex_category_id) {
        const existing = categoryMap.get(order.opex_category_id) || { name: order.opex_category_name || "Sin categoría", amount: 0 };
        existing.amount += order.amount_uf || 0;
        categoryMap.set(order.opex_category_id, existing);
      }
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

  // Summary calculations
  const summaryData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    let filtered = orders.filter(o => o.year === yearNum);

    const totalOC = filtered.reduce((sum, o) => sum + (o.amount_uf || 0), 0);
    const totalFacturado = filtered.reduce((sum, o) => sum + (o.invoices_total || 0), 0);
    const sinFacturar = totalOC - totalFacturado;

    return {
      totalOC,
      totalFacturado,
      sinFacturar,
      countOC: filtered.length,
      countFacturas: filtered.reduce((sum, o) => sum + (o.invoices_count || 0), 0),
    };
  }, [orders, yearFilter]);

  // Group orders by contract with all filters
  const groupedOrders = useMemo(() => {
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

    // Group by contract
    const grouped: Record<string, { contract: Contract; orders: PurchaseOrder[] }> = {};
    filtered.forEach((order) => {
      if (!grouped[order.contract_id]) {
        grouped[order.contract_id] = {
          contract: { id: order.contract_id, name: order.contract_name || "Sin contrato" },
          orders: [],
        };
      }
      grouped[order.contract_id].orders.push(order);
    });

    return Object.values(grouped).sort((a, b) => a.contract.name.localeCompare(b.contract.name));
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
    setExpandedContracts(new Set(groupedOrders.map((g) => g.contract.id)));
  };

  const collapseAll = () => {
    setExpandedContracts(new Set());
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

  const totalOrders = groupedOrders.reduce((sum, g) => sum + g.orders.length, 0);
  const totalAmount = groupedOrders.reduce(
    (sum, g) => sum + g.orders.reduce((s, o) => s + (o.amount_uf || 0), 0),
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

        {/* Summary Cards */}
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
              <p className="text-xs text-muted-foreground">{formatUF(summaryData.totalOC)}</p>
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
              <div className="text-2xl font-bold">{formatUF(summaryData.totalOC)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Facturado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatUF(summaryData.totalFacturado)}</div>
              <p className="text-xs text-muted-foreground">{summaryData.countFacturas} facturas</p>
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
              <div className="text-2xl font-bold text-amber-600">{formatUF(summaryData.sinFacturar)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Locales con OC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{groupedOrders.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Interactive Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
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
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={contractChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        onClick={(data) => handleChartClick(data, "contract")}
                        style={{ cursor: "pointer" }}
                      >
                        {contractChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color}
                            opacity={chartContractFilter && chartContractFilter !== entry.id ? 0.3 : 1}
                            stroke={chartContractFilter === entry.id ? "hsl(var(--primary))" : "transparent"}
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
                        }}
                      />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        formatter={(value) => (
                          <span className="text-xs">{value.length > 15 ? `${value.substring(0, 15)}...` : value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>OC por Categoría OPEX</span>
                {chartCategoryFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setChartCategoryFilter(null)}>
                    <X className="h-4 w-4 mr-1" />
                    Limpiar filtro
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categoryChartData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Sin datos OPEX para el año {yearFilter}</p>
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
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
                        }}
                      />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        formatter={(value) => (
                          <span className="text-xs">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
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
              Órdenes de Compra ({summaryData.countOC})
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Solicitudes de OC ({requestSummary.total})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="oc">
            {/* Grouped Orders */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : groupedOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No se encontraron órdenes de compra para el año {yearFilter}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {groupedOrders.map((group) => {
                  const isExpanded = expandedContracts.has(group.contract.id);
                  const groupTotal = group.orders.reduce((sum, o) => sum + (o.amount_uf || 0), 0);
                  const groupInvoiced = group.orders.reduce((sum, o) => sum + (o.invoices_total || 0), 0);
                  const allSelected = group.orders.every((o) => selectedOrders.has(o.id));
                  const someSelected = group.orders.some((o) => selectedOrders.has(o.id));

                  return (
                    <Collapsible
                      key={group.contract.id}
                      open={isExpanded}
                      onOpenChange={() => toggleContract(group.contract.id)}
                    >
                      <Card>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                )}
                                <div>
                                  <CardTitle className="text-base">{group.contract.name}</CardTitle>
                                  <p className="text-sm text-muted-foreground">
                                    {group.orders.length} OC · Total: {formatUF(groupTotal)} · Facturado: {formatUF(groupInvoiced)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/contracts/${group.contract.id}?section=ordenes-compra&returnTo=purchase-orders`);
                                }}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Ver en Local
                              </Button>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0">
                            {isAdmin && (
                              <div className="mb-2 flex items-center gap-2">
                                <Checkbox
                                  checked={allSelected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      selectAllInGroup(group.orders);
                                    } else {
                                      deselectAllInGroup(group.orders);
                                    }
                                  }}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {someSelected ? `${group.orders.filter(o => selectedOrders.has(o.id)).length} seleccionadas` : "Seleccionar todas"}
                                </span>
                              </div>
                            )}
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {isAdmin && <TableHead className="w-[40px]"></TableHead>}
                                  <TableHead>Nº OC</TableHead>
                                  <TableHead>Descripción</TableHead>
                                  <TableHead>Proveedor</TableHead>
                                  <TableHead>Tipo</TableHead>
                                  <TableHead>Categoría</TableHead>
                                  <TableHead className="text-right">Monto (UF)</TableHead>
                                  <TableHead className="text-center">Facturas</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead>Fecha</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.orders.map((order) => {
                                  const hasInvoices = order.invoices && order.invoices.length > 0;
                                  const isOrderExpanded = expandedOrders.has(order.id);
                                  const isMulti = order.is_multi_contract && order.allocations && order.allocations.length > 0;
                                  const isMultiExpanded = expandedMultiOrders.has(order.id);

                                  return (
                                    <>
                                      <TableRow 
                                        key={order.id}
                                        className={hasInvoices || isMulti ? "cursor-pointer hover:bg-muted/30" : ""}
                                        onClick={() => {
                                          if (isMulti) {
                                            toggleMultiOrder(order.id);
                                          } else if (hasInvoices) {
                                            toggleOrderInvoices(order.id);
                                          }
                                        }}
                                      >
                                        {isAdmin && (
                                          <TableCell onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                              checked={selectedOrders.has(order.id)}
                                              onCheckedChange={() => toggleOrderSelection(order.id)}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell className="font-medium">
                                          <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            {order.order_number}
                                            {isMulti && (
                                              <Badge variant="outline" className="text-[10px] gap-1">
                                                <Layers className="h-3 w-3" />
                                                Multi
                                              </Badge>
                                            )}
                                            {(hasInvoices || isMulti) && (
                                              isMultiExpanded || isOrderExpanded ? 
                                                <ChevronDown className="h-3 w-3 text-muted-foreground" /> : 
                                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate">
                                          {order.description || "-"}
                                        </TableCell>
                                        <TableCell className="max-w-[120px] truncate">
                                          {order.supplier_name || "-"}
                                        </TableCell>
                                        <TableCell>
                                          {order.budget_classification ? (
                                            <Badge
                                              variant={order.budget_classification === "CAPEX" ? "default" : "secondary"}
                                            >
                                              {order.budget_classification}
                                            </Badge>
                                          ) : (
                                            "-"
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {order.opex_category_name || order.budget_line_name || "-"}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                          {formatUF(order.amount_uf)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <Receipt className="h-3 w-3 text-muted-foreground" />
                                            <span>{order.invoices_count}</span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge
                                            variant={
                                              order.status === "completada"
                                                ? "default"
                                                : order.status === "pendiente"
                                                ? "secondary"
                                                : "outline"
                                            }
                                          >
                                            {order.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                          {order.order_date ? format(parseISO(order.order_date), "dd MMM yyyy", { locale: es }) : "-"}
                                        </TableCell>
                                      </TableRow>
                                      
                                      {/* Multi-contract allocations */}
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
                                                  {order.allocations?.map((alloc) => (
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

                                      {/* Invoices sub-table */}
                                      {hasInvoices && isOrderExpanded && !isMulti && (
                                        <TableRow className="bg-muted/20">
                                          <TableCell colSpan={isAdmin ? 10 : 9} className="py-2 px-4">
                                            <div className="pl-8">
                                              <p className="text-xs font-medium text-muted-foreground mb-2">Facturas asociadas:</p>
                                              <Table>
                                                <TableHeader>
                                                  <TableRow>
                                                    <TableHead className="text-xs">Nº Factura</TableHead>
                                                    <TableHead className="text-xs">Fecha</TableHead>
                                                    <TableHead className="text-xs text-right">Monto (UF)</TableHead>
                                                    <TableHead className="text-xs">Estado</TableHead>
                                                  </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                  {order.invoices.map((invoice) => (
                                                    <TableRow key={invoice.id}>
                                                      <TableCell className="text-sm py-1">
                                                        <div className="flex items-center gap-2">
                                                          <Receipt className="h-3 w-3 text-primary" />
                                                          {invoice.invoice_number}
                                                        </div>
                                                      </TableCell>
                                                      <TableCell className="text-sm py-1">
                                                        {format(parseISO(invoice.invoice_date), "dd MMM yyyy", { locale: es })}
                                                      </TableCell>
                                                      <TableCell className="text-sm py-1 text-right font-medium">
                                                        {formatUF(invoice.amount_uf)}
                                                      </TableCell>
                                                      <TableCell className="py-1">
                                                        <Badge
                                                          variant={invoice.reception_status === "recibida" ? "default" : "secondary"}
                                                          className="text-xs"
                                                        >
                                                          {invoice.reception_status}
                                                        </Badge>
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
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
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
    </div>
  );
};

export default PurchaseOrdersDashboard;
