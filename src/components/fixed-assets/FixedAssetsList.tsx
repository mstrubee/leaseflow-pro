import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Search, Archive } from "lucide-react";
import { toast } from "sonner";
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
import { FixedAsset, STATUS_LABELS } from "./types";

interface FixedAssetsListProps {
  onEdit: (asset: FixedAsset) => void;
  refreshKey: number;
}

const statusVariant = (status: FixedAsset["status"]) => {
  if (status === "activo") return "default" as const;
  if (status === "mantencion") return "secondary" as const;
  return "outline" as const;
};

export const FixedAssetsList = ({ onEdit, refreshKey }: FixedAssetsListProps) => {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadAssets();
  }, [refreshKey]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fixed_assets_with_availability")
        .select("*")
        .order("name");
      if (error) throw error;
      setAssets((data || []) as unknown as FixedAsset[]);
    } catch (error) {
      console.error("Error loading fixed assets:", error);
      toast.error("Error al cargar el inventario");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("fixed_assets").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Activo eliminado");
      loadAssets();
    } catch (error) {
      console.error("Error deleting fixed asset:", error);
      if ((error as { code?: string })?.code === "23503") {
        toast.error("No se puede eliminar: tiene contratos con unidades asignadas");
      } else {
        toast.error("Error al eliminar el activo");
      }
    } finally {
      setDeleteId(null);
    }
  };

  const filteredAssets = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return assets;
    return assets.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.category?.toLowerCase().includes(q)) ||
      (a.sku?.toLowerCase().includes(q))
    );
  }, [assets, search]);

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
          placeholder="Buscar por nombre, categoría o SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {filteredAssets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Archive className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No hay activos registrados</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Stock disponible</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.map((asset) => {
                const available = asset.available_quantity ?? asset.total_quantity;
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">
                      {asset.name}
                      {asset.location && (
                        <p className="text-xs text-muted-foreground">{asset.location}</p>
                      )}
                    </TableCell>
                    <TableCell>{asset.category || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{asset.sku || "-"}</TableCell>
                    <TableCell className="text-center">
                      <span className={available <= 0 ? "text-destructive font-medium" : "font-medium"}>
                        {available}
                      </span>
                      <span className="text-muted-foreground"> / {asset.total_quantity} {asset.unit}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusVariant(asset.status)}>{STATUS_LABELS[asset.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => onEdit(asset)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(asset.id)} title="Eliminar">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar activo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El activo será eliminado permanentemente del inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
