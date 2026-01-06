import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Search, ArrowLeft, Trash2, ArrowUpDown, X, Cloud, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { ContractsTable } from "@/components/contracts/ContractsTable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface ContractVersion {
  id: string;
  regime_rent: number;
  duration_months: number;
  is_current: boolean;
  effective_date: string | null;
  notice_type: string;
  notice_value: string;

  // GGCC - UF/m2 methodology
  gastos_comunes_uf_m2: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  adicional_administracion_percentage?: number | null;
  has_extended_gastos_comunes?: boolean | null;

  // GGCC - Percentage methodology
  gastos_comunes_methodology?: string | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: string | null;

  // Other items
  fondo_promocion_percentage: number | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;

  notice_ranges?: Array<{ start_month: number; end_month: number }>;
}

interface TerminationNotice {
  id: string;
  notice_type: string;
  notice_date: string;
  document_url: string | null;
}

interface Contract {
  id: string;
  name: string;
  status: string;
  created_at: string;
  signed_date: string | null;
  operation_status: string | null;
  obra_status: string | null;
  patente_status: string | null;
  is_expired_but_operating: boolean | null;
  display_currency: string | null;
  contract_addresses: Array<{ region: string; commune: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
  superficie_terreno: number | null;
  metros_lineales_frente?: number | null;
  termination_notices?: TerminationNotice[];
}

type SortField = "end_date" | "notice_deadline" | "name" | null;
type SortDirection = "asc" | "desc";

const Contracts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "todos";
  const { user, loading: authLoading, roleLoaded } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters
  const [operationFilter, setOperationFilter] = useState<string>("todos");
  const [obraFilter, setObraFilter] = useState<string>("todos");
  const [patenteFilter, setPatenteFilter] = useState<string>("todos");
  const [proyectoFilter, setProyectoFilter] = useState<string>("todos");
  const [ubicacionFilter, setUbicacionFilter] = useState<string>("todos");
  const [costoArriendoFilter, setCostoArriendoFilter] = useState<string>("todos");

