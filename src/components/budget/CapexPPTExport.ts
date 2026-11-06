import PptxGenJS from "pptxgenjs";

// Shape/chart type helpers to avoid .shapes/.charts accessor issues
const SHAPES = {
  LINE: "line" as const,
  RECTANGLE: "rect" as const,
};
const CHARTS = {
  PIE: "pie" as const,
};
import JSZip from "jszip";
import { formatCLP } from "@/lib/utils";
import logosHeader from "@/assets/logos-header.png";
import { supabase } from "@/integrations/supabase/client";
import { loadBudgetTotals } from "@/lib/budgetTotals";

interface ContractData {
  contract_id: string;
  contract_name: string;
  clasificacion: string | null;
  superficie: number;
  company_names: string[];
  authorized: number;
  unauthorized: number;
  total_uf: number;
  total_clp: number;
  uf_m2: number;
}

// Un total por "Tipo de CAPEX" -- dinámico según lo que esté configurado en
// Admin > Estados y Categorías > Tipos de CAPEX (ya no son 3 fijos
// "nuevo"/"reemplazo"/"regularizacion").
export interface ClasificacionTotal {
  name: string;
  color: string;
  uf: number;
  count: number;
  /** Desglose CLP por año, igual al que muestran las cards de /capex --
   * opcional (no lo arma buildCapexPPTData, que es de un solo año). */
  yearBreakdown?: Record<number, number>;
}

interface CompanyGroup {
  company: string;
  contracts: ContractData[];
  totals: {
    byType: ClasificacionTotal[];
    total: number;
  };
}

export interface CapexPPTData {
  year: string;
  ufValue: number;
  totalCapexUF: number;
  clasificacionTotals: ClasificacionTotal[];
  totalLocales: number;
  companyGroups: CompanyGroup[];
  /** Desglose CLP por año del total general -- mismo formato "mm$ X año YYYY"
   * que las cards de /capex. */
  totalYearBreakdown?: Record<number, number>;
  /** Una slide "Estado de Avance y Presupuesto Aprobado" POR AÑO (2026 en
   * adelante), con el desglose de Estado de Avance de ESE año específico
   * (incluye el desglose por empresa en chips, y la tabla de contratos con
   * empresa/tipo de CAPEX/monto/fecha, para mostrarlos debajo de su card) y
   * su propia fila de Presupuesto Aprobado -- opcional, agrega una slide
   * por cada año presente. */
  avanceByYear?: Array<{
    year: number;
    avanceTotals: Array<ClasificacionTotal & {
      companyBreakdown: Array<{ company: string; uf: number }>;
      contractRows: Array<{ contractName: string; company: string; clasificacion: string | null; uf: number; date: string | null }>;
    }>;
    approvedBudget?: { aprobadoMM: number; totalMM: number; disponibleMM: number };
  }>;
}

interface RawBudget {
  contract_id: string;
  contract_name: string;
  clasificacion: string | null;
  year: number;
  amount_uf: number;
  budget_id: string;
  superficie: number;
  company_names: string[];
}

/**
 * Reconstruye el mismo CapexPPTData que arma CapexDashboard.tsx para el botón
 * "PPT general", pero de forma standalone (sin depender del estado de esa
 * página) — usado por el Informe Directorio para poder generarse desde
 * /reports sin tener /capex abierto. Replica: query de contract_budgets,
 * loadBudgetTotals (misma agregación que "Control de Presupuesto"), y el
 * agrupamiento por empresa (Autoplanet/Agroplanet/Grupo Planet/Otra).
 */
export async function buildCapexPPTData(year: string, ufValue: number): Promise<CapexPPTData> {
  const { data: typesData } = await (supabase as any)
    .from("capex_clasificacion_types")
    .select("id, name, color")
    .eq("is_active", true)
    .order("display_order");
  const clasificacionTypes: Array<{ id: string; name: string; color: string }> = typesData || [];

  const { data, error } = await supabase
    .from("contract_budgets")
    .select("id, contract_id, year, amount_uf, budget_type, contracts!inner(name, clasificacion, superficie_edificada_local, contract_companies(companies(name)))")
    .eq("budget_type", "capex")
    .eq("year", parseInt(year))
    .is("contracts.deleted_at", null);
  if (error) throw error;

  const budgets: RawBudget[] = (data || []).map((b: any) => ({
    contract_id: b.contract_id,
    contract_name: b.contracts?.name || "Sin nombre",
    clasificacion: b.contracts?.clasificacion || null,
    year: b.year,
    amount_uf: b.amount_uf,
    budget_id: b.id,
    superficie: b.contracts?.superficie_edificada_local || 0,
    company_names: (b.contracts?.contract_companies || []).map((cc: any) => cc.companies?.name).filter(Boolean) as string[],
  }));

  const budgetIds = budgets.map((b) => b.budget_id);
  const totals = await loadBudgetTotals(budgetIds, ufValue);

  const getEffectiveTotal = (b: RawBudget): number => {
    const t = totals.get(b.budget_id);
    const cardAmount = b.amount_uf || 0;
    const linesTotal = t?.grand || 0;
    return cardAmount > 0 ? cardAmount : linesTotal;
  };

  // Agrupar por contrato
  const contractMap = new Map<string, RawBudget[]>();
  budgets.forEach((b) => {
    const existing = contractMap.get(b.contract_id) || [];
    existing.push(b);
    contractMap.set(b.contract_id, existing);
  });
  const contractGroups = Array.from(contractMap.entries());

  const authByContract: Record<string, number> = {};
  contractGroups.forEach(([contractId, cBudgets]) => {
    authByContract[contractId] = cBudgets.reduce((s, b) => s + getEffectiveTotal(b), 0);
  });

  // Agrupar por empresa (misma heurística que CapexDashboard.tsx)
  const companyMap = new Map<string, [string, RawBudget[]][]>();
  contractGroups.forEach((entry) => {
    const [, cBudgets] = entry;
    const names = cBudgets[0].company_names;
    const hasAgroplanet = names.some((n) => n.toLowerCase().includes("agroplanet"));
    const hasAutoplanet = names.some((n) => n.toLowerCase().includes("autoplanet"));
    const hasGrupoPlanet = names.some((n) => /grupo\s*planet/.test(n.toLowerCase()));
    const companyKey = (hasAgroplanet && hasAutoplanet) ? "Agroplanet"
      : hasAutoplanet ? "Autoplanet"
      : hasAgroplanet ? "Agroplanet"
      : hasGrupoPlanet ? "Grupo Planet"
      : "Otra";
    const existing = companyMap.get(companyKey) || [];
    existing.push(entry);
    companyMap.set(companyKey, existing);
  });
  const order = ["Autoplanet", "Agroplanet", "Grupo Planet", "Otra"];
  const orderedCompanyGroups = order
    .filter((k) => companyMap.has(k))
    .map((k) => ({ company: k, contracts: companyMap.get(k)! }));

  // Totales globales por tipo (para la slide de Resumen General)
  const globalByType: Record<string, { uf: number; count: number }> = {};

  const pptCompanyGroups: CompanyGroup[] = orderedCompanyGroups.map(({ company, contracts }) => {
    const companyByType: Record<string, { uf: number; count: number }> = {};
    const seen = new Set<string>();

    const contractsData: ContractData[] = contracts.map(([contractId, cBudgets]) => {
      const totalUf = authByContract[contractId] || 0;
      const superficie = cBudgets[0].superficie || 0;
      if (!seen.has(contractId)) {
        seen.add(contractId);
        const cl = cBudgets[0].clasificacion;
        if (cl) {
          if (!companyByType[cl]) companyByType[cl] = { uf: 0, count: 0 };
          companyByType[cl].uf += totalUf;
          companyByType[cl].count++;
          if (!globalByType[cl]) globalByType[cl] = { uf: 0, count: 0 };
          globalByType[cl].uf += totalUf;
          globalByType[cl].count++;
        }
      }
      return {
        contract_id: contractId,
        contract_name: cBudgets[0].contract_name,
        clasificacion: cBudgets[0].clasificacion,
        superficie,
        company_names: cBudgets[0].company_names,
        authorized: 0,
        unauthorized: totalUf,
        total_uf: totalUf,
        total_clp: totalUf * (ufValue || 0),
        uf_m2: superficie > 0 ? totalUf / superficie : 0,
      };
    });

    const byType: ClasificacionTotal[] = clasificacionTypes
      .filter((t) => companyByType[t.name])
      .map((t) => ({ name: t.name, color: t.color, uf: companyByType[t.name].uf, count: companyByType[t.name].count }));

    return {
      company,
      contracts: contractsData,
      totals: { byType, total: byType.reduce((s, t) => s + t.uf, 0) },
    };
  });

  const totalCapexUF = Object.values(authByContract).reduce((s, v) => s + v, 0);

  const clasificacionTotals: ClasificacionTotal[] = clasificacionTypes
    .filter((t) => globalByType[t.name])
    .map((t) => ({ name: t.name, color: t.color, uf: globalByType[t.name].uf, count: globalByType[t.name].count }));

  return {
    year,
    ufValue,
    totalCapexUF,
    clasificacionTotals,
    totalLocales: contractGroups.length,
    companyGroups: pptCompanyGroups,
  };
}

