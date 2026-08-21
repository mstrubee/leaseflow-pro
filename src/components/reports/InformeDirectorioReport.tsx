import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import { computeBC, type BCInputs, type BCResult, type BCSeed } from "@/lib/businessCase/model";
import { buildBCSeed } from "@/lib/businessCase/buildSeed";
import { fmtMM } from "@/lib/businessCase/format";
import { buildResumenEjecutivoRows, buildPnlRows } from "@/lib/businessCase/reportRows";
import { buildCapexPPTData } from "@/components/budget/CapexPPTExport";
import { generateInformeDirectorioPPT, type ContractSlideData } from "@/components/reports/InformeDirectorioPPT";
import { BusinessCaseFinanciero } from "@/components/contracts/BusinessCaseFinanciero";
import { CompanyLogo, getCompanyNames } from "@/components/contracts/CompanyLogo";
import { useReportsNavigation } from "@/components/reports/ReportsReturnButton";
import { AssignIsochroneDialog } from "@/components/reports/AssignIsochroneDialog";
import { ISOCHRONE_SLIDES_BUCKET, dataUrlToBlob, blobToBase64 } from "@/lib/geochile/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, ChevronDown, ChevronRight, BarChart3, ExternalLink, MapPin, Share2, Copy, Check, Image as ImageIcon } from "lucide-react";
import { shareInformeDirectorio, DEFAULT_SHARE_DAYS } from "@/lib/boardReport/share";

const MAROON = "#C0003F";
const MAROON_LIGHT = "#FBE4EA";
const GRAY_HIGHLIGHT = "#D9D9D9";

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
  seed: BCSeed;
  companyNames: string[];
  durationMonths: number | null;
  noticeType: string | null;
  noticeValue: string | null;
  effectiveDate: string | null;
  noticeRanges: NoticeRange[];
  isochroneLink: { name: string; folderName: string | null } | null;
  isochroneReport: { isochroneName: string; slide1Path: string; slide2Path: string | null } | null;
}

const COMITE_GP_STATUS = "En Revisión";

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
  // CAPEX sin inventario (capital de trabajo, no es CAPEX) — mismo criterio
  // que "CAPEX Est." en ContractsTable.tsx. totalCapex sí lo incluye.
  const inventario = c.result.inv.rows.find((row) => row.id === "inv")?.monto || 0;
  bullets.push(`CAPEX ${fmtMM(c.result.totalCapex - inventario, 0)} mm$`);
  const ventasProyectadas = (c.result.ingresos[4] + c.result.ingresos[5]) / 2;
  bullets.push(`Ventas Proyectadas: ${fmtMM(ventasProyectadas, 0)} mm$`);
  const anio = deriveSalidaAnio(c);
  if (c.durationMonths) {
    const years = Math.round(c.durationMonths / 12);
    bullets.push(`Contrato ${years} Año${years === 1 ? "" : "s"}${anio !== null ? `, con salida durante el año ${anio}` : ""}`);
  }
  return bullets;
}

// Mismo separador ("→") que usa la plantilla de referencia (PPT Directorio.pptx).
function buildSubtitle(name: string, inputs: BCInputs | null): string {
  const isExpress = inputs?.formato === "Express";
  return `Nuevo Local ${name}${isExpress ? " → Formato Express" : ""}`;
}

