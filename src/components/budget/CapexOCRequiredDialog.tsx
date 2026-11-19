import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileUp, FileText, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { useBudgetProgressStatuses } from "@/hooks/useBudgetProgressStatuses";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { validatePaymentPlanTotal } from "@/lib/ocRequestShare";
import { PaymentPlanEditor } from "./PaymentPlanEditor";
import { PaymentPlanRow, resolvePaymentPlan } from "@/lib/paymentPlan";

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
  /** Cotización ya subida previamente (ver CotizadoUploadDialog.tsx > "Avanzar
   *  a Requerimiento de OC") -- si viene, se pre-carga y el diálogo arranca
   *  directo en el paso "amount" en vez de pedir el archivo de nuevo. */
  initialFile?: File | null;
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

type InputCurrency = "CLP" | "UF";

const formatUfNumber = (uf: number) =>
  uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Interpreta un monto en UF escrito por el usuario. Acepta formato chileno
// ("1.234,56": punto de miles, coma decimal) y también punto decimal ("12.5").
// Un único punto seguido de 1-2 dígitos se toma como decimal; con 3 dígitos o
// varios puntos, como separador de miles.
function parseUfInput(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = (cleaned.match(/\./g) || []).length;
    const decimals = cleaned.split(".")[1] ?? "";
    normalized = dots === 1 && decimals.length > 0 && decimals.length <= 2 ? cleaned : cleaned.replace(/\./g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
  initialFile,
  onComplete,
}: CapexOCRequiredDialogProps) {
  const { statuses } = useBudgetProgressStatuses();
  const cotizadoStatusId = statuses.find((s) => s.name.trim().toLowerCase() === "cotizado")?.id ?? null;

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  // Moneda en que se tipea el monto. El proceso (plan de pagos, comparación con
  // lo autorizado, OC) siempre es en pesos: si se ingresa en UF, se convierte a
  // CLP con el valor UF vigente y el UF ingresado queda solo como dato referencial.
  const [currency, setCurrency] = useState<InputCurrency>("CLP");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanRow[]>([]);
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
    setCurrency("CLP");
    setSupplierId(null);
    setSupplierName(null);
    setPaymentPlan([]);
    setFinalAdditionalLines([]);
  };

  // El monto requerido se puede ingresar en pesos o en UF.
  // - Pesos: se limpia todo lo que no sea dígito (puntos de miles, "$", etc.).
  // - UF: se convierte a pesos con el valor UF vigente (mismo redondeo que el
  //   resto de la app: Math.round(UF * valorUF)). El proceso sigue en pesos.
  const enteredUf = currency === "UF" ? parseUfInput(monto) : 0;
  const montoClp =
    currency === "UF"
      ? ufValue > 0
        ? Math.round(enteredUf * ufValue)
        : 0
      : parseInt(monto.replace(/\D/g, ""), 10) || 0;
  // UF referencial que queda guardado: el ingresado tal cual (si se tipeó en
  // UF) o el equivalente al valor UF vigente (si se tipeó en pesos).
  const montoUfRef =
    currency === "UF"
      ? Math.round(enteredUf * 10000) / 10000
      : ufValue > 0
      ? Math.round((montoClp / ufValue) * 10000) / 10000
      : 0;

  // Al cambiar de moneda se convierte lo ya escrito para no perder el monto.
  const handleCurrencyChange = (next: InputCurrency) => {
    if (next === currency) return;
    if (montoClp > 0 && ufValue > 0) {
      setMonto(
        next === "UF"
          ? String(Math.round((montoClp / ufValue) * 10000) / 10000).replace(".", ",")
          : String(montoClp)
      );
    } else {
      setMonto("");
    }
    setCurrency(next);
  };

  // Por defecto el plan de pagos es "un pago por el total" -- se arma solo,
  // sin que el usuario tenga que agregar nada. Con un solo pago, ese pago es el
  // saldo (100%) y sigue al monto requerido solo (ver PaymentPlanEditor).
  useEffect(() => {
    if (montoClp <= 0) return;
    setPaymentPlan((prev) =>
      prev.length === 0 ? [{ description: "Pago único", amount: "", percent: "", due_date: "", input_mode: "amount" }] : prev
    );
  }, [montoClp]);

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

  // Viene de "Avanzar a Requerimiento de OC" en CotizadoUploadDialog con la
  // cotización ya subida antes -- se precarga y se salta directo al paso
  // "amount" en vez de pedir el archivo de nuevo.
  useEffect(() => {
    if (open && initialFile) {
      handleFileChange(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  // Cada pago se define por monto o por %, y el último es el saldo: los montos
  // resueltos son los que se validan y se guardan (no el texto tipeado).
  const resolvedPlan = resolvePaymentPlan(paymentPlan, montoClp, 0);
  const paymentPlanError = validatePaymentPlanTotal(
    resolvedPlan.payments.filter((p) => p.amount > 0).map((p) => p.amount),
    montoClp
  );
  // Un "Organismo público" (Municipalidad, Serviu, MOP, etc.) u otro proveedor
  // en texto libre se guarda SIN supplier_id (ver SupplierSelect.handleSavePublicEntity:
  // onChange(null, name)) -- exigir solo supplierId bloqueaba "Aceptar" para
  // siempre en ese caso, sin ningún mensaje visible.
  const hasSupplier = !!supplierId || !!supplierName?.trim();
  const montoValido = montoClp > 0 && hasSupplier && paymentPlan.length > 0 && !paymentPlanError;

  const targetLines = [originLine, ...finalAdditionalLines];
  const authorizedTotalUf = targetLines
    .filter((l) => l.status === "autorizado")
    .reduce((sum, l) => sum + (l.amount_uf || 0), 0);
  const authorizedTotalClp = convertUFToPesos(authorizedTotalUf);
  // Comparar en UF (con la misma tolerancia que ya usa OCRequestDialog.tsx
  // para este mismo tipo de bug) en vez de comparar los CLP ya redondeados:
  // convertUFToPesos redondea cada lado por separado, así que un monto
  // realmente IGUAL al autorizado podía quedar 1 peso por debajo después del
  // redondeo y marcarse como insuficiente sin serlo.
  const montoUf = ufValue > 0 ? montoClp / ufValue : 0;
  const sufficient = authorizedTotalUf >= montoUf - 0.01;

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
        storage_path: upload.storagePath ?? null,
        quotation_date: today,
        amount_clp: montoClp,
        amount_uf: montoUfRef,
        supplier_id: supplierId,
        supplier_name: supplierName,
      }));

      const { error: quotationsError } = await (supabase as any).from("oc_quotations").insert(quotationRows);
      if (quotationsError) {
        toast.error("La cotización se subió, pero no se pudo asociar a las líneas");
        return;
      }

      const validPayments = paymentPlan
        .map((p, idx) => ({ ...p, amountClp: resolvedPlan.payments[idx]?.amount ?? 0 }))
        .filter((p) => p.amountClp > 0);
      const planEntries = (validPayments.length > 0
        ? validPayments
        : [{ description: "Pago único", amountClp: montoClp, due_date: "" }]
      ).map((p, idx) => ({
        quotation_number: quotationNumber,
        payment_number: idx + 1,
        description: p.description || `Pago ${idx + 1}`,
        amount_clp: p.amountClp,
        amount_uf: ufValue > 0 ? Math.round((p.amountClp / ufValue) * 10000) / 10000 : 0,
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
          "max-h-[95vh] overflow-y-auto",
          step === "amount" || step === "summary" ? "max-w-[min(96rem,95vw)]" : "max-w-md"
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
                <iframe src={previewUrl} title="Previsualización de la cotización" className="w-full h-[36rem] rounded-md border" />
              )}
              {previewKindOf(file.name) === "image" && (
                <img
                  src={previewUrl}
                  alt="Previsualización de la cotización"
                  className="w-full h-[36rem] rounded-md border object-contain bg-muted/30"
                />
              )}
              {previewKindOf(file.name) === "none" && (
                <div className="w-full h-[36rem] rounded-md border flex flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
                  <FileText className="h-10 w-10" />
                  <span className="text-xs">Sin previsualización disponible para este tipo de archivo</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground truncate">{file.name}</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="capex-oc-monto">Monto requerido de la OC</Label>
                <div className="flex items-center gap-2">
                  <Select value={currency} onValueChange={(v) => handleCurrencyChange(v as InputCurrency)}>
                    <SelectTrigger className="w-20 shrink-0" aria-label="Moneda del monto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLP">$</SelectItem>
                      <SelectItem value="UF">UF</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="capex-oc-monto"
                    type="text"
                    inputMode={currency === "UF" ? "decimal" : "numeric"}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder={currency === "UF" ? "0,00" : "0"}
                  />
                </div>
                {/* Siempre se muestra el monto en pesos (con qué se va a trabajar) y su UF referencial */}
                {montoClp > 0 && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p className="font-medium text-foreground">{formatCLP(montoClp)}</p>
                    <p>
                      {currency === "UF"
                        ? `Ingresado: UF ${formatUfNumber(enteredUf)} (valor UF ${formatCLP(ufValue)}). El proceso continúa en pesos.`
                        : `Equivalente referencial: UF ${formatUfNumber(montoUfRef)}`}
                    </p>
                  </div>
                )}
                {currency === "UF" && ufValue <= 0 && (
                  <p className="text-xs text-destructive">No hay valor UF disponible para convertir; ingresa el monto en pesos.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Proveedor *</Label>
                <SupplierSelect
                  value={supplierId}
                  supplierName={supplierName}
                  onChange={(id, name) => { setSupplierId(id); setSupplierName(name); }}
                  triggerClassName="w-full h-9 text-sm"
                />
              </div>

              <PaymentPlanEditor
                items={paymentPlan}
                onChange={setPaymentPlan}
                total={montoClp}
                currency="CLP"
                ufValue={ufValue}
                newItem={(i) => ({ description: `Pago ${i + 1}`, amount: "", percent: "", due_date: "", input_mode: "amount" })}
              />

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
                      {line.status === "autorizado" ? "Autorizado" : line.status === "solicita_autorizar" ? "Solicita Autorizar" : "No autorizado"}
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
              <span>
                {formatCLP(montoClp)}{" "}
                <span className="text-muted-foreground font-normal">(UF {formatUfNumber(montoUfRef)})</span>
              </span>
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
              <Button
                disabled={!montoValido}
                onClick={() => { setFinalAdditionalLines([]); setStep("summary"); }}
                title={
                  montoValido
                    ? undefined
                    : montoClp <= 0
                    ? "Ingresa el monto requerido de la OC"
                    : !hasSupplier
                    ? "Selecciona un proveedor"
                    : paymentPlan.length === 0
                    ? "Agrega al menos un pago al plan de pagos"
                    : paymentPlanError || undefined
                }
              >
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
