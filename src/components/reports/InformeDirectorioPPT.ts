import PptxGenJS from "pptxgenjs";
import {
  generateCapexPPT,
  loadImageAsBase64,
  type CapexPPTData,
} from "@/components/budget/CapexPPTExport";
import type { BCInputs, BCResult } from "@/lib/businessCase/model";
import { buildResumenEjecutivoRows, buildPnlRows } from "@/lib/businessCase/reportRows";
import logoGrupoPlanetWhite from "@/assets/logo-grupoplanet-white.png";

// Colores exactos tomados del PPT de referencia ("PPT Directorio.pptx").
const PORTADA_RED = "C21D18";
const MAROON = "C0003F";
const MAROON_LIGHT = "FBE4EA";
const GRAY_HIGHLIGHT = "D9D9D9";
const PAGE_BG = "F2F2F2";
const KICKER_RED = "C21D18";
const WHITE = "FFFFFF";
const DARK = "1A1A1A";
const MUTED = "666666";
const BORDER = "CCCCCC";

// Título fijo de la portada — igual que el PPT de referencia. Por instrucción
// explícita, la slide 1 NUNCA cambia salvo el año.
const PORTADA_TITLE_LINES = ["DESARROLLO nuevas tiendas", "Update patentes y Relocalización"];

export interface ContractSlideData {
  contractName: string;
  subtitle: string;
  bullets: string[];
  inputs: BCInputs;
  result: BCResult;
  /** Láminas del "Informe directorio" de Geochile Compass (PNG 1920×1080), si se extrajeron para este contrato. */
  geochileSlides?: { slide1: string; slide2?: string };
}

export interface InformeDirectorioParams {
  year: string;
  capexData: CapexPPTData;
  contractSlides: ContractSlideData[];
}

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Arma el deck y lo devuelve como Blob, sin decidir qué hacer con él.
 *
 * Está separado de `generateInformeDirectorioPPT` porque el informe ahora tiene
 * dos destinos —descargarlo y compartirlo por link— y ambos tienen que entregar
 * EXACTAMENTE el mismo archivo. Si cada camino armara su propio deck, tarde o
 * temprano el que se comparte diría algo distinto del que se descarga.
 */
