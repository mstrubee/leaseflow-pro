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
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Loader2, MapPin } from "lucide-react";
import {
  fetchCoordinateSyncRows,
  applyCoordinate,
  applyMissingCoordinates,
  type CoordinateSyncRow,
} from "@/lib/geochile/syncCoordinates";
import type { SavedIsochroneSummary } from "@/lib/geochile/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmtCoord = (v: number | null) => (v === null ? "—" : v.toFixed(6));

export function GeochileCoordinateSyncDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CoordinateSyncRow[]>([]);
  const [isochrones, setIsochrones] = useState<SavedIsochroneSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [manualChoice, setManualChoice] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAppliedIds(new Set());
    setManualChoice({});
    (async () => {
      setLoading(true);
      try {
        const { rows: fetched, isochrones: isoList } = await fetchCoordinateSyncRows();
        setRows(fetched);
        setIsochrones(isoList);
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
  const unmatched = rows.filter((r) => r.status === "unmatched");

  const isoOptions: SearchableSelectOption[] = isochrones.map((iso) => ({
    value: iso.id,
    label: iso.folderName ? `${iso.name} (${iso.folderName})` : iso.name,
  }));

  const handleUseGeochile = async (row: CoordinateSyncRow) => {
    if (row.geoLat === null || row.geoLng === null) return;
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

  const handleApplyManual = async (row: CoordinateSyncRow) => {
    const isoId = manualChoice[row.contractId];
    const iso = isochrones.find((i) => i.id === isoId);
    if (!iso) return;
    setApplyingId(row.contractId);
    try {
      await applyCoordinate(row.contractId, iso.centerLat, iso.centerLng);
      setAppliedIds((prev) => new Set(prev).add(row.contractId));
      toast.success(`Coordenada de "${row.contractName}" asignada desde "${iso.name}"`);
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Sincronizar coordenadas con Geochile Compass
          </DialogTitle>
          <DialogDescription>
            Match por nombre de local contra las isócronas guardadas en Geochile Compass. Las coordenadas que no
            tenían ninguna cargada se completaron automáticamente; las que ya tenían una distinta, o las que no
            encontraron un local con el mismo nombre, quedan abajo para resolver a mano.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-6 text-center">{error}</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{missing.length} completadas</Badge>
              <Badge variant="outline">{matches.length} ya coincidían</Badge>
              <Badge variant={conflicts.length > 0 ? "destructive" : "outline"}>{conflicts.length} en conflicto</Badge>
              <Badge variant={unmatched.length > 0 ? "destructive" : "outline"}>
                {unmatched.length} sin coincidencia por nombre
              </Badge>
            </div>

            {conflicts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">En conflicto (ya tenían una coordenada distinta)</h4>
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
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Sin coincidencia por nombre</h4>
                <p className="text-xs text-muted-foreground">
                  No se encontró ninguna isócrona guardada con un nombre parecido. Puede que el local todavía no
                  tenga una isócrona en Geochile Compass, o que se haya guardado con un nombre distinto -- elige la
                  que corresponda manualmente.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Local</TableHead>
                      <TableHead>Coordenada actual</TableHead>
                      <TableHead>Isócrona en Geochile</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmatched.map((row) => {
                      const applied = appliedIds.has(row.contractId);
                      return (
                        <TableRow key={row.contractId}>
                          <TableCell className="font-medium">{row.contractName}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {fmtCoord(row.currentLat)}, {fmtCoord(row.currentLng)}
                          </TableCell>
                          <TableCell className="min-w-[220px]">
                            <SearchableSelect
                              value={manualChoice[row.contractId] || ""}
                              onValueChange={(v) => setManualChoice((prev) => ({ ...prev, [row.contractId]: v }))}
                              options={isoOptions}
                              placeholder="Elegir isócrona..."
                              searchPlaceholder="Buscar..."
                              emptyMessage="No hay isócronas guardadas."
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {applied ? (
                              <Badge className="bg-green-500">Actualizado</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={applyingId === row.contractId || !manualChoice[row.contractId]}
                                onClick={() => handleApplyManual(row)}
                              >
                                {applyingId === row.contractId && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                Aplicar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {conflicts.length === 0 && unmatched.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay nada pendiente de revisar manualmente.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
