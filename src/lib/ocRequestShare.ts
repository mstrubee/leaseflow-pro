import jsPDF from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import QRCode from "qrcode";
import type { OCRequestQuotationRef } from "@/lib/ocRequestQuotation";
import { splitAmount } from "@/lib/cebeDistribution";

// ── Tipos compartidos por los 3 puntos donde se crea una Solicitud de OC
// (OCRequestDialog, OCRequestsList, CentralizedOrderCreator en modo "request") ──

export interface OCRequestShareLine {
  /** Nombre de la línea de presupuesto o categoría OPEX a la que se asigna el monto. */
  lineName: string;
  amountClp: number;
  /** Contrato al que pertenece la línea. Sin él, si la solicitud es de un solo contrato se usa ese. */
  contractName?: string | null;
  /** CEBE del contrato de la línea. Sin él, si la solicitud es de un solo contrato se usa `contractCebe`. */
  cebe?: string | null;
  /** Id de la línea de presupuesto (para poder buscar su monto autorizado). */
  lineId?: string | null;
  /**
   * Monto de la línea en el Control de Presupuesto (monto autorizado). Si viene, el PDF muestra
   * este monto en la columna de la línea en vez de lo imputado a la solicitud.
   */
  authorizedClp?: number | null;
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
  supplierRut?: string | null;
  /** CEBE del contrato (campo personalizado), mostrado debajo del nombre del contrato. */
  contractCebe?: string | null;
  /** CEBE de cada empresa del contrato. Si viene, la fila "CONTRATO(S)" lo identifica por empresa. */
  cebeByCompany?: { company: string; cebes: string }[] | null;
  /** Local mixto (2+ CEBE): reparto del gasto por CEBE. Si viene, el PDF agrega la tabla de distribución. */
  cebeDistribution?: { cebeId?: string; label: string; percent: number; amountClp: number }[] | null;
  /** Órdenes CO del proyecto ("CO-1, CO-2"); solo solicitudes CAPEX. */
  coOrderNumbers?: string | null;
  requestedBy?: string | null;
  /** Correlativo global, independiente de dónde se creó la solicitud (oc_requests.sequence_number). */
  sequenceNumber?: number | null;
  /** Elegido al compartir la solicitud recién creada. */
  migoChoice?: "con" | "sin" | null;
  /** id en oc_requests -- junto con verificationCode arma el link/QR de verificación anti-falsificación. */
  requestId?: string | null;
  /** oc_requests.verification_code -- código fijado por un trigger de DB al crear la solicitud, inalterable. */
  verificationCode?: string | null;
  /** Cotización adjunta de origen (flujo "Solicitar OC" desde un Requerimiento). Si viene, al
   *  descargar se entrega un ZIP con la Solicitud (PDF) y esta cotización. */
  quotation?: OCRequestQuotationRef | null;
}

function fmtSequenceNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return String(n).padStart(6, "0");
}

