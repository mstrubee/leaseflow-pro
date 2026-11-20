import { buildExpenseReportZip, expenseReportZipFileName } from "./expenseReportZip";
import type { ExpenseItem, ExpenseReport } from "./expenseReportsTypes";

const ZIP_MIME = "application/zip";

function summaryText(report: ExpenseReport, items: ExpenseItem[]): string {
  const total = items.reduce((s, i) => s + (i.total_amount ?? 0), 0);
  return `Rendición de gastos — ${report.title}: ${items.length} gasto(s), total ${total.toLocaleString("es-CL")}.`;
}

/**
 * Comparte el informe como .zip (Excel + fotos comprimidas) — Web Share API
 * con el archivo adjunto en navegadores móviles que lo soportan (abre el
 * selector nativo con WhatsApp/Mail ya con el archivo puesto); si no está
 * disponible, ni mailto: ni wa.me pueden llevar un adjunto por URL
 * (limitación real de la plataforma, no un bug acá) — se descarga el .zip
 * igual y se avisa que hay que adjuntarlo a mano.
 */
export async function shareExpenseReport(report: ExpenseReport, items: ExpenseItem[]): Promise<{ shared: boolean; fileName: string }> {
  const blob = await buildExpenseReportZip(report, items);
  const fileName = expenseReportZipFileName(report);
  const file = new File([blob], fileName, { type: ZIP_MIME });
  const text = summaryText(report, items);

  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: report.title, text });
      return { shared: true, fileName };
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return { shared: false, fileName };
      // si falla, cae al fallback de descarga
    }
  }

  // Fallback: descargar el .zip (no queda adjunto en los enlaces de abajo).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { shared: false, fileName };
}

/** Enlaces de fallback para compartir el resumen por WhatsApp/correo (sin adjunto). */
export function expenseReportShareLinks(report: ExpenseReport, items: ExpenseItem[]) {
  const text = summaryText(report, items);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    email: `mailto:?subject=${encodeURIComponent(`Rendición de gastos — ${report.title}`)}&body=${encodeURIComponent(text)}`,
  };
}
