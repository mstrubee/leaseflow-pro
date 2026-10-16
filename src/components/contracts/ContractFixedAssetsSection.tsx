import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import { Plus, Trash2, Loader2, Archive } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { FixedAsset, ContractFixedAsset } from "@/components/fixed-assets/types";

interface ContractFixedAssetsSectionProps {
  contractId: string;
}

export const ContractFixedAssetsSection = ({ contractId }: ContractFixedAssetsSectionProps) => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ContractFixedAsset[]>([]);
  const [availableAssets, setAvailableAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [contractId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignmentsRes, assetsRes] = await Promise.all([
        supabase
          .from("contract_fixed_assets")
          .select(`
            id, contract_id, fixed_asset_id, quantity, assigned_at, notes,
            fixed_asset:fixed_assets(id, name, sku, unit, category)
          `)
          .eq("contract_id", contractId)
          .order("assigned_at", { ascending: false }),
        supabase
          .from("fixed_assets_with_availability")
          .select("*")
          .eq("status", "activo")
          .order("name"),
      ]);
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (assetsRes.error) throw assetsRes.error;
      setAssignments((assignmentsRes.data || []) as unknown as ContractFixedAsset[]);
      setAvailableAssets((assetsRes.data || []) as unknown as FixedAsset[]);
    } catch (error) {
      console.error("Error loading contract fixed assets:", error);
      toast.error("Error al cargar los activos del contrato");
    } finally {
      setLoading(false);
    }
  };

  const assetOptions: SearchableSelectOption[] = useMemo(() => {
    return availableAssets
      .filter((a) => (a.available_quantity ?? a.total_quantity) > 0)
      .map((a) => ({
        value: a.id,
        label: `${a.name} (${a.available_quantity ?? a.total_quantity} ${a.unit} disponibles)`,
        searchValue: `${a.name} ${a.category || ""} ${a.sku || ""}`,
      }));
  }, [availableAssets]);

  const selectedAsset = availableAssets.find((a) => a.id === selectedAssetId);

  const openDialog = () => {
    setSelectedAssetId("");
    setQuantity("1");
    setDialogOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedAssetId) {
      toast.error("Selecciona un activo");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("La cantidad debe ser mayor a cero");
      return;
    }
    const available = selectedAsset?.available_quantity ?? selectedAsset?.total_quantity ?? 0;
    if (qty > available) {
      toast.error(`Solo hay ${available} unidad(es) disponibles`);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("contract_fixed_assets").insert({
        contract_id: contractId,
        fixed_asset_id: selectedAssetId,
        quantity: qty,
        assigned_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Activo asignado al contrato");
      setDialogOpen(false);
      loadData();
    } catch (error) {
      console.error("Error assigning fixed asset:", error);
      const message = error instanceof Error ? error.message : "";
      toast.error(message.includes("Stock insuficiente") ? message : "Error al asignar el activo");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("contract_fixed_assets").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Asignación eliminada, stock liberado");
      loadData();
    } catch (error) {
      console.error("Error removing fixed asset assignment:", error);
      toast.error("Error al eliminar la asignación");
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Asignar Activo
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Archive className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin activos asignados a este contrato</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.fixed_asset?.name || "-"}</TableCell>
                  <TableCell>
                    {a.fixed_asset?.category ? (
                      <Badge variant="outline" className="text-xs">{a.fixed_asset.category}</Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {a.quantity} {a.fixed_asset?.unit}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(a.id)} title="Quitar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar Activo al Contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Activo</Label>
              <SearchableSelect
                value={selectedAssetId}
                onValueChange={setSelectedAssetId}
                options={assetOptions}
                placeholder="Seleccionar activo..."
                searchPlaceholder="Buscar activo..."
                emptyMessage="No hay activos disponibles"
              />
            </div>
            <div>
              <Label htmlFor="assign_quantity">Cantidad</Label>
              <Input
                id="assign_quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleAssign} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Quitar activo del contrato?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción liberará el stock asignado a este contrato.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRemove}>Quitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
