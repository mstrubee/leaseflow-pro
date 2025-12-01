import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

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

export const ContractsList = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<Contract[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  useEffect(() => {
    loadContracts();
  }, []);

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

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-status-negotiation text-white" },
      firmado: { label: "Firmado", className: "bg-status-signed text-white" },
      vencido: { label: "Vencido", className: "bg-status-expired text-white" },
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

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="en_negociacion">En Negociación</SelectItem>
              <SelectItem value="firmado">Firmado</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
            </SelectContent>
          </Select>
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
    </div>
  );
};
