import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath } from "@/lib/storageUtils";
import { parseOCExcelSheet, resolveRows, groupByOrderNumber } from "@/lib/parseBulkOCExcel";

/**
 * Reconciliación retroactiva de importaciones masivas de OC.
 *
 * Antes de #23, una OC cuyo monto ya coincidía con el Excel se dejaba
 * "Mantener existente" y quedaba EXCLUIDA del proceso: nunca recibía
 * import_batch_id, así que seguía apareciendo como "D" (digitada) aunque el
 * import la hubiera verificado como correcta. Ese fix solo corrige las
 * importaciones FUTURAS — no cambia nada de lo que ya se importó antes.
 *
 * Esto reconstruye ese resultado para el historial: vuelve a leer cada Excel
 * ya guardado en oc_import_batches.storage_path (el mismo archivo que se
 * subió en su momento — no hace falta que el usuario lo vuelva a cargar),
 * lo agrupa igual que el import real, y para cada OC cuyo total coincide con
 * lo que hay en purchase_orders y que TODAVÍA no está marcada como
 * importada, deja constancia de qué lote la trajo. No toca monto,
 * descripción ni proveedor — solo import_batch_id, igual que el camino
 * "Mantener existente" del import en vivo.
 */

export interface ReconcileCandidate {
  orderNumber: string;
  purchaseOrderIds: string[];
  batchId: string;
  batchFilename: string;
}

export interface ReconcileSkip {
  batchId: string;
  batchFilename: string;
  reason: string;
}

export interface ReconcilePreview {
  candidates: ReconcileCandidate[];
  skippedBatches: ReconcileSkip[];
  batchesScanned: number;
}

interface HistoricalBatch {
  id: string;
  filename: string;
  storage_path: string | null;
}

/** Tolerancia de 1 peso por redondeo — igual criterio que el import en vivo. */
function amountsMatch(a: number, b: number): boolean {
  return Math.abs((a || 0) - (b || 0)) < 1;
}

async function parseHistoricalExcel(storagePath: string): Promise<Map<string, number>> {
  const filePath = extractStoragePath(storagePath);
  if (!filePath) throw new Error("Ruta de archivo inválida");

  const { data: blob, error } = await supabase.storage
    .from("repository-files")
    .download(filePath);
  if (error || !blob) throw new Error("No se pudo descargar el archivo");

  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const { rows } = parseOCExcelSheet(workbook);

  // Sin locations/suppliers: no hace falta resolver contrato ni proveedor
  // para esto, solo el total por número de OC.
  const parsed = resolveRows(rows, [], []);
  const grouped = groupByOrderNumber(parsed);

  const totalsByOrderNumber = new Map<string, number>();
  for (const g of grouped) {
    if (!g.orderNumber) continue;
    totalsByOrderNumber.set(g.orderNumber, g.totalAmountClp);
  }
  return totalsByOrderNumber;
}

/**
 * Recorre TODOS los lotes históricos (no solo los últimos 20 que muestra la
 * pantalla) y arma una vista previa de qué OC se marcarían como importadas.
 * No escribe nada en la base — eso lo hace applyReconciliation, y solo tras
 * confirmación explícita.
 */