export async function buildInformeDirectorioPptx(
  params: InformeDirectorioParams,
): Promise<{ blob: Blob; fileName: string }> {
  const { year, capexData, contractSlides } = params;
  const fileName = `Informe_Directorio_${year}_${new Date().toISOString().slice(0, 10)}.pptx`;

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "GPlanet";
  pres.title = `Informe Directorio ${year}`;

  // ═══════════ SLIDE 1: Portada (fija, no cambia salvo el año) ═══════════
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(logoGrupoPlanetWhite);
  } catch {
    console.log("Could not load GrupoPlanet logo for PPT");
  }

  const s1 = pres.addSlide();
  s1.background = { color: PORTADA_RED };
  s1.addShape("rect" as const, { x: 0.35, y: 0.15, w: 0.12, h: 3.0, fill: { color: WHITE } });
  if (logoBase64) {
    s1.addImage({ data: logoBase64, x: 7.7, y: 0.35, w: 2.0, h: 0.56 });
  }
  s1.addText(PORTADA_TITLE_LINES.join("\n"), {
    x: 0.9, y: 3.15, w: 8.6, h: 1.7,
    fontSize: 32, fontFace: "Arial", color: WHITE, bold: true, valign: "top", lineSpacing: 38,
  });
  s1.addText(year, {
    x: 0.9, y: 4.85, w: 3, h: 0.4,
    fontSize: 16, fontFace: "Arial", color: WHITE,
  });

  // ═══════════ SLIDES 2-4 (o más): PPT general de CAPEX ═══════════
  await generateCapexPPT(capexData, { pres, skipCover: true, skipSave: true });

  // ═══════════ SLIDES 5+: una por contrato en revisión ═══════════
  for (const c of contractSlides) {
    const s = pres.addSlide();
    s.background = { color: PAGE_BG };

    s.addText("DETALLE CAPEX PLAN EXPANSIÓN", {
      x: 0.4, y: 0.2, w: 9, h: 0.3,
      fontSize: 14, fontFace: "Arial", color: KICKER_RED, bold: true,
    });
    s.addText(c.subtitle, {
      x: 0.4, y: 0.5, w: 9.2, h: 0.35,
      fontSize: 16, fontFace: "Arial", color: DARK, bold: true,
    });
    s.addShape("line" as const, {
      x: 0.4, y: 0.87, w: 9.2, h: 0,
      line: { color: BORDER, width: 1 },
    });

    s.addText(`Local ${c.contractName}`, {
      x: 0.4, y: 0.95, w: 4.3, h: 0.25,
      fontSize: 11, fontFace: "Arial", color: DARK, bold: true,
    });
    s.addText("Aspectos clave:", {
      x: 0.4, y: 1.2, w: 4.3, h: 0.2,
      fontSize: 9, fontFace: "Arial", color: DARK,
    });
    s.addText(
      c.bullets.map((b) => ({ text: b, options: { bullet: { code: "2022" }, breakLine: true } })),
      { x: 0.5, y: 1.4, w: 4.1, h: 0.55, fontSize: 9, fontFace: "Arial", color: DARK, valign: "top" },
    );

    // ── Tabla izquierda: Resumen Ejecutivo NUEVO LOCAL ──
    const infoRows = buildResumenEjecutivoRows(c.inputs, c.result);
    const infoTableRows: PptxGenJS.TableRow[] = [
      [{ text: "Resumen Ejecutivo NUEVO LOCAL", options: { colspan: 3, bold: true, color: WHITE, fill: { color: MAROON }, fontSize: 7, fontFace: "Arial", align: "left" } }],
    ];
    infoRows.forEach((r) => {
      const fill = r.highlight ? MAROON_LIGHT : WHITE;
      const topBorder = r.divider ? { pt: 1, color: MAROON } : { pt: 0.25, color: BORDER };
      infoTableRows.push([
        { text: r.label, options: { fontSize: 5.5, fontFace: "Arial", color: DARK, fill: { color: fill }, align: "left", border: [topBorder, { pt: 0.25, color: BORDER }, { pt: 0.25, color: BORDER }, { pt: 0.25, color: BORDER }] } },
        { text: r.unit, options: { fontSize: 5.5, fontFace: "Arial", color: MUTED, fill: { color: fill }, align: "left" } },
        { text: r.value, options: { fontSize: 5.5, fontFace: "Arial", color: DARK, fill: { color: fill }, align: "right" } },
      ]);
    });
    s.addTable(infoTableRows, {
      x: 0.4, y: 2.0, w: 4.3,
      colW: [2.55, 0.65, 1.1],
      autoPage: false,
      border: { pt: 0, color: BORDER },
      margin: [1, 2, 1, 2],
    });

    // ── Tabla derecha: P&L completo ──
    const pnlRows = buildPnlRows(c.inputs, c.result);
    const pnlTableRows: PptxGenJS.TableRow[] = [
      [
        { text: "Año", options: { bold: true, color: WHITE, fill: { color: MAROON }, fontSize: 5.5, fontFace: "Arial", align: "left" } },
        ...[1, 2, 3, 4, 5].map((n, i) => ({
          text: `${n}\n${new Date(c.inputs.inicio || Date.now()).getFullYear() + i}`,
          options: { bold: true, color: WHITE, fill: { color: MAROON }, fontSize: 5.5, fontFace: "Arial", align: "center" as const },
        })),
      ],
    ];
    pnlRows.forEach((r) => {
      if (!r.label) {
        pnlTableRows.push([{ text: "", options: { colspan: 6, fill: { color: WHITE } } }]);
        return;
      }
      const fill = r.maroonHighlight ? MAROON : r.grayHighlight ? GRAY_HIGHLIGHT : WHITE;
      const textColor = r.maroonHighlight ? WHITE : DARK;
      const labelCell: PptxGenJS.TableCell = {
        text: r.label,
        options: { bold: !!r.bold, color: textColor, fill: { color: fill }, fontSize: 5.5, fontFace: "Arial", align: "left" },
      };
      const valueCells: PptxGenJS.TableCell[] = r.values.map((v, i) => ({
        text: i === 0 && r.col0 ? r.col0 : v,
        options: { bold: !!r.bold, color: textColor, fill: { color: fill }, fontSize: 5.5, fontFace: "Arial", align: "right" as const },
      }));
      pnlTableRows.push([labelCell, ...valueCells]);
    });
    s.addTable(pnlTableRows, {
      x: 4.85, y: 0.95, w: 4.75,
      colW: [1.75, 0.6, 0.6, 0.6, 0.6, 0.6],
      autoPage: false,
      border: { pt: 0.25, color: BORDER },
      margin: [1, 2, 1, 2],
    });

    // ── Láminas territoriales de Geochile Compass, si se extrajeron ──
    // Van DESPUÉS de la slide propia del contrato: números primero, después
    // el territorio que los respalda.
    if (c.geochileSlides) {
      for (const data of [c.geochileSlides.slide1, c.geochileSlides.slide2]) {
        if (!data) continue;
        const gs = pres.addSlide();
        gs.addImage({ data, x: 0, y: 0, w: 10, h: 5.625 });
      }
    }
  }

  const arrBuf = await pres.write({ outputType: "arraybuffer" }) as ArrayBuffer;
  return { blob: new Blob([arrBuf], { type: PPTX_MIME }), fileName };
}

/**
 * Genera el informe y lo guarda en el disco del usuario.
 *
 * Mantiene el comportamiento de siempre: si el navegador soporta
 * `showSaveFilePicker` se elige la ubicación, si no cae al link de descarga.
 * El picker se abre ANTES de armar el deck a propósito — tiene que ocurrir
 * dentro del gesto del usuario o Chrome lo bloquea.
 */
export async function generateInformeDirectorioPPT(params: InformeDirectorioParams): Promise<void> {
  const { year } = params;
  const suggestedName = `Informe_Directorio_${year}_${new Date().toISOString().slice(0, 10)}.pptx`;

  type FileHandle = { createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };
  let saveHandle: FileHandle | null = null;
  const canPick = typeof (window as any).showSaveFilePicker === "function";
  if (canPick) {
    try {
      saveHandle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{ description: "Presentación PowerPoint", accept: { [PPTX_MIME]: [".pptx"] } }],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      saveHandle = null;
    }
  }

  const { blob, fileName } = await buildInformeDirectorioPptx(params);

  if (saveHandle) {
    const writable = await saveHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

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
