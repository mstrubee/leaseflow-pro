import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, MapPin, ArrowLeft, TrendingUp } from "lucide-react";
import {
  listSavedIsochrones,
  fetchSalesProjection,
  type SavedIsochroneSummary,
  type SalesProjectionExport,
} from "@/lib/geochile/client";

const fmtMM = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 1 });

export interface AssignedIsochrone {
  contractId: string;
  savedIsochroneId: string;
  isochroneName: string;
  folderName: string | null;
  projection: SalesProjectionExport;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  hasBusinessCase: boolean;
  onAssigned: (link: AssignedIsochrone) => void;
  onApplyToBusinessCase: (contractId: string, ventaMes: number[]) => Promise<void>;
}

export function AssignIsochroneDialog({
  open,
  onOpenChange,
  contractId,
  contractName,
  hasBusinessCase,
  onAssigned,
  onApplyToBusinessCase,
}: Props) {
  const { user } = useAuth();
  const [loadingList, setLoadingList] = useState(false);
  const [isochrones, setIsochrones] = useState<SavedIsochroneSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedIsochroneSummary | null>(null);
  const [loadingProjection, setLoadingProjection] = useState(false);
  const [projection, setProjection] = useState<SalesProjectionExport | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setProjection(null);
    setListError(null);
    (async () => {
      setLoadingList(true);
      try {
        const list = await listSavedIsochrones();
        setIsochrones(list);
      } catch (err: any) {
        setListError(err.message || "No se pudo conectar con Geochile Compass");
      } finally {
        setLoadingList(false);
      }
    })();
  }, [open]);

  const handleSelect = async (iso: SavedIsochroneSummary) => {
    setSelected(iso);
    setProjection(null);
    setLoadingProjection(true);
    try {
      const p = await fetchSalesProjection(iso.id);
      setProjection(p);
    } catch (err: any) {
      toast.error(err.message || "No se pudo obtener la proyección de ventas");
      setSelected(null);
    } finally {
      setLoadingProjection(false);
    }
  };

  const handleAssign = async () => {
    if (!selected || !projection || !user) return;
    setAssigning(true);
    try {
      const { error } = await supabase.from("contract_isochrone_links" as any).upsert(
        {
          contract_id: contractId,
          saved_isochrone_id: selected.id,
          isochrone_name: selected.name,
          folder_name: selected.folderName,
          projection: projection as unknown as Record<string, unknown>,
          assigned_by: user.id,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: "contract_id" },
      );
      if (error) throw error;
      toast.success("Isócrona asignada al contrato");
      onAssigned({
        contractId,
        savedIsochroneId: selected.id,
        isochroneName: selected.name,
        folderName: selected.folderName,
        projection,
      });
      if (!hasBusinessCase) onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al asignar la isócrona");
    } finally {
      setAssigning(false);
    }
  };

  const handleApply = async () => {
    if (!projection) return;
    setApplying(true);
    try {
      await onApplyToBusinessCase(contractId, projection.ventaMes);
      toast.success("Ventas aplicadas al Business Case");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al aplicar la proyección");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Asignar Isócrona — {contractName}
          </DialogTitle>
          <DialogDescription>
            Elegí una isócrona guardada en Geochile Compass para importar su proyección de ventas a 5 años.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!selected ? (
            <>
              {loadingList && (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando isócronas...
                </div>
              )}
              {listError && (
                <p className="text-sm text-destructive py-6 text-center">
                  {listError} — verificá la configuración en Admin &gt; Integraciones.
                </p>
              )}
              {!loadingList && !listError && isochrones.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No hay isócronas guardadas en Geochile Compass.
                </p>
              )}
              <div className="space-y-1.5">
                {isochrones.map((iso) => (
                  <button
                    key={iso.id}
                    onClick={() => handleSelect(iso)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent/50 transition-colors text-left"
                  >
                    <div>
                      <div className="text-sm font-medium">{iso.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {iso.folderName ? `${iso.folderName} · ` : ""}
                        {iso.mode} · {iso.minutes.join("/")} min
                      </div>
                    </div>
                    {iso.hasProjection ? (
                      <Badge variant="outline" className="gap-1 shrink-0"><TrendingUp className="h-3 w-3" /> Con proyección</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">Sin proyección</Badge>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => { setSelected(null); setProjection(null); }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
              </Button>

              {loadingProjection ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculando proyección...
                </div>
              ) : projection ? (
                <>
                  <div>
                    <p className="font-semibold">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Base {projection.baseYear} · UF/mes régimen: {fmtMM(projection.estimatedUf)} · Crecimiento {(projection.growthRate * 100).toFixed(1)}%
                    </p>
                  </div>

                  {projection.diagnosticMsg && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      {projection.diagnosticMsg}
                    </p>
                  )}

                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Año</th>
                          {projection.ventaMes.map((_, i) => (
                            <th key={i} className="text-right px-3 py-1.5 font-medium">{i + 1}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-1.5 text-muted-foreground">Venta / mes (MM CLP)</td>
                          {projection.ventaMes.map((v, i) => (
                            <td key={i} className="text-right px-3 py-1.5">{fmtMM(v)}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {projection.comparables.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Locales comparables</p>
                      <ul className="text-xs space-y-0.5">
                        {projection.comparables.map((c) => (
                          <li key={c.name} className="flex justify-between text-muted-foreground">
                            <span>{c.name}</span>
                            <span>{(c.distanceScore * 100).toFixed(0)}% similitud</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {selected && projection && (
            <>
              <Button variant="outline" onClick={handleAssign} disabled={assigning}>
                {assigning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Asignar a este contrato
              </Button>
              {hasBusinessCase && (
                <Button onClick={handleApply} disabled={applying}>
                  {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Asignar y aplicar al Business Case
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
