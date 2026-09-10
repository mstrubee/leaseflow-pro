import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, FileText, Loader2, AlertTriangle, CheckCircle2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { useBudgetProgressStatuses } from "@/hooks/useBudgetProgressStatuses";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { validatePaymentPlanTotal } from "@/lib/ocRequestShare";

interface PaymentPlanItem {
  description: string;
  amount: string;
  due_date: string;
  /** % del monto total -- solo se muestra/edita cuando hay más de un pago. */
  percent: string;
}

export interface CapexLineRef {
  id: string;
  name: string;
  amount_uf: number;
  status: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
}

interface CapexOCRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  projectName: string;
  originLine: CapexLineRef;
  ocRequeridaStatusId: string;
  ufValue: number;
  formatCLP: (amount: number) => string;
  convertUFToPesos: (uf: number) => number;
  /** El padre entra en modo selección de líneas directamente en la página.
   *  initialIds queda pre-tildado (incluye siempre la línea de origen, que
   *  además queda bloqueada para no poder destildarla). */
  onRequestLineSelection: (initialIds: string[]) => void;
  /** Se actualiza (junto con additionalLinesVersion) cuando el usuario termina
   *  de seleccionar líneas en la página -- puede ser [] si terminó sin elegir
   *  ninguna. */
  additionalLines: CapexLineRef[];
  additionalLinesVersion: number;
  onComplete: () => void;
}

type Step = "upload" | "amount" | "selecting" | "summary";

// Extensiones aceptadas para la cotización -- PDF, imágenes, Excel y Word.
// Se valida por extensión (no solo por MIME type) porque algunos navegadores
// no informan el tipo para .xls/.doc.
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".doc", ".docx"];
const ACCEPT_ATTR =
  ".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx," +
  "application/pdf,image/jpeg,image/png," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type PreviewKind = "pdf" | "image" | "none";
function previewKindOf(fileName: string): PreviewKind {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (ext === ".pdf") return "pdf";
  if ([".jpg", ".jpeg", ".png"].includes(ext)) return "image";
  return "none";
}

