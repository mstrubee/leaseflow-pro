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

interface CompanyGroup {
  company: string;
  contracts: ContractData[];
  totals: {
    nuevo: number;
    reemplazo: number;
    regularizacion: number;
    cNuevo: number;
    cReemplazo: number;
    cRegularizacion: number;
    total: number;
  };
}

interface CapexPPTData {
  year: string;
  ufValue: number;
  totalCapexUF: number;
  totalNuevoUF: number;
  totalReemplazoUF: number;
  totalRegularizacionUF: number;
  countNuevo: number;
  countReemplazo: number;
  countRegularizacion: number;
  totalLocales: number;
  companyGroups: CompanyGroup[];
}

// Colors
const PRIMARY = "1E2761";
const ACCENT = "DC2626";
const WHITE = "FFFFFF";
const LIGHT_BG = "F8FAFC";
const MUTED = "64748B";
const DARK = "1E293B";
const CHART_1 = "2563EB"; // Nuevos
const CHART_2 = "D97706"; // Reemplazo
const CHART_3 = "059669"; // Regularización

const fmtUF = (v: number) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: 0 });

const fmtUF2 = (v: number) =>
  v.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clasificacionLabel = (c: string | null) => {
  if (c === "nuevo") return "Nuevo";
  if (c === "reemplazo") return "Reemplazo";
  if (c === "regularizacion") return "Regularización";
  return "Sin clasificar";
};

