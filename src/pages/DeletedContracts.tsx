import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Search, ArrowLeft, Trash2, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Contract {
  id: string;
  name: string;
  status: string;
  created_at: string;
  deleted_at: string;
  contract_addresses: Array<{ region: string; commune: string }>;
  contract_versions: Array<{
    regime_rent: number;
    duration_months: number;
    is_current: boolean;
  }>;
}

const DeletedContracts = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin, roleLoaded } = useAuth();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [contractToRestore, setContractToRestore] = useState<Contract | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (!authLoading && roleLoaded && !isAdmin) {
      navigate("/");
      toast.error("No tienes permisos para acceder a esta sección");
    }
  }, [authLoading, user, isAdmin, roleLoaded, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      loadContracts();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    filterContracts();
  }, [searchTerm, contracts]);

  const loadContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_addresses (region, commune),
        contract_versions (regime_rent, duration_months, is_current)
      `)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    setContracts(data || []);
  };

  const filterContracts = () => {
    let filtered = contracts;

    if (searchTerm) {
      filtered = filtered.filter((contract) =>
        contract.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
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

    // Delete related data first
    await supabase.from("rent_escalations").delete().eq("version_id", contractToDelete.id);
    await supabase.from("contract_versions").delete().eq("contract_id", contractToDelete.id);
    await supabase.from("contract_addresses").delete().eq("contract_id", contractToDelete.id);
    await supabase.from("contract_contacts").delete().eq("contract_id", contractToDelete.id);
    await supabase.from("contract_documents").delete().eq("contract_id", contractToDelete.id);
    await supabase.from("finalized_contracts").delete().eq("contract_id", contractToDelete.id);

    const { error } = await supabase
      .from("contracts")
      .delete()
      .eq("id", contractToDelete.id);

    if (error) {
      toast.error("Error al eliminar definitivamente el contrato");
    } else {
      toast.success("Contrato eliminado definitivamente");
      loadContracts();
    }

    setConfirmDeleteDialogOpen(false);
    setContractToDelete(null);
  };

  const handleRestoreClick = (e: React.MouseEvent, contract: Contract) => {
    e.stopPropagation();
    setContractToRestore(contract);
    setRestoreDialogOpen(true);
  };

  const handleRestore = async () => {
    if (!contractToRestore) return;

    const { error } = await supabase
      .from("contracts")
      .update({ deleted_at: null })
      .eq("id", contractToRestore.id);

    if (error) {
      toast.error("Error al restaurar el contrato");
    } else {
      toast.success("Contrato restaurado exitosamente");
      loadContracts();
    }

    setRestoreDialogOpen(false);
    setContractToRestore(null);
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

  if (authLoading || !roleLoaded) {
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
              <h1 className="text-2xl font-semibold text-foreground">Elementos Eliminados</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {filteredContracts.length} contratos eliminados
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
            const address = contract.contract_addresses?.[0];

            return (
              <Card key={contract.id} className="p-6 opacity-75">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{contract.name}</h3>
                      {getStatusBadge(contract.status)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Ubicación</p>
                        <p className="font-medium">
                          {address ? `${address.commune}, ${address.region}` : "Sin dirección"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fecha Creación</p>
                        <p className="font-medium">
                          {new Date(contract.created_at).toLocaleDateString("es-CL")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fecha Eliminación</p>
                        <p className="font-medium">
                          {new Date(contract.deleted_at).toLocaleDateString("es-CL")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-green-600 hover:text-green-600 hover:bg-green-100"
                      onClick={(e) => handleRestoreClick(e, contract)}
                    >
                      <RotateCcw className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteClick(e, contract)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          {filteredContracts.length === 0 && (
            <Card className="p-12">
              <div className="text-center text-muted-foreground">
                <p>No hay contratos eliminados</p>
              </div>
            </Card>
          )}
        </div>
      </main>

      {/* Restore dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              El contrato "{contractToRestore?.name}" será restaurado y volverá a aparecer en la lista de contratos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* First confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar definitivamente el contrato "{contractToDelete?.name}".
              Esta acción NO se puede deshacer.
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
            <AlertDialogTitle>Confirmar eliminación permanente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás COMPLETAMENTE seguro de que deseas eliminar permanentemente "{contractToDelete?.name}"?
              Todos los datos relacionados serán eliminados y NO podrán recuperarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeletedContracts;
