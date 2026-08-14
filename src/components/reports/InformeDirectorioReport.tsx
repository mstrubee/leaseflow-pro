import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import { computeBC, type BCInputs, type BCResult } from "@/lib/businessCase/model";
import { fmtMM } from "@/lib/businessCase/format";
import { buildCapexPPTData } from "@/components/budget/CapexPPTExport";
import { generateInformeDirectorioPPT, type ContractSlideData, type ContractSlideImage } from "@/components/reports/InformeDirectorioPPT";
import { DatosRegionA, DatosRegionB, ResumenBusinessCase, captureSnapshot } from "@/components/reports/BusinessCaseSnapshots";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface NoticeRange {
  start_month: number;
  end_month: number;
}

interface ContractEligible {
  id: string;
  name: string;
  hasBusinessCase: boolean;
  inputs: BCInputs | null;
  result: BCResult | null;
  durationMonths: number | null;
  noticeType: string | null;
  noticeValue: string | null;
  effectiveDate: string | null;
  noticeRanges: NoticeRange[];
}

const COMITE_GP_STATUS = "En Revisión";

function loadImageDims(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** "con salida durante el año X", o null si no aplica una ventana de salida real. */
function deriveSalidaAnio(c: ContractEligible): number | null {
  const t = c.noticeType;
  if (!t || t === "sin_termino" || t === "meses") return null;
  if (t === "rangos") {
    if (!c.noticeRanges.length) return null;
    const sorted = [...c.noticeRanges].sort((a, b) => a.start_month - b.start_month);
    return Math.ceil(sorted[0].start_month / 12);
  }
  if (t === "desde_mes") {
    const m = parseInt(c.noticeValue || "0") || 0;
    if (m <= 0) return null;
    return Math.ceil(m / 12);
  }
  if (t === "fecha" && c.noticeValue && c.effectiveDate) {
    const start = new Date(c.effectiveDate + "T00:00:00");
    const date = new Date(c.noticeValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(date.getTime())) return null;
    const diffDays = (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const month = Math.floor(diffDays / 30.44) + 1;
    if (month <= 0) return null;
    return Math.ceil(month / 12);
  }
  return null;
}

function buildBullets(c: ContractEligible): string[] {
  if (!c.result) return [];
  const bullets: string[] = [];
  bullets.push(`CAPEX: ${fmtMM(c.result.totalCapex, 0)} MM$`);
  const ventasProyectadas = (c.result.ingresos[4] + c.result.ingresos[5]) / 2;
  bullets.push(`Ventas Proyectadas: ${fmtMM(ventasProyectadas, 0)} MM$`);
  if (c.durationMonths) {
    const years = Math.round(c.durationMonths / 12);
    bullets.push(`Contrato ${years} Año${years === 1 ? "" : "s"}`);
  }
  const anio = deriveSalidaAnio(c);
  if (anio !== null) {
    bullets.push(`Con salida durante el año ${anio}`);
  }
  return bullets;
}

function buildSubtitle(name: string, inputs: BCInputs | null): string {
  const isExpress = inputs?.formato === "Express";
  return `Nuevo Local ${name}${isExpress ? " - Formato Express" : ""}`;
}

export function InformeDirectorioReport() {
  const { ufValue } = useEconomicIndicators();
  const { config, loading: cfgLoading } = useBusinessCaseAdminConfig();
  const [contracts, setContracts] = useState<ContractEligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const refsMap = useRef<Map<string, { a: HTMLDivElement | null; b: HTMLDivElement | null; c: HTMLDivElement | null }>>(new Map());

  const year = new Date().getFullYear().toString();

  useEffect(() => {
    if (cfgLoading) return;
    (async () => {
      setLoading(true);
      try {
        const { data: contractRows, error } = await supabase
          .from("contracts")
          .select("id, name")
          .eq("status", "en_negociacion")
          .eq("comite_gp_status", COMITE_GP_STATUS)
          .is("deleted_at", null);
        if (error) throw error;

        const ids = (contractRows || []).map((c) => c.id);
        if (ids.length === 0) {
          setContracts([]);
          return;
        }

        const { data: bcRows } = await supabase
          .from("contract_business_cases")
          .select("contract_id, inputs")
          .in("contract_id", ids);
        const bcByContract = new Map<string, BCInputs>();
        (bcRows || []).forEach((r) => {
          if (r.inputs) bcByContract.set(r.contract_id, r.inputs as unknown as BCInputs);
        });

        const { data: versionRows } = await supabase
          .from("contract_versions")
          .select("id, contract_id, duration_months, notice_type, notice_value, effective_date")
          .in("contract_id", ids)
          .eq("is_current", true);
        const versionByContract = new Map<string, typeof versionRows[number]>();
        (versionRows || []).forEach((v) => versionByContract.set(v.contract_id, v));

        const rangosVersionIds = (versionRows || [])
          .filter((v) => v.notice_type === "rangos")
          .map((v) => v.id);
        const rangesByVersion = new Map<string, NoticeRange[]>();
        if (rangosVersionIds.length > 0) {
          const { data: rangeRows } = await supabase
            .from("notice_ranges")
            .select("version_id, start_month, end_month")
            .in("version_id", rangosVersionIds);
          (rangeRows || []).forEach((r) => {
            const existing = rangesByVersion.get(r.version_id) || [];
            existing.push({ start_month: r.start_month, end_month: r.end_month });
            rangesByVersion.set(r.version_id, existing);
          });
        }

        const result: ContractEligible[] = (contractRows || []).map((c) => {
          const inputs = bcByContract.get(c.id) || null;
          const version = versionByContract.get(c.id);
          const computed = inputs ? computeBC(inputs, config) : null;
          return {
            id: c.id,
            name: c.name,
            hasBusinessCase: !!inputs,
            inputs,
            result: computed,
            durationMonths: version?.duration_months ?? null,
            noticeType: version?.notice_type ?? null,
            noticeValue: version?.notice_value ?? null,
            effectiveDate: version?.effective_date ?? null,
            noticeRanges: version ? rangesByVersion.get(version.id) || [] : [],
          };
        });
        setContracts(result);
        setSelectedIds(new Set(result.filter((c) => c.hasBusinessCase).map((c) => c.id)));
      } catch (err) {
        console.error("Error cargando contratos para Informe Directorio:", err);
        toast.error("Error al cargar contratos en revisión");
      } finally {
        setLoading(false);
      }
    })();
  }, [cfgLoading, config]);

  const withBC = useMemo(() => contracts.filter((c) => c.hasBusinessCase && c.result), [contracts]);
  const withoutBC = useMemo(() => contracts.filter((c) => !c.hasBusinessCase), [contracts]);
  const selectedContracts = useMemo(() => withBC.filter((c) => selectedIds.has(c.id)), [withBC, selectedIds]);
  const allSelected = withBC.length > 0 && selectedIds.size === withBC.length;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(withBC.map((c) => c.id)));
  };

  const handleDownload = async () => {
    if (selectedContracts.length === 0) {
      toast.error("Seleccioná al menos un contrato para incluir en el informe");
      return;
    }
    setGenerating(true);
    try {
      toast.info("Generando Informe Directorio...");
      const capexData = await buildCapexPPTData(year, ufValue || 0);

      const contractSlides: ContractSlideData[] = [];
      for (const c of selectedContracts) {
        const refs = refsMap.current.get(c.id);
        const [aDataUrl, bcDataUrl, bDataUrl] = await Promise.all([
          captureSnapshot(refs?.a ?? null),
          captureSnapshot(refs?.b ?? null),
          captureSnapshot(refs?.c ?? null),
        ]);
        const toImg = async (dataUrl: string | null): Promise<ContractSlideImage | null> => {
          if (!dataUrl) return null;
          try {
            const dims = await loadImageDims(dataUrl);
            return { dataUrl, w: dims.w, h: dims.h };
          } catch {
            return null;
          }
        };
        const [imgA, imgBC, imgB] = await Promise.all([toImg(aDataUrl), toImg(bcDataUrl), toImg(bDataUrl)]);

        contractSlides.push({
          contractName: c.name,
          subtitle: buildSubtitle(c.name, c.inputs),
          bullets: buildBullets(c),
          images: [imgA, imgBC, imgB],
        });
      }

      await generateInformeDirectorioPPT({ year, capexData, contractSlides });
      toast.success("Informe Directorio descargado");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Descarga cancelada");
        return;
      }
      console.error("Error generando Informe Directorio:", err);
      toast.error("Error al generar el Informe Directorio");
    } finally {
      setGenerating(false);
    }
  };

  if (loading || cfgLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando contratos en revisión...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground flex items-center flex-wrap gap-1">
          <span>Contratos con Comité GP</span> <Badge variant="outline">En Revisión</Badge>
          <span>
            en negociación: {selectedContracts.length} de {withBC.length} seleccionado{withBC.length === 1 ? "" : "s"} para el informe
            {withoutBC.length > 0 ? `, ${withoutBC.length} sin Business Case (excluido${withoutBC.length === 1 ? "" : "s"})` : ""}.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {withBC.length > 0 && (
            <Button variant="outline" onClick={toggleSelectAll}>
              {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
            </Button>
          )}
          <Button onClick={handleDownload} disabled={generating || selectedContracts.length === 0}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar PPT
          </Button>
        </div>
      </div>

      {withoutBC.length > 0 && (
        <Card className="p-3 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Sin Business Case cargado (no incluidos en el PPT):</span>{" "}
              {withoutBC.map((c) => c.name).join(", ")}
            </div>
          </div>
        </Card>
      )}

      {withBC.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No hay contratos con Business Case listos para incluir en el Informe Directorio.
        </p>
      ) : (
        <div className="space-y-3">
          {withBC.map((c) => {
            if (!refsMap.current.has(c.id)) refsMap.current.set(c.id, { a: null, b: null, c: null });
            const refs = refsMap.current.get(c.id)!;
            const isExpanded = expandedIds.has(c.id);
            const isSelected = selectedIds.has(c.id);
            return (
              <Card key={c.id} className="p-0 overflow-hidden relative">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(c.id)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => toggleSelected(c.id, checked === true)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <h4 className="font-semibold">{c.name}</h4>
                </div>
                {/* El contenido queda siempre montado (solo movido fuera de pantalla
                    cuando está colapsado, nunca con display:none) para que las 3
                    imágenes del Business Case se puedan capturar con html-to-image
                    aunque la tarjeta esté colapsada al momento de generar el PPT. */}
                <div
                  className="px-4 pb-4 space-y-3"
                  style={isExpanded ? undefined : { position: "absolute", left: -99999, top: 0, visibility: "hidden" }}
                >
                  <p className="text-sm text-muted-foreground italic">{buildSubtitle(c.name, c.inputs)}</p>
                  <div className="flex flex-wrap gap-4 overflow-x-auto">
                    <ResumenBusinessCase ref={(el) => (refs.b = el)} result={c.result!} />
                    <DatosRegionA ref={(el) => (refs.a = el)} inputs={c.inputs!} result={c.result!} />
                    <DatosRegionB ref={(el) => (refs.c = el)} inputs={c.inputs!} result={c.result!} />
                    <div className="border rounded p-3 bg-muted/30 min-w-[220px]">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Aspectos Clave</p>
                      <ul className="text-sm list-disc list-inside space-y-0.5">
                        {buildBullets(c).map((b) => <li key={b}>{b}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