  // Sorting
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      loadContracts();
    }
  }, [user]);

  useEffect(() => {
    filterAndSortContracts();
  }, [searchTerm, statusFilter, contracts, operationFilter, obraFilter, patenteFilter, proyectoFilter, ubicacionFilter, costoArriendoFilter, sortField, sortDirection]);

  const loadContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_addresses (region, commune),
        contract_versions (
          id,
          regime_rent,
          duration_months,
          is_current,
          effective_date,
          notice_type,
          notice_value,
          gastos_comunes_methodology,
          gastos_comunes_percentage,
          gastos_comunes_total_centro,
          gastos_comunes_tope,
          gastos_comunes_tope_type,
          gastos_comunes_uf_m2,
          gastos_comunes_uf_ml_frente,
          gastos_comunes_prorrata_kwh_clima,
          fondo_promocion_percentage,
          adicional_administracion_percentage,
          has_extended_gastos_comunes,
          otros_egresos_amount,
          otros_egresos_description,
          notice_ranges:notice_ranges(start_month, end_month)
        ),
        termination_notices (id, notice_type, notice_date, document_url)
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    setContracts(data || []);
  };

  const calculateEndDate = (contract: Contract): Date | null => {
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion) return null;

    const startDate = currentVersion.effective_date 
      ? parseISO(currentVersion.effective_date)
      : contract.signed_date 
        ? parseISO(contract.signed_date)
        : null;

    if (!startDate) return null;
    return addMonths(startDate, currentVersion.duration_months);
  };

  const calculateNoticeDeadline = (contract: Contract): Date | null => {
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion) return null;

    const startDate = currentVersion.effective_date
      ? parseISO(currentVersion.effective_date)
      : contract.signed_date
        ? parseISO(contract.signed_date)
        : null;

    if (currentVersion.notice_type === "fecha" && currentVersion.notice_value) {
      return parseISO(currentVersion.notice_value);
    }

    if (currentVersion.notice_type === "rangos" && startDate) {
      const noticeRanges = currentVersion.notice_ranges || [];
      if (noticeRanges.length > 0) {
        const today = new Date();
        const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
        
        for (const range of sortedRanges) {
          const rangeStartDate = addMonths(startDate, range.start_month - 1);
          if (rangeStartDate > today) {
            return rangeStartDate;
          }
        }
        
        // If all ranges are expired, use the last one
        if (sortedRanges.length > 0) {
          const lastRange = sortedRanges[sortedRanges.length - 1];
          return addMonths(startDate, lastRange.start_month - 1);
        }
      }
    }

    const endDate = calculateEndDate(contract);
    if (!endDate) return null;

    const noticeMonths = parseInt(currentVersion.notice_value) || 0;
    return subMonths(endDate, noticeMonths);
  };

  const filterAndSortContracts = () => {
    let filtered = contracts;

    // Text search
    if (searchTerm) {
      filtered = filtered.filter((contract) =>
        contract.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter - special handling for "firmado" to include expired but operating
    if (statusFilter !== "todos") {
      if (statusFilter === "firmado") {
        // Show firmado contracts AND vencido contracts that are still operating
        filtered = filtered.filter((contract) => 
          contract.status === "firmado" || 
          (contract.status === "vencido" && contract.is_expired_but_operating)
        );
      } else if (statusFilter === "vencido") {
        // Only show vencido contracts that are NOT operating (fully expired)
        filtered = filtered.filter((contract) => 
          contract.status === "vencido" && !contract.is_expired_but_operating
        );
      } else {
        filtered = filtered.filter((contract) => contract.status === statusFilter);
      }
    }

    // Operation status filter
    if (operationFilter !== "todos") {
      filtered = filtered.filter((contract) => contract.operation_status === operationFilter);
    }

    // Obra filter
    if (obraFilter !== "todos") {
      filtered = filtered.filter((contract) => contract.obra_status === obraFilter);
    }

    // Patente filter
    if (patenteFilter !== "todos") {
      filtered = filtered.filter((contract) => contract.patente_status === patenteFilter);
    }

    // Proyecto filter
    if (proyectoFilter !== "todos") {
      filtered = filtered.filter((contract) => (contract as any).proyecto_status === proyectoFilter);
    }

    // Ubicación filter
    if (ubicacionFilter !== "todos") {
      filtered = filtered.filter((contract) => {
        const address = contract.contract_addresses?.[0];
        return address?.commune === ubicacionFilter;
      });
    }

    // Costo Arriendo filter
    if (costoArriendoFilter !== "todos") {
      filtered = filtered.filter((contract) => {
        const currentVersion = contract.contract_versions?.find((v) => v.is_current);
        if (!currentVersion) return false;
        const superficie = contract.superficie_edificada_local || 0;
        const metrosFrente = contract.metros_lineales_frente || 0;
        const hasExtended = currentVersion.has_extended_gastos_comunes ?? false;
        const methodology = currentVersion.gastos_comunes_methodology || "uf_m2";

        let gastosComunes = 0;

        if (methodology === "percentage") {
          const totalCentro = currentVersion.gastos_comunes_total_centro || 0;
          const percentage = currentVersion.gastos_comunes_percentage || 0;
          const topeValue = currentVersion.gastos_comunes_tope;
          const topeType = currentVersion.gastos_comunes_tope_type || "fixed";

          const calculatedAmount = (totalCentro * percentage) / 100;

          if (topeValue && topeValue > 0) {
            const effectiveTope = topeType === "uf_m2" && superficie > 0 ? topeValue * superficie : topeValue;
            gastosComunes = Math.min(calculatedAmount, effectiveTope);
          } else {
            gastosComunes = calculatedAmount;
          }
        } else {
          const gastosM2 = (currentVersion.gastos_comunes_uf_m2 || 0) * superficie;
          const gastosMlFrente = hasExtended
            ? (currentVersion.gastos_comunes_uf_ml_frente || 0) * metrosFrente
            : 0;
          const gastosKwhClima = hasExtended ? (currentVersion.gastos_comunes_prorrata_kwh_clima || 0) : 0;
          const adicionalAdmin = hasExtended
            ? currentVersion.regime_rent * ((currentVersion.adicional_administracion_percentage || 0) / 100)
            : 0;

          gastosComunes = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdmin;
        }

        const fondoPromocion = currentVersion.regime_rent * ((currentVersion.fondo_promocion_percentage || 0) / 100);
        const otrosEgresos = currentVersion.otros_egresos_amount || 0;
        const total = currentVersion.regime_rent + gastosComunes + fondoPromocion + otrosEgresos;
        
        switch (costoArriendoFilter) {
          case "0-500": return total <= 500;
          case "500-1000": return total > 500 && total <= 1000;
          case "1000-2000": return total > 1000 && total <= 2000;
          case "2000+": return total > 2000;
          default: return true;
        }
      });
    }

        // Sorting
        if (sortField) {
          filtered = [...filtered].sort((a, b) => {
            if (sortField === "name") {
              const nameA = a.name?.toLowerCase() || "";
              const nameB = b.name?.toLowerCase() || "";
              const comparison = nameA.localeCompare(nameB, "es");
              return sortDirection === "asc" ? comparison : -comparison;
            }

            let valueA: Date | null = null;
            let valueB: Date | null = null;

            if (sortField === "end_date") {
              valueA = calculateEndDate(a);
              valueB = calculateEndDate(b);
            } else if (sortField === "notice_deadline") {
              valueA = calculateNoticeDeadline(a);
              valueB = calculateNoticeDeadline(b);
            }

            if (!valueA && !valueB) return 0;
            if (!valueA) return sortDirection === "asc" ? 1 : -1;
            if (!valueB) return sortDirection === "asc" ? -1 : 1;

        const comparison = valueA.getTime() - valueB.getTime();
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    setFilteredContracts(filtered);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const clearFilters = () => {
    setOperationFilter("todos");
    setObraFilter("todos");
    setPatenteFilter("todos");
    setProyectoFilter("todos");
    setUbicacionFilter("todos");
    setCostoArriendoFilter("todos");
    setSortField(null);
    setSortDirection("asc");
    setSearchTerm("");
  };

  const hasActiveFilters = operationFilter !== "todos" || obraFilter !== "todos" || patenteFilter !== "todos" || proyectoFilter !== "todos" || ubicacionFilter !== "todos" || costoArriendoFilter !== "todos" || sortField !== null;

  // Get unique communes for ubicacion filter
  const uniqueCommunes = [...new Set(contracts.flatMap(c => c.contract_addresses?.map(a => a.commune) || []))].filter(Boolean).sort();

  const handleDeleteClick = (e: React.MouseEvent, contract: Contract) => {
    e.stopPropagation();
    setContractToDelete(contract);
    setDeleteDialogOpen(true);
  };

  const handleFirstConfirm = () => {
    setDeleteDialogOpen(false);
    setConfirmDeleteDialogOpen(true);
  };

  const handleFinalDelete = async () => {
    if (!contractToDelete) return;

    const { error } = await supabase
      .from("contracts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", contractToDelete.id);

    if (error) {
      toast.error("Error al eliminar el contrato");
    } else {
      toast.success("Contrato movido a Elementos Eliminados");
      loadContracts();
    }

    setConfirmDeleteDialogOpen(false);
    setContractToDelete(null);
  };

  const updateContractField = async (
    e: React.MouseEvent,
    contractId: string,
    field: string,
    value: string
  ) => {
    e.stopPropagation();
    const { error } = await supabase
      .from("contracts")
      .update({ [field]: value })
      .eq("id", contractId);

    if (error) {
      toast.error("Error al actualizar");
    } else {
      loadContracts();
    }
  };

  const handleSyncAllToDrive = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-drive', {
        body: { action: 'syncAllContracts' }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Sincronización completada`, {
          description: `${data.syncedCount} contratos sincronizados con Google Drive`
        });
        loadContracts();
      }
    } catch (error: any) {
      console.error('Error syncing to Drive:', error);
      toast.error('Error al sincronizar con Google Drive', {
        description: error.message || 'Verifica la configuración de la cuenta de servicio'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-yellow-500 text-white" },
      firmado: { label: "Vigente", className: "bg-green-500 text-white" },
      vencido: { label: "Vencido", className: "bg-red-500 text-white" },
    };

    const statusInfo = statusMap[status] || { label: status, className: "" };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  const formatUF = (amount: number) => {
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  const getPageTitle = () => {
    switch (statusFilter) {
      case "firmado":
        return "Contratos Vigentes";
      case "en_negociacion":
        return "Contratos en Negociación";
      case "vencido":
        return "Contratos Vencidos";
      default:
        return "Todos los Contratos";
    }
  };

  const operationLabels: Record<string, string> = {
    operando: "Operando",
    cerrado: "Cerrado",
  };

  const obraLabels: Record<string, string> = {
    terminada: "Terminada",
    construccion: "Construcción",
    remodelacion: "Remodelación",
    ampliacion: "Ampliación",
  };

  const patenteLabels: Record<string, string> = {
    sin_patente: "Sin Patente",
    provisoria: "Provisoria",
    definitiva: "Definitiva",
  };

  const proyectoLabels: Record<string, string> = {
    sin_proyecto: "Sin Proyecto",
    en_curso: "Proyecto en Curso",
  };

  if (authLoading || !roleLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isFirmadoView = statusFilter === "firmado";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">{getPageTitle()}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredContracts.length} contratos encontrados
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleSyncAllToDrive}
              disabled={isSyncing}
              className="gap-2"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4" />
                  Sincronizar con Drive
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {/* Search and Filters */}
        <Card className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {isFirmadoView && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {/* Operation Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Operación</span>
                  <Select value={operationFilter} onValueChange={setOperationFilter}>
                    <SelectTrigger className="h-8 text-xs w-[110px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                      <SelectItem value="operando" className="text-xs">Operando</SelectItem>
                      <SelectItem value="cerrado" className="text-xs">Cerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Obra Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Obra</span>
                  <Select value={obraFilter} onValueChange={setObraFilter}>
                    <SelectTrigger className="h-8 text-xs w-[110px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                      <SelectItem value="terminada" className="text-xs">Terminada</SelectItem>
                      <SelectItem value="construccion" className="text-xs">Construcción</SelectItem>
                      <SelectItem value="remodelacion" className="text-xs">Remodelación</SelectItem>
                      <SelectItem value="ampliacion" className="text-xs">Ampliación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Patente Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Patente</span>
                  <Select value={patenteFilter} onValueChange={setPatenteFilter}>
                    <SelectTrigger className="h-8 text-xs w-[110px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                      <SelectItem value="sin_patente" className="text-xs">Sin Patente</SelectItem>
                      <SelectItem value="provisoria" className="text-xs">Provisoria</SelectItem>
                      <SelectItem value="definitiva" className="text-xs">Definitiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Proyecto Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Proyecto</span>
                  <Select value={proyectoFilter} onValueChange={setProyectoFilter}>
                    <SelectTrigger className="h-8 text-xs w-[110px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                      <SelectItem value="sin_proyecto" className="text-xs">Sin Proyecto</SelectItem>
                      <SelectItem value="en_curso" className="text-xs">En Curso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Ubicación Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Ubicación</span>
                  <Select value={ubicacionFilter} onValueChange={setUbicacionFilter}>
                    <SelectTrigger className="h-8 text-xs w-[120px]">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todas</SelectItem>
                      {uniqueCommunes.map((commune) => (
                        <SelectItem key={commune} value={commune} className="text-xs">{commune}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Costo Arriendo Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Costo Arriendo</span>
                  <Select value={costoArriendoFilter} onValueChange={setCostoArriendoFilter}>
                    <SelectTrigger className="h-8 text-xs w-[130px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                      <SelectItem value="0-500" className="text-xs">Hasta 500 UF</SelectItem>
                      <SelectItem value="500-1000" className="text-xs">500 - 1.000 UF</SelectItem>
                      <SelectItem value="1000-2000" className="text-xs">1.000 - 2.000 UF</SelectItem>
                      <SelectItem value="2000+" className="text-xs">Más de 2.000 UF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort by End Date */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Ordenar</span>
                  <Button
                    variant={sortField === "end_date" ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => handleSort("end_date")}
                  >
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Vencimiento {sortField === "end_date" && (sortDirection === "asc" ? "↑" : "↓")}
                  </Button>
                </div>

                {/* Sort by Notice Deadline */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground invisible">Ordenar</span>
                  <Button
                    variant={sortField === "notice_deadline" ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => handleSort("notice_deadline")}
                  >
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Aviso {sortField === "notice_deadline" && (sortDirection === "asc" ? "↑" : "↓")}
                  </Button>
                </div>

                {/* Sort by Name */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground invisible">Ordenar</span>
                  <Button
                    variant={sortField === "name" ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => handleSort("name")}
                  >
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Nombre {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                  </Button>
                </div>
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <X className="h-4 w-4 mr-1" />
                  Limpiar filtros
                </Button>
              )}
            </>
          )}
        </Card>

        {filteredContracts.length > 0 ? (
          <ContractsTable
            contracts={filteredContracts}
            isFirmadoView={isFirmadoView}
            onDelete={handleDeleteClick}
            onUpdateField={updateContractField}
            onRefresh={loadContracts}
          />
        ) : (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <p>No se encontraron contratos</p>
              <Button
                variant="link"
                className="mt-2"
                onClick={() => navigate("/contracts/new")}
              >
                Crear primer contrato
              </Button>
            </div>
          </Card>
        )}
      </main>

      {/* First confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el contrato "{contractToDelete?.name}".
              El contrato será movido a Elementos Eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFirstConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second confirmation dialog */}
      <AlertDialog open={confirmDeleteDialogOpen} onOpenChange={setConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar "{contractToDelete?.name}"?
              Esta acción moverá el contrato a Elementos Eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Contracts;