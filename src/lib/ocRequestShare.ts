import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Tipos compartidos por los 3 puntos donde se crea una Solicitud de OC
// (OCRequestDialog, OCRequestsList, CentralizedOrderCreator en modo "request") ──

export interface OCRequestShareLine {
  /** Nombre de la línea de presupuesto o categoría OPEX a la que se asigna el monto. */
  lineName: string;
  amountClp: number;
}

export interface OCRequestSharePayment {
  description: string;
  amountClp: number;
  /** ISO yyyy-mm-dd, o null si no se definió (pago único / balance). */
  dueDate: string | null;
}

export interface OCRequestShareData {
  /** ISO yyyy-mm-dd. */
  requestDate: string;
  currency: "UF" | "CLP";
  /** Uno o varios — una solicitud puede repartirse entre varios contratos (CentralizedOrderCreator). */
  contractNames: string[];
  /** Texto libre que el usuario escribió (el "Título"/concepto de la solicitud). */
  description: string;
  /** Detalle de ítems: una fila por línea de presupuesto con el monto que se le asigna. */
  lines: OCRequestShareLine[];
  totalAmountClp: number;
  /** Plan de pagos ya resuelto a montos concretos en CLP. Vacío = pago único por el total. */
  payments: OCRequestSharePayment[];
  supplierName?: string | null;
  requestedBy?: string | null;
}

function fmtClp(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CL", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Genera el PDF de una Solicitud de OC. Formato similar al de una Orden de
 * Compra real (encabezado, datos, observaciones, tabla de ítems), pero:
 * - título "SOLICITUD DE OC" (no es una orden ya emitida),
 * - sin número de solicitud (uso interno del sistema, no aporta al lector),
 * - "Datos Proveedor" se reemplaza por Contrato(s), porque el destinatario
 *   necesita saber a qué local(es)/contrato(s) corresponde el gasto,
 * - "Observaciones" combina la descripción escrita por el usuario con la(s)
 *   línea(s) de presupuesto a la que se imputa, en un solo texto,
 * - "Detalle de ítems" es una fila por línea con el monto asignado,
 * - se agrega "Plan de Pagos" cuando corresponde, con su total verificado
 *   contra el monto de la solicitud (ver validatePaymentPlanTotal).
 */
export function buildOCRequestPdf(data: OCRequestShareData): jsPDF {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 58, 95);
  doc.rect(14, 10, pageW - 28, 16, "F");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("SOLICITUD DE OC", pageW / 2, 20, { align: "center" });
  doc.setTextColor(0, 0, 0);

  const headerRows: [string, string][] = [
    ["FECHA", fmtDate(data.requestDate)],
    ["MONEDA", data.currency],
    ["CONTRATO(S)", data.contractNames.join(", ") || "—"],
  ];
  if (data.supplierName) headerRows.push(["PROVEEDOR", data.supplierName]);
  if (data.requestedBy) headerRows.push(["SOLICITA", data.requestedBy]);

  autoTable(doc, {
    startY: 32,
    body: headerRows,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold", fillColor: [240, 240, 240] },
      1: { cellWidth: pageW - 63 },
    },
  });

  // Observaciones = descripción + línea(s), como un solo texto.
  const observaciones = [
    data.description?.trim(),
    `Línea(s) de imputación: ${data.lines.map((l) => l.lineName).join(", ") || "—"}`,
  ].filter(Boolean).join("\n");

  const obsY = (doc as any).lastAutoTable?.finalY || 40;
  autoTable(doc, {
    startY: obsY,
    body: [["OBSERVACIONES", observaciones]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, minCellHeight: 20 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold", fillColor: [240, 240, 240], valign: "top" },
      1: { cellWidth: pageW - 63 },
    },
  });

  const itemsY = ((doc as any).lastAutoTable?.finalY || 54) + 6;
  autoTable(doc, {
    startY: itemsY,
    head: [["Línea", "Monto"]],
    body: data.lines.map((l) => [l.lineName, fmtClp(l.amountClp)]),
    foot: [["Total", fmtClp(data.totalAmountClp)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });

  const paymentsY = ((doc as any).lastAutoTable?.finalY || 90) + 10;
  const payments = data.payments.length > 0
    ? data.payments
    : [{ description: "Pago único", amountClp: data.totalAmountClp, dueDate: null }];

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Plan de Pagos", 14, paymentsY);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: paymentsY + 4,
    head: [["Descripción", "Vencimiento", "Monto"]],
    body: payments.map((p) => [p.description, fmtDate(p.dueDate), fmtClp(p.amountClp)]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [230, 230, 230], textColor: 0 },
    columnStyles: { 2: { halign: "right" } },
  });

  return doc;
}

