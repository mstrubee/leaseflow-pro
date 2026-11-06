import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { ContractFixedAsset } from "./types";

interface ContractGroup {
  contractId: string;
  contractName: string;
  items: ContractFixedAsset[];
}

export const FixedAssetContractsTab = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<ContractFixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contract_fixed_assets")
        .select(`
          id, contract_id, fixed_asset_id, quantity, assigned_at, notes,
          fixed_asset:fixed_assets(id, name, sku, unit, category),
          contract:contracts(id, name)
        `)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      setAssignments((data || []) as unknown as ContractFixedAsset[]);
    } catch (error) {
      console.error("Error loading contract fixed assets:", error);
      toast.error("Error al cargar los contratos con activos asignados");
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo<ContractGroup[]>(() => {
    const byContract = new Map<string, ContractGroup>();
    for (const a of assignments) {
      const contractId = a.contract_id;
      if (!byContract.has(contractId)) {
        byContract.set(contractId, {
          contractId,
          contractName: a.contract?.name || "Contrato",
          items: [],
        });
      }
      byContract.get(contractId)!.items.push(a);
    }
    return Array.from(byContract.values());
  }, [assignments]);

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      g.contractName.toLowerCase().includes(q) ||
      g.items.some((i) => i.fixed_asset?.name.toLowerCase().includes(q))
    );
  }, [groups, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por contrato o activo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No hay contratos con activos asignados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <div key={group.contractId} className="border rounded-md">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
                <span className="font-medium">{group.contractName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => navigate(`/contracts/${group.contractId}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver contrato
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead>Asignado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.fixed_asset?.name || "-"}</TableCell>
                      <TableCell>
                        {item.fixed_asset?.category ? (
                          <Badge variant="outline" className="text-xs">{item.fixed_asset.category}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.quantity} {item.fixed_asset?.unit}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(item.assigned_at), "dd MMM yyyy", { locale: es })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
