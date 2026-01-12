import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  X,
  FileText,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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
  invoices_count?: number;
  invoices_total?: number;
}

interface Contract {
  id: string;
  name: string;
}

interface OpexCategory {
  id: string;
  name: string;
}

const PurchaseOrdersDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [opexCategories, setOpexCategories] = useState<OpexCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [contractFilter, setContractFilter] = useState("todos");
  const [dateFilter, setDateFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [classificationFilter, setClassificationFilter] = useState("todos");
  const [amountFilter, setAmountFilter] = useState("todos");

  // Collapse state per contract
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());

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

      // Load purchase orders with related data
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
          contract_id,
          budget_line_id,
          opex_category_id,
          supplier_name,
          contracts!inner(name),
          budget_lines(name),
          opex_categories(name),
          invoices(id, amount_uf)
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      const processedOrders = (ordersData || []).map((order: any) => ({
        ...order,
        contract_name: order.contracts?.name || "Sin contrato",
        budget_line_name: order.budget_lines?.name || null,
        opex_category_name: order.opex_categories?.name || null,
        invoices_count: order.invoices?.length || 0,
        invoices_total: order.invoices?.reduce((sum: number, inv: any) => sum + (inv.amount_uf || 0), 0) || 0,
      }));

      setOrders(processedOrders);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Group orders by contract
  const groupedOrders = useMemo(() => {
    let filtered = orders;

    // Apply filters
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

    if (dateFilter !== "todos") {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      filtered = filtered.filter((o) => {
        const orderDate = parseISO(o.created_at);
        const orderYear = orderDate.getFullYear();
        const orderMonth = orderDate.getMonth();

        switch (dateFilter) {
          case "este_mes":
            return orderYear === currentYear && orderMonth === currentMonth;
          case "este_año":
            return orderYear === currentYear;
          case "año_anterior":
            return orderYear === currentYear - 1;
          default:
            return true;
        }
      });
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
  }, [orders, searchTerm, contractFilter, dateFilter, categoryFilter, classificationFilter, amountFilter]);

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

  const expandAll = () => {
    setExpandedContracts(new Set(groupedOrders.map((g) => g.contract.id)));
  };

  const collapseAll = () => {
    setExpandedContracts(new Set());
  };

  const clearFilters = () => {
    setSearchTerm("");
    setContractFilter("todos");
    setDateFilter("todos");
    setCategoryFilter("todos");
    setClassificationFilter("todos");
    setAmountFilter("todos");
  };

  const hasActiveFilters =
    searchTerm ||
    contractFilter !== "todos" ||
    dateFilter !== "todos" ||
    categoryFilter !== "todos" ||
    classificationFilter !== "todos" ||
    amountFilter !== "todos";

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
                  Vista consolidada de todas las órdenes de compra
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronsUpDown className="h-4 w-4 mr-1" />
                Expandir Todo
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Colapsar Todo
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total OC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monto Total (UF)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAmount.toLocaleString("es-CL", { minimumFractionDigits: 2 })}</div>
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

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por OC, descripción o local..."
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

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Fecha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las fechas</SelectItem>
                  <SelectItem value="este_mes">Este mes</SelectItem>
                  <SelectItem value="este_año">Este año</SelectItem>
                  <SelectItem value="año_anterior">Año anterior</SelectItem>
                </SelectContent>
              </Select>

              <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">CAPEX/OPEX</SelectItem>
                  <SelectItem value="CAPEX">CAPEX</SelectItem>
                  <SelectItem value="OPEX">OPEX</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las categorías</SelectItem>
                  {opexCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={amountFilter} onValueChange={setAmountFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Monto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los montos</SelectItem>
                  <SelectItem value="0-100">0 - 100 UF</SelectItem>
                  <SelectItem value="100-500">100 - 500 UF</SelectItem>
                  <SelectItem value="500-1000">500 - 1.000 UF</SelectItem>
                  <SelectItem value="1000+">Más de 1.000 UF</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Grouped Orders */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : groupedOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No se encontraron órdenes de compra
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groupedOrders.map((group) => {
              const isExpanded = expandedContracts.has(group.contract.id);
              const groupTotal = group.orders.reduce((sum, o) => sum + (o.amount_uf || 0), 0);

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
                                {group.orders.length} OC · {groupTotal.toLocaleString("es-CL", { minimumFractionDigits: 2 })} UF
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/contracts/${group.contract.id}`);
                            }}
                          >
                            Ver Local
                          </Button>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nº OC</TableHead>
                              <TableHead>Descripción</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Categoría</TableHead>
                              <TableHead className="text-right">Monto (UF)</TableHead>
                              <TableHead className="text-center">Facturas</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Fecha</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.orders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    {order.order_number}
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {order.description || "-"}
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
                                  {order.amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2 })}
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
                                  {format(parseISO(order.created_at), "dd MMM yyyy", { locale: es })}
                                </TableCell>
                              </TableRow>
                            ))}
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
      </main>
    </div>
  );
};

export default PurchaseOrdersDashboard;