async function loadImageAsBase64(src: string): Promise<string> {
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

export async function generateCapexPPT(data: CapexPPTData) {
  const fileName = `CAPEX_${data.year}_${new Date().toISOString().slice(0, 10)}.pptx`;

  type FileHandle = { createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };
  let saveHandle: FileHandle | null = null;
  const canPick = typeof (window as any).showSaveFilePicker === "function";
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

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "GPlanet";
  pres.title = `Presupuesto CAPEX ${data.year}`;

  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(logosHeader);
  } catch {
    console.log("Could not load logo for PPT");
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
  const s1 = pres.addSlide();
  s1.background = { color: PRIMARY };

  if (logoBase64) {
    s1.addImage({ data: logoBase64, x: 0.5, y: 0.4, w: 2.5, h: 1 });
  }

  s1.addText("Presupuesto CAPEX", {
    x: 0.5, y: 1.8, w: 9, h: 1,
    fontSize: 40, fontFace: "Arial", color: WHITE, bold: true,
  });
  s1.addText(`Año ${data.year}`, {
    x: 0.5, y: 2.7, w: 9, h: 0.6,
    fontSize: 24, fontFace: "Arial", color: "CADCFC",
  });

  s1.addShape(SHAPES.LINE, {
    x: 0.5, y: 3.5, w: 3, h: 0,
    line: { color: ACCENT, width: 3 },
  });

  const today = new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  s1.addText(today, {
    x: 0.5, y: 4.0, w: 9, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: "8899BB",
  });

  // ═══════════ SLIDE 2: Resumen General ═══════════
  let pageNum = 1;
  const s2 = pres.addSlide();
  s2.background = { color: WHITE };

  s2.addText("Resumen General", {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 28, fontFace: "Arial", color: PRIMARY, bold: true, margin: 0,
  });

  s2.addShape(SHAPES.LINE, {
    x: 0.5, y: 0.85, w: 9, h: 0,
    line: { color: ACCENT, width: 2 },
  });

  // Big total card
  s2.addShape(SHAPES.RECTANGLE, {
    x: 0.5, y: 1.2, w: 9, h: 1.2,
    fill: { color: PRIMARY },
  });

  s2.addText("Inversión Total CAPEX", {
    x: 0.7, y: 1.3, w: 4, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: "CADCFC",
  });

  s2.addText(`${fmtUF(data.totalCapexUF)} UF`, {
    x: 0.7, y: 1.65, w: 4, h: 0.5,
    fontSize: 28, fontFace: "Arial", color: WHITE, bold: true,
  });

  s2.addText(formatCLP(data.totalCapexUF * data.ufValue), {
    x: 5, y: 1.65, w: 4.3, h: 0.5,
    fontSize: 22, fontFace: "Arial", color: "CADCFC", align: "right",
  });

  s2.addText(`${data.totalLocales} locales`, {
    x: 5, y: 1.3, w: 4.3, h: 0.4,
    fontSize: 14, fontFace: "Arial", color: "CADCFC", align: "right",
  });

  // Classification cards
  const classCards = [
    { label: "Nuevos", count: data.countNuevo, uf: data.totalNuevoUF, color: CHART_1 },
    { label: "Reemplazo", count: data.countReemplazo, uf: data.totalReemplazoUF, color: CHART_2 },
    { label: "Regularización", count: data.countRegularizacion, uf: data.totalRegularizacionUF, color: CHART_3 },
  ];

  classCards.forEach((card, i) => {
    const x = 0.5 + i * 3.1;
    const y = 2.7;

    s2.addShape(SHAPES.RECTANGLE, {
      x, y, w: 2.8, h: 1.4,
      fill: { color: LIGHT_BG },
    });

    // Left accent
    s2.addShape(SHAPES.RECTANGLE, {
      x, y, w: 0.06, h: 1.4,
      fill: { color: card.color },
    });

    s2.addText(card.label, {
      x: x + 0.2, y: y + 0.1, w: 2.4, h: 0.3,
      fontSize: 11, fontFace: "Arial", color: MUTED,
    });

    s2.addText(`${fmtUF(card.uf)} UF`, {
      x: x + 0.2, y: y + 0.4, w: 2.4, h: 0.4,
      fontSize: 18, fontFace: "Arial", color: DARK, bold: true,
    });

    s2.addText(`${card.count} ${card.count === 1 ? "local" : "locales"}`, {
      x: x + 0.2, y: y + 0.85, w: 2.4, h: 0.3,
      fontSize: 10, fontFace: "Arial", color: MUTED,
    });

    s2.addText(formatCLP(card.uf * data.ufValue), {
      x: x + 0.2, y: y + 1.05, w: 2.4, h: 0.25,
      fontSize: 9, fontFace: "Arial", color: MUTED,
    });
  });

  // Pie chart
  s2.addChart(CHARTS.PIE, [{
    name: "Distribución",
    labels: ["Nuevos", "Reemplazo", "Regularización"],
    values: [data.totalNuevoUF, data.totalReemplazoUF, data.totalRegularizacionUF],
  }], {
    x: 1.5, y: 4.2, w: 3, h: 1.0,
    showPercent: true,
    showTitle: false,
    showLegend: true,
    legendPos: "r",
    legendFontSize: 8,
    chartColors: [CHART_1, CHART_2, CHART_3],
    dataLabelFontSize: 8,
    dataLabelColor: DARK,
  });

  addFooter(s2, pageNum++);

  // ═══════════ SLIDES 3+: Per Company ═══════════
  for (const group of data.companyGroups) {
    const s = pres.addSlide();
    s.background = { color: WHITE };

    s.addText(group.company, {
      x: 0.5, y: 0.3, w: 9, h: 0.6,
      fontSize: 28, fontFace: "Arial", color: PRIMARY, bold: true, margin: 0,
    });

    s.addShape(SHAPES.LINE, {
      x: 0.5, y: 0.85, w: 9, h: 0,
      line: { color: ACCENT, width: 2 },
    });

    // Company summary cards
    const companyCards = [
      { label: "Nuevos", count: group.totals.cNuevo, uf: group.totals.nuevo, color: CHART_1 },
      { label: "Reemplazo", count: group.totals.cReemplazo, uf: group.totals.reemplazo, color: CHART_2 },
      { label: "Regularización", count: group.totals.cRegularizacion, uf: group.totals.regularizacion, color: CHART_3 },
    ];

    companyCards.forEach((card, i) => {
      const x = 0.5 + i * 3.1;

      s.addShape(SHAPES.RECTANGLE, {
        x, y: 1.1, w: 2.8, h: 0.9,
        fill: { color: LIGHT_BG },
      });

      s.addShape(SHAPES.RECTANGLE, {
        x, y: 1.1, w: 0.06, h: 0.9,
        fill: { color: card.color },
      });

      s.addText(`${card.label} (${card.count})`, {
        x: x + 0.15, y: 1.15, w: 2.5, h: 0.25,
        fontSize: 10, fontFace: "Arial", color: MUTED,
      });

      s.addText(`${fmtUF(card.uf)} UF`, {
        x: x + 0.15, y: 1.4, w: 2.5, h: 0.35,
        fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
      });

      s.addText(formatCLP(card.uf * data.ufValue), {
        x: x + 0.15, y: 1.7, w: 2.5, h: 0.2,
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

    // Sort contracts: by clasificacion then name
    const sorted = [...group.contracts].sort((a, b) => {
      const clOrder = ["nuevo", "reemplazo", "regularizacion"];
      const aIdx = clOrder.indexOf(a.clasificacion || "");
      const bIdx = clOrder.indexOf(b.clasificacion || "");
      if (aIdx !== bIdx) return aIdx - bIdx;
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
        targetSlide.background = { color: WHITE };
        targetSlide.addText(`${group.company} (cont.)`, {
          x: 0.5, y: 0.3, w: 9, h: 0.5,
          fontSize: 22, fontFace: "Arial", color: PRIMARY, bold: true,
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
          fontSize: 9, fontFace: "Arial", color: WHITE, fill: { color: DARK }, align, bold: true,
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
        border: { pt: 0.5, color: "E2E8F0" },
      });

      addFooter(targetSlide, pageNum++);
    });
  }

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
}

