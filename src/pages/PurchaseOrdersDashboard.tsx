import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SuppliersReturnButton } from "@/components/suppliers/SuppliersReturnButton";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ContractSearchSelect } from "@/components/contracts/ContractSearchSelect";
import { getCompanyNames, CompanyLogo } from "@/components/contracts/CompanyLogo";
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
  Upload,
  Settings,
  FolderOpen,
  Save,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useSecureFileAccess } from "@/hooks/useSecureFileAccess";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { CentralizedOrderCreator } from "@/components/budget/CentralizedOrderCreator";
import { OCRequestViewDialog } from "@/components/budget/OCRequestViewDialog";
import { ConvertOCRequestDialog } from "@/components/budget/ConvertOCRequestDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCLP } from "@/lib/utils";
import { backupOCFileToRepository, uploadFileToMultipleContracts } from "@/lib/repositoryBackup";
import { FolderDestinationPicker } from "@/components/budget/FolderDestinationPicker";
import { Building2, Store } from "lucide-react";
import { useFileDestinationSettings } from "@/hooks/useFileDestinationSettings";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  amount_uf: number;
  amount_clp?: number | null;
  uf_value_at_entry?: number | null;
  reception_status: string;
  attachment_url?: string | null;
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
  amount_clp?: number;
  uf_value_at_entry?: number | null;
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
  invoices_total_clp?: number;
  year?: number;
  is_multi_contract?: boolean;
  allocations?: ContractAllocation[];
  import_batch_id?: string | null;
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
  company_names?: string[];
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
  total_amount_clp: number;
  total_invoices_count: number;
  total_invoices_amount: number;
  total_invoices_clp: number;
  status: string;
  year: number;
  is_multi_contract: boolean;
  is_imported: boolean;
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

type OCSortField = "local" | "order_number" | "description" | "supplier" | "type" | "category" | "amount" | "invoices" | "status" | "date";

const PurchaseOrdersDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { ufValue } = useEconomicIndicators();
  const { openFile, getSecureUrl } = useSecureFileAccess();
  const { settings: fileDestSettings, updateSetting: updateFileDestSetting } = useFileDestinationSettings();

  // File destination settings dialog
  const [showFileDestDialog, setShowFileDestDialog] = useState(false);
  const [tempOCFolder, setTempOCFolder] = useState("");
  const [tempInvoiceFolder, setTempInvoiceFolder] = useState("");
  const [tempPatentFolder, setTempPatentFolder] = useState("");
  const [savingFileDest, setSavingFileDest] = useState(false);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  
  // CAPEX budgets assigned by admin
  const [capexBudgets, setCapexBudgets] = useState<{ contract_id: string; contract_name: string; amount_uf: number; year: number }[]>([]);
  
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
  
  // State for expanded invoice breakdown (shows contract allocation for multi-contract invoices)
  const [expandedInvoiceBreakdown, setExpandedInvoiceBreakdown] = useState<Set<string>>(new Set());

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
    attachment_url: "" as string | null,
  });
  const [editingOCId, setEditingOCId] = useState<string | null>(null);
  const [editingOCContracts, setEditingOCContracts] = useState<{ contract_id: string; contract_name: string; amount_uf: number; amount_clp: number; amount_input: number; currency: "UF" | "CLP"; order_id?: string }[]>([]);
  const [editingOCIsMulti, setEditingOCIsMulti] = useState(false);
  const [updatingOC, setUpdatingOC] = useState(false);
  const [editingOCOriginalOrderNumber, setEditingOCOriginalOrderNumber] = useState<string>("");
  const [editingOCFile, setEditingOCFile] = useState<File | null>(null);
  const editOCFileInputRef = useRef<HTMLInputElement>(null);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<string | null>(null);

  // Credit notes storage
  const [creditNotes, setCreditNotes] = useState<
    Map<
      string,
      {
        id: string;
        credit_note_number: string;
        amount_uf: number;
        amount_clp?: number | null;
        uf_value_at_entry?: number | null;
        invoice_id: string;
      }[]
    >
  >(new Map());

  // URL search params for external navigation (e.g. from suppliers)
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Contract to company mapping
  const [contractCompanyMap, setContractCompanyMap] = useState<Map<string, string>>(new Map());

  // Sorting state for the OC table
  const [sortField, setSortField] = useState<OCSortField>("order_number");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: OCSortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Selection for deletion
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConfirmDeleteDialog, setShowConfirmDeleteDialog] = useState(false);
  /** Distingue qué flujo disparó el diálogo: "orders" o "requests" */
  const [deleteMode, setDeleteMode] = useState<"orders" | "requests">("orders");
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
  }, [user?.id]);

  // Apply supplier filter from URL params (e.g. navigating from Suppliers page)
  useEffect(() => {
    const supplierParam = searchParams.get("supplier");
    if (supplierParam) {
      setSearchTerm(supplierParam);
      // Clean the URL param after applying
      searchParams.delete("supplier");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load contracts
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, name, contract_companies(companies(name))")
        .is("deleted_at", null)
        .order("name");
      setContracts((contractsData || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        company_names: getCompanyNames(c.contract_companies),
      })));

      // Load OPEX categories
      const { data: categoriesData } = await supabase
        .from("opex_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");
      setOpexCategories(categoriesData || []);

      // Load contract-company relationships
      const { data: contractCompaniesData } = await supabase
        .from("contract_companies")
        .select("contract_id, companies(name)");
      
      const companyMap = new Map<string, string>();
      (contractCompaniesData || []).forEach((cc: any) => {
        if (cc.companies?.name) {
          companyMap.set(cc.contract_id, cc.companies.name);
        }
      });
      setContractCompanyMap(companyMap);

      // Load purchase orders with related data and invoices
      const { data: ordersData } = await supabase
        .from("purchase_orders")
        .select(`
          id,
          order_number,
          description,
          amount_uf,
          amount_clp,
          input_currency,
          uf_value_at_entry,
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
          import_batch_id,
          contracts!inner(name),
          budget_lines(name),
          opex_categories(name),
          invoices(id, invoice_number, invoice_date, amount_uf, amount_clp, uf_value_at_entry, reception_status, deleted_at, attachment_url)
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
          invoices_total_clp: validInvoices.reduce((sum: number, inv: any) => {
            const clp = inv.amount_clp ?? (inv.amount_uf || 0) * (inv.uf_value_at_entry || ufValue);
            return sum + clp;
          }, 0),
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

      // Load CAPEX budgets assigned by admin (from contract_budgets table)
      const { data: capexBudgetsData } = await supabase
        .from("contract_budgets")
        .select("contract_id, amount_uf, year, contracts(name)")
        .eq("budget_type", "capex")
        .gt("amount_uf", 0);

      const processedCapexBudgets = (capexBudgetsData || []).map((budget: any) => ({
        contract_id: budget.contract_id,
        contract_name: budget.contracts?.name || "Sin contrato",
        amount_uf: budget.amount_uf || 0,
        year: budget.year,
      }));
      setCapexBudgets(processedCapexBudgets);
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

  // Chart data for CAPEX budgets assigned by admin (from contract_budgets)
  const capexLocalChartData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    // Filter CAPEX budgets by year
    const filtered = capexBudgets.filter(b => b.year === yearNum && b.amount_uf > 0);
    
    return filtered
      .map((budget, index) => ({
        id: budget.contract_id,
        name: budget.contract_name,
        value: budget.amount_uf,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [capexBudgets, yearFilter]);

  // Chart data for OPEX by local
  const opexLocalChartData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      (o.opex_category_id || o.budget_classification === "OPEX")
    );
    
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

  // Chart data for OPEX by category by company
  const opexCategoryByCompanyData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      (o.opex_category_id || o.budget_classification === "OPEX")
    );
    
    // Group by company -> category
    const companyCategories = new Map<string, Map<string, number>>();
    filtered.forEach(order => {
      const companyName = contractCompanyMap.get(order.contract_id) || "Sin empresa";
      const catName = order.opex_category_name || "Sin categoría";
      
      if (!companyCategories.has(companyName)) {
        companyCategories.set(companyName, new Map());
      }
      const catMap = companyCategories.get(companyName)!;
      catMap.set(catName, (catMap.get(catName) || 0) + (order.amount_uf || 0));
    });

    // Flatten for chart
    const result: { id: string; name: string; value: number; company: string; color: string }[] = [];
    let colorIndex = 0;
    companyCategories.forEach((catMap, company) => {
      catMap.forEach((amount, category) => {
        result.push({
          id: `${company}-${category}`,
          name: `${category}`,
          company,
          value: amount,
          color: COLORS[colorIndex % COLORS.length],
        });
        colorIndex++;
      });
    });

    return result.sort((a, b) => b.value - a.value).slice(0, 8);
  }, [orders, yearFilter, contractCompanyMap]);

  // Chart data for CAPEX by category by company (using budget_line as category)
  const capexCategoryByCompanyData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      !o.opex_category_id && 
      o.budget_classification !== "OPEX"
    );
    
    const companyCategories = new Map<string, Map<string, number>>();
    filtered.forEach(order => {
      const companyName = contractCompanyMap.get(order.contract_id) || "Sin empresa";
      const catName = order.budget_line_name || "Sin línea";
      
      if (!companyCategories.has(companyName)) {
        companyCategories.set(companyName, new Map());
      }
      const catMap = companyCategories.get(companyName)!;
      catMap.set(catName, (catMap.get(catName) || 0) + (order.amount_uf || 0));
    });

    const result: { id: string; name: string; value: number; company: string; color: string }[] = [];
    let colorIndex = 0;
    companyCategories.forEach((catMap, company) => {
      catMap.forEach((amount, category) => {
        result.push({
          id: `${company}-${category}`,
          name: `${category}`,
          company,
          value: amount,
          color: COLORS[colorIndex % COLORS.length],
        });
        colorIndex++;
      });
    });

    return result.sort((a, b) => b.value - a.value).slice(0, 8);
  }, [orders, yearFilter, contractCompanyMap]);

  // Chart data for OPEX by company
  const opexByCompanyData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      (o.opex_category_id || o.budget_classification === "OPEX")
    );
    
    const companyAggMap = new Map<string, { name: string; amount: number }>();
    filtered.forEach(order => {
      const companyName = contractCompanyMap.get(order.contract_id) || "Sin empresa";
      const existing = companyAggMap.get(companyName) || { name: companyName, amount: 0 };
      existing.amount += order.amount_uf || 0;
      companyAggMap.set(companyName, existing);
    });

    return Array.from(companyAggMap.entries())
      .map(([id, data], index) => ({
        id,
        name: data.name,
        value: data.amount,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [orders, yearFilter, contractCompanyMap]);

  // Chart data for CAPEX by company
  const capexByCompanyData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const filtered = orders.filter(o => 
      o.year === yearNum && 
      !o.opex_category_id && 
      o.budget_classification !== "OPEX"
    );
    
    const companyAggMap = new Map<string, { name: string; amount: number }>();
    filtered.forEach(order => {
      const companyName = contractCompanyMap.get(order.contract_id) || "Sin empresa";
      const existing = companyAggMap.get(companyName) || { name: companyName, amount: 0 };
      existing.amount += order.amount_uf || 0;
      companyAggMap.set(companyName, existing);
    });

    return Array.from(companyAggMap.entries())
      .map(([id, data], index) => ({
        id,
        name: data.name,
        value: data.amount,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [orders, yearFilter, contractCompanyMap]);

  // Summary calculations
  const summaryData = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    let filtered = orders.filter(o => o.year === yearNum);

    const totalOC = filtered.reduce((sum, o) => sum + (o.amount_uf || 0), 0);
    const totalOCClp = filtered.reduce((sum, o) => sum + (o.amount_clp || Math.round((o.amount_uf || 0) * ufValue)), 0);
    const totalFacturado = filtered.reduce((sum, o) => sum + (o.invoices_total || 0), 0);
    const totalFacturadoClp = filtered.reduce((sum, o) => sum + (o.invoices_total_clp || 0), 0);
    const sinFacturar = totalOC - totalFacturado;
    const sinFacturarClp = totalOCClp - totalFacturadoClp;
    
    // Count unique order numbers (unique OCs)
    const uniqueOrderNumbers = new Set(filtered.map(o => o.order_number));
    
    // Count unique contracts/locales with OCs
    const uniqueContracts = new Set(filtered.map(o => o.contract_id));

    return {
      totalOC,
      totalOCClp,
      totalFacturado,
      totalFacturadoClp,
      sinFacturar,
      sinFacturarClp,
      countOC: uniqueOrderNumbers.size,
      countLocales: uniqueContracts.size,
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
      const totalAmount = ordersList.reduce((sum, o) => {
        if ((o.amount_uf || 0) > 0) return sum + o.amount_uf;
        if ((o.amount_clp || 0) > 0) {
          const rate = (o.uf_value_at_entry || 0) > 0 ? o.uf_value_at_entry! : ufValue;
          if (rate > 0) return sum + (o.amount_clp / rate);
        }
        return sum;
      }, 0);
      const totalAmountClp = ordersList.reduce((sum, o) => sum + (o.amount_clp || Math.round((o.amount_uf || 0) * ufValue)), 0);
      const totalInvoicesCount = ordersList.reduce((sum, o) => sum + (o.invoices_count || 0), 0);
      const totalInvoicesAmount = ordersList.reduce((sum, o) => sum + (o.invoices_total || 0), 0);
      const totalInvoicesClp = ordersList.reduce((sum, o) => sum + (o.invoices_total_clp || 0), 0);
      
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
        total_amount_clp: totalAmountClp,
        total_invoices_count: totalInvoicesCount,
        total_invoices_amount: totalInvoicesAmount,
        total_invoices_clp: totalInvoicesClp,
        status,
        year: firstOrder.year || yearNum,
        is_multi_contract: isMulti,
        is_imported: !!firstOrder.import_batch_id,
        orders: ordersList,
        contracts,
      });
    });

    // Sort based on current sort state
    const dir = sortDirection === "asc" ? 1 : -1;
    return result.sort((a, b) => {
      switch (sortField) {
        case "local": {
          const aName = a.contracts[0]?.contract_name || "";
          const bName = b.contracts[0]?.contract_name || "";
          return dir * aName.localeCompare(bName);
        }
        case "order_number":
          return dir * (a.order_number || "").localeCompare(b.order_number || "");
        case "description":
          return dir * (a.description || "").localeCompare(b.description || "");
        case "supplier":
          return dir * (a.supplier_name || "").localeCompare(b.supplier_name || "");
        case "type":
          return dir * (a.budget_classification || "OPEX").localeCompare(b.budget_classification || "OPEX");
        case "category":
          return dir * (a.opex_category_name || a.budget_line_name || "").localeCompare(b.opex_category_name || b.budget_line_name || "");
        case "amount":
          return dir * (a.total_amount_uf - b.total_amount_uf);
        case "invoices":
          return dir * (a.total_invoices_count - b.total_invoices_count);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "date":
        default: {
          if (!a.order_date && !b.order_date) return 0;
          if (!a.order_date) return 1;
          if (!b.order_date) return -1;
          return dir * a.order_date.localeCompare(b.order_date);
        }
      }
    });
  }, [orders, searchTerm, contractFilter, yearFilter, categoryFilter, classificationFilter, amountFilter, chartContractFilter, chartCategoryFilter, sortField, sortDirection]);

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

  // Filtered OC Requests - hide converted requests except for admin historical view
  const filteredRequests = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed
    
    let filtered = ocRequests.filter(r => r.year === yearNum);

    // For non-admins: always hide converted requests
    // For admins: show converted requests only if within 3 months after year change
    if (!isAdmin) {
      filtered = filtered.filter(r => r.status !== "converted");
    } else {
      // Admin can see converted if:
      // - Current year is the same as request year, OR
      // - Current year is next year AND current month is Jan/Feb/Mar (first 3 months)
      const isHistoricalViewAllowed = 
        yearNum === currentYear || 
        (yearNum === currentYear - 1 && currentMonth < 3);
      
      if (!isHistoricalViewAllowed) {
        // Even admin can't see converted from older years
        filtered = filtered.filter(r => r.status !== "converted");
      }
      // If historical view is allowed, show all including converted
    }

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
  }, [ocRequests, yearFilter, searchTerm, contractFilter, requestStatusFilter, isAdmin]);

  // OC Request summary - only count pending for display (converted are hidden)
  const requestSummary = useMemo(() => {
    const yearNum = parseInt(yearFilter);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    let yearRequests = ocRequests.filter(r => r.year === yearNum);
    
    // Apply same visibility rules as filtered list
    if (!isAdmin) {
      yearRequests = yearRequests.filter(r => r.status !== "converted");
    } else {
      const isHistoricalViewAllowed = 
        yearNum === currentYear || 
        (yearNum === currentYear - 1 && currentMonth < 3);
      if (!isHistoricalViewAllowed) {
        yearRequests = yearRequests.filter(r => r.status !== "converted");
      }
    }
    
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
  }, [ocRequests, yearFilter, isAdmin]);

  // OC PDF Viewer dialog state
  const [showOCViewerDialog, setShowOCViewerDialog] = useState(false);
  const [viewerOCData, setViewerOCData] = useState<{
    order_number: string;
    description: string | null;
    supplier_name: string | null;
    order_date: string;
    budget_classification: string | null;
    opex_category_name: string | null;
    budget_line_name: string | null;
    total_amount_uf: number;
    total_amount_clp: number;
    contracts: { contract_id: string; contract_name: string; amount_uf: number }[];
    attachment_url: string | null;
    pdfUrl: string | null;
  } | null>(null);
  const [loadingViewer, setLoadingViewer] = useState(false);

  const handleOpenOCViewer = async (groupedOrder: GroupedOrder) => {
    setLoadingViewer(true);
    setShowOCViewerDialog(true);

    // Fetch attachment_url from DB
    const orderIds = groupedOrder.orders.map(o => o.id);
    const { data: fullOrders } = await supabase
      .from("purchase_orders")
      .select("id, attachment_url")
      .in("id", orderIds);

    const attachmentUrl = fullOrders?.[0]?.attachment_url || null;
    let pdfUrl: string | null = null;

    if (attachmentUrl) {
      pdfUrl = await getSecureUrl(attachmentUrl);
    }

    setViewerOCData({
      order_number: groupedOrder.order_number,
      description: groupedOrder.description,
      supplier_name: groupedOrder.supplier_name,
      order_date: groupedOrder.order_date,
      budget_classification: groupedOrder.budget_classification,
      opex_category_name: groupedOrder.opex_category_name,
      budget_line_name: groupedOrder.budget_line_name,
      total_amount_uf: groupedOrder.total_amount_uf,
      total_amount_clp: groupedOrder.total_amount_clp || Math.round(groupedOrder.total_amount_uf * ufValue),
      contracts: groupedOrder.contracts,
      attachment_url: attachmentUrl,
      pdfUrl,
    });
    setLoadingViewer(false);
  };

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
  const handleOpenEditOCDialog = async (groupedOrder: GroupedOrder) => {
    setEditingOCId(groupedOrder.orders[0].id);
    setEditingOCOriginalOrderNumber(groupedOrder.order_number);
    setEditingOCFile(null);
    
    // Fetch full order data including amount_clp and attachment_url for each contract
    const orderIds = groupedOrder.orders.map(o => o.id);
    const { data: fullOrders } = await supabase
      .from("purchase_orders")
      .select("id, contract_id, amount_uf, amount_clp, attachment_url")
      .in("id", orderIds);
    
    const firstOrderAttachment = fullOrders?.[0]?.attachment_url || null;
    
    setEditingOCData({
      order_number: groupedOrder.order_number,
      description: groupedOrder.description || "",
      supplier_name: groupedOrder.supplier_name || "",
      order_date: groupedOrder.order_date || "",
      opex_category_id: groupedOrder.orders[0].opex_category_id || "",
      attachment_url: firstOrderAttachment,
    });
    
    const orderClpMap = new Map<string, number>();
    (fullOrders || []).forEach(o => {
      orderClpMap.set(o.contract_id, o.amount_clp || Math.round(o.amount_uf * ufValue));
    });
    
    // Set multi-contract info with CLP as default display currency
    setEditingOCIsMulti(groupedOrder.is_multi_contract);
    setEditingOCContracts(groupedOrder.contracts.map(c => {
      const amountClp = orderClpMap.get(c.contract_id) || Math.round(c.amount_uf * ufValue);
      return {
        contract_id: c.contract_id,
        contract_name: c.contract_name,
        amount_uf: c.amount_uf,
        amount_clp: amountClp,
        amount_input: amountClp, // Default to CLP display
        currency: "CLP" as "UF" | "CLP",
        order_id: c.order_id,
      };
    }));
    setShowEditOCDialog(true);
  };

  // Handle adding a new contract to the edit OC dialog
  const handleAddContractToEditOC = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return;
    
    // Check if contract already exists
    if (editingOCContracts.some(c => c.contract_id === contractId)) {
      toast.error("Este contrato ya está asignado");
      return;
    }
    
    setEditingOCContracts(prev => [...prev, {
      contract_id: contractId,
      contract_name: contract.name,
      amount_uf: 0,
      amount_clp: 0,
      amount_input: 0,
      currency: "CLP" as "UF" | "CLP",
    }]);
  };

  // Handle removing a contract from the edit OC dialog
  const handleRemoveContractFromEditOC = (contractId: string) => {
    if (editingOCContracts.length <= 1) {
      toast.error("Debe haber al menos un contrato asignado");
      return;
    }
    setEditingOCContracts(prev => prev.filter(c => c.contract_id !== contractId));
  };

  // Handle updating a contract amount in the edit OC dialog
  const handleUpdateContractAmountInEditOC = (contractId: string, amount: number) => {
    setEditingOCContracts(prev => prev.map(c => {
      if (c.contract_id !== contractId) return c;
      let newAmountUf: number;
      let newAmountClp: number;
      if (c.currency === "CLP" && ufValue > 0) {
        newAmountClp = Math.round(amount);
        newAmountUf = amount / ufValue;
      } else {
        newAmountUf = amount;
        newAmountClp = Math.round(amount * ufValue);
      }
      return { ...c, amount_input: amount, amount_uf: newAmountUf, amount_clp: newAmountClp };
    }));
  };

  // Handle changing currency for a contract in edit OC dialog
  const handleUpdateContractCurrencyInEditOC = (contractId: string, currency: "UF" | "CLP") => {
    setEditingOCContracts(prev => prev.map(c => {
      if (c.contract_id !== contractId) return c;
      // Convert the current amount_uf to the new currency for display
      let newInputAmount = c.amount_uf;
      if (currency === "CLP" && ufValue > 0) {
        newInputAmount = Math.round(c.amount_uf * ufValue);
      }
      return { ...c, currency, amount_input: newInputAmount };
    }));
  };

  // Handle update OC
  const handleUpdateOC = async () => {
    if (!editingOCId || editingOCContracts.length === 0) return;
    
    // Validate that all contracts have valid amounts
    const invalidContracts = editingOCContracts.filter(c => !c.amount_uf || c.amount_uf <= 0);
    if (invalidContracts.length > 0) {
      toast.error("Todos los contratos deben tener un monto mayor a 0");
      return;
    }
    
    setUpdatingOC(true);
    try {
      // Upload new file to Drive if selected - copy to ALL contracts in multi-contract OC
      let newAttachmentUrl = editingOCData.attachment_url;
      if (editingOCFile && editingOCContracts.length > 0) {
        const contractIds = editingOCContracts.map(c => c.contract_id);
        
        // Use the new function to upload to all contracts at once
        const uploadResult = await uploadFileToMultipleContracts(
          editingOCFile,
          contractIds,
          editingOCData.order_number
        );
        
        if (uploadResult.primaryUrl) {
          newAttachmentUrl = uploadResult.primaryUrl;
          const successCount = uploadResult.successful.length;
          const totalCount = contractIds.length;
          
          if (successCount === totalCount) {
            toast.success(`Archivo subido a ${successCount} contrato${successCount > 1 ? 's' : ''}`);
          } else {
            toast.warning(`Archivo subido a ${successCount} de ${totalCount} contratos`);
          }
        } else {
          // Show more helpful error message
          const firstError = uploadResult.failed[0]?.error || "Error desconocido";
          const isDriveError = firstError.includes("Google Drive") || firstError.includes("sincronizado");
          if (isDriveError) {
            toast.error("Los contratos no tienen Google Drive configurado. Configure Drive en cada contrato antes de subir archivos.", { duration: 6000 });
          } else {
            toast.error(`No se pudo subir el archivo: ${firstError}`);
          }
        }
      }

      // Find all existing orders with the original order_number
      const existingOrders = orders.filter(o => o.order_number === editingOCOriginalOrderNumber);
      const existingContractIds = new Set(existingOrders.map(o => o.contract_id));
      const newContractIds = new Set(editingOCContracts.map(c => c.contract_id));
      
      const contractsToAdd = editingOCContracts.filter(c => !existingContractIds.has(c.contract_id));
      const contractsToUpdate = editingOCContracts.filter(c => existingContractIds.has(c.contract_id));
      const contractsToRemove = existingOrders.filter(o => !newContractIds.has(o.contract_id));
      
      const isMulti = editingOCContracts.length > 1;
      const firstExistingOrder = existingOrders[0];
      
      for (const order of contractsToRemove) {
        if (order.invoices && order.invoices.length > 0) {
          throw new Error(`No se puede eliminar el contrato ${order.contract_name} porque tiene facturas asociadas`);
        }
        await supabase.from("purchase_orders").update({ deleted_at: new Date().toISOString() }).eq("id", order.id);
        await supabase.from("purchase_order_contract_allocations").delete().eq("purchase_order_id", order.id);
      }
      
      for (const contractData of contractsToUpdate) {
        const existingOrder = existingOrders.find(o => o.contract_id === contractData.contract_id);
        if (!existingOrder) continue;
        
        await supabase.from("purchase_orders").update({
          order_number: editingOCData.order_number,
          description: editingOCData.description || null,
          supplier_name: editingOCData.supplier_name || null,
          order_date: editingOCData.order_date || null,
          opex_category_id: editingOCData.opex_category_id || null,
          amount_uf: contractData.amount_uf,
          amount_clp: contractData.amount_clp,
          input_currency: contractData.currency,
          uf_value_at_entry: ufValue,
          is_multi_contract: isMulti,
          attachment_url: newAttachmentUrl,
        }).eq("id", existingOrder.id);
        
        await supabase.from("purchase_order_contract_allocations").upsert({
          purchase_order_id: existingOrder.id,
          contract_id: contractData.contract_id,
          amount_uf: contractData.amount_uf,
          amount_clp: contractData.amount_clp,
        }, { onConflict: "purchase_order_id,contract_id" });
      }
      
      for (const contractData of contractsToAdd) {
        const insertData = {
          order_number: editingOCData.order_number,
          description: editingOCData.description || null,
          supplier_name: editingOCData.supplier_name || null,
          order_date: editingOCData.order_date || null,
          opex_category_id: editingOCData.opex_category_id || null,
          contract_id: contractData.contract_id,
          amount_uf: contractData.amount_uf,
          amount_clp: contractData.amount_clp,
          input_currency: contractData.currency,
          uf_value_at_entry: ufValue,
          year: firstExistingOrder?.year || new Date().getFullYear(),
          budget_classification: (firstExistingOrder?.budget_classification || "OPEX") as "CAPEX" | "OPEX",
          status: "abierta" as const,
          is_multi_contract: isMulti,
          attachment_url: newAttachmentUrl,
        };
        const { data: newOrder, error: insertError } = await supabase.from("purchase_orders").insert(insertData).select().single();

        if (insertError) throw insertError;
        
        if (newOrder) {
          await supabase.from("purchase_order_contract_allocations").insert({
            purchase_order_id: newOrder.id,
            contract_id: contractData.contract_id,
            amount_uf: contractData.amount_uf,
            amount_clp: contractData.amount_clp,
          });
        }
      }

      toast.success("OC actualizada correctamente");
      setShowEditOCDialog(false);
      setEditingOCId(null);
      setEditingOCOriginalOrderNumber("");
      setEditingOCFile(null);
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
    const totalCreditNotesClp = orderCreditNotes.reduce((sum, cn) => {
      const cnClp = cn.amount_clp ?? cn.amount_uf * (cn.uf_value_at_entry ?? ufValue);
      return sum + cnClp;
    }, 0);
    const netInvoiced = groupedOrder.total_invoices_amount - totalCreditNotesAmount;
    const netInvoicedClp = groupedOrder.total_invoices_clp - totalCreditNotesClp;
    const percentage = groupedOrder.total_amount_uf > 0 ? (netInvoiced / groupedOrder.total_amount_uf) * 100 : 0;
    
    let status: "abierta" | "cerrada" | "sobrepasada" = "abierta";
    if (netInvoiced > groupedOrder.total_amount_uf + 0.01) {
      status = "sobrepasada";
    } else if (netInvoiced > 0 && Math.abs(netInvoiced - groupedOrder.total_amount_uf) < 0.01) {
      status = "cerrada";
    }

    return {
      status,
      percentage,
      netInvoiced,
      netInvoicedClp,
      totalCreditNotes: totalCreditNotesAmount,
      totalCreditNotesClp,
      pending: groupedOrder.total_amount_uf - netInvoiced,
      pendingClp: groupedOrder.total_amount_clp - netInvoicedClp,
    };
  };

  const totalOrders = groupedOrdersByNumber.length;
  const totalAmount = groupedOrdersByNumber.reduce(
    (sum, g) => sum + g.total_amount_uf,
    0
  );

  // Handle invoice PDF upload
  const handleInvoiceFileUpload = async (invoiceId: string, file: File, contractId: string) => {
    setUploadingInvoiceId(invoiceId);
    try {
      const { backupInvoiceFileToRepository } = await import("@/lib/repositoryBackup");
      const { sanitizeFileName } = await import("@/lib/fileValidation");

      const sanitized = sanitizeFileName(file.name);
      const result = await backupInvoiceFileToRepository(contractId, file, sanitized);

      if (!result.success) throw new Error(result.error || "Error al subir archivo");

      // Update invoice with the Drive URL (or storage URL as fallback)
      const finalUrl = result.driveUrl || "";
      const { error: dbError } = await supabase
        .from("invoices")
        .update({ attachment_url: finalUrl })
        .eq("id", invoiceId);
      if (dbError) throw dbError;

      toast.success("PDF de factura subido a Drive correctamente");
      loadData();
    } catch (err: any) {
      toast.error("Error al subir archivo: " + (err?.message || "Error desconocido"));
    } finally {
      setUploadingInvoiceId(null);
    }
  };

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
        <div className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                  onClick={() => { setDeleteMode("orders"); setShowDeleteDialog(true); }}
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
              <Button variant="outline" size="sm" onClick={() => navigate("/purchase-orders/bulk-import")}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Carga Masiva de OOCC
              </Button>
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronsUpDown className="h-4 w-4 mr-1" />
                Expandir
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Colapsar
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/suppliers")}>
                <Building2 className="h-4 w-4 mr-1" />
                Proveedores
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTempOCFolder(fileDestSettings.oc_folder);
                    setTempInvoiceFolder(fileDestSettings.invoice_folder);
                    setTempPatentFolder(fileDestSettings.patent_folder);
                    setShowFileDestDialog(true);
                  }}
                >
                  <Settings className="h-4 w-4 mr-1 text-muted-foreground" />
                  Carpetas
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Year Filter */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Año:</span>
          <SearchableSelect
            value={yearFilter}
            onValueChange={setYearFilter}
            options={availableYears.map((year) => ({ value: year.toString(), label: year.toString() }))}
            placeholder="Año"
            triggerClassName="w-[120px]"
          />
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
              <div className="text-2xl font-bold">${Math.round(summaryData.totalOCClp).toLocaleString("es-CL")}</div>
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
              <div className="text-2xl font-bold text-green-600">${Math.round(summaryData.totalFacturadoClp).toLocaleString("es-CL")}</div>
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
              <div className="text-2xl font-bold text-amber-600">${Math.round(summaryData.sinFacturarClp).toLocaleString("es-CL")}</div>
              <p className="text-xs text-muted-foreground">{formatUF(summaryData.sinFacturar)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Interactive Charts - 2 Bar charts in first row, 4 pie charts in second row */}
        <div className="space-y-4">
          {/* Row 1: Bar Charts - CAPEX por Local y OPEX por Local */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar Chart - CAPEX Autorizado por Local */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">CAPEX Autorizado por Local</CardTitle>
              </CardHeader>
              <CardContent>
                {capexLocalChartData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sin presupuesto CAPEX asignado para {yearFilter}</p>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={capexLocalChartData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          type="number" 
                          tickFormatter={(value) => `$${Math.round(value * ufValue).toLocaleString("es-CL")}`}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={90}
                          tick={{ fontSize: 9 }}
                          tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 12)}...` : value}
                        />
                        <Tooltip
                          formatter={(value: number) => [
                            `${formatCLP(value * ufValue)} (${formatUF(value)})`,
                            "Autorizado"
                          ]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="value">
                          {capexLocalChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bar Chart - OPEX por Local */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">OC OPEX por Local</CardTitle>
              </CardHeader>
              <CardContent>
                {opexLocalChartData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sin datos OPEX para {yearFilter}</p>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={opexLocalChartData}
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
                          width={90}
                          tick={{ fontSize: 9 }}
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
                        <Bar dataKey="value">
                          {opexLocalChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Pie Charts - Categoría por Empresa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart - CAPEX por Categoría por Empresa */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CAPEX por Categoría/Empresa</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {capexCategoryByCompanyData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">Sin datos CAPEX</p>
                ) : (
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={capexCategoryByCompanyData}
                          cx="30%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {capexCategoryByCompanyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name, props) => [formatUF(value), `${props.payload.company}: ${name}`]}
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
                          wrapperStyle={{ fontSize: "9px", right: 0 }}
                          formatter={(value, entry: any) => (
                            <span className="text-[9px]">{entry.payload?.company}: {value.length > 10 ? `${value.substring(0, 10)}...` : value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pie Chart - OPEX por Categoría por Empresa */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">OPEX por Categoría/Empresa</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {opexCategoryByCompanyData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">Sin datos OPEX</p>
                ) : (
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={opexCategoryByCompanyData}
                          cx="30%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {opexCategoryByCompanyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name, props) => [formatUF(value), `${props.payload.company}: ${name}`]}
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
                          wrapperStyle={{ fontSize: "9px", right: 0 }}
                          formatter={(value, entry: any) => (
                            <span className="text-[9px]">{entry.payload?.company}: {value.length > 10 ? `${value.substring(0, 10)}...` : value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Pie Charts - Por Empresa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart - CAPEX por Empresa */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CAPEX por Empresa</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {capexByCompanyData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">Sin datos CAPEX</p>
                ) : (
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={capexByCompanyData}
                          cx="30%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {capexByCompanyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
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
                            <span className="text-[10px]">{value}</span>
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
                {opexByCompanyData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">Sin datos OPEX</p>
                ) : (
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={opexByCompanyData}
                          cx="30%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {opexByCompanyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
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
                            <span className="text-[10px]">{value}</span>
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
                  placeholder="Buscar por OC, titulo, local o proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ContractSearchSelect
                value={contractFilter}
                onValueChange={setContractFilter}
                contracts={contracts}
                placeholder="Local"
                showAllOption
                allOptionLabel="Todos los locales"
                allOptionValue="todos"
                triggerClassName="w-[180px]"
              />

              <SearchableSelect
                value={classificationFilter}
                onValueChange={setClassificationFilter}
                options={[
                  { value: "todos", label: "Todos" },
                  { value: "CAPEX", label: "CAPEX" },
                  { value: "OPEX", label: "OPEX" },
                ]}
                placeholder="Tipo"
                triggerClassName="w-[140px]"
              />

              <SearchableSelect
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                options={[
                  { value: "todos", label: "Todas las categorías" },
                  ...opexCategories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                placeholder="Categoría"
                triggerClassName="w-[180px]"
              />

              <SearchableSelect
                value={amountFilter}
                onValueChange={setAmountFilter}
                options={[
                  { value: "todos", label: "Todos los montos" },
                  { value: "0-100", label: "0 - 100 UF" },
                  { value: "100-500", label: "100 - 500 UF" },
                  { value: "500-1000", label: "500 - 1.000 UF" },
                  { value: "1000+", label: "+1.000 UF" },
                ]}
                placeholder="Monto"
                triggerClassName="w-[150px]"
              />

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
                        {([
                          { field: "local" as OCSortField, label: "Local", className: "" },
                          { field: "order_number" as OCSortField, label: "Nº OC", className: "" },
                          { field: "description" as OCSortField, label: "Titulo", className: "" },
                          { field: "supplier" as OCSortField, label: "Proveedor", className: "" },
                          { field: "type" as OCSortField, label: "Tipo", className: "" },
                          { field: "category" as OCSortField, label: "Categoría", className: "" },
                          { field: "amount" as OCSortField, label: "Monto Total", className: "text-right" },
                          { field: "invoices" as OCSortField, label: "Facturas", className: "text-center" },
                          { field: "status" as OCSortField, label: "Estado", className: "" },
                          { field: "date" as OCSortField, label: "Fecha", className: "" },
                        ]).map(col => (
                          <TableHead key={col.field} className={col.className}>
                            <button
                              className="flex items-center gap-1 hover:text-foreground transition-colors w-full"
                              onClick={() => handleSort(col.field)}
                            >
                              {col.label}
                              {sortField === col.field ? (
                                sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                              )}
                            </button>
                          </TableHead>
                        ))}
                        <TableHead className="w-[50px] text-center">Origen</TableHead>
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
                              {/* Local column - first */}
                              <TableCell
                                className="min-w-[200px] cursor-pointer hover:bg-muted/50 transition-colors"
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
                                title="Ver facturas"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <CompanyLogo
                                    companyNames={
                                      groupedOrder.contracts.length === 1
                                        ? [contractCompanyMap.get(groupedOrder.contracts[0].contract_id) || ""].filter(Boolean)
                                        : groupedOrder.contracts.map(c => contractCompanyMap.get(c.contract_id) || "").filter(Boolean)
                                    }
                                    size="sm"
                                  />
                                  <span className="truncate text-sm">
                                    {groupedOrder.contracts.length === 1
                                      ? groupedOrder.contracts[0].contract_name
                                      : groupedOrder.contracts.length > 1
                                      ? `${groupedOrder.contracts.length} Locales`
                                      : "-"}
                                  </span>
                                  {isInvoicesExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                </div>
                              </TableCell>
                              {/* Nº OC column */}
                              <TableCell
                                className="font-medium cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => handleOpenOCViewer(groupedOrder)}
                                title="Ver PDF de OC"
                              >
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
                                <div className="flex flex-col">
                                  {groupedOrder.budget_classification ? (
                                    <Badge
                                      variant={groupedOrder.budget_classification === "CAPEX" ? "default" : "secondary"}
                                    >
                                      {groupedOrder.budget_classification}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">OPEX</Badge>
                                  )}
                                  {groupedOrder.budget_classification === "CAPEX" && !groupedOrder.budget_line_name && (
                                    <span className="text-[10px] text-destructive font-medium">sin línea</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {groupedOrder.opex_category_name || groupedOrder.budget_line_name || "-"}
                              </TableCell>
                              <TableCell
                                className="text-right font-medium cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => {
                                  setExpandedInvoiceSections(prev => {
                                    const next = new Set(prev);
                                    if (next.has(groupedOrder.order_number)) next.delete(groupedOrder.order_number);
                                    else next.add(groupedOrder.order_number);
                                    return next;
                                  });
                                }}
                                title="Ver facturas"
                              >
                                <div className="flex flex-col items-end">
                                  <span>{formatCLP(groupedOrder.total_amount_clp || Math.round(groupedOrder.total_amount_uf * ufValue))}</span>
                                  <span className="text-[10px] text-muted-foreground">{formatUF(groupedOrder.total_amount_uf)}</span>
                                </div>
                              </TableCell>
                              <TableCell
                                className="text-center cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => {
                                  setExpandedInvoiceSections(prev => {
                                    const next = new Set(prev);
                                    if (next.has(groupedOrder.order_number)) next.delete(groupedOrder.order_number);
                                    else next.add(groupedOrder.order_number);
                                    return next;
                                  });
                                }}
                                title="Ver facturas"
                              >
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
                              <TableCell className="text-center">
                                {groupedOrder.is_imported ? (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] px-1.5 font-mono" title="Importada desde Excel">I</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-1.5 font-mono text-muted-foreground" title="Digitada manualmente">D</Badge>
                                )}
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

                              // For multi-contract orders, group invoices by invoice_number
                              const consolidatedInvoices = groupedOrder.is_multi_contract
                                ? (() => {
                                    const invoiceMap = new Map<string, {
                                      invoice_number: string;
                                      invoice_date: string;
                                      total_amount_uf: number;
                                      total_amount_clp: number;
                                      reception_status: string;
                                      contracts: Array<{
                                        id: string;
                                        contract_name: string;
                                        amount_uf: number;
                                        amount_clp: number;
                                        order_id: string;
                                      }>;
                                      // Keep first invoice for operations
                                      firstInvoice: typeof allInvoices[0];
                                      allInvoiceIds: string[];
                                    }>();
                                    
                                    allInvoices.forEach(inv => {
                                      const invAmountClp =
                                        inv.amount_clp ??
                                        inv.amount_uf * (inv.uf_value_at_entry ?? ufValue);

                                      const existing = invoiceMap.get(inv.invoice_number);
                                      if (existing) {
                                        existing.total_amount_uf += inv.amount_uf;
                                        existing.total_amount_clp += invAmountClp;
                                        existing.contracts.push({
                                          id: inv.id,
                                          contract_name: inv.contract_name,
                                          amount_uf: inv.amount_uf,
                                          amount_clp: invAmountClp,
                                          order_id: inv.order_id,
                                        });
                                        existing.allInvoiceIds.push(inv.id);
                                      } else {
                                        invoiceMap.set(inv.invoice_number, {
                                          invoice_number: inv.invoice_number,
                                          invoice_date: inv.invoice_date,
                                          total_amount_uf: inv.amount_uf,
                                          total_amount_clp: invAmountClp,
                                          reception_status: inv.reception_status,
                                          contracts: [{
                                            id: inv.id,
                                            contract_name: inv.contract_name,
                                            amount_uf: inv.amount_uf,
                                            amount_clp: invAmountClp,
                                            order_id: inv.order_id,
                                          }],
                                          firstInvoice: inv,
                                          allInvoiceIds: [inv.id],
                                        });
                                      }
                                    });
                                    
                                    return Array.from(invoiceMap.values());
                                  })()
                                : null;

                              // Helper function for toggling invoice expansion using component-level state
                              const toggleInvoiceBreakdownExpand = (orderNumber: string, invoiceNumber: string) => {
                                const key = `${orderNumber}::${invoiceNumber}`;
                                setExpandedInvoiceBreakdown(prev => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              };

                              // Count unique invoices for display
                              const uniqueInvoiceCount = consolidatedInvoices?.length || allInvoices.length;

                              return (
                                <TableRow className="bg-green-50/30 dark:bg-green-950/10">
                                  <TableCell colSpan={isAdmin ? 11 : 10} className="py-3 px-4">
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                          <Receipt className="h-4 w-4" />
                                          Facturas y Notas de Crédito ({uniqueInvoiceCount})
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs gap-1"
                                            onClick={() => handleOpenInvoiceDialogForGroup(groupedOrder)}
                                          >
                                            <Receipt className="h-3.5 w-3.5" />
                                            + Agregar Factura
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs gap-1"
                                            onClick={() => handleOpenCreditNoteDialog(null, groupedOrder)}
                                          >
                                            <CreditCard className="h-3.5 w-3.5" />
                                            + Agregar Nota de Crédito
                                          </Button>
                                        </div>
                                      </div>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            {groupedOrder.is_multi_contract && <TableHead className="text-xs w-8"></TableHead>}
                                            <TableHead className="text-xs">Nº Factura</TableHead>
                                            <TableHead className="text-xs">Fecha</TableHead>
                                            <TableHead className="text-xs text-right">Monto Total (UF)</TableHead>
                                            {groupedOrder.is_multi_contract && <TableHead className="text-xs text-center">Contratos</TableHead>}
                                            <TableHead className="text-xs">Notas Crédito</TableHead>
                                            <TableHead className="text-xs">Estado</TableHead>
                                            <TableHead className="text-xs">Acciones</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {groupedOrder.is_multi_contract && consolidatedInvoices ? (
                                            // Multi-contract: show consolidated invoices
                                            consolidatedInvoices.map((consolidated) => {
                                              const invoiceKey = `${groupedOrder.order_number}::${consolidated.invoice_number}`;
                                              const isExpanded = expandedInvoiceBreakdown.has(invoiceKey);
                                              // Get all credit notes for all invoices in this group
                                              const invoiceCreditNotes = allCreditNotes.filter(cn => 
                                                consolidated.allInvoiceIds.includes(cn.invoice_id)
                                              );
                                              // Consolidate credit notes by number
                                              const creditNoteMap = new Map<
                                                string,
                                                { number: string; total_uf: number; total_clp: number; ids: string[] }
                                              >();
                                              invoiceCreditNotes.forEach(cn => {
                                                const cnAmountClp =
                                                  cn.amount_clp ??
                                                  cn.amount_uf * (cn.uf_value_at_entry ?? ufValue);

                                                const existing = creditNoteMap.get(cn.credit_note_number);
                                                if (existing) {
                                                  existing.total_uf += cn.amount_uf;
                                                  existing.total_clp += cnAmountClp;
                                                  existing.ids.push(cn.id);
                                                } else {
                                                  creditNoteMap.set(cn.credit_note_number, {
                                                    number: cn.credit_note_number,
                                                    total_uf: cn.amount_uf,
                                                    total_clp: cnAmountClp,
                                                    ids: [cn.id],
                                                  });
                                                }
                                              });
                                              const consolidatedCreditNotes = Array.from(creditNoteMap.values());
                                              const creditNotesTotalCLP = consolidatedCreditNotes.reduce((sum, cn) => sum + cn.total_clp, 0);
                                              
                                              return (
                                                <React.Fragment key={consolidated.invoice_number}>
                                                  <TableRow className="hover:bg-muted/30">
                                                    <TableCell className="p-0 w-8">
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => toggleInvoiceBreakdownExpand(groupedOrder.order_number, consolidated.invoice_number)}
                                                      >
                                                        {isExpanded ? (
                                                          <ChevronDown className="h-3 w-3" />
                                                        ) : (
                                                          <ChevronRight className="h-3 w-3" />
                                                        )}
                                                      </Button>
                                                    </TableCell>
                                                    <TableCell className="text-sm py-1.5">
                                                      <div className="flex items-center gap-2">
                                                        <Receipt className="h-3 w-3 text-primary" />
                                                        {consolidated.invoice_number}
                                                      </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm py-1.5">
                                                      {format(parseISO(consolidated.invoice_date), "dd MMM yyyy", { locale: es })}
                                                    </TableCell>
                                                    <TableCell className="text-sm py-1.5 text-right">
                                                      <div className="font-medium">{formatCLP(consolidated.total_amount_clp)}</div>
                                                      <div className="text-xs text-muted-foreground">{formatUF(consolidated.total_amount_uf)}</div>
                                                    </TableCell>
                                                    <TableCell className="text-sm py-1.5 text-center">
                                                      <Badge variant="outline" className="text-xs">
                                                        {consolidated.contracts.length} locales
                                                      </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-1.5">
                                                      {consolidatedCreditNotes.length > 0 ? (
                                                        <div className="space-y-1">
                                                          {consolidatedCreditNotes.map((cn) => (
                                                            <div key={cn.number} className="flex items-center gap-1">
                                                              <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                                                                NC {cn.number}: -{formatCLP(cn.total_clp)}
                                                              </Badge>
                                                              <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-5 w-5 p-0 text-destructive"
                                                                onClick={async () => {
                                                                  // Delete all related credit notes
                                                                  for (const id of cn.ids) {
                                                                    await handleDeleteCreditNote(id);
                                                                  }
                                                                }}
                                                              >
                                                                <Trash2 className="h-3 w-3" />
                                                              </Button>
                                                            </div>
                                                          ))}
                                                          <p className="text-xs text-muted-foreground">
                                                            Neto: {formatCLP(consolidated.total_amount_clp - creditNotesTotalCLP)}
                                                          </p>
                                                        </div>
                                                      ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                      )}
                                                    </TableCell>
                                                    <TableCell className="py-1.5">
                                                      <Badge
                                                        variant={consolidated.reception_status === "recibido" ? "default" : "secondary"}
                                                        className="text-xs"
                                                      >
                                                        {consolidated.reception_status}
                                                      </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-1.5">
                                                      <div className="flex items-center gap-1">
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={() => handleOpenCreditNoteDialog(consolidated.firstInvoice, groupedOrder)}
                                                          className="h-6 px-1.5"
                                                          title="Agregar Nota de Crédito"
                                                        >
                                                          <CreditCard className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={() => handleEditInvoice(consolidated.firstInvoice, groupedOrder)}
                                                          className="h-6 px-1.5"
                                                          title="Editar Factura"
                                                        >
                                                          <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={async () => {
                                                            // Delete all related invoices
                                                            for (const id of consolidated.allInvoiceIds) {
                                                              await handleDeleteInvoice(id);
                                                            }
                                                          }}
                                                          className="h-6 px-1.5 text-destructive"
                                                          title="Eliminar Factura"
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                      </div>
                                                    </TableCell>
                                                  </TableRow>
                                                  {/* Contract breakdown when expanded */}
                                                  {isExpanded && (
                                                    <TableRow className="bg-muted/20">
                                                      <TableCell colSpan={8} className="py-2 px-6">
                                                        <div className="text-xs space-y-1">
                                                          <p className="font-medium text-muted-foreground mb-2">Desglose por Contrato:</p>
                                                          <div className="grid grid-cols-2 gap-2">
                                                            {consolidated.contracts.map((contract) => (
                                                              <div key={contract.id} className="flex justify-between items-center p-2 bg-background rounded border">
                                                                <span className="font-medium">{contract.contract_name}</span>
                                                                <span className="text-primary">{formatCLP(contract.amount_clp)}</span>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      </TableCell>
                                                    </TableRow>
                                                  )}
                                                </React.Fragment>
                                              );
                                            })
                                          ) : (
                                            // Single-contract: show invoices normally
                                            allInvoices.map((invoice) => {
                                              const invoiceCreditNotes = allCreditNotes.filter(cn => cn.invoice_id === invoice.id);
                                              const creditNotesTotalCLP = invoiceCreditNotes.reduce((sum, cn) => {
                                                const cnAmountClp =
                                                  cn.amount_clp ??
                                                  cn.amount_uf * (cn.uf_value_at_entry ?? ufValue);
                                                return sum + cnAmountClp;
                                              }, 0);

                                              const invoiceAmountCLP =
                                                invoice.amount_clp ??
                                                invoice.amount_uf * (invoice.uf_value_at_entry ?? ufValue);
                                              
                                              return (
                                                <TableRow key={invoice.id}>
                                                  <TableCell className="text-sm py-1.5">
                                                    <div className="flex items-center gap-2">
                                                      <Receipt className="h-3 w-3 text-primary" />
                                                      {invoice.invoice_number}
                                                    </div>
                                                  </TableCell>
                                                  <TableCell className="text-sm py-1.5">
                                                    {format(parseISO(invoice.invoice_date), "dd MMM yyyy", { locale: es })}
                                                  </TableCell>
                                                  <TableCell className="text-sm py-1.5 text-right">
                                                    <div className="font-medium">{formatCLP(invoiceAmountCLP)}</div>
                                                    <div className="text-xs text-muted-foreground">{formatUF(invoice.amount_uf)}</div>
                                                  </TableCell>
                                                  <TableCell className="py-1.5">
                                                    {invoiceCreditNotes.length > 0 ? (
                                                      <div className="space-y-1">
                                                        {invoiceCreditNotes.map((cn) => (
                                                          <div key={cn.id} className="flex items-center gap-1">
                                                            <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                                                              NC {cn.credit_note_number}: -{formatCLP(
                                                                cn.amount_clp ?? cn.amount_uf * (cn.uf_value_at_entry ?? ufValue)
                                                              )}
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
                                                          Neto: {formatCLP(invoiceAmountCLP - creditNotesTotalCLP)}
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
                                                      {/* Upload / View PDF */}
                                                      {invoice.attachment_url ? (
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={() => void openFile(invoice.attachment_url!)}
                                                          className="h-6 px-1.5"
                                                          title="Ver PDF de factura"
                                                        >
                                                          <FileText className="h-3 w-3 text-emerald-600" />
                                                        </Button>
                                                      ) : (
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={() => {
                                                            const input = document.createElement("input");
                                                            input.type = "file";
                                                            input.accept = ".pdf";
                                                            input.onchange = (e) => {
                                                              const file = (e.target as HTMLInputElement).files?.[0];
                                                              if (file) {
                                                                const order = groupedOrder.orders[0];
                                                                handleInvoiceFileUpload(invoice.id, file, order.contract_id);
                                                              }
                                                            };
                                                            input.click();
                                                          }}
                                                          className="h-6 px-1.5"
                                                          title="Subir PDF de factura"
                                                          disabled={uploadingInvoiceId === invoice.id}
                                                        >
                                                          {uploadingInvoiceId === invoice.id ? (
                                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                                          ) : (
                                                            <Upload className="h-3 w-3 text-blue-500" />
                                                          )}
                                                        </Button>
                                                      )}
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
                                            })
                                          )}
                                        </TableBody>
                                      </Table>
                                      {/* Summary */}
                                      <div className="flex items-center gap-4 text-sm pt-2 border-t">
                                        <span className="text-muted-foreground">
                                          Total OC: <span className="font-medium text-foreground">{formatCLP(groupedOrder.total_amount_clp)}</span>
                                        </span>
                                        <span className="text-muted-foreground">
                                          Facturado: <span className="font-medium text-green-600">{formatCLP(statusInfo.netInvoicedClp + statusInfo.totalCreditNotesClp)}</span>
                                        </span>
                                        {statusInfo.totalCreditNotes > 0 && (
                                          <span className="text-muted-foreground">
                                            NC: <span className="font-medium text-blue-600">-{formatCLP(statusInfo.totalCreditNotesClp)}</span>
                                          </span>
                                        )}
                                        <span className="text-muted-foreground">
                                          Pendiente: <span className={`font-medium ${statusInfo.pending < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                            {formatCLP(statusInfo.pendingClp)}
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
                                          <TableHead className="text-xs text-right">Monto OC</TableHead>
                                          <TableHead className="text-xs text-right">Facturado</TableHead>
                                          <TableHead className="text-xs text-right">% Facturado</TableHead>
                                          <TableHead className="text-xs text-right">Pendiente</TableHead>
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
                                          // Use stored CLP amount, not recalculated
                                          const orderAmountClp = order.amount_clp || Math.round(order.amount_uf * ufValue);
                                          // Calculate invoiced/pending CLP proportionally from stored CLP
                                          const invoicedClp = Math.round((orderAmountClp * groupPercentage) / 100);
                                          const pendingClp = orderAmountClp - invoicedClp;
                                          
                                          return (
                                            <TableRow key={order.id}>
                                              <TableCell className="text-sm py-1.5 font-medium">
                                                {order.contract_name}
                                              </TableCell>
                                              <TableCell className="text-sm py-1.5 text-right">
                                                <div className="flex flex-col items-end">
                                                  <span>{formatCLP(orderAmountClp)}</span>
                                                  <span className="text-[10px] text-muted-foreground">{formatUF(order.amount_uf)}</span>
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-sm py-1.5 text-right text-green-600">
                                                <div className="flex flex-col items-end">
                                                  <span>{formatCLP(invoicedClp)}</span>
                                                  <span className="text-[10px] text-muted-foreground">{formatUF(proportionalInvoiced)}</span>
                                                </div>
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
                                                <div className="flex flex-col items-end">
                                                  <span>{formatCLP(pendingClp)}</span>
                                                  <span className="text-[10px] text-muted-foreground">{formatUF(proportionalPending)}</span>
                                                </div>
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
                      placeholder="Buscar por número, titulo o proyecto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <ContractSearchSelect
                    value={contractFilter}
                    onValueChange={setContractFilter}
                    contracts={contracts}
                    placeholder="Proyecto"
                    showAllOption
                    allOptionLabel="Todos los proyectos"
                    allOptionValue="todos"
                    triggerClassName="w-[180px]"
                  />
                  <SearchableSelect
                    value={requestStatusFilter}
                    onValueChange={setRequestStatusFilter}
                    options={[
                      { value: "todos", label: "Todos" },
                      { value: "pending", label: "Pendientes" },
                      { value: "converted", label: "Convertidas" },
                    ]}
                    placeholder="Estado"
                    triggerClassName="w-[140px]"
                  />
                  {isAdmin && selectedRequests.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { setDeleteMode("requests"); setShowDeleteDialog(true); }}
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
                        <TableHead>Titulo</TableHead>
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
      {/* First confirmation — diferencia órdenes vs solicitudes */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteMode === "requests"
                ? "¿Eliminar solicitudes de OC?"
                : "¿Eliminar órdenes de compra?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "requests" ? (
                <>
                  Estás a punto de eliminar{" "}
                  <strong>{selectedRequests.size} solicitud(es) de OC</strong>.
                  Esta acción no se puede deshacer.
                </>
              ) : (
                <>
                  Estás a punto de eliminar{" "}
                  <strong>{selectedOrders.size} orden(es) de compra</strong>.
                  Esta acción marcará las OC como eliminadas y no serán visibles en los listados.
                </>
              )}
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
              {deleteMode === "requests" ? (
                <>Se eliminarán permanentemente <strong>{selectedRequests.size} solicitud(es) de OC</strong>.</>
              ) : (
                <>Se eliminarán permanentemente <strong>{selectedOrders.size} orden(es) de compra</strong>.</>
              )}
              <br /><br />
              ¿Estás completamente seguro de que deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteMode === "requests" ? handleDeleteSelectedRequests : handleDeleteSelected}
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
        <DialogContent className={cn(
          // NOTE: `h-[90vh]` (not only `max-h`) is required so the internal ScrollArea
          // gets a real height to scroll within.
          "overflow-hidden",
          "h-[90vh] max-h-[90vh] flex flex-col",
          editingOCContracts.length > 0 ? "sm:max-w-2xl" : "sm:max-w-md"
        )}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Orden de Compra
              {editingOCIsMulti && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Layers className="h-3 w-3" />
                  Centralizado
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/*
            NOTE: Radix ScrollArea can fail to scroll if the layout/height chain breaks.
            For this dialog we use a plain overflow container to guarantee scroll.
          */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <div className="space-y-4 pb-4 pr-2">
            <div className="space-y-1.5">
              <Label htmlFor="oc_number">Número de OC</Label>
              <Input
                id="oc_number"
                value={editingOCData.order_number}
                onChange={(e) => setEditingOCData({ ...editingOCData, order_number: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="oc_description">Titulo</Label>
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

            {/* Only show OPEX category selector for OPEX orders (not CAPEX) */}
            {(() => {
              const firstOrder = orders.find(o => o.order_number === editingOCOriginalOrderNumber);
              const isCAPEX = firstOrder?.budget_classification === "CAPEX";
              if (isCAPEX) return null;
              return (
                <div className="space-y-1.5">
                  <Label htmlFor="oc_category">Categoría OPEX</Label>
                  <SearchableSelect
                    value={editingOCData.opex_category_id || "none"}
                    onValueChange={(v) => setEditingOCData({ ...editingOCData, opex_category_id: v === "none" ? null : v })}
                    options={[
                      { value: "none", label: "Sin categoría" },
                      ...opexCategories.map((cat) => ({ value: cat.id, label: cat.name })),
                    ]}
                    placeholder="Seleccionar categoría"
                  />
                </div>
              );
            })()}

            {/* OC File upload */}
            <div className="space-y-1.5">
              <Label>Archivo OC (PDF)</Label>
              <input
                ref={editOCFileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Validate file
                    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
                      toast.error("Solo se permiten archivos PDF");
                      return;
                    }
                    setEditingOCFile(file);
                  }
                }}
              />
              
              {/* Show existing file if present and no new file selected */}
              {editingOCData.attachment_url && !editingOCFile && (
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => void openFile(editingOCData.attachment_url)}
                    className="text-sm text-primary hover:underline flex-1 truncate text-left"
                  >
                    Ver archivo adjunto
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => editOCFileInputRef.current?.click()}
                  >
                    Reemplazar
                  </Button>
                </div>
              )}
              
              {/* Show new file selected */}
              {editingOCFile && (
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <FileText className="h-4 w-4 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{editingOCFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(editingOCFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingOCFile(null);
                      if (editOCFileInputRef.current) editOCFileInputRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              {/* Upload button if no file */}
              {!editingOCData.attachment_url && !editingOCFile && (
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  onClick={() => editOCFileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click para subir archivo OC (PDF)
                  </p>
                </div>
              )}
            </div>

            {/* Contract allocations - editable */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Contratos asignados ({editingOCContracts.length})
                  {editingOCContracts.length === 1 && (
                    <span className="text-muted-foreground font-normal flex items-center gap-1.5">
                      —
                      <CompanyLogo
                        companyNames={[contractCompanyMap.get(editingOCContracts[0].contract_id) || ""].filter(Boolean)}
                        size="sm"
                      />
                      {editingOCContracts[0].contract_name}
                    </span>
                  )}
                  {editingOCContracts.length > 1 && (
                    <Badge variant="outline" className="text-xs">Multi-contrato</Badge>
                  )}
                </Label>
              </div>
              
              {/* Add contract selector */}
              <div className="flex gap-2">
                <ContractSearchSelect
                  value=""
                  onValueChange={(v) => handleAddContractToEditOC(v)}
                  contracts={contracts.filter(c => !editingOCContracts.some(ec => ec.contract_id === c.id))}
                  placeholder="Agregar contrato..."
                  triggerClassName="flex-1"
                />
              </div>

              {/* Contracts table */}
              {editingOCContracts.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-[250px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Contrato</TableHead>
                        <TableHead className="text-xs w-[80px]">Moneda</TableHead>
                        <TableHead className="text-xs text-right w-[130px]">Monto</TableHead>
                        <TableHead className="text-xs text-right w-[100px]">Equiv. UF</TableHead>
                        <TableHead className="text-xs w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingOCContracts.map((c) => (
                        <TableRow key={c.contract_id}>
                          <TableCell className="py-2 text-sm font-medium">{c.contract_name}</TableCell>
                          <TableCell className="py-1.5">
                            <Select
                              value={c.currency}
                              onValueChange={(v) => handleUpdateContractCurrencyInEditOC(c.contract_id, v as "UF" | "CLP")}
                            >
                              <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UF">UF</SelectItem>
                                <SelectItem value="CLP">$</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Input
                              type="number"
                              step={c.currency === "UF" ? "0.01" : "1"}
                              min="0"
                              value={c.amount_input || ""}
                              onChange={(e) => handleUpdateContractAmountInEditOC(c.contract_id, parseFloat(e.target.value) || 0)}
                              className="h-8 text-right font-mono text-sm"
                            />
                          </TableCell>
                          <TableCell className="py-1.5 text-right text-sm font-mono text-muted-foreground">
                            {c.currency === "CLP" ? (
                              c.amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            ) : (
                              <span className="text-foreground">{c.amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveContractFromEditOC(c.contract_id)}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              disabled={editingOCContracts.length <= 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* Total */}
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-muted-foreground">Total:</span>
                <div className="text-right">
                  <div className="font-bold font-mono">
                    $ {editingOCContracts.reduce((sum, c) => sum + (c.amount_clp || Math.round((c.amount_uf || 0) * ufValue)), 0).toLocaleString("es-CL")}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {editingOCContracts.reduce((sum, c) => sum + (c.amount_uf || 0), 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowEditOCDialog(false)} disabled={updatingOC}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateOC} disabled={updatingOC || !editingOCData.order_number}>
              {updatingOC ? "Guardando..." : "Actualizar OC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* File Destination Settings Dialog */}
      <Dialog open={showFileDestDialog} onOpenChange={setShowFileDestDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-blue-500" />
              Carpetas de Destino
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Configure en qué carpeta del repositorio de cada contrato se almacenarán automáticamente los archivos. 
              Esto no impide que los archivos también se guarden en otra ubicación.
            </p>
            <div className="space-y-4">
              <FolderDestinationPicker
                icon={<ShoppingCart className="h-4 w-4 text-indigo-500" />}
                label="Archivos de OC"
                description="Carpeta donde se guardarán los PDFs de las Órdenes de Compra"
                value={tempOCFolder}
                onChange={setTempOCFolder}
              />
              <FolderDestinationPicker
                icon={<Receipt className="h-4 w-4 text-emerald-500" />}
                label="Archivos de Facturas y Notas de Crédito"
                description="Carpeta donde se guardarán los archivos de facturas y notas de crédito"
                value={tempInvoiceFolder}
                onChange={setTempInvoiceFolder}
              />
              <FolderDestinationPicker
                icon={<FileText className="h-4 w-4 text-orange-500" />}
                label="Archivos de Patentes"
                description="Carpetas donde se guardarán los documentos de patentes"
                value={tempPatentFolder}
                onChange={setTempPatentFolder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFileDestDialog(false)} disabled={savingFileDest}>
              Cancelar
            </Button>
            <Button
              disabled={savingFileDest || !tempOCFolder.trim() || !tempInvoiceFolder.trim()}

              onClick={async () => {
                setSavingFileDest(true);
                try {
                  await updateFileDestSetting("oc_folder", tempOCFolder.trim());
                  await updateFileDestSetting("invoice_folder", tempInvoiceFolder.trim());
                  await updateFileDestSetting("patent_folder", tempPatentFolder.trim());
                  toast.success("Configuración de carpetas actualizada");
                  setShowFileDestDialog(false);
                } catch (err: any) {
                  toast.error("Error al guardar: " + (err?.message || "Error desconocido"));
                } finally {
                  setSavingFileDest(false);
                }
              }}
            >
              {savingFileDest ? "Guardando..." : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OC PDF Viewer Dialog */}
      <Dialog open={showOCViewerDialog} onOpenChange={(open) => { if (!open) { setShowOCViewerDialog(false); setViewerOCData(null); } }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <span>OC {viewerOCData?.order_number}</span>
              {viewerOCData?.budget_classification && (
                <Badge variant={viewerOCData.budget_classification === "CAPEX" ? "default" : "secondary"}>
                  {viewerOCData.budget_classification}
                </Badge>
              )}
            </DialogTitle>
            {viewerOCData && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground pt-1">
                {viewerOCData.supplier_name && (
                  <span>Proveedor: <span className="text-foreground font-medium">{viewerOCData.supplier_name}</span></span>
                )}
                {viewerOCData.order_date && (
                  <span>Fecha: <span className="text-foreground font-medium">{format(parseISO(viewerOCData.order_date), "dd/MM/yyyy", { locale: es })}</span></span>
                )}
                <span>Monto: <span className="text-foreground font-medium font-mono">{formatCLP(viewerOCData.total_amount_clp)} ({formatUF(viewerOCData.total_amount_uf)})</span></span>
                {viewerOCData.contracts.length === 1 && (
                  <span className="flex items-center gap-1.5">
                    Local:
                    <CompanyLogo
                      companyNames={[contractCompanyMap.get(viewerOCData.contracts[0].contract_id) || ""].filter(Boolean)}
                      size="sm"
                    />
                    <span className="text-foreground font-medium">{viewerOCData.contracts[0].contract_name}</span>
                  </span>
                )}
              </div>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-0 p-4">
            {loadingViewer ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : viewerOCData?.pdfUrl ? (
              <iframe
                src={viewerOCData.pdfUrl}
                className="w-full h-full rounded-lg border"
                title={`PDF OC ${viewerOCData.order_number}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <FileText className="h-16 w-16 opacity-20" />
                <p className="text-lg">Esta OC no tiene un PDF adjunto</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowOCViewerDialog(false);
                    if (viewerOCData) {
                      const go = groupedOrdersByNumber.find(g => g.order_number === viewerOCData.order_number);
                      if (go) handleOpenEditOCDialog(go);
                    }
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar OC para adjuntar PDF
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SuppliersReturnButton />
    </div>
  );
};

export default PurchaseOrdersDashboard;
