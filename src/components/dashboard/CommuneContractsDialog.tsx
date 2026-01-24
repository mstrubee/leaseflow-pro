import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";
import { useDashboardRegionNavigation } from "./DashboardRegionReturnButton";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

interface Contract {
  id: string;
  name: string;
  status: string;
  companies: string[];
}

interface CommuneContractsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  region: string;
  commune: string;
}

export function CommuneContractsDialog({
  open,
  onOpenChange,
  region,
  commune,
}: CommuneContractsDialogProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const { navigateToContractFromDashboardRegion } = useDashboardRegionNavigation();

  useEffect(() => {
    if (open && region && commune) {
      loadContracts();
    }
  }, [open, region, commune]);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contract_addresses")
        .select(`
          contract_id,
          contracts:contract_id (
            id,
            name,
            status,
            deleted_at,
            contract_companies (
              company:companies (name)
            )
          )
        `)
        .eq("region", region)
        .eq("commune", commune);

      if (error) throw error;

      const contractsList: Contract[] = [];
      data?.forEach((addr: any) => {
        if (addr.contracts && !addr.contracts.deleted_at) {
          const companies = addr.contracts.contract_companies?.map(
            (cc: any) => cc.company?.name
          ).filter(Boolean) || [];
          
          contractsList.push({
            id: addr.contracts.id,
            name: addr.contracts.name,
            status: addr.contracts.status,
            companies,
          });
        }
      });

      // Remove duplicates
      const uniqueContracts = contractsList.reduce((acc: Contract[], curr) => {
        if (!acc.find(c => c.id === curr.id)) {
          acc.push(curr);
        }
        return acc;
      }, []);

      setContracts(uniqueContracts);
    } catch (err) {
      console.error("Error loading contracts:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "firmado":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Vigente</Badge>;
      case "en_negociacion":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Negociación</Badge>;
      case "vencido":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Vencido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleNavigateToContract = (contractId: string) => {
    onOpenChange(false);
    navigateToContractFromDashboardRegion(contractId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Contratos en {commune}, {region}
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay contratos en esta comuna
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <CompanyLogo companyNames={contract.companies} size="sm" />
                      {contract.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contract.companies.map((company, idx) => (
                        <Badge 
                          key={idx} 
                          variant="outline"
                          className={
                            company.toLowerCase().includes("autoplanet") 
                              ? "border-green-500 text-green-700"
                              : company.toLowerCase().includes("agroplanet")
                              ? "border-red-500 text-red-600"
                              : "border-blue-500 text-blue-600"
                          }
                        >
                          {company}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleNavigateToContract(contract.id)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
