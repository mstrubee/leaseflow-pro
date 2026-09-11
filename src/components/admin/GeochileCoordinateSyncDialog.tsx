import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MapPin } from "lucide-react";
import {
  fetchCoordinateSyncRows,
  applyCoordinate,
  applyMissingCoordinates,
  type CoordinateSyncRow,
} from "@/lib/geochile/syncCoordinates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmtCoord = (v: number | null) => (v === null ? "—" : v.toFixed(6));

export function GeochileCoordinateSyncDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CoordinateSyncRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAppliedIds(new Set());
    (async () => {
      setLoading(true);
      try {
        const fetched = await fetchCoordinateSyncRows();
        setRows(fetched);
        const missingCount = await applyMissingCoordinates(fetched);
        if (missingCount > 0) {
          setAppliedIds(new Set(fetched.filter((r) => r.status === "missing").map((r) => r.contractId)));
          toast.success(`${missingCount} coordenada(s) completadas automáticamente (no tenían ninguna cargada).`);
        }
      } catch (err: any) {
        setError(err.message || "No se pudo conectar con Geochile Compass");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const conflicts = rows.filter((r) => r.status === "conflict");
  const matches = rows.filter((r) => r.status === "match");
  const missing = rows.filter((r) => r.status === "missing");

  const handleUseGeochile = async (row: CoordinateSyncRow) => {
    setApplyingId(row.contractId);
    try {
      await applyCoordinate(row.contractId, row.geoLat, row.geoLng);
      setAppliedIds((prev) => new Set(prev).add(row.contractId));
      toast.success(`Coordenada de "${row.contractName}" actualizada`);
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Sincronizar coordenadas con Geochile Compass
          </DialogTitle>
          <DialogDescription>
            Match por nombre de local contra las isócronas guardadas en Geochile Compass. Las coordenadas que no
            tenían ninguna cargada se completaron automáticamente; las que ya tenían una distinta quedan abajo para
            que elijas cuál dejar.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-6 text-center">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2 text-sm">
              <Badge variant="secondary">{missing.length} completadas</Badge>
              <Badge variant="outline">{matches.length} ya coincidían</Badge>
              <Badge variant={conflicts.length > 0 ? "destructive" : "outline"}>{conflicts.length} en conflicto</Badge>
            </div>

            {conflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No hay conflictos pendientes de revisar.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Local</TableHead>
                    <TableHead>Coordenada actual</TableHead>
                    <TableHead>Coordenada Geochile</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.map((row) => {
                    const applied = appliedIds.has(row.contractId);
                    return (
                      <TableRow key={row.contractId}>
                        <TableCell className="font-medium">{row.contractName}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {fmtCoord(row.currentLat)}, {fmtCoord(row.currentLng)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fmtCoord(row.geoLat)}, {fmtCoord(row.geoLng)}
                        </TableCell>
                        <TableCell className="text-right">
                          {applied ? (
                            <Badge className="bg-green-500">Actualizado</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={applyingId === row.contractId}
                              onClick={() => handleUseGeochile(row)}
                            >
                              {applyingId === row.contractId && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              Usar Geochile
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
