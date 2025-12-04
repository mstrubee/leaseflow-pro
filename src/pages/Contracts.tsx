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
import { Search, ArrowLeft, Trash2, ArrowUpDown, X, Cloud, Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface ContractVersion {
  regime_rent: number;
  duration_months: number;
  is_current: boolean;
  effective_date: string | null;
  notice_type: string;
  notice_value: string;
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
  contract_addresses: Array<{ region: string; commune: string }>;
  contract_versions: ContractVersion[];
}

type SortField = "end_date" | "notice_deadline" | "name" | null;
type SortDirection = "asc" | "desc";

const Contracts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "todos";
  const { user, loading: authLoading } = useAuth();

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
  }, [searchTerm, statusFilter, contracts, operationFilter, obraFilter, patenteFilter, sortField, sortDirection]);

  const loadContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_addresses (region, commune),
        contract_versions (regime_rent, duration_months, is_current, effective_date, notice_type, notice_value)
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

    if (currentVersion.notice_type === "fecha") {
      return parseISO(currentVersion.notice_value);
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

    // Status filter
    if (statusFilter !== "todos") {
      filtered = filtered.filter((contract) => contract.status === statusFilter);
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

    // Sorting
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
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
    setSortField(null);
    setSortDirection("asc");
    setSearchTerm("");
  };

  const hasActiveFilters = operationFilter !== "todos" || obraFilter !== "todos" || patenteFilter !== "todos" || sortField !== null;

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

  if (authLoading) {
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Operation Filter */}
                <Select value={operationFilter} onValueChange={setOperationFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Estado Operación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los Estados</SelectItem>
                    <SelectItem value="operando">Operando</SelectItem>
                    <SelectItem value="cerrado">Cerrado</SelectItem>
                  </SelectContent>
                </Select>

                {/* Obra Filter */}
                <Select value={obraFilter} onValueChange={setObraFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Obra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas las Obras</SelectItem>
                    <SelectItem value="terminada">Terminada</SelectItem>
                    <SelectItem value="construccion">Construcción</SelectItem>
                    <SelectItem value="remodelacion">Remodelación</SelectItem>
                    <SelectItem value="ampliacion">Ampliación</SelectItem>
                  </SelectContent>
                </Select>

                {/* Patente Filter */}
                <Select value={patenteFilter} onValueChange={setPatenteFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Patente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas las Patentes</SelectItem>
                    <SelectItem value="sin_patente">Sin Patente</SelectItem>
                    <SelectItem value="provisoria">Provisoria</SelectItem>
                    <SelectItem value="definitiva">Definitiva</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sort by End Date */}
                <Button
                  variant={sortField === "end_date" ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => handleSort("end_date")}
                >
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Vencimiento {sortField === "end_date" && (sortDirection === "asc" ? "↑" : "↓")}
                </Button>

                {/* Sort by Notice Deadline */}
                <Button
                  variant={sortField === "notice_deadline" ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => handleSort("notice_deadline")}
                >
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Aviso {sortField === "notice_deadline" && (sortDirection === "asc" ? "↑" : "↓")}
                </Button>
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

        <div className="grid gap-4">
          {filteredContracts.map((contract) => {
            const currentVersion = contract.contract_versions?.find((v) => v.is_current);
            const address = contract.contract_addresses?.[0];
            const endDate = calculateEndDate(contract);
            const noticeDeadline = calculateNoticeDeadline(contract);

            return (
              <Card
                key={contract.id}
                className="p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/contracts/${contract.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{contract.name}</h3>
                      {getStatusBadge(contract.status)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Ubicación</p>
                        <p className="font-medium">
                          {address ? `${address.commune}, ${address.region}` : "Sin dirección"}
                        </p>
                      </div>
                      {currentVersion && (
                        <>
                          <div>
                            <p className="text-muted-foreground">Canon de Arriendo</p>
                            <p className="font-medium">
                              {formatUF(currentVersion.regime_rent)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duración</p>
                            <p className="font-medium">{currentVersion.duration_months} meses</p>
                          </div>
                        </>
                      )}
                      {isFirmadoView && (
                        <>
                          <div>
                            <p className="text-muted-foreground">Fecha Término</p>
                            <p className="font-medium">
                              {endDate 
                                ? format(endDate, "dd MMM yyyy", { locale: es })
                                : "Sin definir"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Fecha Tope Aviso</p>
                            <p className={`font-medium ${noticeDeadline && noticeDeadline < new Date() ? "text-destructive" : ""}`}>
                              {noticeDeadline 
                                ? format(noticeDeadline, "dd MMM yyyy", { locale: es })
                                : "Sin definir"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right side - Status selectors for firmado contracts */}
                  {isFirmadoView && (
                    <div className="flex flex-col gap-2 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={contract.operation_status || "operando"}
                        onValueChange={(value) => updateContractField({ stopPropagation: () => {} } as React.MouseEvent, contract.id, "operation_status", value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operando">Operando</SelectItem>
                          <SelectItem value="cerrado">Cerrado</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={contract.obra_status || "terminada"}
                        onValueChange={(value) => updateContractField({ stopPropagation: () => {} } as React.MouseEvent, contract.id, "obra_status", value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="terminada">Obra: Terminada</SelectItem>
                          <SelectItem value="construccion">Obra: Construcción</SelectItem>
                          <SelectItem value="remodelacion">Obra: Remodelación</SelectItem>
                          <SelectItem value="ampliacion">Obra: Ampliación</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={contract.patente_status || "sin_patente"}
                        onValueChange={(value) => updateContractField({ stopPropagation: () => {} } as React.MouseEvent, contract.id, "patente_status", value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sin_patente">Sin Patente</SelectItem>
                          <SelectItem value="provisoria">Patente: Provisoria</SelectItem>
                          <SelectItem value="definitiva">Patente: Definitiva</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeleteClick(e, contract)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </Card>
            );
          })}

          {filteredContracts.length === 0 && (
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
        </div>
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