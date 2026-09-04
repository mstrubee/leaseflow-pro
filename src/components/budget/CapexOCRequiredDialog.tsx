import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { useBudgetProgressStatuses } from "@/hooks/useBudgetProgressStatuses";

export interface CapexLineRef {
  id: string;
  name: string;
  amount_uf: number;
  status: string;
}

interface CapexOCRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  projectName: string;
  originLine: CapexLineRef;
  ocRequeridaStatusId: string;
  /** El padre entra en modo selección de líneas directamente en la página. */
  onRequestLineSelection: () => void;
  /** Se actualiza (junto con additionalLinesVersion) cuando el usuario termina
   *  de seleccionar líneas en la página -- puede ser [] si terminó sin elegir
   *  ninguna. */
  additionalLines: CapexLineRef[];
  additionalLinesVersion: number;
  onComplete: () => void;
}

type Step = "upload" | "amount" | "selecting" | "summary";

/**
 * Se abre al marcar una línea CAPEX como "OC Requerida". Flujo:
 * 1) subir la cotización PDF: 2) previsualizarla e ingresar el monto
 * requerido de la OC; 3) opcionalmente salir a seleccionar líneas
 * adicionales "Autorizado" directamente en la página del contrato (ver
 * BudgetModule.tsx + CapexLineSelectionContext); 4) resumen con el total
 * autorizado de las líneas elegidas -- si alcanza el monto, se puede
 * "Guardar" (deja las líneas en "OC Requerida"); si no, solo "Guardar
 * temporalmente" (deja las líneas en "Cotizado"). La cotización solo se
 * sube y se asocia a las líneas al confirmar cualquiera de los dos guardados.
 */