function fmtMigoChoice(choice: "con" | "sin" | null | undefined): string {
  if (choice === "con") return "Con Migo";
  if (choice === "sin") return "Sin Migo";
  return "—";
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
 * - si la solicitud ya tiene código de verificación (requestId +
 *   verificationCode), se imprime junto con un QR que apunta a la página
 *   pública de verificación -- así un tercero sin acceso a la plataforma
 *   (ej. el proveedor) puede confirmar que el documento no fue alterado.
 */
export async function buildOCRequestPdf(data: OCRequestShareData): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 58, 95);
  doc.rect(14, 10, pageW - 28, 16, "F");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("SOLICITUD DE OC", pageW / 2, 20, { align: "center" });
  doc.setTextColor(0, 0, 0);

  const headerRows: [string, string][] = [
    ["N° SOLICITUD", fmtSequenceNumber(data.sequenceNumber)],
    ["FECHA", fmtDate(data.requestDate)],
    ["MONEDA", data.currency],
    ["MIGO", fmtMigoChoice(data.migoChoice)],
    [
      "CONTRATO(S)",
      [
        data.contractNames.join(", ") || "—",
        // Con varias empresas se identifica el CEBE de cada una; si no, el CEBE del local como siempre.
        ...(data.cebeByCompany && data.cebeByCompany.length > 0
          ? data.cebeByCompany.map((c) => `${c.company}: CEBE ${c.cebes}`)
          : data.contractCebe
            ? [`CEBE: ${data.contractCebe}`]
            : []),
      ].join("\n"),
    ],
  ];
  if (data.coOrderNumbers) headerRows.push(["ORDEN CO", data.coOrderNumbers]);
  if (data.supplierName) {
    headerRows.push([
      "PROVEEDOR",
      [data.supplierName, data.supplierRut ? `RUT: ${data.supplierRut}` : null].filter(Boolean).join("\n"),
    ]);
  }
  if (data.requestedBy) headerRows.push(["SOLICITA", data.requestedBy]);

  autoTable(doc, {
    startY: 32,
    body: headerRows,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold", fillColor: [240, 240, 240] },
      1: { cellWidth: pageW - 68 },
    },
  });

  // Observaciones = solo el título/descripción de la solicitud. Las líneas de imputación van en el
  // "Detalle" (última tabla), no se repiten aquí.
  const observaciones = data.description?.trim() || "—";

  const obsY = (doc as any).lastAutoTable?.finalY || 40;
  autoTable(doc, {
    startY: obsY,
    body: [["OBSERVACIONES", observaciones]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, minCellHeight: 20 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold", fillColor: [240, 240, 240], valign: "top" },
      1: { cellWidth: pageW - 68 },
    },
  });

  // Los títulos de sección ("Distribución por CEBE", "Plan de Pagos") son la PRIMERA fila de su tabla y
  // la tabla usa pageBreak "avoid": si no cabe completa en lo que queda de la hoja, pasa entera a la
  // siguiente. Así el título nunca queda solo al final de una hoja con su contenido en la otra.
  const sectionTitle = (text: string, colSpan: number): CellDef => ({
    content: text,
    colSpan,
    styles: {
      fillColor: [255, 255, 255],
      textColor: 0,
      fontStyle: "bold",
      fontSize: 11,
      halign: "left",
      lineWidth: 0,
      cellPadding: { top: 0, right: 0, bottom: 3, left: 0 },
    },
  });
  // El rótulo de cada CEBE ("Empresa / CEBE X / CO N") debe quedar SIEMPRE en una sola línea: si no cabe en
  // el ancho de su columna, se reduce la letra de esa celda (nunca se parte en dos líneas). El ancho de la
  // columna se fija a mano (hoja menos márgenes menos las otras columnas) porque autoTable aún no lo calcula
  // cuando se leen las celdas.
  const tableW = pageW - 28;
  const keepOneLine = (colIndex: number, colWidth: number, indent = 0, minFont = 6) => (hook: { section: string; column: { index: number }; cell: { text: string[]; styles: { fontSize: number } } }) => {
    if (hook.section !== "body" || hook.column.index !== colIndex) return;
    const text = hook.cell.text.join(" ");
    const available = colWidth - 8 - indent; // 8 = relleno izquierdo + derecho de la celda
    let size = hook.cell.styles.fontSize;
    doc.setFontSize(size);
    while (size > minFont && doc.getTextWidth(text) > available) {
      size -= 0.25;
      doc.setFontSize(size);
    }
    hook.cell.styles.fontSize = size;
  };
  const lastFinalY = (fallback: number) =>
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || fallback);

  // Local mixto: distribución del gasto entre sus CEBE (cada uno con su % y monto).
  const cebeDist = data.cebeDistribution && data.cebeDistribution.length >= 2 ? data.cebeDistribution : null;
  if (cebeDist) {
    autoTable(doc, {
      startY: lastFinalY(90) + 10,
      pageBreak: "avoid",
      head: [[sectionTitle("Distribución por CEBE", 3)], ["Contrato / CEBE / CO", "% Distribución", "Monto"]],
      body: cebeDist.map((d) => [
        d.label,
        `${d.percent.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%`,
        fmtClp(d.amountClp),
      ]),
      foot: [[
        "Total",
        `${cebeDist.reduce((a, d) => a + d.percent, 0).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%`,
        fmtClp(cebeDist.reduce((a, d) => a + d.amountClp, 0)),
      ]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
      // "% Distribución" angosta para que "Contrato / CEBE / CO" use el resto del ancho.
      columnStyles: { 0: { cellWidth: tableW - 62 }, 1: { halign: "right", cellWidth: 30 }, 2: { halign: "right", cellWidth: 32 } },
      didParseCell: keepOneLine(0, tableW - 62),
    });
  }

  const payments = data.payments.length > 0
    ? data.payments
    : [{ description: "Pago único", amountClp: data.totalAmountClp, dueDate: null }];

  // Plan de pagos. En un local mixto cada pago lleva debajo su desglose por CEBE: la distribución de la
  // OC aplicada al monto de ese pago (el último CEBE absorbe el redondeo, así suma exacto el pago).
  const subStyles = { fontSize: 8, textColor: [90, 90, 90] as [number, number, number], fillColor: [248, 248, 248] as [number, number, number] };
  const paymentRows: RowInput[] = payments.flatMap((p): RowInput[] => {
    if (!cebeDist) return [[p.description, fmtDate(p.dueDate), fmtClp(p.amountClp)]];
    const amounts = splitAmount(p.amountClp, cebeDist.map((d) => d.amountClp));
    return [
      [
        { content: p.description, styles: { fontStyle: "bold" } },
        fmtDate(p.dueDate),
        { content: fmtClp(p.amountClp), styles: { fontStyle: "bold" } },
      ],
      ...cebeDist.map((d, i): RowInput => [
        { content: `     ${d.label}`, styles: subStyles },
        { content: "", styles: subStyles },
        { content: fmtClp(amounts[i]), styles: { ...subStyles, halign: "right" } },
      ]),
    ];
  });

  autoTable(doc, {
    startY: lastFinalY(90) + 10,
    pageBreak: "avoid",
    head: [[sectionTitle("Plan de Pagos", 3)], ["Descripción", "Vencimiento", "Monto"]],
    body: paymentRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [230, 230, 230], textColor: 0 },
    columnStyles: { 0: { cellWidth: tableW - 68 }, 1: { cellWidth: 32 }, 2: { halign: "right", cellWidth: 36 } },
    didParseCell: keepOneLine(0, tableW - 68, 6),
  });

  // ORDEN DEL DOCUMENTO: 1) información general, 2) distribución por CEBE, 3) plan de pagos y
  // 4) detalle de líneas (línea, contrato, CEBE y monto).
  // Cada línea muestra su contrato y el CEBE de ese contrato (en una solicitud multi-contrato
  // el encabezado solo lista todos juntos, sin decir cuál corresponde a cada línea). En una
  // solicitud de un solo contrato, las líneas sin dato propio usan el del encabezado.
  const singleContract = data.contractNames.length === 1;
  // La columna de monto muestra el monto AUTORIZADO de cada línea en el Control de Presupuesto (no lo
  // imputado a la solicitud); el pie sigue siendo el total de la solicitud.
  const useAuthorized = data.lines.some((l) => l.authorizedClp != null);

  // Título "Detalle". La tabla puede ocupar varias hojas, así que el título va aparte de la tabla; para que
  // nunca quede solo al final de una hoja se exige espacio para título + encabezado + 2 filas, y si no
  // hay, el título y la tabla empiezan en la hoja siguiente.
  const detailPageH = doc.internal.pageSize.getHeight();
  let detailY = lastFinalY(90) + 10;
  if (detailY + 8 + 14 + 24 > detailPageH - 15) {
    doc.addPage();
    detailY = 14;
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Detalle", 14, detailY + 4);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: detailY + 8,
    // Una fila nunca se parte entre hojas (antes la segunda línea del CEBE quedaba sola arriba de la hoja
    // siguiente) y el total aparece UNA sola vez, al final del listado (no en el pie de cada hoja).
    rowPageBreak: "avoid",
    showFoot: "lastPage",
    head: [["Línea", "Contrato", "CEBE", useAuthorized ? "Monto autorizado" : "Monto"]],
    body: data.lines.map((l) => [
      l.lineName,
      l.contractName || (singleContract ? data.contractNames[0] : null) || "—",
      l.cebe || (singleContract ? data.contractCebe : null) || "—",
      fmtClp(l.authorizedClp ?? l.amountClp),
    ]),
    foot: [[{ content: useAuthorized ? "Total solicitud" : "Total", colSpan: 3 }, fmtClp(data.totalAmountClp)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    // Filas compactas: el espacio vacío arriba y abajo del texto de cada fila es 1/3 del anterior
    // (4 -> 4/3 mm). Mismo tamaño de letra y mismos anchos de columna; encabezado y total no cambian.
    bodyStyles: { cellPadding: { top: 4 / 3, bottom: 4 / 3, left: 4, right: 4 } },
    headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 48 },
      2: { cellWidth: 36 },
      3: { cellWidth: 36, halign: "right" },
    },
  });

  if (data.requestId && data.verificationCode) {
    const verifyUrl = `${window.location.origin}/verify-oc/${data.requestId}/${data.verificationCode}`;
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 200 });
    } catch {
      // Sin QR si falla -- el código de texto sigue permitiendo verificar a mano.
    }

    const pageH = doc.internal.pageSize.getHeight();
    const verifyBoxH = 22;
    const verifyY = pageH - verifyBoxH - 10;
    // El detalle de líneas (última tabla) puede llegar hasta el pie de la hoja: si no queda espacio para el
    // recuadro de verificación, va en una hoja nueva en vez de montarse sobre la tabla.
    if (lastFinalY(0) + 6 > verifyY) {
      doc.addPage();
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(14, verifyY, pageW - 14, verifyY);

    if (qrDataUrl) {
      doc.addImage(qrDataUrl, "PNG", 14, verifyY + 3, 16, 16);
    }
    const textX = qrDataUrl ? 34 : 14;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Verificación de autenticidad", textX, verifyY + 8);
    doc.setFont("helvetica", "normal");
    doc.text(`Código: ${data.verificationCode}`, textX, verifyY + 13);
    doc.text(`Escanea el QR o visita: ${verifyUrl}`, textX, verifyY + 18);
    doc.setTextColor(0, 0, 0);
  }

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
  /** Para verificar lo escrito (existe en Chromium). */
  getFile?: () => Promise<{ size: number }>;
  /** Borra el archivo (Chromium reciente); se usa solo para no dejar uno vacío si la escritura falla. */
  remove?: () => Promise<void>;
}

