import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateFile } from "@/lib/fileValidation";
import { uploadFileToMultipleContracts } from "@/lib/repositoryBackup";
import { parseOrderNumberFromFileName, extractOrderNumberFromPdf } from "@/lib/pdfOrderNumber";

interface OCMatchRow {
  id: string;
  contractId: string;
}

interface OCFileEntry {
  file: File;
  /** Número de OC extraído del nombre del archivo, o null si no se reconoció. */
  orderNumber: string | null;
  /** Filas de purchase_orders (una por contrato) que comparten ese order_number. */
  matches: OCMatchRow[];
  /** Cualquiera de esas filas ya tenía un adjunto antes de esta sincronización.
   *  Una OC en este estado se omite SIEMPRE — nunca se pisa un PDF existente,
   *  no hay opción de "reemplazar". Solo se cuenta en el resumen. */
  hasExistingAttachment: boolean;
  /** Si se va a subir en esta pasada. */
  selected: boolean;
  status: "idle" | "uploading" | "done" | "error";
  errorMessage?: string;
  /** Número leído del CONTENIDO del PDF. undefined = aún verificando,
   *  null = no se pudo leer o no se encontró, string = encontrado. */
  contentOrderNumber?: string | null;
  /** true si el nombre del archivo y su contenido indican OC distintas. */
  numberMismatch: boolean;
}

/**
 * Solo dos categorías aparecen como fila individual en el listado — las que
 * requieren una decisión real del usuario. El resto (sin reconocer, no
 * existe, ya tiene PDF) se omite de la subida y se resume en un contador,
 * para no llenar la pantalla con archivos que no se van a tocar.
 */
type EntryCategory = "ready" | "mismatch" | "unrecognized" | "not_found" | "already_attached";

function categorize(entry: OCFileEntry): EntryCategory {
  if (!entry.orderNumber) return "unrecognized";
  if (entry.matches.length === 0) return "not_found";
  if (entry.hasExistingAttachment) return "already_attached";
  if (entry.numberMismatch) return "mismatch";
  return "ready";
}

interface OCBulkAttachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

/**
 * "OC 4900040476.pdf" → "4900040476". Tolera guion/guion bajo además del
 * espacio y mayúsculas/minúsculas, pero exige que el nombre empiece con "OC"
 * seguido de dígitos: no hay forma de saber a qué OC corresponde un PDF cuyo
 * nombre no lo indica.
 */