export async function buildReconcilePreview(): Promise<ReconcilePreview> {
  const { data: batchesData, error: batchesErr } = await supabase
    .from("oc_import_batches" as any)
    .select("id, filename, storage_path")
    .order("imported_at", { ascending: true }) as any;

  if (batchesErr) throw new Error(batchesErr.message || "No se pudo leer el historial de importaciones");

  const batches = (batchesData || []) as HistoricalBatch[];
  const skippedBatches: ReconcileSkip[] = [];

  // orderNumber -> { totalAmountClp, batchId, batchFilename } — si el mismo
  // número aparece en más de un lote, gana el más reciente (orden ascendente
  // + sobreescritura), igual criterio que "la última importación manda".
  const totalsByOrderNumber = new Map<string, { totalAmountClp: number; batchId: string; batchFilename: string }>();

  for (const batch of batches) {
    if (!batch.storage_path) {
      skippedBatches.push({ batchId: batch.id, batchFilename: batch.filename, reason: "Sin archivo guardado" });
      continue;
    }
    try {
      const totals = await parseHistoricalExcel(batch.storage_path);
      for (const [orderNumber, totalAmountClp] of totals) {
        totalsByOrderNumber.set(orderNumber, { totalAmountClp, batchId: batch.id, batchFilename: batch.filename });
      }
    } catch (err: any) {
      skippedBatches.push({ batchId: batch.id, batchFilename: batch.filename, reason: err?.message || "Error al leer el archivo" });
    }
  }

  const orderNumbers = [...totalsByOrderNumber.keys()];
  if (orderNumbers.length === 0) {
    return { candidates: [], skippedBatches, batchesScanned: batches.length };
  }

  // Una sola consulta para todos los números encontrados en todo el
  // historial, igual que hace el import en vivo.
  const { data: existingRows, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, order_number, amount_clp, import_batch_id")
    .in("order_number", orderNumbers)
    .is("deleted_at", null);
  if (poErr) throw new Error(poErr.message || "No se pudo consultar las OC existentes");

  const rowsByOrderNumber = new Map<string, { id: string; amountClp: number; importBatchId: string | null }[]>();
  for (const row of (existingRows || []) as any[]) {
    const list = rowsByOrderNumber.get(row.order_number) ?? [];
    list.push({ id: row.id, amountClp: Number(row.amount_clp) || 0, importBatchId: row.import_batch_id });
    rowsByOrderNumber.set(row.order_number, list);
  }

  const candidates: ReconcileCandidate[] = [];
  for (const [orderNumber, info] of totalsByOrderNumber) {
    const rows = rowsByOrderNumber.get(orderNumber);
    if (!rows || rows.length === 0) continue;
    // Si CUALQUIER fila ya está marcada, no se toca — evita reprocesar lo
    // que el import en vivo (o una reconciliación anterior) ya resolvió.
    if (rows.some((r) => r.importBatchId)) continue;

    const sumExisting = rows.reduce((s, r) => s + r.amountClp, 0);
    if (!amountsMatch(sumExisting, info.totalAmountClp)) continue; // no se toca lo que no coincide

    candidates.push({
      orderNumber,
      purchaseOrderIds: rows.map((r) => r.id),
      batchId: info.batchId,
      batchFilename: info.batchFilename,
    });
  }

  return { candidates, skippedBatches, batchesScanned: batches.length };
}

export interface ReconcileResult {
  updated: number;
  failed: number;
}

/** Aplica lo que arrojó buildReconcilePreview. Solo toca import_batch_id. */
export async function applyReconciliation(candidates: ReconcileCandidate[]): Promise<ReconcileResult> {
  let updated = 0;
  let failed = 0;

  // Agrupado por batchId para minimizar llamadas: un UPDATE por lote,
  // filtrando por los order_number que le corresponden a ESE lote. El total
  // de filas afectadas se cuenta a partir de los candidatos ya conocidos
  // (purchaseOrderIds), no del resultado del UPDATE — una OC multi-contrato
  // tiene varias filas por un mismo order_number.
  const orderNumbersByBatch = new Map<string, string[]>();
  const rowCountByBatch = new Map<string, number>();
  for (const c of candidates) {
    const list = orderNumbersByBatch.get(c.batchId) ?? [];
    list.push(c.orderNumber);
    orderNumbersByBatch.set(c.batchId, list);
    rowCountByBatch.set(c.batchId, (rowCountByBatch.get(c.batchId) ?? 0) + c.purchaseOrderIds.length);
  }

  for (const [batchId, orderNumbers] of orderNumbersByBatch) {
    const { error } = await supabase
      .from("purchase_orders")
      .update({ import_batch_id: batchId } as any)
      .in("order_number", orderNumbers)
      .is("import_batch_id", null)
      .is("deleted_at", null);

    if (error) {
      console.error("Error al reconciliar lote", batchId, error);
      failed += rowCountByBatch.get(batchId) ?? orderNumbers.length;
    } else {
      updated += rowCountByBatch.get(batchId) ?? orderNumbers.length;
    }
  }

  return { updated, failed };
}
