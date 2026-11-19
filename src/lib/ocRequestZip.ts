/**
 * ZIP de una Solicitud de OC: el PDF de la solicitud + la cotización adjunta.
 * Parte pura (sin Supabase) para poder probarla; la obtención del archivo de la
 * cotización está en ocRequestQuotation.ts.
 */

export interface QuotationFile {
  blob: Blob;
  fileName: string;
}

/** Quita lo que no puede ir en el nombre de un archivo dentro del ZIP. */
const safeEntryName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Cotizacion";

/** Mismo nombre que el PDF de la solicitud, con extensión .zip. */
export const ocRequestZipFileName = (pdfFileName: string): string =>
  `${pdfFileName.replace(/\.pdf$/i, "")}.zip`;

/**
 * Arma el ZIP con la Solicitud de OC (PDF) y la cotización, esta última con su
 * nombre original. Si el nombre coincidiera con el del PDF, se antepone
 * "Cotizacion_" para no pisarlo.
 */
export async function buildOCRequestZip(
  pdf: { blob: Blob; fileName: string },
  quotation: QuotationFile,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file(pdf.fileName, pdf.blob);
  let quotationName = safeEntryName(quotation.fileName);
  if (quotationName === pdf.fileName) quotationName = `Cotizacion_${quotationName}`;
  zip.file(quotationName, quotation.blob);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