// Mismos colores/tipografía que el Business Case Financiero (ver
// InformeDirectorioPPT.ts / exportV2.ts) -- para que el PPT de CAPEX,
// el PPT del Informe Directorio y el PDF del Business Case se vean
// como un mismo documento.
// PRIMARY = ACCENT a propósito: pedido explícito de que todos los rojos de
// las slides 2 en adelante sean el MISMO rojo que el fondo de la portada
// (antes PRIMARY era un maroon distinto, C0003F, y convivía con variantes
// de texto claro ligeramente distintas -- F5C6D0 vs F5C6C4 -- lo que hacía
// que el rojo se viera inconsistente entre slides).
export const ACCENT = "C21D18"; // Rojo de portada (slide 1) -- único rojo de toda la presentación
export const PRIMARY = ACCENT;
export const WHITE = "FFFFFF";
export const LIGHT_BG = "FBE4EA"; // Rojo muy claro, para fondos de card
export const LIGHT_TEXT = "F5C6C4"; // Rojo claro, para texto sobre fondo ACCENT/PRIMARY (mismo que la portada)
export const MUTED = "666666";
export const DARK = "1A1A1A";
const BORDER = "CCCCCC";

// Toda la presentación usa el formato ancho (13.33x7.5", LAYOUT_WIDE) en vez
// del 16:9 más angosto (10x5.625") que se usaba antes -- pedido explícito
// para que la lámina de Resumen General + Estado de Avance (fusionada, ver
// más abajo) pueda listar TODOS los locales de cada estado sin truncar
// ("+ N más"). W() escala cualquier medida (posición, tamaño, tamaño de
// fuente) pensada para el formato angosto al nuevo ancho (factor 4/3,
// 13.33/10), para que el resto de las láminas (portada, por empresa) se
// vean igual que antes pero más grandes, sin tener que rehacerlas a mano.
const WIDE_SCALE = 4 / 3;
const W = (v: number) => v * WIDE_SCALE;
const SLIDE_H = 7.5;

// Mismos 7 colores administrables que usan CapexClasificacionTypeManager /
// CapexAvanceStatusManager (green/red/blue/yellow/purple/orange/gray), acá
// en hex para pptxgenjs en vez de clases Tailwind.
const COLOR_HEX: Record<string, string> = {
  green: "22C55E",
  red: "EF4444",
  blue: "3B82F6",
  yellow: "EAB308",
  purple: "A855F7",
  orange: "F97316",
  gray: "8C8C8C",
};

// Colores para la torta "Por año" (distribución del CAPEX total entre años)
// -- deliberadamente distintos de los de clasificación (COLOR_HEX) para no
// confundirse con la leyenda de Nuevo/Reemplazo/etc.
const YEAR_PIE_COLORS = [PRIMARY, "8C8C8C", "3B82F6", "F97316", "22C55E"];

// Ningún año anterior a este se muestra en el PPT (ni en las tortas de la
// slide 2, ni como slide propia de "Estado de Avance y Presupuesto
// Aprobado") -- pedido explícito, no interesan años pasados.
const PPT_MIN_YEAR = 2026;
const colorHex = (c?: string) => COLOR_HEX[c || "gray"] || COLOR_HEX.gray;

const fmtUF = (v: number) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: 0 });

const fmtUF2 = (v: number) =>
  v.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mismo formato que las cards de /capex: "mm$ 1.711 año 2026".
const fmtYearChip = (clp: number, year: number) =>
  `mm$ ${Math.round(clp / 1_000_000).toLocaleString("es-CL")} año ${year}`;

