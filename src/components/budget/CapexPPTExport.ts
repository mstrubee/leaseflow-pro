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
export const PRIMARY = "C0003F"; // Maroon
export const ACCENT = "C21D18"; // Kicker rojo
export const WHITE = "FFFFFF";
export const LIGHT_BG = "FBE4EA"; // Maroon claro
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
const colorHex = (c?: string) => COLOR_HEX[c || "gray"] || COLOR_HEX.gray;

const fmtUF = (v: number) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: 0 });

const fmtUF2 = (v: number) =>
  v.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  // Big total card
  s2.addShape(SHAPES.RECTANGLE, {
    x: 0.5, y: 1.2, w: 9, h: 1.2,
    fill: { color: PRIMARY },
  });

  s2.addText("Inversión Total CAPEX", {
    x: 0.7, y: 1.3, w: 4, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: "F5C6D0",
  });

  s2.addText(`${fmtUF(data.totalCapexUF)} UF`, {
    x: 0.7, y: 1.65, w: 4, h: 0.5,
    fontSize: 28, fontFace: "Arial", color: WHITE, bold: true,
  });

  s2.addText(formatCLP(data.totalCapexUF * data.ufValue), {
    x: 5, y: 1.65, w: 4.3, h: 0.5,
    fontSize: 22, fontFace: "Arial", color: "F5C6D0", align: "right",
  });

  s2.addText(`${data.totalLocales} locales`, {
    x: 5, y: 1.3, w: 4.3, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: "F5C6D0", align: "right",
  });

  // Classification cards -- dinámico según los "Tipos de CAPEX" que tengan
  // algún local asignado (ya no son 3 fijos).
  const classCards = data.clasificacionTotals.map((t) => ({ label: t.name, count: t.count, uf: t.uf, color: colorHex(t.color) }));
  const cardGap = 0.15;
  const cardW = classCards.length > 0 ? (9 - cardGap * (classCards.length - 1)) / classCards.length : 0;

  classCards.forEach((card, i) => {
    const x = 0.5 + i * (cardW + cardGap);
    const y = 2.7;

    s2.addShape(SHAPES.RECTANGLE, {
      x, y, w: cardW, h: 1.4,
      fill: { color: LIGHT_BG },
    });

    // Left accent
    s2.addShape(SHAPES.RECTANGLE, {
      x, y, w: 0.06, h: 1.4,
      fill: { color: card.color },
    });

    s2.addText(card.label, {
      x: x + 0.2, y: y + 0.1, w: cardW - 0.4, h: 0.3,
      fontSize: 11, fontFace: "Arial", color: MUTED,
    });

    s2.addText(`${fmtUF(card.uf)} UF`, {
      x: x + 0.2, y: y + 0.4, w: cardW - 0.4, h: 0.4,
      fontSize: 18, fontFace: "Arial", color: DARK, bold: true,
    });

    s2.addText(`${card.count} ${card.count === 1 ? "local" : "locales"}`, {
      x: x + 0.2, y: y + 0.85, w: cardW - 0.4, h: 0.3,
      fontSize: 10, fontFace: "Arial", color: MUTED,
    });

    s2.addText(formatCLP(card.uf * data.ufValue), {
      x: x + 0.2, y: y + 1.05, w: cardW - 0.4, h: 0.25,
      fontSize: 9, fontFace: "Arial", color: MUTED,
    });
  });

  // Pie chart
  if (data.clasificacionTotals.length > 0) {
    s2.addChart(CHARTS.PIE, [{
      name: "Distribución",
      labels: data.clasificacionTotals.map((t) => t.name),
      values: data.clasificacionTotals.map((t) => t.uf),
    }], {
      x: 1.5, y: 4.2, w: 3, h: 1.0,
      showPercent: true,
      showTitle: false,
      showLegend: true,
      legendPos: "r",
      legendFontSize: 8,
      chartColors: data.clasificacionTotals.map((t) => colorHex(t.color)),
      dataLabelFontSize: 8,
      dataLabelColor: DARK,
    });
  }

  addFooter(s2, pageNum++);

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
    const companyCards = group.totals.byType.map((t) => ({ label: t.name, count: t.count, uf: t.uf, color: colorHex(t.color) }));
    const companyCardGap = 0.15;
    const companyCardW = companyCards.length > 0 ? (9 - companyCardGap * (companyCards.length - 1)) / companyCards.length : 0;

    companyCards.forEach((card, i) => {
      const x = 0.5 + i * (companyCardW + companyCardGap);

      s.addShape(SHAPES.RECTANGLE, {
        x, y: 1.1, w: companyCardW, h: 0.9,
        fill: { color: LIGHT_BG },
      });

      s.addShape(SHAPES.RECTANGLE, {
        x, y: 1.1, w: 0.06, h: 0.9,
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

      const tableY = pageIdx === 0 ? 2.2 : 0.9;

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

