import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { Search, ArrowLeft, Trash2, ArrowUpDown, X, Cloud, Loader2, ExternalLink, AlertTriangle, Download } from "lucide-react";
import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { ContractsTable, ContractSortField } from "@/components/contracts/ContractsTable";
import { ColumnSelector } from "@/components/contracts/ColumnSelector";
import { ContractRowSelector } from "@/components/contracts/ContractRowSelector";
import { generateContractsListPDF, getAvailableColumns } from "@/components/contracts/ContractsTablePDF";
import { ColumnWidthsManager } from "@/components/contracts/ColumnWidthsManager";
import { SortOrder } from "@/components/contracts/SortableTableHead";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useContractColumnWidths, DEFAULT_COLUMN_WIDTHS } from "@/hooks/useContractColumnWidths";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface RentEscalation {
  id: string;
  month_number: number;
  amount: number;
}

interface ContractVersion {
  id: string;
  regime_rent: number;
  regime_rent_is_uf_m2?: boolean | null;
  initial_rent?: number | null;
  initial_rent_is_uf_m2?: boolean | null;
  grace_months?: number | null;
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

  // Periodic adjustments
  has_periodic_adjustments?: boolean | null;
  adjustment_type?: string | null;
  adjustment_value?: number | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;

  // Other items
  fondo_promocion_percentage: number | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;

  notice_ranges?: Array<{ start_month: number; end_month: number }>;
  rent_escalations?: RentEscalation[];
}

interface TerminationNotice {
  id: string;
  notice_type: string;
  notice_date: string;
  required_exit_date: string | null;
  document_url: string | null;
}

interface ContractCompany {
  company_id: string;
  companies: { id: string; name: string } | null;
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
  requires_special_attention: boolean | null;
  special_attention_reason: string | null;
  negotiation_subcategory: string | null;
  venta_estimada: number | null;
  clasificacion?: string | null;
  contract_companies: ContractCompany[];
  contract_addresses: Array<{ region: string; commune: string; street?: string; number?: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
  superficie_terreno: number | null;
  metros_lineales_frente?: number | null;
  termination_notices?: TerminationNotice[];
}

interface Company {
  id: string;
  name: string;
}

type SortDirection = "asc" | "desc";

const Contracts = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "todos";
  const { user, loading: authLoading, roleLoaded, isAdmin } = useAuth();
  const { ufValue } = useEconomicIndicators();
  const { columnWidths, updateColumnWidth, resetToDefaults } = useContractColumnWidths();