function InfoTablePreview({ inputs, result }: { inputs: BCInputs; result: BCResult }) {
  const rows = buildResumenEjecutivoRows(inputs, result);
  return (
    <table className="text-[11px] border-collapse w-full max-w-xs">
      <thead>
        <tr><th colSpan={3} className="text-left text-white px-2 py-1" style={{ background: MAROON }}>Resumen Ejecutivo NUEVO LOCAL</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: r.highlight ? MAROON_LIGHT : undefined, borderTop: r.divider ? `2px solid ${MAROON}` : "1px solid #e5e5e5" }}>
            <td className="px-2 py-0.5">{r.label}</td>
            <td className="px-2 py-0.5 text-muted-foreground">{r.unit}</td>
            <td className="px-2 py-0.5 text-right font-medium">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PnlTablePreview({ inputs, result }: { inputs: BCInputs; result: BCResult }) {
  const rows = buildPnlRows(inputs, result);
  const startYear = inputs.inicio ? new Date(inputs.inicio).getFullYear() : new Date().getFullYear();
  return (
    <table className="text-[11px] border-collapse w-full">
      <thead>
        <tr>
          <th className="text-left text-white px-2 py-1" style={{ background: MAROON }}>Año</th>
          {[1, 2, 3, 4, 5].map((n, i) => (
            <th key={n} className="text-white px-2 py-1 text-center" style={{ background: MAROON }}>
              {n}<br /><span className="font-normal text-[10px]">{startYear + i}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          if (!r.label) return <tr key={i}><td colSpan={6} className="h-2" /></tr>;
          const bg = r.maroonHighlight ? MAROON : r.grayHighlight ? GRAY_HIGHLIGHT : undefined;
          const color = r.maroonHighlight ? "white" : undefined;
          return (
            <tr key={i} style={{ background: bg, color, fontWeight: r.bold ? 600 : 400 }}>
              <td className="px-2 py-0.5">{r.label}</td>
              {r.values.map((v, vi) => <td key={vi} className="px-2 py-0.5 text-right">{vi === 0 && r.col0 ? r.col0 : v}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InformeDirectorioReport() {
  const { isAdmin, user } = useAuth();
  const { ufValue } = useEconomicIndicators();
  const { config, loading: cfgLoading } = useBusinessCaseAdminConfig();
  const { navigateToContractFromReports } = useReportsNavigation();
  const [contracts, setContracts] = useState<ContractEligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Link recién emitido. Se muestra en pantalla en vez de solo copiarlo al
  // portapapeles: si el copiado falla —Safari lo bloquea fuera de un gesto
  // directo— el usuario igual necesita poder tomarlo a mano.
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bcDialogContractId, setBcDialogContractId] = useState<string | null>(null);
  const [isoDialogContractId, setIsoDialogContractId] = useState<string | null>(null);

  const year = new Date().getFullYear().toString();

  const loadContracts = async () => {
    setLoading(true);
    try {
      const { data: contractRows, error } = await supabase
        .from("contracts")
        .select("id, name, superficie_edificada_local, metros_lineales_frente, contract_companies(companies(name)), contract_addresses(street, number, commune)")
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

      // "*" (no lista acotada de columnas): el Business Case de esta pantalla
      // tiene que ser un espejo exacto del que se ve en la ficha del contrato
      // (ContractDetail.tsx usa contract_versions (*, ...) también). Antes
      // esta query traía solo un subconjunto de columnas y le faltaban los
      // campos de escalonamiento/GGCC extendido/fondo de promoción/ajustes
      // periódicos, así que buildBCSeed armaba acá un Business Case distinto
      // al de la ficha del contrato para el mismo contrato.
      const { data: versionRows } = await supabase
        .from("contract_versions")
        .select("*")
        .in("contract_id", ids)
        .eq("is_current", true);
      const versionIds = (versionRows || []).map((v) => v.id);
      const { data: escalationRows } = versionIds.length
        ? await supabase
            .from("rent_escalations")
            .select("id, version_id, month_number, amount, is_uf_m2")
            .in("version_id", versionIds)
        : { data: [] as { id: string; version_id: string; month_number: number; amount: number; is_uf_m2: boolean }[] };
      const escalationsByVersion = new Map<string, { id: string; month_number: number; amount: number; is_uf_m2: boolean }[]>();
      (escalationRows || []).forEach((e) => {
        const arr = escalationsByVersion.get(e.version_id) || [];
        arr.push({ id: e.id, month_number: e.month_number, amount: e.amount, is_uf_m2: e.is_uf_m2 });
        escalationsByVersion.set(e.version_id, arr);
      });
      const versionByContract = new Map<string, (typeof versionRows[number]) & { rent_escalations: { id: string; month_number: number; amount: number; is_uf_m2: boolean }[] }>();
      (versionRows || []).forEach((v) =>
        versionByContract.set(v.contract_id, { ...v, rent_escalations: escalationsByVersion.get(v.id) || [] }),
      );

      const { data: linkRows } = await supabase
        .from("contract_isochrone_links" as any)
        .select("contract_id, isochrone_name, folder_name")
        .in("contract_id", ids);
      const linkByContract = new Map<string, { name: string; folderName: string | null }>();
      (linkRows || []).forEach((r: any) => linkByContract.set(r.contract_id, { name: r.isochrone_name, folderName: r.folder_name }));

      const { data: reportRows } = await supabase
        .from("contract_isochrone_reports" as any)
        .select("contract_id, isochrone_name, slide1_path, slide2_path")
        .in("contract_id", ids);
      const reportByContract = new Map<string, { isochroneName: string; slide1Path: string; slide2Path: string | null }>();
      (reportRows || []).forEach((r: any) =>
        reportByContract.set(r.contract_id, { isochroneName: r.isochrone_name, slide1Path: r.slide1_path, slide2Path: r.slide2_path }),
      );

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
        const seed = buildBCSeed({
          contract: c,
          version: version as any,
          address: c.contract_addresses?.[0] || null,
          ufValue,
        });
        return {
          id: c.id,
          name: c.name,
          hasBusinessCase: !!inputs,
          inputs,
          result: computed,
          seed,
          companyNames: getCompanyNames(c.contract_companies as any),
          durationMonths: version?.duration_months ?? null,
          noticeType: version?.notice_type ?? null,
          noticeValue: version?.notice_value ?? null,
          effectiveDate: version?.effective_date ?? null,
          noticeRanges: version ? rangesByVersion.get(version.id) || [] : [],
          isochroneLink: linkByContract.get(c.id) || null,
          isochroneReport: reportByContract.get(c.id) || null,
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
  };

  useEffect(() => {
    if (cfgLoading) return;
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgLoading, config]);

  const withBC = useMemo(() => contracts.filter((c) => c.hasBusinessCase && c.result), [contracts]);
  const withoutBC = useMemo(() => contracts.filter((c) => !c.hasBusinessCase), [contracts]);
  const selectedContracts = useMemo(() => withBC.filter((c) => selectedIds.has(c.id)), [withBC, selectedIds]);
  const allSelected = withBC.length > 0 && selectedIds.size === withBC.length;
  const bcDialogContract = contracts.find((c) => c.id === bcDialogContractId) || null;
  const isoDialogContract = contracts.find((c) => c.id === isoDialogContractId) || null;

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

  const handleBcDialogChange = (open: boolean) => {
    if (!open) {
      const closedId = bcDialogContractId;
      setBcDialogContractId(null);
      // Refresca al cerrar: puede haberse creado/editado el Business Case.
      if (closedId) loadContracts();
    }
  };

  // AssignIsochroneDialog hace todo (link + proyección +, si corresponde,
  // stagear el informe) en una sola acción — acá solo hace falta recargar
  // para reflejar el resultado real de la DB.
  const handleAssociated = () => {
    loadContracts();
  };

  const handleApplyProjectionToBC = async (contractId: string, ventaMes: number[], ventaGrowthPct: number[]) => {
    // Se relee el Business Case directo de la DB (no desde el estado en
    // memoria de esta lista, que puede quedar desactualizado si se editó en
    // otra pantalla) para no pisar cambios recientes al mergear ventaMes.
    const { data: bcRow, error: fetchError } = await supabase
      .from("contract_business_cases")
      .select("inputs")
      .eq("contract_id", contractId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    const currentInputs = bcRow?.inputs as unknown as BCInputs | null;
    if (!currentInputs) throw new Error("Este contrato no tiene Business Case cargado");
    // ventaGrowthPct = curva de maduración de Geochile ("Crec." en su panel).
    // NO toca ufRates (UF real/inflación), es un supuesto totalmente aparte.
    const mergedInputs: BCInputs = { ...currentInputs, ventaMes, ventaGrowthPct };
    const computed = computeBC(mergedInputs, config);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("contract_business_cases").upsert(
      {
        contract_id: contractId,
        inputs: mergedInputs as unknown as Record<string, unknown>,
        computed: computed as unknown as Record<string, unknown>,
        created_by: u?.user?.id ?? null,
      } as never,
      { onConflict: "contract_id" },
    );
    if (error) throw error;
    if (ventaMes.length > 0) {
      await supabase.from("contracts").update({
        venta_estimada: Math.min(...ventaMes) * 1_000_000,
        venta_estimada_max: Math.max(...ventaMes) * 1_000_000,
      } as never).eq("id", contractId);
    }
    loadContracts();
  };

  // Descarga con reintento: un error transitorio de Storage (momentáneo, de
  // red) hacía que la lámina se cayera en silencio de ESE PPT únicamente —
  // pero como clearExtractedReports (más abajo) desvinculaba el informe
  // igual para todos los contratos incluidos sin chequear si su lámina
  // realmente se había adjuntado, un solo fallo transitorio dejaba el
  // contrato SIN informe territorial para siempre (nadie lo notaba porque
  // no había ningún aviso). Ahora se reintenta, se loguea si igual falla, y
  // clearExtractedReports solo desvincula los contratos cuya lámina sí quedó
  // adjunta — ver geochileFailures/geochileSucceededIds en buildReportParams.
  const downloadSlideWithRetry = async (path: string, contractName: string, attempts = 2): Promise<Blob | null> => {
    for (let i = 0; i < attempts; i++) {
      const { data, error } = await supabase.storage.from(ISOCHRONE_SLIDES_BUCKET).download(path);
      if (data && !error) return data;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 600));
      else console.error(`[InformeDirectorio] No se pudo descargar "${path}" (${contractName}):`, error);
    }
    return null;
  };

  const loadGeochileSlides = async (
    c: ContractEligible,
    failures: string[],
  ): Promise<ContractSlideData["geochileSlides"]> => {
    if (!c.isochroneReport) return undefined;
    const d1 = await downloadSlideWithRetry(c.isochroneReport.slide1Path, c.name);
    if (!d1) {
      failures.push(c.name);
      return undefined;
    }
    const slide1 = await blobToBase64(d1);
    let slide2: string | undefined;
    if (c.isochroneReport.slide2Path) {
      const d2 = await downloadSlideWithRetry(c.isochroneReport.slide2Path, c.name);
      if (d2) slide2 = await blobToBase64(d2);
      else failures.push(`${c.name} (lámina 2)`);
    }
    return { slide1, slide2 };
  };

  const buildReportParams = async () => {
    const capexData = await buildCapexPPTData(year, ufValue || 0);
    const geochileFailures: string[] = [];
    const geochileSucceededIds: string[] = [];
    const contractSlides: ContractSlideData[] = await Promise.all(
      selectedContracts.map(async (c) => {
        const geochileSlides = await loadGeochileSlides(c, geochileFailures);
        if (c.isochroneReport && geochileSlides) geochileSucceededIds.push(c.id);
        return {
          contractName: c.name,
          subtitle: buildSubtitle(c.name, c.inputs),
          bullets: buildBullets(c),
          inputs: c.inputs!,
          result: c.result!,
          geochileSlides,
        };
      }),
    );
    return { params: { year, capexData, contractSlides }, geochileFailures, geochileSucceededIds };
  };

  const warnGeochileFailures = (failures: string[]) => {
    if (failures.length === 0) return;
    toast.warning(
      `No se pudo adjuntar la lámina territorial de: ${failures.join(", ")}. El resto del informe se generó igual — reintenta la descarga para esos contratos.`,
      { duration: 12000 },
    );
  };

  // El informe extraído es un stage temporal ("hasta que se genere el PPT"):
  // una vez incluido en una descarga exitosa, se limpia — no queda dando
  // vueltas indefinidamente ni hay que acordarse de sacarlo a mano. Solo se
  // desvincula lo que REALMENTE quedó adjunto en el PPT (succeededIds) — si
  // la descarga de una lámina falló, su vínculo se conserva para poder
  // reintentar, en vez de perderse en silencio.
  const clearExtractedReports = async (contractIds: string[]) => {
    const withReport = contracts.filter((c) => contractIds.includes(c.id) && c.isochroneReport);
    if (withReport.length === 0) return;
    const paths = withReport.flatMap((c) => [c.isochroneReport!.slide1Path, c.isochroneReport!.slide2Path].filter(Boolean) as string[]);
    await supabase.storage.from(ISOCHRONE_SLIDES_BUCKET).remove(paths);
    await supabase.from("contract_isochrone_reports" as any).delete().in("contract_id", withReport.map((c) => c.id));
  };

  const handleShare = async () => {
    if (selectedContracts.length === 0) {
      toast.error("Selecciona al menos un contrato para incluir en el informe");
      return;
    }
    if (!user?.id) {
      toast.error("Tu sesión expiró. Vuelve a iniciar sesión para compartir el informe.");
      return;
    }
    setSharing(true);
    setShareUrl(null);
    setCopied(false);
    try {
      toast.info("Generando y subiendo el informe...");
      const { params, geochileFailures } = await buildReportParams();
      const { url } = await shareInformeDirectorio({
        report: params,
        contractIds: selectedContracts.map((c) => c.id),
        userId: user.id,
      });
      setShareUrl(url);
      warnGeochileFailures(geochileFailures);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success(`Link copiado. Vence en ${DEFAULT_SHARE_DAYS} días.`);
      } catch {
        toast.success(`Link generado. Vence en ${DEFAULT_SHARE_DAYS} días.`);
      }
    } catch (err) {
      console.error("Error compartiendo Informe Directorio:", err);
      toast.error(err instanceof Error ? err.message : "Error al compartir el informe");
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (selectedContracts.length === 0) {
      toast.error("Seleccioná al menos un contrato para incluir en el informe");
      return;
    }
    setGenerating(true);
    try {
      toast.info("Generando Informe Directorio...");
      const { params, geochileFailures, geochileSucceededIds } = await buildReportParams();
      await generateInformeDirectorioPPT(params);
      await clearExtractedReports(geochileSucceededIds);
      loadContracts();
      toast.success("Informe Directorio descargado");
      warnGeochileFailures(geochileFailures);
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

  const allContracts = [...withBC, ...withoutBC];

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
          <Button
            variant="outline"
            onClick={handleShare}
            disabled={sharing || generating || selectedContracts.length === 0}
          >
            {sharing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
            Compartir link
          </Button>
          <Button onClick={handleDownload} disabled={generating || sharing || selectedContracts.length === 0}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar PPT
          </Button>
        </div>
      </div>

      {shareUrl && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Share2 className="h-4 w-4" />
            Link para compartir
            <Badge variant="secondary">vence en {DEFAULT_SHARE_DAYS} días</Badge>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                } catch {
                  toast.error("No se pudo copiar. Selecciona el link y cópialo a mano.");
                }
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cualquiera con este link puede descargar el informe, sin necesidad de cuenta.
            Contiene los Business Case completos — compártelo solo con el directorio.
          </p>
        </div>
      )}

      {allContracts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No hay contratos en negociación con Comité GP "En Revisión".
        </p>
      ) : (
        <div className="space-y-3">
          {allContracts.map((c) => {
            const isExpanded = expandedIds.has(c.id);
            const isSelected = selectedIds.has(c.id);
            const bcButtonLabel = !c.hasBusinessCase ? "Crear Business Case" : isAdmin ? "Editar Business Case" : "Ver Business Case";
            return (
              <Card key={c.id} className="p-0 overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(c.id)}
                >
                  {c.hasBusinessCase ? (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleSelected(c.id, checked === true)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <CompanyLogo companyNames={c.companyNames} size="sm" />
                  <h4 className="font-semibold flex-1">{c.name}</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={(e) => { e.stopPropagation(); setBcDialogContractId(c.id); }}
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> {bcButtonLabel}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-1.5 shrink-0 ${c.isochroneLink ? "border-green-500 text-green-700 bg-green-50 hover:bg-green-100 hover:text-green-800" : ""}`}
                    onClick={(e) => { e.stopPropagation(); setIsoDialogContractId(c.id); }}
                  >
                    <MapPin className="h-3.5 w-3.5" /> Asociar Isócrona
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={(e) => { e.stopPropagation(); navigateToContractFromReports(c.id, "directorio"); }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ir al Contrato
                  </Button>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {c.isochroneLink && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Isócrona asociada: {c.isochroneLink.name}
                        {c.isochroneLink.folderName ? ` (${c.isochroneLink.folderName})` : ""}
                      </p>
                    )}
                    {c.isochroneReport && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Informe territorial extraído de "{c.isochroneReport.isochroneName}" — se incluirá en el PPT
                      </p>
                    )}
                    {!c.hasBusinessCase ? (
                      <p className="text-sm text-muted-foreground italic">Sin Business Case</p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground italic">{buildSubtitle(c.name, c.inputs)}</p>
                        <div className="border rounded p-3 bg-muted/30">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Aspectos Clave</p>
                          <ul className="text-sm list-disc list-inside space-y-0.5">
                            {buildBullets(c).map((b) => <li key={b}>{b}</li>)}
                          </ul>
                        </div>
                        <div className="flex flex-wrap gap-4 overflow-x-auto">
                          <div className="border rounded overflow-hidden">
                            <InfoTablePreview inputs={c.inputs!} result={c.result!} />
                          </div>
                          <div className="border rounded overflow-hidden flex-1 min-w-[500px]">
                            <PnlTablePreview inputs={c.inputs!} result={c.result!} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {bcDialogContract && (
        <BusinessCaseFinanciero
          open={!!bcDialogContractId}
          onOpenChange={handleBcDialogChange}
          contractId={bcDialogContract.id}
          canEdit={isAdmin}
          seed={bcDialogContract.seed}
        />
      )}

      {isoDialogContract && (
        <AssignIsochroneDialog
          open={!!isoDialogContractId}
          onOpenChange={(open) => setIsoDialogContractId(open ? isoDialogContractId : null)}
          contractId={isoDialogContract.id}
          contractName={isoDialogContract.name}
          hasBusinessCase={isoDialogContract.hasBusinessCase}
          businessCaseFormato={isoDialogContract.inputs?.formato}
          onAssigned={handleAssociated}
          onApplyToBusinessCase={handleApplyProjectionToBC}
        />
      )}
    </div>
  );
}
