import * as pdfjsLib from "pdfjs-dist";
// Vite resuelve esto a la URL del worker ya compilado. Sin esto pdf.js no
// puede parsear en el navegador: necesita correr en un worker.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * "OC 4900040476.pdf" → "4900040476". Tolera espacio, guion y guion bajo.
 * También acepta el archivo nombrado solo con el número, sin el prefijo
 * "OC" ("4900040476.pdf") — se exige un mínimo de 6 dígitos y que sea TODO
 * el nombre (no una parte), para no confundir con años, versiones u otros
 * números que aparezcan en nombres compuestos como "Factura_123456.pdf".
 */
export function parseOrderNumberFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.pdf$/i, "").trim();

  const withPrefix = base.match(/^oc[\s_-]+(\d+)/i);
  if (withPrefix) return withPrefix[1];

  const onlyNumber = base.match(/^(\d{6,})$/);
  if (onlyNumber) return onlyNumber[1];

  return null;
}

/**
 * Lee el número real impreso en un PDF de OC ("Nº Orden: 4900043986"),
 * verificado contra un PDF de ejemplo real. Solo se lee la primera página:
 * ahí está el dato en todas las OC vistas. Si el PDF no tiene capa de texto
 * (escaneado) o pdfjs no puede leerlo, devuelve null sin lanzar — quien lo
 * llama decide si eso bloquea algo o no.
 */
export async function extractOrderNumberFromPdf(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str ?? "").join(" ");
    // "Nº Orden", "N° Orden", "No Orden", con o sin espacio/dos puntos.
    const match = text.match(/n[°ºo]\.?\s*orden\s*:?\s*(\d{4,})/i);
    return match ? match[1] : null;
  } catch (err) {
    console.error("No se pudo leer el contenido del PDF para extraer el número de OC:", err);
    return null;
  }
}