export function ocRequestPdfFileName(data: OCRequestShareData): string {
  const dateCompact = data.requestDate.replace(/-/g, "");
  const line = data.lines[0]?.lineName?.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30) ?? "solicitud";
  return `Solicitud_OC_${dateCompact}_${line}.pdf`;
}

interface SaveFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

type SaveTarget =
  | { status: "ready"; handle: SaveFileHandle }
  | { status: "unsupported" }
  | { status: "cancelled" };

const canPickSaveLocation = () =>
  typeof window !== "undefined" &&
  typeof (window as typeof window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";

/**
 * Mismo patrón que CapexExcelExport.ts (showSaveFilePicker con fallback a
 * <a download> en navegadores que no lo soportan), agregando `startIn:
 * "downloads"` para que el selector abra en la carpeta Descargas por
 * defecto, como se pidió explícitamente para este flujo.
 */
async function pickSaveLocation(filename: string): Promise<SaveTarget> {
  if (!canPickSaveLocation()) return { status: "unsupported" };
  try {
    const handle = await (window as typeof window & {
      showSaveFilePicker: (options: {
        suggestedName: string;
        startIn?: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<SaveFileHandle>;
    }).showSaveFilePicker({
      suggestedName: filename,
      startIn: "downloads",
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    return { status: "ready", handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled" };
    console.warn("No se pudo abrir el selector de carpeta, usando descarga del navegador.", error);
    return { status: "unsupported" };
  }
}

export type OCRequestPdfDownloadResult = "saved" | "downloaded" | "cancelled";

/**
 * Descarga el PDF ya generado. Si el navegador soporta elegir carpeta
 * (Chrome/Edge de escritorio), abre el selector en Descargas por defecto;
 * si no (Safari, Firefox, la mayoría de los navegadores móviles), cae en la
 * descarga normal del navegador — limitación real de esas plataformas, no
 * algo que se pueda evitar desde la web.
 */
export async function downloadOCRequestPdf(blob: Blob, filename: string): Promise<OCRequestPdfDownloadResult> {
  const saveTarget = await pickSaveLocation(filename);
  if (saveTarget.status === "cancelled") return "cancelled";

  if (saveTarget.status === "ready") {
    const writable = await saveTarget.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return "saved";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
  return "downloaded";
}

/**
 * Verifica que el plan de pagos sume el total de la solicitud. Cada flujo de
 * creación resuelve su propio plan a montos CLP concretos (maneja modos como
 * "porcentaje" o "saldo" a su manera) — esta función solo valida el
 * resultado final, en vez de reimplementar la resolución tres veces.
 * Tolerancia de 1 peso por redondeo.
 */
export function validatePaymentPlanTotal(resolvedAmountsClp: number[], totalClp: number): string | null {
  if (resolvedAmountsClp.length === 0) return null; // sin plan = pago único por el total, siempre consistente
  const sum = resolvedAmountsClp.reduce((s, a) => s + (a || 0), 0);
  if (Math.abs(sum - totalClp) > 1) {
    return `El plan de pagos suma ${fmtClp(sum)}, pero la solicitud es por ${fmtClp(totalClp)}. Ajusta los montos para que coincidan.`;
  }
  return null;
}
