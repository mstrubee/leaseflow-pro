import PptxGenJS from "pptxgenjs";
import {
  generateCapexPPT,
  loadImageAsBase64,
  PRIMARY,
  ACCENT,
  WHITE,
  LIGHT_BG,
  MUTED,
  DARK,
  type CapexPPTData,
} from "@/components/budget/CapexPPTExport";
import logosHeader from "@/assets/logos-header.png";

const SHAPES = {
  LINE: "line" as const,
};

export interface ContractSlideImage {
  dataUrl: string;
  w: number;
  h: number;
}

export interface ContractSlideData {
  contractName: string;
  subtitle: string;
  bullets: string[];
  /** [Datos Región A, Resumen business case, Datos Región B] — en ese orden. */
  images: [ContractSlideImage | null, ContractSlideImage | null, ContractSlideImage | null];
}

export interface InformeDirectorioParams {
  year: string;
  capexData: CapexPPTData;
  contractSlides: ContractSlideData[];
}

function fitContain(imgW: number, imgH: number, boxW: number, boxH: number) {
  if (!imgW || !imgH) return { w: boxW, h: boxH };
  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;
  if (imgAspect > boxAspect) return { w: boxW, h: boxW / imgAspect };
  return { w: boxH * imgAspect, h: boxH };
}

function addFooter(slide: PptxGenJS.Slide, text: string, pageNum: number) {
  slide.addText(text, {
    x: 0.5, y: 5.15, w: 5, h: 0.35,
    fontSize: 8, color: MUTED, fontFace: "Arial",
  });
  slide.addText(`${pageNum}`, {
    x: 8.5, y: 5.15, w: 1, h: 0.35,
    fontSize: 8, color: MUTED, fontFace: "Arial", align: "right",
  });
}

/**
 * Arma el PPT completo del Informe Directorio:
 *  1. Portada (mismo estilo que la portada de "PPT general" de CAPEX).
 *  2. Slides del PPT general de CAPEX (omitiendo su propia portada).
 *  3. Una slide por cada contrato en revisión, con los 3 recortes del
 *     Business Case ya capturados como imagen + subtítulo + Aspectos clave.
 */
export async function generateInformeDirectorioPPT(params: InformeDirectorioParams): Promise<void> {
  const { year, capexData, contractSlides } = params;
  const fileName = `Informe_Directorio_${year}_${new Date().toISOString().slice(0, 10)}.pptx`;

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
  pres.title = `Informe Directorio ${year}`;

  // ═══════════ SLIDE 1: Portada (mismo estilo que "PPT general") ═══════════
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(logosHeader);
  } catch {
    console.log("Could not load logo for PPT");
  }

  const s1 = pres.addSlide();
  s1.background = { color: PRIMARY };
  if (logoBase64) {
    s1.addImage({ data: logoBase64, x: 0.5, y: 0.4, w: 2.5, h: 1 });
  }
  s1.addText("Informe Directorio", {
    x: 0.5, y: 1.8, w: 9, h: 1,
    fontSize: 40, fontFace: "Arial", color: WHITE, bold: true,
  });
  s1.addText(`Año ${year}`, {
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

  // ═══════════ SLIDES 2-4 (o más): PPT general de CAPEX ═══════════
  await generateCapexPPT(capexData, { pres, skipCover: true, skipSave: true });

  // ═══════════ SLIDES 5+: una por contrato en revisión ═══════════
  let pageNum = pres.slides.length + 1;
  for (const c of contractSlides) {
    const s = pres.addSlide();
    s.background = { color: WHITE };

    s.addText(c.contractName, {
      x: 0.5, y: 0.3, w: 9, h: 0.5,
      fontSize: 26, fontFace: "Arial", color: PRIMARY, bold: true, margin: 0,
    });
    s.addText(c.subtitle, {
      x: 0.5, y: 0.78, w: 9, h: 0.35,
      fontSize: 13, fontFace: "Arial", color: DARK, italic: true,
    });
    s.addShape(SHAPES.LINE, {
      x: 0.5, y: 1.15, w: 9, h: 0,
      line: { color: ACCENT, width: 2 },
    });

    const [imgDatosA, imgResumenBC, imgDatosB] = c.images;

    // Fila superior: Resumen business case (recorte más ancho), a todo el ancho
    if (imgResumenBC) {
      const boxW = 9, boxH = 1.85;
      const fit = fitContain(imgResumenBC.w, imgResumenBC.h, boxW, boxH);
      s.addImage({
        data: imgResumenBC.dataUrl,
        x: 0.5 + (boxW - fit.w) / 2, y: 1.3 + (boxH - fit.h) / 2,
        w: fit.w, h: fit.h,
      });
    }

    // Fila inferior: Datos Región A (izq) + Datos Región B (centro) + Aspectos clave (der)
    const rowY = 3.3, rowH = 1.75;
    if (imgDatosA) {
      const boxW = 3.3;
      const fit = fitContain(imgDatosA.w, imgDatosA.h, boxW, rowH);
      s.addImage({
        data: imgDatosA.dataUrl,
        x: 0.5 + (boxW - fit.w) / 2, y: rowY + (rowH - fit.h) / 2,
        w: fit.w, h: fit.h,
      });
    }
    if (imgDatosB) {
      const boxW = 2.9;
      const fit = fitContain(imgDatosB.w, imgDatosB.h, boxW, rowH);
      s.addImage({
        data: imgDatosB.dataUrl,
        x: 4.0 + (boxW - fit.w) / 2, y: rowY + (rowH - fit.h) / 2,
        w: fit.w, h: fit.h,
      });
    }

    // Aspectos clave
    const aspX = 7.1, aspW = 2.4;
    s.addShape("rect" as const, {
      x: aspX, y: rowY, w: aspW, h: rowH,
      fill: { color: LIGHT_BG }, line: { color: "E2E8F0", width: 1 },
    });
    s.addText("Aspectos Clave", {
      x: aspX + 0.1, y: rowY + 0.08, w: aspW - 0.2, h: 0.3,
      fontSize: 11, fontFace: "Arial", color: PRIMARY, bold: true,
    });
    s.addText(
      c.bullets.map((b) => ({ text: b, options: { bullet: { code: "2022" }, breakLine: true } })),
      {
        x: aspX + 0.1, y: rowY + 0.4, w: aspW - 0.2, h: rowH - 0.5,
        fontSize: 9.5, fontFace: "Arial", color: DARK, valign: "top",
      },
    );

    addFooter(s, `Informe Directorio ${year}`, pageNum++);
  }

  if (saveHandle) {
    const arrBuf = await pres.write({ outputType: "arraybuffer" }) as ArrayBuffer;
    const blob = new Blob([arrBuf], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const writable = await saveHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const arrBuf = await pres.write({ outputType: "arraybuffer" }) as ArrayBuffer;
  const blob = new Blob([arrBuf], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
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