  useEffect(() => {
    // Remember last contracts list URL so the detail "Volver" can restore filters even after refresh
    sessionStorage.setItem("contracts:lastListUrl", `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Read filters from URL params
  const searchTerm = searchParams.get("search") || "";
  const operationFilter = searchParams.get("operation") || "todos";
  const obraFilter = searchParams.get("obra") || "todos";
  const patenteFilter = searchParams.get("patente") || "todos";
  const proyectoFilter = searchParams.get("proyecto") || "todos";
  const ubicacionFilter = searchParams.get("ubicacion") || "todos";
  const costoArriendoFilter = searchParams.get("costo") || "todos";
  const companyFilter = searchParams.get("company") || "todos";
  const atencionEspecialFilter = searchParams.get("atencion_especial") === "true" ? "si" : (searchParams.get("atencion_especial") === "false" ? "no" : "todos");
  const negotiationSubcategoryFilter = searchParams.get("subcategory") || "todos";
  const sortField = (searchParams.get("sort") as ContractSortField) || null;
  const sortDirection = (searchParams.get("dir") as SortDirection) || "asc";

  // NOTE: using window.location.search avoids stale `searchParams` closures
  // when users change multiple filters one after another.
  const getFreshParams = () => new URLSearchParams(window.location.search);

  // Helper to update a single filter in URL
  const updateFilter = (key: string, value: string) => {
    const newParams = getFreshParams();
    if (value === "todos" || value === "" || (value as any) === null) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams, { replace: true });
  };

  const setNegotiationSubcategoryFilter = (value: string) => updateFilter("subcategory", value);

  const setSearchTerm = (value: string) => updateFilter("search", value);
  const setOperationFilter = (value: string) => updateFilter("operation", value);
  const setObraFilter = (value: string) => updateFilter("obra", value);
  const setPatenteFilter = (value: string) => updateFilter("patente", value);
  const setProyectoFilter = (value: string) => updateFilter("proyecto", value);
  const setUbicacionFilter = (value: string) => updateFilter("ubicacion", value);
  const setCostoArriendoFilter = (value: string) => updateFilter("costo", value);
  const setCompanyFilter = (value: string) => updateFilter("company", value);
  const setAtencionEspecialFilter = (value: string) => {
    const newParams = getFreshParams();
    if (value === "si") {
      newParams.set("atencion_especial", "true");
    } else if (value === "no") {
      newParams.set("atencion_especial", "false");
    } else {
      newParams.delete("atencion_especial");
    }
    setSearchParams(newParams, { replace: true });
  };

  const setSortField = (field: ContractSortField) => {
    const newParams = getFreshParams();
    if (field === null) {
      newParams.delete("sort");
      newParams.delete("dir");
    } else {
      newParams.set("sort", field);
    }
    setSearchParams(newParams, { replace: true });
  };

  const setSortDirection = (dir: SortDirection) => {
    const newParams = getFreshParams();
    if (dir === "asc") {
      newParams.delete("dir");
    } else {
      newParams.set("dir", dir);
    }
    setSearchParams(newParams, { replace: true });
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      loadContracts();
      loadCompanies();
    }
  }, [user]);

  const loadCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true });
    setCompanies(data || []);
  };

  useEffect(() => {
    filterAndSortContracts();
  }, [searchTerm, statusFilter, contracts, operationFilter, obraFilter, patenteFilter, proyectoFilter, ubicacionFilter, costoArriendoFilter, companyFilter, atencionEspecialFilter, negotiationSubcategoryFilter, sortField, sortDirection]);

  const loadContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_companies (
          company_id,
          companies (id, name)
        ),
        contract_addresses (region, commune, street, number),
        contract_versions (
          id,
          regime_rent,
          regime_rent_is_uf_m2,
          initial_rent,
          initial_rent_is_uf_m2,
          grace_months,
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
          has_periodic_adjustments,
          adjustment_type,
          adjustment_value,
          first_adjustment_month,
          adjustment_periodicity_months,
          notice_ranges:notice_ranges(start_month, end_month),
          rent_escalations:rent_escalations(id, month_number, amount)
        ),
        termination_notices (id, notice_type, notice_date, required_exit_date, document_url)
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

    // Ubicación filter - buscar en región O comuna
    if (ubicacionFilter !== "todos") {
      filtered = filtered.filter((contract) => {
        const address = contract.contract_addresses?.[0];
        return address?.region === ubicacionFilter || address?.commune === ubicacionFilter;
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

    // Company filter
    if (companyFilter !== "todos") {
      filtered = filtered.filter((contract) => 
        contract.contract_companies?.some(cc => cc.company_id === companyFilter)
      );
    }

    // Atención Especial filter
    if (atencionEspecialFilter !== "todos") {
      filtered = filtered.filter((contract) => {
        const hasSpecialAttention = (contract as any).requires_special_attention === true;
        return atencionEspecialFilter === "si" ? hasSpecialAttention : !hasSpecialAttention;
      });
    }

    // Negotiation subcategory filter (only for en_negociacion)
    if (negotiationSubcategoryFilter !== "todos" && statusFilter === "en_negociacion") {
      filtered = filtered.filter((contract) => 
        (contract as any).negotiation_subcategory === negotiationSubcategoryFilter
      );
    }

    // Sorting
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let comparison = 0;

        // Helper to get company name
        const getCompanyName = (contract: Contract) => {
          const companies = contract.contract_companies?.map(cc => cc.companies?.name).filter(Boolean) || [];
          return companies.join(", ").toLowerCase();
        };

        // Helper to get ubicación
        const getUbicacion = (contract: Contract) => {
          const addr = contract.contract_addresses?.[0];
          if (!addr) return "";
          return `${addr.commune || ""}, ${addr.region || ""}`.toLowerCase();
        };

        // Helper to get costo arriendo
        const getCostoArriendo = (contract: Contract) => {
          const currentVersion = contract.contract_versions?.find((v) => v.is_current);
          if (!currentVersion) return 0;
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
          return currentVersion.regime_rent + gastosComunes + fondoPromocion + otrosEgresos;
        };

        // Helper to get duration
        const getDuracion = (contract: Contract) => {
          const currentVersion = contract.contract_versions?.find((v) => v.is_current);
          return currentVersion?.duration_months || 0;
        };

        // Helper to get aviso (notice value)
        const getAviso = (contract: Contract) => {
          const currentVersion = contract.contract_versions?.find((v) => v.is_current);
          if (!currentVersion) return "";
          return currentVersion.notice_value || "";
        };

        // Helper to get categoria
        const getCategoria = (contract: Contract) => {
          return (contract.negotiation_subcategory || "").toLowerCase();
        };

        // Helper to get venta estimada
        const getVentaEstimada = (contract: Contract) => {
          return contract.venta_estimada || 0;
        };

        switch (sortField) {
          case "name": {
            const nameA = a.name?.toLowerCase() || "";
            const nameB = b.name?.toLowerCase() || "";
            comparison = nameA.localeCompare(nameB, "es");
            break;
          }
          case "empresa": {
            const empresaA = getCompanyName(a);
            const empresaB = getCompanyName(b);
            comparison = empresaA.localeCompare(empresaB, "es");
            break;
          }
          case "ubicacion": {
            const ubicA = getUbicacion(a);
            const ubicB = getUbicacion(b);
            comparison = ubicA.localeCompare(ubicB, "es");
            break;
          }
          case "costo_arriendo": {
            const costoA = getCostoArriendo(a);
            const costoB = getCostoArriendo(b);
            comparison = costoA - costoB;
            break;
          }
          case "duracion": {
            const durA = getDuracion(a);
            const durB = getDuracion(b);
            comparison = durA - durB;
            break;
          }
          case "termino":
          case "end_date": {
            const endA = calculateEndDate(a);
            const endB = calculateEndDate(b);
            if (!endA && !endB) comparison = 0;
            else if (!endA) comparison = 1;
            else if (!endB) comparison = -1;
            else comparison = endA.getTime() - endB.getTime();
            break;
          }
          case "aviso": {
            const avisoA = getAviso(a);
            const avisoB = getAviso(b);
            // Try to compare as numbers first, fall back to string comparison
            const numA = parseInt(avisoA);
            const numB = parseInt(avisoB);
            if (!isNaN(numA) && !isNaN(numB)) {
              comparison = numA - numB;
            } else {
              comparison = avisoA.localeCompare(avisoB, "es");
            }
            break;
          }
          case "notice_deadline": {
            const noticeA = calculateNoticeDeadline(a);
            const noticeB = calculateNoticeDeadline(b);
            if (!noticeA && !noticeB) comparison = 0;
            else if (!noticeA) comparison = 1;
            else if (!noticeB) comparison = -1;
            else comparison = noticeA.getTime() - noticeB.getTime();
            break;
          }
          case "categoria": {
            const catA = getCategoria(a);
            const catB = getCategoria(b);
            comparison = catA.localeCompare(catB, "es");
            break;
          }
          case "clasificacion": {
            const clasifA = (a.clasificacion || "").toLowerCase();
            const clasifB = (b.clasificacion || "").toLowerCase();
            comparison = clasifA.localeCompare(clasifB, "es");
            break;
          }
          case "venta_estimada": {
            const ventaA = getVentaEstimada(a);
            const ventaB = getVentaEstimada(b);
            comparison = ventaA - ventaB;
            break;
          }
          default:
            comparison = 0;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    setFilteredContracts(filtered);
  };

  const handleSort = (field: ContractSortField) => {
    const newParams = new URLSearchParams(window.location.search);
    if (sortField === field) {
      if (sortDirection === "asc") {
        newParams.set("dir", "desc");
      } else {
        newParams.delete("sort");
        newParams.delete("dir");
      }
    } else {
      newParams.set("sort", field as string);
      newParams.delete("dir");
    }
    setSearchParams(newParams, { replace: true });
  };

  const clearFilters = () => {
    // Clear all filter params but keep status if present
    const newParams = new URLSearchParams();
    const status = new URLSearchParams(window.location.search).get("status");
    if (status) {
      newParams.set("status", status);
    }
    setSearchParams(newParams, { replace: true });
  };

  const hasActiveFilters = operationFilter !== "todos" || obraFilter !== "todos" || patenteFilter !== "todos" || proyectoFilter !== "todos" || ubicacionFilter !== "todos" || costoArriendoFilter !== "todos" || companyFilter !== "todos" || atencionEspecialFilter !== "todos" || negotiationSubcategoryFilter !== "todos" || sortField !== null;

  // PDF export state
  const availablePdfColumns = useMemo(() => {
    const isFirmado = statusFilter === "firmado";
    const isNego = statusFilter === "en_negociacion";
    return getAvailableColumns(isFirmado, isNego);
  }, [statusFilter]);
  
  const [selectedPdfColumns, setSelectedPdfColumns] = useState<string[]>([
    "contrato", "empresa", "ubicacion", "costo_arriendo", "duracion"
  ]);
  
  // PDF row exclusion state
  const [excludedPdfContractIds, setExcludedPdfContractIds] = useState<string[]>([]);

  const handleDownloadReport = async () => {
    const isFirmado = statusFilter === "firmado";
    const isNego = statusFilter === "en_negociacion";
    const title = isNego 
      ? "Contratos en Negociación" 
      : isFirmado 
        ? "Contratos Vigentes" 
        : "Lista de Contratos";
    
    // Filter out excluded contracts
    const contractsForPdf = filteredContracts.filter(
      c => !excludedPdfContractIds.includes(c.id)
    );
    
    await generateContractsListPDF(
      contractsForPdf as any, 
      selectedPdfColumns, 
      title, 
      isFirmado, 
      isNego,
      ufValue
    );
  };

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
  const isNegociacionView = statusFilter === "en_negociacion";
  const showAdvancedFilters = statusFilter === "firmado" || statusFilter === "todos";

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
            <div className="flex items-center gap-2">
              {/* PDF Export Group */}
              <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/30">
                <ColumnSelector
                  availableColumns={availablePdfColumns}
                  selectedColumns={selectedPdfColumns}
                  onSelectionChange={setSelectedPdfColumns}
                />
                <ContractRowSelector
                  contracts={filteredContracts.map(c => ({ id: c.id, name: c.name }))}
                  excludedContractIds={excludedPdfContractIds}
                  onExclusionChange={setExcludedPdfContractIds}
                />
                <Button
                  variant="outline"
                  onClick={handleDownloadReport}
                  className="gap-2"
                  size="sm"
                >
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </Button>
              </div>
              {isAdmin && (
                <ColumnWidthsManager
                  columnWidths={columnWidths}
                  onUpdateWidth={updateColumnWidth}
                  onReset={resetToDefaults}
                  visibleColumns={
                    statusFilter === "en_negociacion"
                      ? ["name", "ubicacion", "categoria", "clasificacion", "origen", "venta_estimada", "costo_arriendo", "duracion"]
                      : statusFilter === "firmado"
                        ? ["name", "ubicacion", "costo_arriendo", "duracion", "termino", "aviso", "estado"]
                        : ["name", "ubicacion", "costo_arriendo", "duracion"]
                  }
                />
              )}
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {/* Search and Filters */}
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contratos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Negotiation Subcategory Filter - Only for en_negociacion */}
            {isNegociacionView && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">Categoría</span>
                <Select value={negotiationSubcategoryFilter} onValueChange={setNegotiationSubcategoryFilter}>
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos" className="text-xs">Todas las categorías</SelectItem>
                    <SelectItem value="negociacion_contrato" className="text-xs">Negociación Contrato</SelectItem>
                    <SelectItem value="ubicacion_preliminar" className="text-xs">Ubicación Preliminar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Ubicación Filter - Available for all views */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground">Ubicación</span>
              <Select value={ubicacionFilter} onValueChange={setUbicacionFilter}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
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

            {/* Company Filter - Available for all views */}
            {companies.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">Empresa</span>
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-8 text-xs w-[140px]">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos" className="text-xs">Todas</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id} className="text-xs">{company.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(hasActiveFilters || companyFilter !== "todos") && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-8">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          {showAdvancedFilters && (
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

                {/* Atención Especial Filter */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Atención Especial</span>
                  <Select value={atencionEspecialFilter} onValueChange={setAtencionEspecialFilter}>
                    <SelectTrigger className="h-8 text-xs w-[130px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                      <SelectItem value="si" className="text-xs">
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-orange-500" />
                          Sí
                        </div>
                      </SelectItem>
                      <SelectItem value="no" className="text-xs">No</SelectItem>
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
            sortField={sortField}
            sortOrder={sortDirection as SortOrder}
            onSort={handleSort}
            columnWidths={columnWidths}
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