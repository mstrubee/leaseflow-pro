import PptxGenJS from "pptxgenjs";

// Shape/chart type helpers to avoid .shapes/.charts accessor issues
const SHAPES = {
  LINE: "line" as const,
  RECTANGLE: "rect" as const,
};
const CHARTS = {
  PIE: "pie" as const,
};
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
    pres.layout = "LAYOUT_16x9";
    pres.author = "GPlanet";
    pres.title = `Presupuesto CAPEX ${data.year}`;
  }

  const addFooter = (slide: PptxGenJS.Slide, pageNum: number) => {
    slide.addText(`Presupuesto CAPEX ${data.year}`, {
      x: 0.5, y: 5.15, w: 5, h: 0.35,
      fontSize: 8, color: MUTED, fontFace: "Arial",
    });
    slide.addText(`${pageNum}`, {
      x: 8.5, y: 5.15, w: 1, h: 0.35,
      fontSize: 8, color: MUTED, fontFace: "Arial", align: "right",
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
      s1.addImage({ data: logoBase64, x: 0.5, y: 0.4, w: 2.5, h: 1 });
    }

    s1.addText("Presupuesto CAPEX", {
      x: 0.5, y: 1.8, w: 9, h: 1,
      fontSize: 40, fontFace: "Arial", color: WHITE, bold: true,
    });
    s1.addText(`Año ${data.year}`, {
      x: 0.5, y: 2.7, w: 9, h: 0.6,
      fontSize: 24, fontFace: "Arial", color: WHITE,
    });

    s1.addShape(SHAPES.LINE, {
      x: 0.5, y: 3.5, w: 3, h: 0,
      line: { color: WHITE, width: 3 },
    });

    const today = new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
    s1.addText(today, {
      x: 0.5, y: 4.0, w: 9, h: 0.4,
      fontSize: 14, fontFace: "Arial", color: "F5C6C4",
    });
  }

  // ═══════════ SLIDE 2: Resumen General ═══════════
  let pageNum = 1;
  const s2 = pres.addSlide();
  s2.background = { color: "F2F2F2" };

  s2.addText("PRESUPUESTO CAPEX", {
    x: 0.5, y: 0.2, w: 9, h: 0.3,
    fontSize: 14, fontFace: "Arial", color: ACCENT, bold: true,
  });
  s2.addText(`Resumen General ${data.year}`, {
    x: 0.5, y: 0.5, w: 9.2, h: 0.35,
    fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
  });
  s2.addShape(SHAPES.LINE, {
    x: 0.5, y: 0.87, w: 9, h: 0,
    line: { color: BORDER, width: 1 },
  });

  // Alto de los chips de año (uno por línea, ver yearBreakdownLine) -- crece
  // según cuántos años tenga cada bloque, para no solaparse con lo de abajo.
  const CHIP_LINE_H_LG = 0.16; // fontSize 9 (card grande "Inversión Total")
  const CHIP_LINE_H_SM = 0.12; // fontSize 6.5 (cards de clasificación)

  // Posiciones y tamaños de este bloque ajustados a la diagramación de
  // referencia (más compacto que antes: la card total arranca justo debajo
  // de la línea divisoria, no dejando el aire de sobra que empujaba todo lo
  // demás hacia abajo).
  const TOTAL_CARD_Y = 0.99;
  const totalYears = yearsWithCapex(data.totalYearBreakdown);
  // El texto de años adjunto a la card total no debe considerar años
  // anteriores a 2026 (a diferencia de las cards de clasificación de más
  // abajo, que sí siguen mostrando todos los años en sus propios chips).
  const totalYearsForDisplay = totalYears.filter((y) => y >= PPT_MIN_YEAR);
  const totalCardH = 1.26 + Math.max(0, totalYearsForDisplay.length - 1) * CHIP_LINE_H_LG;

  // Big total card
  s2.addShape(SHAPES.RECTANGLE, {
    x: 0.5, y: TOTAL_CARD_Y, w: 9, h: totalCardH,
    fill: { color: PRIMARY },
  });

  s2.addText("Inversión Total CAPEX", {
    x: 0.7, y: TOTAL_CARD_Y + 0.04, w: 4, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: LIGHT_TEXT,
  });

  s2.addText(`${fmtUF(data.totalCapexUF)} UF`, {
    x: 0.7, y: TOTAL_CARD_Y + 0.39, w: 4, h: 0.5,
    fontSize: 28, fontFace: "Arial", color: WHITE, bold: true,
  });

  s2.addText(formatCLP(data.totalCapexUF * data.ufValue), {
    x: 5, y: TOTAL_CARD_Y + 0.31, w: 4.3, h: 0.5,
    fontSize: 22, fontFace: "Arial", color: WHITE, align: "right",
  });

  s2.addText(`${data.totalLocales} locales`, {
    x: 5, y: TOTAL_CARD_Y + 0.03, w: 4.3, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: WHITE, align: "right",
  });

  const totalYearBreakdownForDisplay = totalYearsForDisplay.length > 0
    ? Object.fromEntries(totalYearsForDisplay.map((y) => [y, data.totalYearBreakdown![y]]))
    : undefined;
  const totalYearLine = yearBreakdownLine(totalYearBreakdownForDisplay);
  if (totalYearLine) {
    s2.addText(totalYearLine, {
      x: 5, y: TOTAL_CARD_Y + 0.71, w: 4.3, h: totalYearsForDisplay.length * CHIP_LINE_H_LG,
      fontSize: 9, fontFace: "Arial", color: WHITE, align: "right",
    });
  }

  // Classification cards -- dinámico según los "Tipos de CAPEX" que tengan
  // algún local asignado (ya no son 3 fijos).
  const classCards = data.clasificacionTotals.map((t) => ({
    label: t.name, count: t.count, uf: t.uf, color: colorHex(t.color),
    years: yearsWithCapex(t.yearBreakdown), yearLine: yearBreakdownLine(t.yearBreakdown),
  }));
  const cardGap = 0.15;
  const cardW = classCards.length > 0 ? (9 - cardGap * (classCards.length - 1)) / classCards.length : 0;
  const maxClassYears = classCards.reduce((max, c) => Math.max(max, c.years.length), 0);
  const classCardH = 1.32 + Math.max(0, maxClassYears - 1) * CHIP_LINE_H_SM;
  const classCardsY = TOTAL_CARD_Y + totalCardH + 0.14;

  classCards.forEach((card, i) => {
    const x = 0.5 + i * (cardW + cardGap);
    const y = classCardsY;

    s2.addShape(SHAPES.RECTANGLE, {
      x, y, w: cardW, h: classCardH,
      fill: { color: LIGHT_BG },
    });

    // Left accent
    s2.addShape(SHAPES.RECTANGLE, {
      x, y, w: 0.06, h: classCardH,
      fill: { color: card.color },
    });

    s2.addText(card.label, {
      x: x + 0.2, y: y, w: cardW - 0.4, h: 0.25,
      fontSize: 11, fontFace: "Arial", color: MUTED,
    });

    s2.addText(`${fmtUF(card.uf)} UF`, {
      x: x + 0.2, y: y + 0.20, w: cardW - 0.4, h: 0.35,
      fontSize: 18, fontFace: "Arial", color: DARK, bold: true,
    });

    s2.addText(`${card.count} ${card.count === 1 ? "local" : "locales"}`, {
      x: x + 0.2, y: y + 0.50, w: cardW - 0.4, h: 0.25,
      fontSize: 10, fontFace: "Arial", color: MUTED,
    });

    s2.addText(formatCLP(card.uf * data.ufValue), {
      x: x + 0.2, y: y + 0.70, w: cardW - 0.4, h: 0.22,
      fontSize: 9, fontFace: "Arial", color: MUTED,
    });

    if (card.yearLine) {
      s2.addText(card.yearLine, {
        x: x + 0.2, y: y + 0.93, w: cardW - 0.4, h: card.years.length * CHIP_LINE_H_SM,
        fontSize: 6.5, fontFace: "Arial", color: MUTED,
      });
    }
  });

  // Gráficos de torta: uno por año (distribución por clasificación en ESE
  // año) + uno extra con la distribución del CAPEX total entre los años.
  // Una sola leyenda para todos (clasificación), en vez de repetirla en
  // cada torta -- el gráfico "Por año" no la necesita porque sus propias
  // porciones ya muestran el año como etiqueta. La leyenda ocupa la misma
  // "columna" que ocuparía una torta más, apilada verticalmente, en vez de
  // ir en una fila propia arriba -- así se ahorra una fila entera de alto.
  //
  // Un año cuyo aporte al total es marginal (ej. 2 UF de miles de UF) no
  // aporta nada útil como torta propia -- se le da su propia torta solo si
  // su participación supera este umbral; igual sigue apareciendo como
  // porción (chica) en la torta "Por año", que sí debe reflejar el 100%.
  const MIN_YEAR_SHARE_FOR_OWN_PIE = 0.01; // 1% del total
  // Los gráficos de torta no muestran años anteriores a 2026 -- a
  // diferencia de la card total y las cards de clasificación de arriba
  // (esas sí siguen mostrando todos los años en sus chips de texto).
  const pieYears = totalYears.filter((y) => y >= PPT_MIN_YEAR);
  const totalCapexCLP = pieYears.reduce((s, y) => s + (data.totalYearBreakdown?.[y] || 0), 0);
  const yearsForOwnPie = totalCapexCLP > 0
    ? pieYears.filter((y) => (data.totalYearBreakdown![y] / totalCapexCLP) >= MIN_YEAR_SHARE_FOR_OWN_PIE)
    : pieYears;

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
  const pieGap = 0.15;
  // Ancho de contenido reducido a propósito (8.4 en vez de 9): las
  // etiquetas de porcentaje de la torta (showPercent) pueden dibujarse
  // ligeramente fuera de su recuadro nominal -- este margen extra evita que
  // se salgan del borde derecho de la slide cuando hay pocas tortas (y por
  // lo tanto cada una queda más ancha).
  const PIE_ROW_W = 8.4;
  const slotW = (PIE_ROW_W - pieGap * (slotCount - 1)) / slotCount;
  const pieH = Math.min(1.35, slotW);
  const pieTitleY = classCardsY + classCardH + 0.16;
  const pieChartY = pieTitleY + 0.2;

  if (classCards.length > 0) {
    const legendX = 0.5;
    const legendStep = 0.22;
    classCards.forEach((card, i) => {
      const y = pieChartY + 0.17 + i * legendStep;
      s2.addShape(SHAPES.RECTANGLE, {
        x: legendX + 0.1, y: y + 0.02, w: 0.12, h: 0.12,
        fill: { color: card.color },
      });
      s2.addText(card.label, {
        x: legendX + 0.28, y, w: 2.1, h: 0.18,
        fontSize: 8, fontFace: "Arial", color: MUTED,
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
    const x = 0.5 + (i + 1) * (slotW + pieGap);
    s2.addText(block.title, {
      x, y: pieTitleY, w: slotW, h: 0.2,
      fontSize: 9, fontFace: "Arial", color: MUTED, align: "center", bold: true,
    });
    s2.addChart(CHARTS.PIE, [{
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
      dataLabelFontSize: 7,
      dataLabelColor: DARK,
    });
  });

  addFooter(s2, pageNum++);

  // ═══════════ SLIDES (opcionales): Estado de Avance + Presupuesto Aprobado, UNA POR AÑO ═══
  // Mismos datos que la fila de cards de Estado de Avance y la card "Capex
  // Aprobado" de /capex, pero de ESE año específico -- una slide por cada
  // año (2026 en adelante) en vez de una sola slide con todos los años
  // mezclados. Diagramación: subtítulo + tabla de Presupuesto Aprobado
  // arriba, cards de Estado de Avance debajo, y el listado de nombres de
  // contrato de cada estado debajo de su card correspondiente.
  const AVANCE_ORDER = ["Terminado", "En Curso", "Programado", "Caído"];
  for (const yearData of data.avanceByYear || []) {
    if (yearData.avanceTotals.length === 0 && !yearData.approvedBudget) continue;

    const s2b = pres.addSlide();
    s2b.background = { color: "F2F2F2" };

    s2b.addText("PRESUPUESTO CAPEX", {
      x: 0.5, y: 0.2, w: 9, h: 0.3,
      fontSize: 14, fontFace: "Arial", color: ACCENT, bold: true,
    });
    s2b.addText(`Estado de Avance y Presupuesto Aprobado — ${yearData.year}`, {
      x: 0.5, y: 0.5, w: 9.2, h: 0.35,
      fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
    });
    s2b.addShape(SHAPES.LINE, {
      x: 0.5, y: 0.87, w: 9, h: 0,
      line: { color: BORDER, width: 1 },
    });

    let cardsY = 0.99;

    if (yearData.approvedBudget) {
      s2b.addText("Presupuesto Aprobado", {
        x: 0.5, y: 0.89, w: 9, h: 0.3,
        fontSize: 13, fontFace: "Arial", color: DARK, bold: true,
      });

      const tableHeader: PptxGenJS.TableCell[] = [
        { text: "Año", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 10, fontFace: "Arial", align: "left" } },
        { text: "Ppto.", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 10, fontFace: "Arial", align: "right" } },
        { text: "Aprob. Gasto", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 10, fontFace: "Arial", align: "right" } },
        { text: "Disponible", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 10, fontFace: "Arial", align: "right" } },
      ];
      const cellOpts = (align: "left" | "right"): PptxGenJS.TextPropsOptions => ({
        fontSize: 10, fontFace: "Arial", color: DARK, align,
      });
      const row = yearData.approvedBudget;
      s2b.addTable([
        tableHeader,
        [
          { text: String(yearData.year), options: cellOpts("left") },
          { text: `mm$ ${row.aprobadoMM.toLocaleString("es-CL")}`, options: cellOpts("right") },
          { text: `mm$ ${row.totalMM.toLocaleString("es-CL")}`, options: cellOpts("right") },
          {
            text: `mm$ ${row.disponibleMM.toLocaleString("es-CL")}`,
            options: { ...cellOpts("right"), color: row.disponibleMM < 0 ? PRIMARY : "1E8E3E", bold: true },
          },
        ],
      ], {
        x: 0.5, y: 1.24, w: 9,
        colW: [2, 2.33, 2.33, 2.34],
        border: { type: "solid", color: BORDER, pt: 0.5 },
        autoPage: false,
      });
      cardsY = 1.83;
    }

    if (yearData.avanceTotals.length > 0) {
      // Mismo orden fijo que las cards de /capex: Terminado, En Curso,
      // Programado, Caído (no el display_order administrado en Admin).
      const avanceCards = [...yearData.avanceTotals].sort((a, b) => {
        const ia = AVANCE_ORDER.indexOf(a.name), ib = AVANCE_ORDER.indexOf(b.name);
        if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
      const cardGap = 0.15;
      const cardW = (9 - cardGap * (avanceCards.length - 1)) / avanceCards.length;
      // La card crece según cuántos chips de empresa tenga (máximo entre las
      // 4), para que las 4 cards queden a la misma altura.
      const COMPANY_CHIP_H = 0.13;
      const maxCompanyChips = avanceCards.reduce((max, c) => Math.max(max, c.companyBreakdown.length), 0);
      const cardH = 1.02 + maxCompanyChips * COMPANY_CHIP_H;
      // Espacio disponible para la tabla de contratos, debajo de las cards
      // y hasta el footer.
      const tableY = cardsY + cardH + 0.08;
      const tableMaxH = 5.0 - tableY;
      const ROW_H = 0.155;
      const maxTableRows = Math.max(0, Math.floor(tableMaxH / ROW_H) - 1); // -1 por el header

      const companyShort: Record<string, string> = { Autoplanet: "AP", Agroplanet: "AG", "Grupo Planet": "GP", Otra: "Otra" };
      const fmtDate = (iso: string | null) => {
        if (!iso) return "-";
        const [y, m, d] = iso.split("-");
        return d && m && y ? `${d}/${m}/${y.slice(2)}` : "-";
      };

      avanceCards.forEach((card, i) => {
        const x = 0.5 + i * (cardW + cardGap);
        s2b.addShape(SHAPES.RECTANGLE, { x, y: cardsY, w: cardW, h: cardH, fill: { color: LIGHT_BG } });
        s2b.addShape(SHAPES.RECTANGLE, { x, y: cardsY, w: 0.06, h: cardH, fill: { color: colorHex(card.color) } });
        s2b.addText(`${card.name} (${card.count})`, {
          x: x + 0.15, y: cardsY + 0.1, w: cardW - 0.3, h: 0.25,
          fontSize: 10, fontFace: "Arial", color: MUTED,
        });
        s2b.addText(`${fmtUF(card.uf)} UF`, {
          x: x + 0.15, y: cardsY + 0.4, w: cardW - 0.3, h: 0.35,
          fontSize: 15, fontFace: "Arial", color: DARK, bold: true,
        });
        s2b.addText(formatCLP(card.uf * data.ufValue), {
          x: x + 0.15, y: cardsY + 0.75, w: cardW - 0.3, h: 0.25,
          fontSize: 9, fontFace: "Arial", color: MUTED,
        });

        // Desglose por empresa en chips (Autoplanet, Agroplanet, Grupo
        // Planet, en ese orden), un chip por línea, debajo del monto CLP.
        if (card.companyBreakdown.length > 0) {
          const chipLines = card.companyBreakdown.map((c) => `${c.company}: ${fmtUF(c.uf)} UF`);
          s2b.addText(chipLines.join("\n"), {
            x: x + 0.15, y: cardsY + 0.99, w: cardW - 0.3, h: card.companyBreakdown.length * COMPANY_CHIP_H,
            fontSize: 7, fontFace: "Arial", color: MUTED, lineSpacing: 9.5,
          });
        }

        // Tabla de contratos de este estado, debajo de su card: Empresa |
        // Local | Tipo de CAPEX | Monto | Fecha de término/apertura --
        // agrupada por empresa (Autoplanet, Agroplanet, Grupo Planet) y,
        // dentro de cada una, ordenada por fecha (ya viene ordenada así
        // desde CapexDashboard.tsx).
        if (card.contractRows.length > 0 && maxTableRows > 0) {
          const rows = card.contractRows;
          const visibleRows = rows.length > maxTableRows ? rows.slice(0, Math.max(0, maxTableRows - 1)) : rows;
          const cellOpts = (align: "left" | "right" = "left"): PptxGenJS.TextPropsOptions => ({
            fontSize: 6, fontFace: "Arial", color: DARK, align,
          });
          const tableRows: PptxGenJS.TableRow[] = [
            [
              { text: "Emp.", options: { ...cellOpts(), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "Local", options: { ...cellOpts(), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "Tipo", options: { ...cellOpts(), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "UF", options: { ...cellOpts("right"), bold: true, color: WHITE, fill: { color: PRIMARY } } },
              { text: "Fecha", options: { ...cellOpts("right"), bold: true, color: WHITE, fill: { color: PRIMARY } } },
            ],
          ];
          visibleRows.forEach((r) => {
            tableRows.push([
              { text: companyShort[r.company] || r.company, options: cellOpts() },
              { text: r.contractName, options: cellOpts() },
              { text: clasificacionLabel(r.clasificacion), options: cellOpts() },
              { text: fmtUF(r.uf), options: cellOpts("right") },
              { text: fmtDate(r.date), options: cellOpts("right") },
            ]);
          });
          if (rows.length > maxTableRows) {
            tableRows.push([{
              text: `+ ${rows.length - visibleRows.length} más`,
              options: { ...cellOpts(), colspan: 5, italic: true, color: MUTED },
            }]);
          }
          s2b.addTable(tableRows, {
            x, y: tableY, w: cardW,
            colW: [0.28, cardW - 1.13, 0.35, 0.3, 0.4],
            border: { type: "solid", color: BORDER, pt: 0.25 },
            autoPage: false,
            margin: 0.01,
          });
        }
      });
    }

    addFooter(s2b, pageNum++);
  }

  // ═══════════ SLIDES 3+: Per Company ═══════════
  for (const group of data.companyGroups) {
    const s = pres.addSlide();
    s.background = { color: "F2F2F2" };

    s.addText("PRESUPUESTO CAPEX", {
      x: 0.5, y: 0.2, w: 9, h: 0.3,
      fontSize: 14, fontFace: "Arial", color: ACCENT, bold: true,
    });
    s.addText(group.company, {
      x: 0.5, y: 0.5, w: 9.2, h: 0.35,
      fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
    });
    s.addShape(SHAPES.LINE, {
      x: 0.5, y: 0.87, w: 9, h: 0,
      line: { color: BORDER, width: 1 },
    });

    // Company summary cards -- dinámico según los tipos con locales en esta empresa
    const companyCards = group.totals.byType.map((t) => ({
      label: t.name, count: t.count, uf: t.uf, color: colorHex(t.color),
      years: yearsWithCapex(t.yearBreakdown), yearLine: yearBreakdownLine(t.yearBreakdown),
    }));
    const companyCardGap = 0.15;
    const companyCardW = companyCards.length > 0 ? (9 - companyCardGap * (companyCards.length - 1)) / companyCards.length : 0;
    const maxCompanyYears = companyCards.reduce((max, c) => Math.max(max, c.years.length), 0);
    const companyCardH = 1.05 + Math.max(0, maxCompanyYears - 1) * CHIP_LINE_H_SM;

    companyCards.forEach((card, i) => {
      const x = 0.5 + i * (companyCardW + companyCardGap);

      s.addShape(SHAPES.RECTANGLE, {
        x, y: 1.1, w: companyCardW, h: companyCardH,
        fill: { color: LIGHT_BG },
      });

      s.addShape(SHAPES.RECTANGLE, {
        x, y: 1.1, w: 0.06, h: companyCardH,
        fill: { color: card.color },
      });

      s.addText(`${card.label} (${card.count})`, {
        x: x + 0.15, y: 1.15, w: companyCardW - 0.3, h: 0.25,
        fontSize: 10, fontFace: "Arial", color: MUTED,
      });

      s.addText(`${fmtUF(card.uf)} UF`, {
        x: x + 0.15, y: 1.4, w: companyCardW - 0.3, h: 0.35,
        fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
      });

      s.addText(formatCLP(card.uf * data.ufValue), {
        x: x + 0.15, y: 1.7, w: companyCardW - 0.3, h: 0.2,
        fontSize: 9, fontFace: "Arial", color: MUTED,
      });

      if (card.yearLine) {
        s.addText(card.yearLine, {
          x: x + 0.15, y: 1.9, w: companyCardW - 0.3, h: card.years.length * CHIP_LINE_H_SM,
          fontSize: 6.5, fontFace: "Arial", color: MUTED,
        });
      }
    });

    // Detail table
    const tableHeader: PptxGenJS.TableCell[] = [
      { text: "Local", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 9, fontFace: "Arial", align: "left" } },
      { text: "Clasificación", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 9, fontFace: "Arial", align: "center" } },
      { text: "m²", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 9, fontFace: "Arial", align: "center" } },
      { text: "Total UF", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 9, fontFace: "Arial", align: "right" } },
      { text: "Total CLP", options: { bold: true, color: WHITE, fill: { color: PRIMARY }, fontSize: 9, fontFace: "Arial", align: "right" } },
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
        targetSlide.addText("PRESUPUESTO CAPEX", {
          x: 0.5, y: 0.2, w: 9, h: 0.3,
          fontSize: 14, fontFace: "Arial", color: ACCENT, bold: true,
        });
        targetSlide.addText(`${group.company} (cont.)`, {
          x: 0.5, y: 0.5, w: 9.2, h: 0.35,
          fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
        });
      }

      const tableY = pageIdx === 0 ? 1.1 + companyCardH + 0.2 : 0.9;

      const rows: PptxGenJS.TableRow[] = [tableHeader];

      pageContracts.forEach((c, idx) => {
        const bgColor = idx % 2 === 0 ? WHITE : LIGHT_BG;
        const cellOpts = (align: "left" | "center" | "right" = "left"): PptxGenJS.TextPropsOptions => ({
          fontSize: 8, fontFace: "Arial", color: DARK, fill: { color: bgColor }, align,
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
          fontSize: 9, fontFace: "Arial", color: WHITE, fill: { color: PRIMARY }, align, bold: true,
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
        x: 0.3, y: tableY, w: 9.4,
        colW: [3.2, 1.5, 1.0, 1.8, 1.9],
        border: { pt: 0.5, color: BORDER },
      });

      addFooter(targetSlide, pageNum++);
    });
  }

  if (opts.skipSave) return pres;

  // Save
  const arrBuf = await pres.write({ outputType: "arraybuffer" }) as ArrayBuffer;
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