export type SaveTarget =
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
export async function pickSaveLocation(filename: string): Promise<SaveTarget> {
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
      types: filename.toLowerCase().endsWith(".zip")
        ? [{ description: "ZIP", accept: { "application/zip": [".zip"] } }]
        : [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    return { status: "ready", handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled" };
    console.warn("No se pudo abrir el selector de carpeta, usando descarga del navegador.", error);
    return { status: "unsupported" };
  }
}

/**
 * - saved: guardado en la ubicación elegida (y verificado).
 * - downloaded: descarga normal del navegador (sin selector de carpeta disponible).
 * - fallback: se eligió una ubicación pero no se pudo escribir ahí; se descargó por la vía normal.
 * - cancelled: el usuario cerró el selector.
 */
export type OCRequestPdfDownloadResult = "saved" | "downloaded" | "fallback" | "cancelled";

/**
 * Descarga el archivo ya generado (el PDF de la solicitud o, si lleva la cotización,
 * el ZIP; el tipo se deduce de la extensión). Si el navegador soporta elegir carpeta
 * (Chrome/Edge de escritorio), abre el selector en Descargas por defecto;
 * si no (Safari, Firefox, la mayoría de los navegadores móviles), cae en la
 * descarga normal del navegador — limitación real de esas plataformas, no
 * algo que se pueda evitar desde la web.
 */
export async function downloadOCRequestPdf(
  blob: Blob,
  filename: string,
  /**
   * Destino ya elegido con pickSaveLocation. showSaveFilePicker solo se puede abrir
   * mientras dura el clic del usuario (~5 s): si antes de descargar hay trabajo lento
   * (bajar la cotización, armar el ZIP), el selector falla con "Must be handling a user
   * gesture" y la descarga no sale. Quien tenga trabajo lento debe elegir el destino
   * PRIMERO, dentro del clic, y pasarlo aquí cuando el archivo esté listo.
   */
  target?: SaveTarget,
): Promise<OCRequestPdfDownloadResult> {
  const saveTarget = target ?? (await pickSaveLocation(filename));
  if (saveTarget.status === "cancelled") return "cancelled";

  let fellBack = false;
  if (saveTarget.status === "ready") {
    const { handle } = saveTarget;
    try {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      // Verifica que quedó escrito completo: el navegador, un antivirus o una política
      // pueden cerrar el flujo sin error y dejar el archivo vacío, truncado o eliminado.
      const saved = handle.getFile ? await handle.getFile() : null;
      if (saved && saved.size !== blob.size) {
        throw new Error(`El archivo guardado pesa ${saved.size} bytes y debía pesar ${blob.size}`);
      }
      return "saved";
    } catch (error) {
      console.warn("No se pudo escribir en la ubicación elegida; se usa la descarga del navegador.", error);
      // Mejor esfuerzo: no dejar un archivo vacío/parcial en la carpeta elegida.
      try { await handle.remove?.(); } catch { /* sin permiso o no soportado: se ignora */ }
      fellBack = true;
    }
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
  return fellBack ? "fallback" : "downloaded";
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

/**
 * Líneas del PDF a partir de las líneas elegidas en el selector.
 *
 * `amount` de cada línea NO es "lo que se solicita": el selector la precarga
 * con el saldo disponible de la línea (UF en CAPEX, CLP en OPEX). Por eso:
 * - Una sola línea lleva el monto total de la solicitud. Usar su `amount`
 *   mostraba el saldo completo de la línea, y en OPEX además lo multiplicaba
 *   por la UF aunque ya estuviera en pesos (un PDF salió con $827.405.814.286
 *   en una solicitud de $1.000.000).
 * - Con varias líneas se respeta el reparto del usuario; solo se pasan a CLP
 *   las que vienen en UF.
 */
export function buildShareLines(
  lines: { lineName: string; amount: number; contractName?: string | null; cebe?: string | null; lineId?: string | null }[],
  opts: { totalAmountClp: number; amountsInClp: boolean; ufValue: number }
): OCRequestShareLine[] {
  if (lines.length === 1) {
    return [{ lineName: lines[0].lineName, amountClp: Math.round(opts.totalAmountClp), contractName: lines[0].contractName, cebe: lines[0].cebe, lineId: lines[0].lineId }];
  }
  return reconcileShareLines(
    lines.map((l) => ({
      lineName: l.lineName,
      amountClp: Math.round(opts.amountsInClp ? l.amount : l.amount * opts.ufValue),
      contractName: l.contractName,
      cebe: l.cebe,
      lineId: l.lineId,
    })),
    opts.totalAmountClp
  );
}

/**
 * Hace que las filas del PDF sumen EXACTAMENTE el total. Cada fila se redondea a pesos por
 * separado (viene en UF o repartida entre contratos), así que la suma puede quedar a
 * unos pesos del total ($5.295.493 filas vs $5.295.494 total). Igual que en el plan de
 * pagos (lib/paymentPlan.ts), la última fila absorbe la diferencia.
 * Solo corrige diferencias de redondeo (hasta 1 peso por fila): una diferencia mayor
 * indicaría montos mal repartidos y no se debe tapar.
 */
export function reconcileShareLines(lines: OCRequestShareLine[], totalClp: number): OCRequestShareLine[] {
  if (lines.length < 2) return lines;
  const diff = Math.round(totalClp) - lines.reduce((sum, l) => sum + l.amountClp, 0);
  if (diff === 0 || Math.abs(diff) > lines.length) return lines;
  const last = lines.length - 1;
  return lines.map((l, i) => (i === last ? { ...l, amountClp: l.amountClp + diff } : l));
}