// Años con CAPEX real (> 0) -- mismo criterio que los chips en /capex
// (YearBreakdownChips): un año en $0 no corresponde mostrarlo.
const yearsWithCapex = (breakdown: Record<number, number> | undefined): number[] =>
  breakdown
    ? Object.keys(breakdown).map(Number).filter((y) => breakdown[y] > 0).sort((a, b) => a - b)
    : [];

// Un chip por línea (uno sobre otro), igual que en /capex -- no en una sola
// línea separados por "·".
const yearBreakdownLine = (breakdown: Record<number, number> | undefined): string => {
  const years = yearsWithCapex(breakdown);
  if (years.length === 0) return "";
  return years.map((y) => fmtYearChip(breakdown![y], y)).join("\n");
};

// El nombre de la clasificación es el mismo texto libre que se guarda en
// contracts.clasificacion (el "name" de cualquier "Tipo de CAPEX" que exista
// en Admin en el momento en que se asignó) -- no hay 3 valores fijos.
const clasificacionLabel = (c: string | null) => c && c.trim() ? c : "Sin clasificar";

export async function loadImageAsBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// pptxgenjs no expone "explosion" (el espacio nativo de PowerPoint entre
// las porciones de una torta) -- se post-procesa el .pptx ya generado,
// inyectando <c:explosion> en cada <c:dPt> de cada gráfico de torta. Cada
// punto de datos de una torta con chartColors (como arma este archivo)
// siempre trae "<c:bubble3D val="0"/>" seguido de su propio <c:spPr> -- el
// explosion debe ir justo entre esos dos nodos según el schema de OOXML
// (CT_DPt: idx, invertIfNegative?, marker?, bubble3D?, explosion?, spPr?).
async function addPieSliceGaps(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const chartPaths = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
  for (const path of chartPaths) {
    const xml = await zip.file(path)!.async("text");
    if (!xml.includes("<c:pieChart")) continue;
    zip.file(path, xml.replace(/<c:bubble3D val="0"\/>/g, '<c:bubble3D val="0"/><c:explosion val="6"/>'));
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

export interface GenerateCapexPPTOptions {
  /** Instancia existente de PptxGenJS a la que agregar las slides, en vez de crear una nueva. */
  pres?: PptxGenJS;
  /** Omite la slide de portada propia (usada cuando el llamador ya agregó la suya). */
  skipCover?: boolean;
  /** Omite el guardado/descarga del archivo, retornando el `pres` para seguir agregando slides. */
  skipSave?: boolean;
}

export async function generateCapexPPT(data: CapexPPTData, opts: GenerateCapexPPTOptions = {}): Promise<PptxGenJS> {
  const fileName = `CAPEX_${data.year}_${new Date().toISOString().slice(0, 10)}.pptx`;

  type FileHandle = { createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };
  let saveHandle: FileHandle | null = null;
  const canPick = !opts.skipSave && typeof (window as any).showSaveFilePicker === "function";
  if (canPick) {
    try {
      saveHandle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "Presentación PowerPoint", accept: { "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"] } }],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      saveHandle = null;
    }
  }

  const pres = opts.pres ?? new PptxGenJS();
  if (!opts.pres) {
    pres.layout = "LAYOUT_WIDE";
    pres.author = "GPlanet";
    pres.title = `Presupuesto CAPEX ${data.year}`;
  }

  const addFooter = (slide: PptxGenJS.Slide, pageNum: number) => {
    slide.addText(`Presupuesto CAPEX ${data.year}`, {
      x: W(0.5), y: W(5.25), w: W(5), h: W(0.3),
      fontSize: W(8), color: MUTED, fontFace: "Arial",
    });
    slide.addText(`${pageNum}`, {
      x: W(8.5), y: W(5.25), w: W(1), h: W(0.3),
      fontSize: W(8), color: MUTED, fontFace: "Arial", align: "right",
    });
  };

  // Header común a toda lámina de contenido (todo menos la portada): título
  // "PRESUPUESTO CAPEX" + subtítulo + línea divisoria -- antes se repetía
  // (con los mismos 3 valores) en cada lugar donde se armaba una lámina.
  const addPageHeader = (slide: PptxGenJS.Slide, subtitle: string) => {
    slide.addText("PRESUPUESTO CAPEX", {
      x: W(0.5), y: W(0.2), w: W(9), h: W(0.3),
      fontSize: W(14), fontFace: "Arial", color: ACCENT, bold: true,
    });
    slide.addText(subtitle, {
      x: W(0.5), y: W(0.5), w: W(9.2), h: W(0.35),
      fontSize: W(16), fontFace: "Arial", color: DARK, bold: true,
    });
    slide.addShape(SHAPES.LINE, {
      x: W(0.5), y: W(0.87), w: W(9), h: 0,
      line: { color: BORDER, width: 1 },
    });
  };

  // ═══════════ SLIDE 1: Title ═══════════
  if (!opts.skipCover) {
    let logoBase64: string | null = null;
    try {
      logoBase64 = await loadImageAsBase64(logosHeader);
    } catch {
      console.log("Could not load logo for PPT");
    }

    const s1 = pres.addSlide();
    s1.background = { color: ACCENT };

    if (logoBase64) {
      s1.addImage({ data: logoBase64, x: W(0.5), y: W(0.4), w: W(2.5), h: W(1) });
    }

    s1.addText("Presupuesto CAPEX", {
      x: W(0.5), y: W(1.8), w: W(9), h: W(1),
      fontSize: W(40), fontFace: "Arial", color: WHITE, bold: true,
    });
    s1.addText(`Año ${data.year}`, {
      x: W(0.5), y: W(2.7), w: W(9), h: W(0.6),
      fontSize: W(24), fontFace: "Arial", color: WHITE,
    });

    s1.addShape(SHAPES.LINE, {
      x: W(0.5), y: W(3.5), w: W(3), h: 0,
      line: { color: WHITE, width: 3 },
    });

    const today = new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
    s1.addText(today, {
      x: W(0.5), y: W(4.0), w: W(9), h: W(0.4),
      fontSize: W(14), fontFace: "Arial", color: "F5C6C4",
    });
  }

  // ═══════════ SLIDE 2: Resumen General + Estado de Avance (fusionada) ═══
  // Antes eran hasta 3 slides separadas (Resumen General + una "Estado de
  // Avance y Presupuesto Aprobado" por año) -- pedido explícito de
  // fusionarlas en UNA sola lámina, listando TODOS los locales de cada
  // estado sin truncar ("+ N más"). La card grande "Inversión Total CAPEX"
  // (con el conteo de locales) y las cards de clasificación con su propio
  // desglose se eliminan de esta lámina -- la clasificación queda
  // representada solo por la leyenda junto a los gráficos de torta.
  let pageNum = 1;
  const s2 = pres.addSlide();
  s2.background = { color: "F2F2F2" };

  const avanceByYear = data.avanceByYear || [];
  const subtitleYears = avanceByYear.length > 0 ? avanceByYear.map((y) => y.year).join(" / ") : data.year;
  addPageHeader(s2, `Estado de Avance y Presupuesto Aprobado — ${subtitleYears}`);

  let cardsY = W(0.99);

  // --- Presupuesto Aprobado: una fila por año (antes, una tabla por slide) ---
  const approvedRows = avanceByYear.filter((y) => y.approvedBudget);
  if (approvedRows.length > 0) {
    const tableHeader: PptxGenJS.TableCell[] = [
      { text: "Año", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(10), fontFace: "Arial", align: "left" } },
      { text: "Ppto.", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(10), fontFace: "Arial", align: "right" } },
      { text: "Aprob. Gasto", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(10), fontFace: "Arial", align: "right" } },
      { text: "Disponible", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(10), fontFace: "Arial", align: "right" } },
    ];
    const cellOpts = (align: "left" | "right"): PptxGenJS.TextPropsOptions => ({
      fontSize: W(10), fontFace: "Arial", color: DARK, align,
    });
    const tableRows: PptxGenJS.TableRow[] = [tableHeader];
    approvedRows.forEach((yearData) => {
      const row = yearData.approvedBudget!;
      tableRows.push([
        { text: String(yearData.year), options: cellOpts("left") },
        { text: `mm$ ${row.aprobadoMM.toLocaleString("es-CL")}`, options: cellOpts("right") },
        { text: `mm$ ${row.totalMM.toLocaleString("es-CL")}`, options: cellOpts("right") },
        {
          text: `mm$ ${row.disponibleMM.toLocaleString("es-CL")}`,
          options: { ...cellOpts("right"), color: row.disponibleMM < 0 ? PRIMARY : "1E8E3E", bold: true },
        },
      ]);
    });
    s2.addTable(tableRows, {
      x: W(0.5), y: cardsY, w: W(9), h: W(0.19) * tableRows.length,
      colW: [W(2), W(2.33), W(2.33), W(2.34)],
      rowH: Array(tableRows.length).fill(W(0.19)),
      margin: [0.02, 0.05, 0.02, 0.05],
      border: { type: "solid", color: BORDER, pt: 0.5 },
      autoPage: false,
    });
    cardsY = cardsY + W(0.19) * tableRows.length + W(0.1);
  }

  // --- Gráficos de torta + leyenda: geometría calculada ANTES de las cards
  // de Estado de Avance (ver más abajo) porque ancla al borde inferior de
  // la slide -- las tablas de esas cards usan su borde superior como límite
  // de cuánto espacio tienen disponible, en vez de un alto fijo adivinado. ---
  const totalYears = yearsWithCapex(data.totalYearBreakdown);
  // Un año cuyo aporte al total es marginal (ej. 2 UF de miles de UF) no
  // aporta nada útil como torta propia -- se le da su propia torta solo si
  // su participación supera este umbral; igual sigue apareciendo como
  // porción (chica) en la torta "Por año", que sí debe reflejar el 100%.
  const MIN_YEAR_SHARE_FOR_OWN_PIE = 0.01; // 1% del total
  // Los gráficos de torta no muestran años anteriores a 2026.
  const pieYears = totalYears.filter((y) => y >= PPT_MIN_YEAR);
  const totalCapexCLP = pieYears.reduce((s, y) => s + (data.totalYearBreakdown?.[y] || 0), 0);
  const yearsForOwnPie = totalCapexCLP > 0
    ? pieYears.filter((y) => (data.totalYearBreakdown![y] / totalCapexCLP) >= MIN_YEAR_SHARE_FOR_OWN_PIE)
    : pieYears;

  // Clasificación -- dinámico según los "Tipos de CAPEX" que tengan algún
  // local asignado (ya no son 3 fijos). Solo se usan como leyenda (color +
  // nombre) junto a las tortas, sin card propia.
  const classCards = data.clasificacionTotals.map((t) => ({ label: t.name, color: colorHex(t.color) }));

  const pieBlocks = yearsForOwnPie.map((year) => ({
    title: String(year),
    labels: classCards.map((c) => c.label),
    values: classCards.map((c) => data.clasificacionTotals.find((t) => t.name === c.label)?.yearBreakdown?.[year] || 0),
    colors: classCards.map((c) => c.color),
    showLabel: false,
  })).filter((block) => block.values.some((v) => v > 0));

  const distributionBlock = pieYears.length > 0 && totalCapexCLP > 0 ? {
    title: "Por año",
    labels: pieYears.map((y) => String(y)),
    values: pieYears.map((y) => data.totalYearBreakdown?.[y] || 0),
    colors: pieYears.map((_, i) => YEAR_PIE_COLORS[i % YEAR_PIE_COLORS.length]),
    showLabel: true,
  } : null;

  // Slots de igual ancho en la misma fila: 1 para la leyenda + 1 por cada
  // torta (años + "Por año"). Mismo layout que si todas fueran tortas, para
  // que la leyenda quede alineada con ellas.
  const slotCount = 1 + pieBlocks.length + (distributionBlock ? 1 : 0);
  const pieGap = W(0.15);
  // Ancho de contenido reducido a propósito (8.4 en vez de 9, ya escalado):
  // las etiquetas de porcentaje de la torta (showPercent) pueden dibujarse
  // ligeramente fuera de su recuadro nominal -- este margen extra evita que
  // se salgan del borde derecho de la slide cuando hay pocas tortas.
  const PIE_ROW_W = W(8.4);
  const slotW = (PIE_ROW_W - pieGap * (slotCount - 1)) / slotCount;
  const pieH = Math.min(W(0.85), slotW);
  const pieTitleY = SLIDE_H - W(0.4) - W(0.1) - W(0.2) - pieH;
  const pieChartY = pieTitleY + W(0.2);

  // --- Cards de Estado de Avance: una por cada combinación estado+año que
  // tenga datos (Terminado/En Curso/Programado/Caído, mismo orden fijo que
  // las cards de /capex), con el desglose por empresa, el monto y la tabla
  // de TODOS sus contratos debajo -- sin truncar ("+ N más" eliminado). Si
  // un mismo estado tiene datos en más de un año (ej. "Programado" en 2026
  // Y 2027), cada año es su propia card, distinguida por el año debajo del
  // título; si el estado solo aparece en un año, el título no lo muestra. --
  const AVANCE_ORDER = ["Terminado", "En Curso", "Programado", "Caído"];
  interface AvanceCardSpec {
    year: number; name: string; count: number; uf: number; color: string;
    companyBreakdown: Array<{ company: string; uf: number }>;
    contractRows: Array<{ contractName: string; company: string; clasificacion: string | null; uf: number; date: string | null }>;
  }
  const avanceCardSpecs: AvanceCardSpec[] = [];
  avanceByYear.forEach((yearData) => {
    [...yearData.avanceTotals]
      .sort((a, b) => {
        const ia = AVANCE_ORDER.indexOf(a.name), ib = AVANCE_ORDER.indexOf(b.name);
        if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .forEach((t) => avanceCardSpecs.push({
        year: yearData.year, name: t.name, count: t.count, uf: t.uf, color: t.color,
        companyBreakdown: t.companyBreakdown, contractRows: t.contractRows,
      }));
  });
  avanceCardSpecs.sort((a, b) => {
    const ia = AVANCE_ORDER.indexOf(a.name), ib = AVANCE_ORDER.indexOf(b.name);
    const ra = ia === -1 ? AVANCE_ORDER.length : ia, rb = ib === -1 ? AVANCE_ORDER.length : ib;
    return ra !== rb ? ra - rb : a.year - b.year;
  });
  const nameCounts = new Map<string, number>();
  avanceCardSpecs.forEach((c) => nameCounts.set(c.name, (nameCounts.get(c.name) || 0) + 1));

  // Locales que no entraron en el espacio de su card en la lámina fusionada
  // -- se listan en lámina(s) de continuación después, en una tabla ancha
  // (ver más abajo), nunca truncados.
  const overflowRows: Array<{ status: string; year: number; row: AvanceCardSpec["contractRows"][number] }> = [];
  // La lámina donde terminan rindiéndose las cards de Estado de Avance --
  // la fusionada (s2) si entran todas en una sola fila, o la última lámina
  // de continuación si hizo falta más de una. Los gráficos de torta y su
  // footer van en ESTA lámina (ver más abajo), nunca en s2 a secas si el
  // contenido se corrió a otra parte.
  let currentSlide: PptxGenJS.Slide = s2;

  const companyShort: Record<string, string> = { Autoplanet: "AP", Agroplanet: "AG", "Grupo Planet": "GP", Otra: "Otra" };
  const fmtDate = (iso: string | null) => {
    if (!iso) return "-";
    const [y, m, d] = iso.split("-");
    return d && m && y ? `${d}/${m}/${y.slice(2)}` : "-";
  };
  // Tipos de CAPEX abreviados para que entren en una sola línea en la
  // columna "Tipo" de las tablas angostas de cada card -- solo ahí, el
  // resto de la presentación sigue mostrando el nombre completo.
  const clasificacionShort: Record<string, string> = {
    "Reemplazo": "Reemp.",
    "Regularización": "Regulariza",
    "Amplia/Mejora": "Amp/Mejora",
  };
  const fmtTipoShort = (c: string | null) => {
    const label = clasificacionLabel(c);
    return clasificacionShort[label] || label;
  };
  // "Monto de los detalles en millones de pesos" (ej. "265"), sin la unidad
  // repetida en cada fila -- la unidad ("mm$") va una sola vez en el
  // encabezado de la columna.
  const fmtMM = (uf: number) => `${Math.round((uf * data.ufValue) / 1_000_000).toLocaleString("es-CL")}`;

  if (avanceCardSpecs.length > 0) {
    const cardGap = W(0.15);
    // Máximo de cards por fila -- si hay más combinaciones estado+año que
    // esto (ej. 4 estados x 2 años), se pasa a una segunda fila en vez de
    // angostar las cards hasta el punto de no poder mostrar ni el título ni
    // los chips de empresa.
    const MAX_CARDS_PER_ROW = 4;
    const cols = Math.min(MAX_CARDS_PER_ROW, avanceCardSpecs.length);
    const cardW = (W(9) - cardGap * (cols - 1)) / cols;
    const cardRows: AvanceCardSpec[][] = [];
    for (let i = 0; i < avanceCardSpecs.length; i += MAX_CARDS_PER_ROW) {
      cardRows.push(avanceCardSpecs.slice(i, i + MAX_CARDS_PER_ROW));
    }

    const TITLE_W = W(1.05); // alcanza para "Programado (99)" en negrita, en una línea
    const CHIPS_W = cardW - W(0.15) - TITLE_W - W(0.05) - W(0.10);
    const COMPANY_CHIP_H = W(0.09);
    const maxCompanyChips = avanceCardSpecs.reduce((max, c) => Math.max(max, c.companyBreakdown.length), 0);
    const anyYearSuffix = avanceCardSpecs.some((c) => (nameCounts.get(c.name) || 0) > 1);
    const titleBlockH = anyYearSuffix ? W(0.26) : W(0.13); // 1 línea, o 2 si lleva el año debajo
    const topBlockH = Math.max(titleBlockH, maxCompanyChips * COMPANY_CHIP_H);
    const dollarOffsetY = W(0.06) + topBlockH + W(0.03);
    const ufOffsetY = dollarOffsetY + W(0.25);
    const cardH = ufOffsetY + W(0.15);

    // Alto de fila fijo y cómodo (no se achica según el volumen de datos --
    // PowerPoint tampoco lo permitiría por debajo de lo que el texto
    // necesita). Si una card tiene más locales de los que entran en el
    // espacio disponible, el resto se lista en una lámina de continuación
    // (tabla ancha, ver más abajo) -- nunca se trunca ("+ N más" eliminado)
    // ni se superpone con otra cosa.
    const TABLE_HEADER_H = W(0.14);
    const TABLE_ROW_H = W(0.2);
    const rowGapToTable = W(0.06);

    // La primera fila de cards (hasta 4 combinaciones estado+año) va en la
    // lámina fusionada, debajo de Presupuesto Aprobado. Si hace falta más
    // de una fila (más de 4 combinaciones), cada fila extra pasa a su
    // propia lámina de continuación, con TODO el alto disponible -- sin
    // competir con los gráficos de torta, que solo van en la ÚLTIMA fila
    // (y por lo tanto en la última lámina) de esta sección.
    let rowTopY = cardsY;
    cardRows.forEach((rowCards, rowIdx) => {
      const isLastRow = rowIdx === cardRows.length - 1;
      if (rowIdx > 0) {
        currentSlide = pres.addSlide();
        currentSlide.background = { color: "F2F2F2" };
        addPageHeader(currentSlide, `Estado de Avance y Presupuesto Aprobado — ${subtitleYears} (cont.)`);
        rowTopY = W(0.99);
      }
      const bottomLimit = isLastRow ? pieTitleY - W(0.08) : SLIDE_H - W(0.5);
      const tableY = rowTopY + cardH + rowGapToTable;
      const maxVisibleRows = Math.max(0, Math.floor((bottomLimit - tableY - TABLE_HEADER_H) / TABLE_ROW_H));
      const maxRowsHere = Math.min(maxVisibleRows, rowCards.reduce((max, c) => Math.max(max, c.contractRows.length), 0));

      rowCards.forEach((card, i) => {
        const x = W(0.5) + i * (cardW + cardGap);
        currentSlide.addShape(SHAPES.RECTANGLE, { x, y: rowTopY, w: cardW, h: cardH, fill: { color: LIGHT_BG } });
        currentSlide.addShape(SHAPES.RECTANGLE, { x, y: rowTopY, w: W(0.06), h: cardH, fill: { color: colorHex(card.color) } });

        const titleText = (nameCounts.get(card.name) || 0) > 1
          ? `${card.name} (${card.count})\n${card.year}`
          : `${card.name} (${card.count})`;
        currentSlide.addText(titleText, {
          x: x + W(0.15), y: rowTopY + W(0.07), w: TITLE_W, h: titleBlockH,
          fontSize: W(10), fontFace: "Arial", color: MUTED, bold: true, wrap: false,
        });

        // Desglose por empresa en chips (Autoplanet, Agroplanet, Grupo
        // Planet, en ese orden), arriba a la derecha, justificados al borde
        // de la card.
        if (card.companyBreakdown.length > 0) {
          const chipLines = card.companyBreakdown.map((c) => `${c.company}: ${fmtUF(c.uf)} UF`);
          currentSlide.addText(chipLines.join("\n"), {
            x: x + cardW - W(0.10) - CHIPS_W, y: rowTopY + W(0.07), w: CHIPS_W, h: card.companyBreakdown.length * COMPANY_CHIP_H,
            fontSize: W(7), fontFace: "Arial", color: MUTED, align: "right", lineSpacing: W(8.5),
          });
        }

        // El monto en $ es el protagonista (bold, grande); la UF es
        // "meramente un dato", secundario -- mismo criterio en toda la
        // presentación.
        currentSlide.addText(formatCLP(card.uf * data.ufValue), {
          x: x + W(0.05), y: rowTopY + dollarOffsetY, w: cardW - W(0.10), h: W(0.3),
          fontSize: W(13), fontFace: "Arial", color: DARK, bold: true, wrap: false,
        });
        currentSlide.addText(`${fmtUF(card.uf)} UF`, {
          x: x + W(0.15), y: rowTopY + ufOffsetY, w: cardW - W(0.3), h: W(0.2),
          fontSize: W(9), fontFace: "Arial", color: MUTED,
        });

        // Tabla de TODOS los contratos de este estado (sin truncar), debajo
        // de su card: Empresa | Local | Tipo de CAPEX | Monto | Fecha de
        // término/apertura -- agrupada por empresa (ya viene ordenada así
        // desde CapexDashboard.tsx). Anchos de columna fijos (en pulgadas,
        // no proporcionales al ancho de la card) para que Emp./Tipo/mm$/
        // Fecha nunca necesiten una segunda línea -- "Local" se lleva el
        // ancho restante y es la única columna que puede quedar en 2
        // líneas. Si todavía así no entran todos los locales de la card
        // (card.contractRows.length > maxRowsHere), el resto pasa a
        // overflowRows (lámina de continuación en tabla ancha).
        if (card.contractRows.length > 0 && maxRowsHere > 0) {
          const visibleRows = card.contractRows.slice(0, maxRowsHere);
          card.contractRows.slice(maxRowsHere).forEach((row) => {
            overflowRows.push({ status: card.name, year: card.year, row });
          });
          const EMP_W = W(0.22), TIPO_W = W(0.50), MONTO_W = W(0.30), FECHA_W = W(0.38);
          const LOCAL_W = cardW - EMP_W - TIPO_W - MONTO_W - FECHA_W - W(0.02);
          const cellOpts = (align: "left" | "right" = "left"): PptxGenJS.TextPropsOptions => ({
            fontSize: W(6), fontFace: "Arial", color: DARK, align,
          });
          const tableRows: PptxGenJS.TableRow[] = [
            [
              { text: "Emp.", options: { ...cellOpts(), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "Local", options: { ...cellOpts(), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "Tipo", options: { ...cellOpts(), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "mm$", options: { ...cellOpts("right"), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "Fecha", options: { ...cellOpts("right"), bold: true, color: WHITE, fill: { color: PRIMARY } } },
            ],
          ];
          visibleRows.forEach((r) => {
            // Toda la fila en negrita para los locales de Autoplanet.
            const rowCellOpts = (align: "left" | "right" = "left"): PptxGenJS.TextPropsOptions =>
              r.company === "Autoplanet" ? { ...cellOpts(align), bold: true } : cellOpts(align);
            tableRows.push([
              { text: companyShort[r.company] || r.company, options: rowCellOpts() },
              { text: r.contractName, options: rowCellOpts() },
              { text: fmtTipoShort(r.clasificacion), options: rowCellOpts() },
              { text: fmtMM(r.uf), options: rowCellOpts("right") },
              { text: fmtDate(r.date), options: rowCellOpts("right") },
            ]);
          });
          currentSlide.addTable(tableRows, {
            x, y: tableY, w: cardW, h: TABLE_HEADER_H + (tableRows.length - 1) * TABLE_ROW_H,
            colW: [EMP_W, LOCAL_W, TIPO_W, MONTO_W, FECHA_W],
            rowH: [TABLE_HEADER_H, ...Array(tableRows.length - 1).fill(TABLE_ROW_H)],
            border: { type: "solid", color: BORDER, pt: 0.25 },
            autoPage: false,
            margin: 0.01,
            valign: "middle",
          });
        } else if (card.contractRows.length > 0) {
          card.contractRows.forEach((row) => overflowRows.push({ status: card.name, year: card.year, row }));
        }
      });

      if (!isLastRow) addFooter(currentSlide, pageNum++);
    });
  }

  // --- Leyenda de clasificación + gráficos de torta (geometría calculada
  // más arriba) -- van en `currentSlide`, la última lámina de la sección de
  // Estado de Avance (la fusionada si entró todo en una fila, o la última
  // de continuación si no). ---
  if (classCards.length > 0) {
    const legendX = W(0.5);
    // Compacta (0.18 en vez de 0.22, ya escalado) para que, con 4+ tipos de
    // CAPEX, el último ítem no llegue a montarse con el pie de página.
    const legendStep = W(0.18);
    classCards.forEach((card, i) => {
      const y = pieChartY + W(0.12) + i * legendStep;
      currentSlide.addShape(SHAPES.RECTANGLE, {
        x: legendX + W(0.1), y: y + W(0.02), w: W(0.12), h: W(0.12),
        fill: { color: card.color },
      });
      currentSlide.addText(card.label, {
        x: legendX + W(0.28), y, w: W(2.1), h: W(0.18),
        fontSize: W(8), fontFace: "Arial", color: MUTED,
      });
    });
  }

  [...pieBlocks, ...(distributionBlock ? [distributionBlock] : [])].forEach((block, i) => {
    // Cada torta filtra sus propios ceros -- una clasificación sin monto
    // ese año no debe aparecer como porción vacía.
    const nonZero = block.labels
      .map((label, idx) => ({ label, value: block.values[idx], color: block.colors[idx] }))
      .filter((d) => d.value > 0);
    if (nonZero.length === 0) return;

    // Slot 0 es la leyenda -- las tortas ocupan del slot 1 en adelante.
    const x = W(0.5) + (i + 1) * (slotW + pieGap);
    currentSlide.addText(block.title, {
      x, y: pieTitleY, w: slotW, h: W(0.2),
      fontSize: W(9), fontFace: "Arial", color: MUTED, align: "center", bold: true,
    });
    currentSlide.addChart(CHARTS.PIE, [{
      name: block.title,
      labels: nonZero.map((d) => d.label),
      values: nonZero.map((d) => d.value),
    }], {
      x, y: pieChartY, w: slotW, h: pieH,
      showPercent: true,
      showLabel: block.showLabel,
      showTitle: false,
      showLegend: false,
      chartColors: nonZero.map((d) => d.color),
      dataLabelFontSize: W(7),
      dataLabelColor: DARK,
    });
  });

  addFooter(currentSlide, pageNum++);

  // ═══════════ SLIDE(S) de continuación: locales que no entraron en la lámina fusionada ═══
  // Si algún estado de avance tiene más locales de los que caben en su card
  // (ver overflowRows más arriba), se listan acá en una tabla ancha de
  // ancho completo -- nunca se trunca ("+ N más" eliminado), solo se sigue
  // en otra lámina cuando hace falta, igual que la tabla de cada empresa.
  if (overflowRows.length > 0) {
    const OV_HEADER_H = W(0.14);
    const OV_ROW_H = W(0.22);
    const OV_ROWS_PER_SLIDE = 20;
    const ovTableHeader: PptxGenJS.TableCell[] = [
      { text: "Estado", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "left" } },
      { text: "Año", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "center" } },
      { text: "Emp.", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "left" } },
      { text: "Local", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "left" } },
      { text: "Tipo", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "left" } },
      { text: "mm$", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "right" } },
      { text: "Fecha", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(8), fontFace: "Arial", align: "right" } },
    ];
    const ovPages: (typeof overflowRows)[] = [];
    for (let i = 0; i < overflowRows.length; i += OV_ROWS_PER_SLIDE) {
      ovPages.push(overflowRows.slice(i, i + OV_ROWS_PER_SLIDE));
    }
    ovPages.forEach((pageRows) => {
      const ovSlide = pres.addSlide();
      ovSlide.background = { color: "F2F2F2" };
      addPageHeader(ovSlide, `Estado de Avance — ${subtitleYears} (cont.)`);

      const cellOpts = (align: "left" | "center" | "right" = "left"): PptxGenJS.TextPropsOptions => ({
        fontSize: W(8), fontFace: "Arial", color: DARK, align,
      });
      const ovRows: PptxGenJS.TableRow[] = [ovTableHeader];
      pageRows.forEach(({ status, year, row: r }) => {
        const rowCellOpts = (align: "left" | "center" | "right" = "left"): PptxGenJS.TextPropsOptions =>
          r.company === "Autoplanet" ? { ...cellOpts(align), bold: true } : cellOpts(align);
        ovRows.push([
          { text: status, options: rowCellOpts() },
          { text: String(year), options: rowCellOpts("center") },
          { text: companyShort[r.company] || r.company, options: rowCellOpts() },
          { text: r.contractName, options: rowCellOpts() },
          { text: fmtTipoShort(r.clasificacion), options: rowCellOpts() },
          { text: fmtMM(r.uf), options: rowCellOpts("right") },
          { text: fmtDate(r.date), options: rowCellOpts("right") },
        ]);
      });
      ovSlide.addTable(ovRows, {
        x: W(0.5), y: W(0.99), w: W(9), h: OV_HEADER_H + (ovRows.length - 1) * OV_ROW_H,
        colW: [W(1.6), W(0.7), W(0.6), W(5.6), W(1.6), W(0.9), W(1.0)],
        rowH: [OV_HEADER_H, ...Array(ovRows.length - 1).fill(OV_ROW_H)],
        border: { type: "solid", color: BORDER, pt: 0.5 },
        autoPage: false,
      });

      addFooter(ovSlide, pageNum++);
    });
  }

  // ═══════════ SLIDES 3+: Per Company ═══════════
  // Alto de los chips de año (uno por línea, ver yearBreakdownLine) de las
  // cards de empresa -- crece según cuántos años tenga cada bloque.
  const CHIP_LINE_H_SM = W(0.12); // fontSize 6.5

  for (const group of data.companyGroups) {
    const s = pres.addSlide();
    s.background = { color: "F2F2F2" };
    addPageHeader(s, group.company);

    // Company summary cards -- dinámico según los tipos con locales en esta empresa
    const companyCards = group.totals.byType.map((t) => ({
      label: t.name, count: t.count, uf: t.uf, color: colorHex(t.color),
      years: yearsWithCapex(t.yearBreakdown), yearLine: yearBreakdownLine(t.yearBreakdown),
    }));
    const companyCardGap = W(0.15);
    const companyCardW = companyCards.length > 0 ? (W(9) - companyCardGap * (companyCards.length - 1)) / companyCards.length : 0;
    const maxCompanyYears = companyCards.reduce((max, c) => Math.max(max, c.years.length), 0);
    const companyCardH = W(1.05) + Math.max(0, maxCompanyYears - 1) * CHIP_LINE_H_SM;
    const companyCardsY = W(1.1);

    companyCards.forEach((card, i) => {
      const x = W(0.5) + i * (companyCardW + companyCardGap);

      s.addShape(SHAPES.RECTANGLE, {
        x, y: companyCardsY, w: companyCardW, h: companyCardH,
        fill: { color: LIGHT_BG },
      });

      s.addShape(SHAPES.RECTANGLE, {
        x, y: companyCardsY, w: W(0.06), h: companyCardH,
        fill: { color: card.color },
      });

      s.addText(`${card.label} (${card.count})`, {
        x: x + W(0.15), y: companyCardsY + W(0.05), w: companyCardW - W(0.3), h: W(0.25),
        fontSize: W(10), fontFace: "Arial", color: MUTED,
      });

      s.addText(formatCLP(card.uf * data.ufValue), {
        x: x + W(0.05), y: companyCardsY + W(0.3), w: companyCardW - W(0.10), h: W(0.35),
        fontSize: W(14), fontFace: "Arial", color: DARK, bold: true, wrap: false,
      });

      s.addText(`${fmtUF(card.uf)} UF`, {
        x: x + W(0.15), y: companyCardsY + W(0.6), w: companyCardW - W(0.3), h: W(0.2),
        fontSize: W(9), fontFace: "Arial", color: MUTED,
      });

      if (card.yearLine) {
        s.addText(card.yearLine, {
          x: x + W(0.15), y: companyCardsY + W(0.8), w: companyCardW - W(0.3), h: card.years.length * CHIP_LINE_H_SM,
          fontSize: W(6.5), fontFace: "Arial", color: MUTED,
        });
      }
    });

    // Detail table
    const tableHeader: PptxGenJS.TableCell[] = [
      { text: "Local", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(9), fontFace: "Arial", align: "left" } },
      { text: "Clasificación", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(9), fontFace: "Arial", align: "center" } },
      { text: "m²", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(9), fontFace: "Arial", align: "center" } },
      { text: "Total UF", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(9), fontFace: "Arial", align: "right" } },
      { text: "Total CLP", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: W(9), fontFace: "Arial", align: "right" } },
    ];

    // Sort contracts: by clasificacion (mismo orden que las cards / Admin >
    // Tipos de CAPEX) y después por nombre. Sin clasificar queda al final.
    const clOrder = data.clasificacionTotals.map((t) => t.name);
    const sorted = [...group.contracts].sort((a, b) => {
      const aIdx = a.clasificacion ? clOrder.indexOf(a.clasificacion) : -1;
      const bIdx = b.clasificacion ? clOrder.indexOf(b.clasificacion) : -1;
      const aRank = aIdx === -1 ? clOrder.length : aIdx;
      const bRank = bIdx === -1 ? clOrder.length : bIdx;
      if (aRank !== bRank) return aRank - bRank;
      return a.contract_name.localeCompare(b.contract_name);
    });

    // Split into pages if needed (max ~12 rows per slide for readability)
    const ROWS_PER_SLIDE = 12;
    const pages = [];
    for (let i = 0; i < sorted.length; i += ROWS_PER_SLIDE) {
      pages.push(sorted.slice(i, i + ROWS_PER_SLIDE));
    }

    pages.forEach((pageContracts, pageIdx) => {
      const targetSlide = pageIdx === 0 ? s : pres.addSlide();
      if (pageIdx > 0) {
        targetSlide.background = { color: "F2F2F2" };
        addPageHeader(targetSlide, `${group.company} (cont.)`);
      }

      const tableY = pageIdx === 0 ? companyCardsY + companyCardH + W(0.2) : W(0.99);

      const rows: PptxGenJS.TableRow[] = [tableHeader];

      pageContracts.forEach((c, idx) => {
        const bgColor = idx % 2 === 0 ? WHITE : LIGHT_BG;
        const cellOpts = (align: "left" | "center" | "right" = "left"): PptxGenJS.TextPropsOptions => ({
          fontSize: W(8), fontFace: "Arial", color: DARK, fill: { color: bgColor }, align,
        });

        rows.push([
          { text: c.contract_name, options: cellOpts("left") },
          { text: clasificacionLabel(c.clasificacion), options: cellOpts("center") },
          { text: c.superficie > 0 ? c.superficie.toLocaleString("es-CL") : "-", options: cellOpts("center") },
          { text: fmtUF2(c.total_uf), options: { ...cellOpts("right"), bold: true } },
          { text: formatCLP(c.total_clp), options: cellOpts("right") },
        ]);
      });

      // Totals row
      if (pageIdx === pages.length - 1) {
        const totalUF = group.contracts.reduce((s, c) => s + c.total_uf, 0);
        const totalCLP = group.contracts.reduce((s, c) => s + c.total_clp, 0);

        const totOpts = (align: "left" | "center" | "right" = "right"): PptxGenJS.TextPropsOptions => ({
          fontSize: W(9), fontFace: "Arial", color: WHITE, fill: { color: PRIMARY }, align, bold: true,
        });

        rows.push([
          { text: "TOTAL", options: totOpts("left") },
          { text: "", options: totOpts("center") },
          { text: "", options: totOpts("center") },
          { text: fmtUF2(totalUF), options: totOpts("right") },
          { text: formatCLP(totalCLP), options: totOpts("right") },
        ]);
      }

      targetSlide.addTable(rows, {
        x: W(0.3), y: tableY, w: W(9.4),
        colW: [W(3.2), W(1.5), W(1.0), W(1.8), W(1.9)],
        border: { pt: 0.5, color: BORDER },
      });

      addFooter(targetSlide, pageNum++);
    });
  }

  if (opts.skipSave) return pres;

  // Save
  let arrBuf = await pres.write({ outputType: "arraybuffer" }) as ArrayBuffer;
  arrBuf = await addPieSliceGaps(arrBuf);
  const blob = new Blob([arrBuf], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  if (saveHandle) {
    const writable = await saveHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }
  return pres;
}