/**
 * Se abre al marcar una línea CAPEX como "OC Requerida". Flujo:
 * 1) subir la cotización (PDF, JPEG, PNG, Excel o Word); 2) previsualizarla (si el tipo lo permite) e ingresar el monto
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
  ufValue,
  formatCLP,
  convertUFToPesos,
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
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
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

  // Si la línea de origen ya tiene un proveedor asignado, se prellena --
  // el usuario puede cambiarlo o dejarlo en blanco si es un error.
  useEffect(() => {
    if (open && originLine.supplier_id) {
      setSupplierId(originLine.supplier_id);
      setSupplierName(originLine.supplier_name ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, originLine.id]);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStep("upload");
    setFile(null);
    setPreviewUrl(null);
    setMonto("");
    setSupplierId(null);
    setSupplierName(null);
    setPaymentPlan([]);
    setFinalAdditionalLines([]);
  };

  const addPaymentItem = () =>
    setPaymentPlan((prev) => [...prev, { description: `Pago ${prev.length + 1}`, amount: "", due_date: "", percent: "" }]);
  const removePaymentItem = (index: number) => setPaymentPlan((prev) => prev.filter((_, i) => i !== index));

  // El monto requerido se ingresa en pesos -- se limpia todo lo que no sea
  // dígito (el usuario puede escribir puntos de miles, "$", etc.).
  const montoClp = parseInt(monto.replace(/\D/g, ""), 10) || 0;

  // Por defecto el plan de pagos es "un pago por el total" -- se arma solo,
  // sin que el usuario tenga que agregar nada. Mientras siga habiendo un solo
  // pago, su monto se mantiene igual al monto requerido si éste cambia.
  useEffect(() => {
    if (montoClp <= 0) return;
    setPaymentPlan((prev) => {
      if (prev.length === 0) {
        return [{ description: "Pago único", amount: String(montoClp), due_date: "", percent: "100" }];
      }
      if (prev.length === 1) {
        const pct = parseFloat(prev[0].percent) || 100;
        const newAmount = String(Math.round((montoClp * pct) / 100));
        if (prev[0].amount === newAmount) return prev;
        return [{ ...prev[0], amount: newAmount }];
      }
      return prev;
    });
  }, [montoClp]);

  // Al agregar un segundo pago (o editar uno ya existente), % y monto quedan
  // ligados: editar uno recalcula el otro contra el monto total requerido.
  const updatePaymentItem = (index: number, field: keyof PaymentPlanItem, value: string) =>
    setPaymentPlan((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      if (field === "amount") {
        const amt = parseFloat(value) || 0;
        const percent = montoClp > 0 ? String(Math.round((amt / montoClp) * 10000) / 100) : item.percent;
        return { ...item, amount: value, percent };
      }
      if (field === "percent") {
        const pct = parseFloat(value) || 0;
        const amount = montoClp > 0 ? String(Math.round((montoClp * pct) / 100)) : item.amount;
        return { ...item, percent: value, amount };
      }
      return { ...item, [field]: value };
    }));

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      toast.error("El archivo debe ser PDF, JPEG, PNG, Excel o Word");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStep("amount");
  };

  const paymentPlanError = validatePaymentPlanTotal(
    paymentPlan.filter((p) => parseFloat(p.amount) > 0).map((p) => Math.round(parseFloat(p.amount) || 0)),
    montoClp
  );
  const montoValido = montoClp > 0 && !!supplierId && paymentPlan.length > 0 && !paymentPlanError;

  const targetLines = [originLine, ...finalAdditionalLines];
  const authorizedTotalUf = targetLines
    .filter((l) => l.status === "autorizado")
    .reduce((sum, l) => sum + (l.amount_uf || 0), 0);
  const authorizedTotalClp = convertUFToPesos(authorizedTotalUf);
  const sufficient = authorizedTotalClp >= montoClp;

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
        amount_clp: montoClp,
        amount_uf: ufValue > 0 ? montoClp / ufValue : 0,
        supplier_id: supplierId,
        supplier_name: supplierName,
      }));

      const { error: quotationsError } = await (supabase as any).from("oc_quotations").insert(quotationRows);
      if (quotationsError) {
        toast.error("La cotización se subió, pero no se pudo asociar a las líneas");
        return;
      }

      const validPayments = paymentPlan.filter((p) => parseFloat(p.amount) > 0);
      const planEntries = (validPayments.length > 0 ? validPayments : [{ description: "Pago único", amount: String(montoClp), due_date: "" }])
        .map((p, idx) => ({
          quotation_number: quotationNumber,
          payment_number: idx + 1,
          description: p.description || `Pago ${idx + 1}`,
          amount_clp: Math.round(parseFloat(p.amount) || 0),
          amount_uf: ufValue > 0 ? Math.round(((parseFloat(p.amount) || 0) / ufValue) * 10000) / 10000 : 0,
          due_date: p.due_date || null,
          status: "pending",
        }));
      const { error: paymentPlanError2 } = await (supabase as any).from("oc_payment_plans").insert(planEntries);
      if (paymentPlanError2) {
        toast.error("La cotización se asoció, pero no se pudo guardar el plan de pagos");
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
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          step === "amount" || step === "summary" ? "max-w-3xl" : "max-w-md"
        )}
      >
        <DialogHeader>
          <DialogTitle>Marcar "OC Requerida"</DialogTitle>
          <DialogDescription>
            <strong>{originLine.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="capex-oc-quote-file">Cotización</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="cursor-pointer">
                  <label htmlFor="capex-oc-quote-file" className="flex items-center gap-1.5">
                    <FileUp className="h-3.5 w-3.5" />
                    Elegir archivo
                  </label>
                </Button>
                <span className="text-sm text-muted-foreground truncate">Ningún archivo seleccionado</span>
              </div>
              <p className="text-[11px] text-muted-foreground">PDF, JPEG, PNG, Excel o Word</p>
              <input
                id="capex-oc-quote-file"
                type="file"
                accept={ACCEPT_ATTR}
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
              {previewKindOf(file.name) === "pdf" && (
                <iframe src={previewUrl} title="Previsualización de la cotización" className="w-full h-72 rounded-md border" />
              )}
              {previewKindOf(file.name) === "image" && (
                <img
                  src={previewUrl}
                  alt="Previsualización de la cotización"
                  className="w-full h-72 rounded-md border object-contain bg-muted/30"
                />
              )}
              {previewKindOf(file.name) === "none" && (
                <div className="w-full h-72 rounded-md border flex flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
                  <FileText className="h-10 w-10" />
                  <span className="text-xs">Sin previsualización disponible para este tipo de archivo</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground truncate">{file.name}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="capex-oc-monto">Monto requerido de la OC ($)</Label>
                <Input
                  id="capex-oc-monto"
                  type="text"
                  inputMode="numeric"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Proveedor *</Label>
                <SupplierSelect
                  value={supplierId}
                  onChange={(id, name) => { setSupplierId(id); setSupplierName(name); }}
                  triggerClassName="w-full h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Plan de Pagos *</Label>
                  <Button size="sm" variant="outline" onClick={addPaymentItem} className="h-7 gap-1">
                    <Plus className="h-3 w-3" />
                    Agregar Pago
                  </Button>
                </div>
                {paymentPlan.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Agrega al menos un pago.</p>
                ) : (
                  <div className="space-y-2">
                    {paymentPlan.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <Input
                          value={item.description}
                          onChange={(e) => updatePaymentItem(idx, "description", e.target.value)}
                          placeholder="Descripción"
                          className="h-8 text-xs flex-1 min-w-[7rem]"
                        />
                        {paymentPlan.length > 1 && (
                          <Input
                            type="number"
                            value={item.percent}
                            onChange={(e) => updatePaymentItem(idx, "percent", e.target.value)}
                            placeholder="%"
                            className="h-8 text-xs w-16"
                          />
                        )}
                        <Input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updatePaymentItem(idx, "amount", e.target.value)}
                          placeholder="Monto $"
                          className="h-8 text-xs w-28"
                        />
                        <Input
                          type="date"
                          value={item.due_date}
                          onChange={(e) => updatePaymentItem(idx, "due_date", e.target.value)}
                          className="h-8 text-xs w-36"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removePaymentItem(idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {paymentPlanError && <p className="text-xs text-destructive">{paymentPlanError}</p>}
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
                      {formatCLP(convertUFToPesos(line.amount_uf))}{" "}
                      <span className="text-muted-foreground font-normal">
                        (UF {line.amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </span>
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
              <span>
                {formatCLP(authorizedTotalClp)}{" "}
                <span className="text-muted-foreground font-normal">
                  (UF {authorizedTotalUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monto requerido de la OC</span>
              <span>{formatCLP(montoClp)}</span>
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
              <Button
                variant="outline"
                disabled={!montoValido}
                onClick={() => {
                  setStep("selecting");
                  onRequestLineSelection([originLine.id]);
                }}
              >
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
                variant="outline"
                disabled={!!saving}
                onClick={() => {
                  setStep("selecting");
                  onRequestLineSelection([originLine.id, ...finalAdditionalLines.map((l) => l.id)]);
                }}
              >
                Agregar o quitar líneas
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
