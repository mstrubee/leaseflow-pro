import JSZip from "jszip";
import * as XLSX from "xlsx";
import { resolveFileUrl } from "@/lib/storageUtils";
import { buildExpenseReportWorkbook } from "./expenseReportExcel";
import { EXPENSE_TYPE_LABELS, type ExpenseItem, type ExpenseReport } from "./expenseReportsTypes";

function sanitizeFileName(s: string): string {
  return s.replace(/[^\w.\-]/g, "_");
}

function photoExtension(photoPath: string): string {
  const match = photoPath.match(/\.([a-zA-Z0-9]{2,5})(?:$|\?)/);
  return match ? match[1].toLowerCase() : "jpg";
}

export function expenseReportZipFileName(report: ExpenseReport): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  return `Rendicion_${sanitizeFileName(report.title)}_${dateStr}.zip`;
}

/** Arma un .zip con el Excel del informe + una carpeta fotos/ con cada
 *  comprobante (comprimido vía DEFLATE, igual que el resto del zip). Las
 *  fotos que ya no existan en storage (p.ej. purgadas a los 60 días) se
 *  omiten sin interrumpir el resto. */
export async function buildExpenseReportZip(report: ExpenseReport, items: ExpenseItem[]): Promise<Blob> {
  const zip = new JSZip();

  const wb = buildExpenseReportWorkbook(report, items);
  const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  zip.file(`Rendicion_${sanitizeFileName(report.title)}.xlsx`, xlsxBuffer);

  const photosFolder = zip.folder("fotos");
  let photoIndex = 0;
  for (const item of items) {
    if (!item.photo_path) continue;
    photoIndex++;
    try {
      const url = await resolveFileUrl(item.photo_path);
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const label = item.expense_type ? EXPENSE_TYPE_LABELS[item.expense_type] : "gasto";
      const ext = photoExtension(item.photo_path);
      photosFolder?.file(`${String(photoIndex).padStart(2, "0")}_${sanitizeFileName(label)}.${ext}`, blob);
    } catch {
      // una foto que falle no debe impedir el resto del zip
    }
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/** Descarga directa del .zip (Excel + fotos). */
export async function exportExpenseReportZip(report: ExpenseReport, items: ExpenseItem[]): Promise<string> {
  const blob = await buildExpenseReportZip(report, items);
  const fileName = expenseReportZipFileName(report);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return fileName;
}