export function CapexOCRequiredDialog({
  open,
  onOpenChange,
  contractId,
  projectName,
  originLine,
  ocRequeridaStatusId,
  onRequestLineSelection,
  additionalLines,
  additionalLinesVersion,
  onComplete,
}: CapexOCRequiredDialogProps) {
  const { statuses } = useBudgetProgressStatuses();
  const cotizadoStatusId = statuses.find((s) => s.name.trim().toLowerCase() === "cotizado")?.id ?? null;

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [finalAdditionalLines, setFinalAdditionalLines] = useState<CapexLineRef[]>([]);
  const [saving, setSaving] = useState<"final" | "temp" | null>(null);

  // Vuelve del modo "seleccionar en la página" con el resultado -- incluso si
  // vino vacío, cuenta como "terminó de seleccionar" (pasa al resumen).
  useEffect(() => {
    if (additionalLinesVersion > 0) {
      setFinalAdditionalLines(additionalLines);
      setStep("summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalLinesVersion]);

  // Revoca la URL del preview anterior al cambiar de archivo o desmontar.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStep("upload");
    setFile(null);
    setPreviewUrl(null);
    setMonto("");
    setFinalAdditionalLines([]);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("El archivo debe ser un PDF");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStep("amount");
  };

  const montoNum = parseFloat(monto.replace(",", ".")) || 0;
  const montoValido = montoNum > 0;

  const targetLines = [originLine, ...finalAdditionalLines];
  const authorizedTotal = targetLines
    .filter((l) => l.status === "autorizado")
    .reduce((sum, l) => sum + (l.amount_uf || 0), 0);
  const sufficient = authorizedTotal >= montoNum;

  const handleSave = async (mode: "final" | "temp") => {
    if (!file) return;
    const statusId = mode === "final" ? ocRequeridaStatusId : cotizadoStatusId;
    if (!statusId) {
      toast.error(`No se encontró el estado "${mode === "final" ? "OC Requerida" : "Cotizado"}"`);
      return;
    }

    setSaving(mode);
    try {
      const upload = await backupQuotationFileToRepository(contractId, file, file.name);
      if (!upload.success || !upload.driveUrl) {
        toast.error(upload.error || "No se pudo subir la cotización");
        return;
      }

      const quotationNumber = `COT-${Date.now()}`;
      const today = new Date().toISOString().slice(0, 10);
      const quotationRows = targetLines.map((line) => ({
        budget_line_id: line.id,
        contract_id: contractId,
        quotation_number: quotationNumber,
        line_name: line.name,
        project_name: projectName,
        file_path: upload.driveUrl,
        file_name: file.name,
        quotation_date: today,
        amount_uf: montoNum,
      }));

      const { error: quotationsError } = await (supabase as any).from("oc_quotations").insert(quotationRows);
      if (quotationsError) {
        toast.error("La cotización se subió, pero no se pudo asociar a las líneas");
        return;
      }

      const { error: statusError } = await (supabase as any)
        .from("budget_lines")
        .update({ progress_status_id: statusId })
        .in("id", targetLines.map((l) => l.id));
      if (statusError) {
        toast.error("La cotización se asoció, pero no se pudo actualizar el estado de las líneas");
        return;
      }

      const statusLabel = mode === "final" ? "OC Requerida" : "Cotizado";
      toast.success(
        targetLines.length > 1
          ? `${targetLines.length} líneas marcadas como "${statusLabel}"`
          : `Línea marcada como "${statusLabel}"`
      );
      reset();
      onComplete();
    } catch (error: any) {
      console.error("Error al procesar OC Requerida:", error);
      toast.error("Ocurrió un error al procesar la solicitud");
    } finally {
      setSaving(null);
    }
  };

  const dialogOpen = open && step !== "selecting";

  return (
    <Dialog open={dialogOpen} onOpenChange={saving ? undefined : handleClose}>
      <DialogContent className={cn(step === "amount" || step === "summary" ? "max-w-2xl" : "max-w-md")}>
        <DialogHeader>
          <DialogTitle>Marcar "OC Requerida"</DialogTitle>
          <DialogDescription>
            <strong>{originLine.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="capex-oc-quote-file">Cotización (PDF)</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="cursor-pointer">
                  <label htmlFor="capex-oc-quote-file" className="flex items-center gap-1.5">
                    <FileUp className="h-3.5 w-3.5" />
                    Elegir archivo
                  </label>
                </Button>
                <span className="text-sm text-muted-foreground truncate">Ningún archivo seleccionado</span>
              </div>
              <input
                id="capex-oc-quote-file"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        )}

        {step === "amount" && file && previewUrl && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cotización</Label>
              <iframe src={previewUrl} title="Previsualización de la cotización" className="w-full h-72 rounded-md border" />
              <p className="text-xs text-muted-foreground truncate">{file.name}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="capex-oc-monto">Monto requerido de la OC (UF)</Label>
                <Input
                  id="capex-oc-monto"
                  type="text"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Puedes asociar otras líneas CAPEX "Autorizado" del mismo presupuesto para cubrir este monto, o
                continuar solo con esta línea.
              </p>
            </div>
          </div>
        )}

        {step === "summary" && (
          <div className="space-y-3">
            <div className="rounded-md border divide-y">
              {targetLines.map((line) => (
                <div key={line.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="truncate">{line.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(line.status !== "autorizado" && "text-muted-foreground line-through")}>
                      UF {line.amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {line.status === "autorizado" ? "Autorizado" : "No autorizado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total autorizado</span>
              <span>UF {authorizedTotal.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monto requerido de la OC</span>
              <span>UF {montoNum.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {sufficient ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-950/30 rounded-md px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                El monto autorizado cubre el requerimiento de la OC.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Monto autorizado es inferior al Requerimiento de OC.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "amount" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button variant="outline" disabled={!montoValido} onClick={onRequestLineSelection}>
                Seleccionar líneas adicionales
              </Button>
              <Button disabled={!montoValido} onClick={() => { setFinalAdditionalLines([]); setStep("summary"); }}>
                Aceptar
              </Button>
            </>
          )}
          {step === "summary" && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={!!saving}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleSave("temp")}
                disabled={!!saving}
              >
                {saving === "temp" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar temporalmente
              </Button>
              <Button onClick={() => handleSave("final")} disabled={!sufficient || !!saving}>
                {saving === "final" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
