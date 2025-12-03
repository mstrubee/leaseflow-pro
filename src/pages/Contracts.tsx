import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Search, ArrowLeft, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Contract {
  id: string;
  name: string;
  status: string;
  created_at: string;
  contract_addresses: Array<{ region: string; commune: string }>;
  contract_versions: Array<{
    regime_rent: number;
    duration_months: number;
    is_current: boolean;
  }>;
}

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
    filterContracts();
  }, [searchTerm, statusFilter, contracts]);

  const loadContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_addresses (region, commune),
        contract_versions (regime_rent, duration_months, is_current)
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    setContracts(data || []);
  };

  const filterContracts = () => {
    let filtered = contracts;

    if (searchTerm) {
      filtered = filtered.filter((contract) =>
        contract.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "todos") {
      filtered = filtered.filter((contract) => contract.status === statusFilter);
    }

    setFilteredContracts(filtered);
  };

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

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-yellow-500 text-white" },
      firmado: { label: "Vigente", className: "bg-green-500 text-white" },
      vencido: { label: "Vencido", className: "bg-red-500 text-white" },
    };

    const statusInfo = statusMap[status] || { label: status, className: "" };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        <div className="grid gap-4">
          {filteredContracts.map((contract) => {
            const currentVersion = contract.contract_versions?.find((v) => v.is_current);
            const address = contract.contract_addresses?.[0];

            return (
              <Card
                key={contract.id}
                className="p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/contracts/${contract.id}`)}
              >
                <div className="flex items-start justify-between">
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
                              {formatCurrency(currentVersion.regime_rent)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Duración</p>
                            <p className="font-medium">{currentVersion.duration_months} meses</p>
                          </div>
                        </>
                      )}
                      <div>
                        <p className="text-muted-foreground">Fecha Creación</p>
                        <p className="font-medium">
                          {new Date(contract.created_at).toLocaleDateString("es-CL")}
                        </p>
                      </div>
                    </div>
                  </div>
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
