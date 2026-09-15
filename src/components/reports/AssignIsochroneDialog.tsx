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
import { Loader2, MapPin, ArrowLeft, TrendingUp, Image as ImageIcon } from "lucide-react";
import {
  listSavedIsochrones,
  fetchSalesProjection,
  fetchReportSlides,
  dataUrlToBlob,
  ISOCHRONE_SLIDES_BUCKET,
  type SavedIsochroneSummary,
  type SalesProjectionExport,
} from "@/lib/geochile/client";

const fmtMM = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 1 });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  hasBusinessCase: boolean;
  // "Formato de local" del Business Case (Express/Tradicional) — para avisar
  // si no coincide con el ajuste Express de la proyección de Geochile.
  businessCaseFormato?: string | null;
  onAssigned: () => void;
  onApplyToBusinessCase: (contractId: string, ventaMes: number[], ventaGrowthPct: number[]) => Promise<void>;
}

export function AssignIsochroneDialog({
  open,
  onOpenChange,
  contractId,
  contractName,
  hasBusinessCase,
  businessCaseFormato,
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

  // Asocia la isócrona (link + proyección) y, si tiene informe generado en
  // Geochile, stagea sus 2 láminas para el PPT — todo en una sola acción.
  // El informe es best-effort: si falla, no revierte la asociación, que ya
  // es lo principal y quedó guardada.
  const persistAssignment = async (): Promise<void> => {
    if (!selected || !projection || !user) return;
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

    if (!selected.hasSlides) return;
    try {
      const slides = await fetchReportSlides(selected.id);
      const slide1Path = `${contractId}/slide1.png`;
      const { error: upErr1 } = await supabase.storage
        .from(ISOCHRONE_SLIDES_BUCKET)
        .upload(slide1Path, await dataUrlToBlob(slides.slide1), { upsert: true, contentType: "image/png" });
      if (upErr1) throw upErr1;

      let slide2Path: string | null = null;
      if (slides.slide2) {
        slide2Path = `${contractId}/slide2.png`;
        const { error: upErr2 } = await supabase.storage
          .from(ISOCHRONE_SLIDES_BUCKET)
          .upload(slide2Path, await dataUrlToBlob(slides.slide2), { upsert: true, contentType: "image/png" });
        if (upErr2) throw upErr2;
      }

      await supabase.from("contract_isochrone_reports" as any).upsert(
        {
          contract_id: contractId,
          saved_isochrone_id: selected.id,
          isochrone_name: selected.name,
          slide1_path: slide1Path,
          slide2_path: slide2Path,
          extracted_by: user.id,
          extracted_at: new Date().toISOString(),
        },
        { onConflict: "contract_id" },
      );
    } catch (err) {
      console.error("[AssignIsochroneDialog] no se pudo extraer el informe de directorio", err);
    }
  };

  const handleAssign = async () => {
    if (!selected || !projection || !user) return;
    setAssigning(true);
    try {
      await persistAssignment();
      toast.success("Isócrona asociada al contrato");
      onAssigned();
      if (!hasBusinessCase) onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al asociar la isócrona");
    } finally {
      setAssigning(false);
    }
  };

  // La proyección de Geochile trae su propio ajuste "Express" (vía
  // meta.isExpress), independiente del "Formato de local" del Business Case
  // de leaseflow — si no coinciden, las ventas están calibradas para el
  // formato equivocado.
  const geoIsExpress = !!projection?.meta?.isExpress;
  const bcIsExpress = businessCaseFormato === "Express";
  const expressMismatch = !!projection && !!businessCaseFormato && geoIsExpress !== bcIsExpress;

  const handleApply = async () => {
    if (!selected || !projection || !user) return;
    setApplying(true);
    try {
      await persistAssignment();
      await onApplyToBusinessCase(contractId, projection.ventaMes, projection.growthRates);
      toast.success("Isócrona asociada y ventas aplicadas al Business Case");
      onAssigned();
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
            Asociar Isócrona — {contractName}
          </DialogTitle>
          <DialogDescription>
            Elegí una isócrona guardada en Geochile Compass para importar su proyección de ventas a 5 años y, si tiene informe de directorio generado, sus 2 láminas para el PPT.
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
                    <div className="flex gap-1 shrink-0">
                      {iso.hasProjection ? (
                        <Badge variant="outline" className="gap-1"><TrendingUp className="h-3 w-3" /> Con proyección</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Sin proyección</Badge>
                      )}
                      {iso.hasSlides && (
                        <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50">
                          <ImageIcon className="h-3 w-3" /> Con informe
                        </Badge>
                      )}
                    </div>
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

                  {expressMismatch && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      Este Business Case es "{businessCaseFormato}", pero esta proyección de Geochile Compass{" "}
                      {geoIsExpress ? "SÍ" : "NO"} tiene el ajuste Express aplicado. Las ventas pueden estar
                      sobre/sub-estimadas para este formato — revisá el ajuste Express de la isócrona en Geochile
                      Compass antes de aplicarlas.
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
                Asociar a este contrato
              </Button>
              {hasBusinessCase && (
                <Button onClick={handleApply} disabled={applying}>
                  {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Asociar y aplicar al Business Case
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