export function OCBulkAttachDialog({ open, onOpenChange, onComplete }: OCBulkAttachDialogProps) {
  const [entries, setEntries] = useState<OCFileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const resetState = () => {
    setEntries([]);
    setProgress(0);
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    e.target.value = "";

    const parsed = files.map((file) => ({ file, orderNumber: parseOrderNumberFromFileName(file.name) }));
    const orderNumbers = [...new Set(parsed.filter((p) => p.orderNumber).map((p) => p.orderNumber as string))];

    // Una sola consulta para todos los archivos seleccionados, en vez de una
    // por archivo. Trae TODAS las filas de cada order_number: una OC
    // multi-local vive en varias filas (una por contrato, ver
    // ConvertOCRequestDialog), y el adjunto debe quedar en todas.
    const matchesByOrderNumber = new Map<string, { id: string; contractId: string; attachmentUrl: string | null }[]>();
    if (orderNumbers.length > 0) {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, contract_id, attachment_url")
        .in("order_number", orderNumbers)
        .is("deleted_at", null);

      if (error) {
        console.error("Error al buscar OC para adjuntar PDFs:", error);
        toast.error("No se pudo verificar qué OC existen. Intenta de nuevo.");
        return;
      }

      for (const row of (data || []) as any[]) {
        const list = matchesByOrderNumber.get(row.order_number) ?? [];
        list.push({ id: row.id, contractId: row.contract_id, attachmentUrl: row.attachment_url });
        matchesByOrderNumber.set(row.order_number, list);
      }
    }

    const newEntries: OCFileEntry[] = parsed.map(({ file, orderNumber }) => {
      const rows = orderNumber ? matchesByOrderNumber.get(orderNumber) ?? [] : [];
      const existing = rows.find((r) => r.attachmentUrl);
      return {
        file,
        orderNumber,
        matches: rows.map((r) => ({ id: r.id, contractId: r.contractId })),
        hasExistingAttachment: !!existing,
        // Seleccionado por defecto solo cuando matcheó y todavía no tiene
        // PDF. Una OC con adjunto existente jamás se sube — se omite del
        // todo, no hay forma de forzarla desde acá.
        selected: !!orderNumber && rows.length > 0 && !existing,
        status: "idle",
        contentOrderNumber: undefined,
        numberMismatch: false,
      };
    });

    setEntries((prev) => [...prev, ...newEntries]);

    // Verificación cruzada: leer el número real del PDF y compararlo con el
    // del nombre. Solo vale la pena para archivos que de otro modo se
    // subirían (matchearon y no fallaron antes) — no tiene sentido gastar
    // tiempo leyendo un PDF cuyo archivo ya está descartado.
    const startIndex = entries.length; // los nuevos quedan a partir de acá
    newEntries.forEach((entry, offset) => {
      if (!entry.orderNumber || entry.matches.length === 0) return;
      const globalIndex = startIndex + offset;
      void extractOrderNumberFromPdf(entry.file).then((contentOrderNumber) => {
        setEntries((prev) => {
          const copy = [...prev];
          const current = copy[globalIndex];
          if (!current || current.file !== entry.file) return prev; // se reordenó/borró
          const mismatch = !!contentOrderNumber && contentOrderNumber !== entry.orderNumber;
          copy[globalIndex] = {
            ...current,
            contentOrderNumber,
            numberMismatch: mismatch,
            // Un archivo con el número equivocado no se sube solo por error:
            // se desmarca y el usuario decide qué hacer después de revisarlo.
            selected: mismatch ? false : current.selected,
          };
          return copy;
        });
      });
    });
  };

  const toggleSelected = (index: number) => {
    setEntries((prev) => {
      const copy = [...prev];
      const entry = copy[index];
      if (!entry.orderNumber || entry.matches.length === 0) return prev;
      copy[index] = { ...entry, selected: !entry.selected };
      return copy;
    });
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedCount = entries.filter((e) => e.selected).length;
  const unrecognizedCount = entries.filter((e) => categorize(e) === "unrecognized").length;
  const notFoundCount = entries.filter((e) => categorize(e) === "not_found").length;
  const alreadyAttachedCount = entries.filter((e) => categorize(e) === "already_attached").length;
  const visibleCount = entries.filter((e) => {
    const c = categorize(e);
    return c === "ready" || c === "mismatch";
  }).length;

  const handleUploadAll = async () => {
    if (selectedCount === 0) return;
    setUploading(true);
    let done = 0;
    const toProcess = entries.filter((e) => e.selected);

    for (const entry of toProcess) {
      const index = entries.indexOf(entry);

      const validation = validateFile(entry.file);
      if (!validation.isValid) {
        toast.error(`${entry.file.name}: ${validation.error}`);
        setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, status: "error", errorMessage: validation.error } : e)));
        done++;
        setProgress(Math.round((done / toProcess.length) * 100));
        continue;
      }

      setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, status: "uploading" } : e)));

      try {
        const contractIds = [...new Set(entry.matches.map((m) => m.contractId))];
        const uploadResult = await uploadFileToMultipleContracts(entry.file, contractIds, entry.orderNumber!);

        if (!uploadResult.primaryUrl) {
          throw new Error("No se pudo subir el archivo");
        }

        // Se actualizan TODAS las filas actuales de este order_number, no solo
        // las que trajo la consulta inicial: evita dejar una fila sin adjuntar
        // si algo cambió entre que se abrió el diálogo y se subió el archivo.
        // `.is("attachment_url", null)` es la última salvaguarda contra
        // duplicar una subida: si alguien más adjuntó un PDF a esta OC
        // mientras el diálogo seguía abierto, esa fila no se pisa acá.
        const { error: updateErr } = await supabase
          .from("purchase_orders")
          .update({ attachment_url: uploadResult.primaryUrl } as any)
          .eq("order_number", entry.orderNumber!)
          .is("deleted_at", null)
          .is("attachment_url", null);

        if (updateErr) throw updateErr;

        setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, status: "done" } : e)));
      } catch (err: any) {
        console.error("Error al adjuntar PDF de OC", entry.orderNumber, err);
        setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, status: "error", errorMessage: err?.message } : e)));
      }

      done++;
      setProgress(Math.round((done / toProcess.length) * 100));
    }

    setUploading(false);
    setEntries((prev) => {
      const successCount = prev.filter((e) => e.selected && e.status === "done").length;
      const errorCount = prev.filter((e) => e.selected && e.status === "error").length;
      if (errorCount > 0) {
        toast.warning(`${successCount} PDF adjuntado(s), ${errorCount} con error.`);
      } else {
        toast.success(`${successCount} PDF adjuntado(s) correctamente.`);
      }
      return prev;
    });
    onComplete?.();
  };

  const handleClose = (isOpen: boolean) => {
    if (uploading) return;
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adjuntar PDFs de OC</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Selecciona los archivos de tu carpeta local. Se reconocen por el nombre:
          "OC (número).pdf" (ej. "OC 4900040476.pdf") o solo el número (ej. "4900040476.pdf").
        </p>

        <div className="flex items-center gap-2">
          <Input
            type="file"
            id="oc-bulk-attach-input"
            className="hidden"
            onChange={handleFilesSelected}
            accept=".pdf"
            multiple
            disabled={uploading}
          />
          <label htmlFor="oc-bulk-attach-input">
            <Button variant="outline" size="sm" asChild disabled={uploading}>
              <span>
                <Upload className="h-4 w-4 mr-1" />
                Seleccionar archivos
              </span>
            </Button>
          </label>
          <span className="text-sm text-muted-foreground">
            {entries.length} archivo(s) · {selectedCount} para subir
          </span>
        </div>

        {entries.length > 0 && (unrecognizedCount > 0 || notFoundCount > 0 || alreadyAttachedCount > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
            {alreadyAttachedCount > 0 && (
              <span>{alreadyAttachedCount} ya tienen PDF (omitidas, no se pisan)</span>
            )}
            {notFoundCount > 0 && (
              <span>{notFoundCount} no existen en el sistema</span>
            )}
            {unrecognizedCount > 0 && (
              <span>{unrecognizedCount} sin número reconocible en el nombre</span>
            )}
          </div>
        )}

        {uploading && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{progress}%</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[150px]">
          {entries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Selecciona los PDFs para reconocer automáticamente a qué OC corresponden.
            </div>
          )}

          {entries.length > 0 && visibleCount === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Ningún archivo coincide con una OC pendiente de PDF — ver el resumen arriba.
            </div>
          )}

          {/* Solo se listan "ready" y "mismatch": son las dos categorías que
              requieren una decisión del usuario. El resto (sin reconocer, no
              existe, ya tiene PDF) queda resumido arriba, no como fila. */}
          {entries.map((entry, idx) => {
            const category = categorize(entry);
            if (category !== "ready" && category !== "mismatch") return null;

            return (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-md border bg-card">
                <div className="mt-1 flex-shrink-0">
                  {entry.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : entry.status === "error" || category === "mismatch" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-500/60" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{entry.file.name}</span>
                  </div>

                  {entry.status === "error" && (
                    <p className="text-xs text-destructive">{entry.errorMessage || "Error al subir"}</p>
                  )}

                  {entry.status !== "error" && category === "mismatch" && (
                    <div className="space-y-1">
                      <p className="text-xs text-destructive font-medium">
                        El nombre dice OC {entry.orderNumber}, pero el PDF dice OC {entry.contentOrderNumber}. No se sube hasta que lo revises.
                      </p>
                      <button
                        className="text-xs underline hover:text-foreground"
                        onClick={() => toggleSelected(idx)}
                        disabled={uploading}
                      >
                        {entry.selected ? "No subir de todos modos" : `Subir igual a OC ${entry.orderNumber}`}
                      </button>
                    </div>
                  )}

                  {entry.status !== "error" && category === "ready" && (
                    <p className={`text-xs ${entry.selected ? "text-green-600" : "text-muted-foreground"}`}>
                      → OC {entry.orderNumber}
                      {entry.matches.length > 1 && ` · ${entry.matches.length} contratos`}
                      {entry.contentOrderNumber === undefined && " · verificando…"}
                    </p>
                  )}
                </div>

                {!uploading && entry.status !== "done" && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => removeEntry(idx)}>
                    ×
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => handleClose(false)} disabled={uploading}>
            Cerrar
          </Button>
          <Button size="sm" onClick={handleUploadAll} disabled={selectedCount === 0 || uploading}>
            <Upload className="h-4 w-4 mr-1" />
            Subir {selectedCount > 0 ? `(${selectedCount})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
