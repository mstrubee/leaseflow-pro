import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enrichShareData } from "@/lib/shareDataEnrich";
import { resolveFileUrl } from "@/lib/storageUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, FileSpreadsheet, FileUp, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { MultipleLinesSelector } from "./MultipleLinesSelector";
import { ShareOCRequestDialog } from "./ShareOCRequestDialog";
import { OCRequestShareData, validatePaymentPlanTotal } from "@/lib/ocRequestShare";
import { PaymentPlanEditor } from "./PaymentPlanEditor";
import { useCebeDistribution, useContractCebeSet } from "@/hooks/useCebeDistribution";
import { CebeDistributionEditor } from "./CebeDistributionEditor";
import { saveDistribution, syncPaymentSublines } from "@/lib/cebeDistributionStore";
import { toShareRows } from "@/lib/cebeDistribution";
import { PaymentPlanRow, resolvePaymentPlan as resolvePlan } from "@/lib/paymentPlan";
import { backupQuotationFileToRepository } from "@/lib/repositoryBackup";
import { useCloseGuard } from "@/hooks/useCloseGuard";

// Presupuesto/cotización adjuntado a la Solicitud -- mismas extensiones y
// mismo criterio de previsualización que usa "Requerimiento de OC"
// (CapexOCRequiredDialog.tsx), para que la experiencia sea consistente.
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

interface SelectedLine {
  lineId: string;
  lineName: string;
  amount: number;
  maxAmount: number;
}

interface OCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  contractCebe?: string | null;
  /** CAPEX incluye las Órdenes CO del proyecto en la solicitud; OPEX no. */
  budgetType?: "capex" | "opex";
  /** Números de Orden CO del contrato ("CO-1, CO-2"), ya formateados. */
  coOrderNumbers?: string | null;
  budgetId: string;
  budgetLineId: string;
  lineName: string;
  lineAvailable: number;
  lineBudget: number;
  /** Proveedor ya asignado a la línea CAPEX de origen, si tiene uno -- se
   *  prellena al abrir (el usuario puede cambiarlo o dejarlo en blanco). */
  initialSupplierId?: string | null;
  initialSupplierName?: string | null;
  year: number;
  ufValue: number;
  formatUF: (value: number) => string;
  onSuccess?: () => void;
}

export const OCRequestDialog = ({
  open,
  onOpenChange,
  contractId,
  contractName,
  contractCebe,
  budgetType,
  coOrderNumbers,
  budgetId,
  budgetLineId,
  lineName,
  lineAvailable,
  lineBudget,
  initialSupplierId = null,
  initialSupplierName = null,
  year,
  ufValue,
  formatUF,
  onSuccess
}: OCRequestDialogProps) => {
  const [loading, setLoading] = useState(false);
  // Al crear una solicitud DIRECTA (sin venir de un Requerimiento de OC), la
  // primera interacción es elegir la(s) línea(s) de presupuesto.
  const [activeTab, setActiveTab] = useState("lines");
  // Mientras sea true, la Descripción se autocompleta con el nombre de las
  // líneas seleccionadas -- se apaga apenas el usuario la edita a mano, para
  // no pisar un texto que ya escribió.
  const [descriptionIsAuto, setDescriptionIsAuto] = useState(true);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    currency: "CLP",
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [useMultipleLines, setUseMultipleLines] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanRow[]>([]);
  // Presupuesto/cotización adjuntado -- obligatorio para poder crear la
  // solicitud. Se sube al repositorio del contrato (carpeta "Solicitudes de
  // OC") recién al crear, no al elegir el archivo.
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [quotePreviewUrl, setQuotePreviewUrl] = useState<string | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateFileName, setTemplateName] = useState<string | null>(null);
  const [shareData, setShareData] = useState<OCRequestShareData | null>(null);
  const [shareRequestId, setShareRequestId] = useState<string | undefined>(undefined);

  // Local mixto (2+ CEBE): el gasto se distribuye entre sus CEBE. Se detecta solo.
  const { cebes, isMixed: cebeMixed, loading: cebesLoading } = useContractCebeSet(contractId);
  // Total del documento en pesos, con la MISMA aritmética que usa handleCreate para guardarlo.
  const docTotalClp = (() => {
    const entered = parseFloat(form.amount) || 0;
    let totalUf = form.currency === "CLP" && ufValue > 0 ? entered / ufValue : entered;
    totalUf = Math.round(totalUf * 10000) / 10000;
    return Math.round(totalUf * ufValue);
  })();
  const dist = useCebeDistribution(cebeMixed ? cebes.map((c) => c.id) : [], docTotalClp);
  useEffect(() => {
    if (open) dist.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const { toast } = useToast();

  // Load active template
  useEffect(() => {
    const loadTemplate = async () => {
      const { data } = await supabase
        .from("oc_request_templates")
        .select("file_path, file_name")
        .eq("is_active", true)
        .limit(1)
        .single();
      
      if (data) {
        const signed = await resolveFileUrl(data.file_path);
        setTemplateUrl(signed);
        setTemplateName(data.file_name);
      }
    };
    if (open) {
      loadTemplate();
      setForm({
        description: lineName,
        amount: "",
        currency: "CLP",
        supplier_id: initialSupplierId,
        supplier_name: initialSupplierName
      });
      setSelectedLines([{ lineId: budgetLineId, lineName, amount: lineAvailable, maxAmount: lineAvailable }]);
      setUseMultipleLines(false);
      setPaymentPlan([]);
      setActiveTab("lines");
      setDescriptionIsAuto(true);
      setQuoteFile(null);
      setQuotePreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open, lineName, budgetLineId, lineAvailable, initialSupplierId, initialSupplierName]);

  // Libera el blob URL de previsualización al desmontar el diálogo.
  useEffect(() => {
    return () => {
      if (quotePreviewUrl) URL.revokeObjectURL(quotePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotePreviewUrl]);

  const handleQuoteFileChange = (f: File | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      toast({ variant: "destructive", title: "Archivo no válido", description: "El archivo debe ser PDF, JPEG, PNG, Excel o Word" });
      return;
    }
    setQuotePreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setQuoteFile(f);
  };

  // Autocompleta la Descripción (pestaña "Datos Básicos") con el nombre de
  // las líneas seleccionadas, unidas por coma -- solo mientras el usuario no
  // la haya editado a mano. Con una sola línea (modo por defecto), no hace
  // falta: form.description ya arranca con lineName.
  useEffect(() => {
    if (!useMultipleLines || !descriptionIsAuto) return;
    const joined = selectedLines.map(l => l.lineName).join(", ");
    setForm(prev => ({ ...prev, description: joined }));
  }, [selectedLines, useMultipleLines, descriptionIsAuto]);

  const formatCLP = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;

  const generateRequestNumber = async (lineNames: string[]): Promise<{ number: string; correlative: number }> => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '.');
    
    // Get count of requests for today to calculate correlative
    const { count } = await supabase
      .from("oc_requests")
      .select("*", { count: "exact", head: true })
      .eq("request_date", today.toISOString().split('T')[0]);
    
    const correlative = (count || 0) + 1;
    const correlativeStr = correlative.toString().padStart(3, '0');
    
    // Clean names for the number - include all line names
    const cleanLineNames = lineNames.map(name => 
      name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_')
    ).join('+').substring(0, 60);
    
    const cleanProjectName = contractName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 30);
    
    const requestNumber = `${dateStr}_${correlativeStr}_${cleanLineNames}_${cleanProjectName}`;
    
    return { number: requestNumber, correlative };
  };

  /** Resuelve cada línea del plan de pagos a un monto CLP concreto (cada pago es
   *  monto o %, y el último es el saldo -- ver lib/paymentPlan.ts). Se usa para
   *  validar el total ANTES de crear nada y para el PDF de la Solicitud. */
  const resolvePaymentPlan = (amountClp: number) => {
    const resolved = resolvePlan(paymentPlan, amountClp, 0);
    return paymentPlan
      .map((p, idx) => ({
        description: p.description || `Pago ${idx + 1}`,
        amountClp: resolved.payments[idx]?.amount ?? 0,
        dueDate: p.due_date || null,
      }))
      .filter((e) => e.amountClp > 0);
  };

  // Solo las solicitudes CAPEX llevan la(s) Orden(es) CO del proyecto
  const requestCoNumbers = budgetType === "capex" ? coOrderNumbers || null : null;

  const handleCreate = async (): Promise<boolean> => {
    if (!quoteFile) {
      toast({ variant: "destructive", title: "Falta adjuntar presupuesto", description: "Debe adjuntar el presupuesto/cotización antes de crear la solicitud" });
      setActiveTab("quote");
      return false;
    }

    // Un "Organismo público" u otro proveedor en texto libre se guarda SIN
    // supplier_id (ver SupplierSelect.handleSavePublicEntity: onChange(null, name)) --
    // exigir solo supplier_id bloqueaba la creación para ese caso legítimo.
    if (!form.supplier_id && !form.supplier_name?.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un proveedor" });
      return false;
    }

    if (paymentPlan.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Debe agregar al menos un pago al plan de pagos" });
      return false;
    }

    // Amount is always entered in basic tab
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return false;
    }
    
    // Convert to UF if entered in CLP
    let totalAmountUf = form.currency === "CLP" && ufValue > 0 ? amount / ufValue : amount;
    
    // Get line names for the request number
    let lineNamesForNumber: string[] = [];
    if (useMultipleLines) {
      const validLines = selectedLines.filter(l => l.lineId);
      if (validLines.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "Seleccione al menos una línea de presupuesto" });
        return false;
      }
      lineNamesForNumber = validLines.map(l => l.lineName);

      // El monto ingresado en "Datos Básicos" debe caber en la suma de las
      // líneas elegidas -- comparación en UF de ambos lados para no mezclar
      // monedas (ver bug: comparar UF contra CLP daba un falso "excede").
      const sumLinesUf = validLines.reduce((s, l) => s + (l.amount || 0), 0);
      if (totalAmountUf > sumLinesUf + 0.01) {
        toast({
          variant: "destructive",
          title: "Monto excede la suma de las líneas",
          description: `El monto ingresado (${formatCLP(totalAmountUf * ufValue)}) supera la suma de las líneas seleccionadas (${formatCLP(sumLinesUf * ufValue)}). Ajusta los montos de las líneas o el monto ingresado.`,
        });
        return false;
      }
    } else {
      lineNamesForNumber = [lineName];
      
      // Validate against available (only for single line mode)
      if (totalAmountUf > lineAvailable + 0.01) {
        toast({ 
          variant: "destructive", 
          title: "Monto excede disponible", 
          description: `El monto ($${Math.round(totalAmountUf * ufValue).toLocaleString("es-CL")}) supera el disponible ($${Math.round(lineAvailable * ufValue).toLocaleString("es-CL")})` 
        });
        return false;
      }
    }

    // Round to 4 decimal places to avoid floating point issues
    totalAmountUf = Math.round(totalAmountUf * 10000) / 10000;
    
    // Calculate CLP equivalent (round to integer)
    const amountClp = Math.round(totalAmountUf * ufValue);

    const resolvedPayments = resolvePaymentPlan(amountClp);
    const planError = validatePaymentPlanTotal(resolvedPayments.map((p) => p.amountClp), amountClp);
    if (planError) {
      toast({ variant: "destructive", title: "Plan de pagos inconsistente", description: planError });
      return false;
    }

    // Local mixto: la distribución del gasto por CEBE es obligatoria y debe sumar el total.
    if (cebesLoading) {
      toast({ variant: "destructive", title: "Espera un momento", description: "Aún se están cargando los CEBE del local." });
      return false;
    }
    if (cebeMixed && !dist.check.valid) {
      toast({ variant: "destructive", title: "Distribución por CEBE inválida", description: dist.check.errors[0] });
      setActiveTab("basic");
      return false;
    }

    setLoading(true);
    try {
      // Sube el presupuesto/cotización a la carpeta "Cotizaciones" del
      // repositorio del contrato (misma carpeta que usa Requerimiento de OC)
      // ANTES de crear la solicitud -- si falla, no se crea nada (evita
      // quedar con una solicitud sin respaldo).
      const upload = await backupQuotationFileToRepository(contractId, quoteFile, quoteFile.name);
      if (!upload.success || !upload.driveUrl) {
        toast({ variant: "destructive", title: "Error", description: upload.error || "No se pudo subir el presupuesto adjunto" });
        return false;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { number, correlative } = await generateRequestNumber(lineNamesForNumber);

      // Build line_name for display - include all line names
      const displayLineName = useMultipleLines
        ? selectedLines.filter(l => l.amount > 0).map(l => l.lineName).join(' + ')
        : lineName;

      // Create the OC request
      const { data: requestData, error } = await supabase.from("oc_requests").insert({
        contract_id: contractId,
        budget_id: budgetId,
        budget_line_id: useMultipleLines ? null : budgetLineId,
        request_number: number,
        correlative_of_day: correlative,
        request_date: new Date().toISOString().split('T')[0],
        line_name: displayLineName,
        project_name: contractName,
        description: form.description,
        amount_uf: totalAmountUf,
        amount_clp: amountClp,
        input_currency: form.currency,
        uf_value_at_entry: ufValue,
        supplier_id: form.supplier_id,
        supplier_name: form.supplier_name,
        year: year,
        status: "pending",
        created_by: user?.id,
        quotation_url: upload.driveUrl,
        quotation_file_name: quoteFile.name,
        // Solo se envía si hay CO, así no cambia nada para proyectos sin Orden CO
        ...(requestCoNumbers ? { co_order_numbers: requestCoNumbers } : {})
      }).select().single();

      if (error) throw error;

      // If using multiple lines, create the budget line assignments
      if (useMultipleLines && requestData) {
        const lineAssignments = selectedLines
          .filter(l => l.amount > 0)
          .map(l => ({
            oc_request_id: requestData.id,
            budget_line_id: l.lineId,
            amount_uf: l.amount
          }));

        if (lineAssignments.length > 0) {
          await supabase.from("oc_budget_lines").insert(lineAssignments);
        }
      }

      // Create payment plan entries - if no plan defined, create single payment entry
      if (requestData) {
        if (resolvedPayments.length > 0) {
          const planEntries = resolvedPayments.map((p, idx) => ({
            oc_request_id: requestData.id,
            payment_number: idx + 1,
            description: p.description,
            amount_uf: ufValue > 0 ? Math.round((p.amountClp / ufValue) * 10000) / 10000 : 0,
            amount_clp: Math.round(p.amountClp),
            due_date: p.dueDate,
            status: "pending"
          }));
          await supabase.from("oc_payment_plans").insert(planEntries);
        } else {
          // No payment plan defined - assume single payment with full amount
          await supabase.from("oc_payment_plans").insert({
            oc_request_id: requestData.id,
            payment_number: 1,
            description: "Pago único",
            amount_uf: totalAmountUf,
            amount_clp: amountClp,
            due_date: null,
            status: "pending"
          });
        }
      }

      // Local mixto: guarda la distribución por CEBE y las sublíneas de cada pago del plan.
      if (requestData && cebeMixed) {
        try {
          const ref = { kind: "request" as const, contractId, id: requestData.id };
          await saveDistribution(ref, dist.rows, amountClp);
          await syncPaymentSublines(ref, { ufValue });
        } catch (distError) {
          console.error("Error al guardar la distribución por CEBE:", distError);
          toast({
            variant: "destructive",
            title: "Solicitud creada sin distribución por CEBE",
            description: "No se pudo guardar la distribución por CEBE. Ábrela y vuelve a ingresarla antes de continuar.",
          });
        }
      }

      toast({ title: "Solicitud creada", description: "Solicitud creada exitosamente" });
      onOpenChange(false);
      onSuccess?.();

      let supplierRut: string | null = null;
      if (form.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("rut")
          .eq("id", form.supplier_id)
          .single();
        supplierRut = supplierData?.rut || null;
      }

      // Se ofrece compartir recién creada, con los mismos datos que se acaban
      // de guardar — así el PDF y lo que quedó en la base nunca se desalinean.
      setShareData(await enrichShareData({
        requestDate: new Date().toISOString().split("T")[0],
        currency: form.currency as "UF" | "CLP",
        contractNames: [contractName],
        contractCebe,
        coOrderNumbers: requestCoNumbers,
        cebeDistribution: cebeMixed ? toShareRows(dist.rows, (id) => cebes.find((c) => c.id === id)?.label ?? "CEBE", amountClp) : null,
        description: form.description,
        lines: useMultipleLines
          ? selectedLines.filter((l) => l.amount > 0).map((l) => ({
              lineId: l.lineId,
              lineName: l.lineName,
              amountClp: Math.round(l.amount * ufValue),
            }))
          : [{ lineId: budgetLineId, lineName, amountClp }],
        totalAmountClp: amountClp,
        payments: resolvedPayments,
        supplierName: form.supplier_name,
        supplierRut,
        sequenceNumber: requestData?.sequence_number,
        requestId: requestData?.id,
        verificationCode: (requestData as any)?.verification_code,
      }, { ufValue, contractId }));
      setShareRequestId(requestData?.id);
      return true;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierChange = (supplierId: string | null, supplierName: string | null) => {
    setForm(prev => ({ ...prev, supplier_id: supplierId, supplier_name: supplierName }));
  };

  const totalClpForPayments = form.currency === "CLP" ? (parseFloat(form.amount) || 0) : (parseFloat(form.amount) || 0) * ufValue;
  // Amount is always from the form
  const currentTotal = form.currency === "CLP" && ufValue > 0
    ? (parseFloat(form.amount) || 0) / ufValue
    : parseFloat(form.amount) || 0;
  // Un "Organismo público" u otro proveedor en texto libre se guarda SIN
  // supplier_id (ver SupplierSelect.handleSavePublicEntity) -- exigir solo
  // supplier_id bloqueaba avanzar para ese caso legítimo.
  const hasSupplier = !!form.supplier_id || !!form.supplier_name?.trim();

  const createDisabled = loading || paymentPlan.length === 0 || !quoteFile || cebesLoading || (cebeMixed && !dist.check.valid);

  // Nada se crea solo: al cerrar con datos ingresados se pregunta (guardar / seguir editando / salir sin guardar).
  // (Los valores con que abre la ventana -línea de origen, título y proveedor de la línea- no cuentan como cambios.)
  const linesChanged =
    selectedLines.length !== 1 || selectedLines[0].lineId !== budgetLineId || selectedLines[0].amount !== lineAvailable;
  const isDirty =
    open &&
    (!!quoteFile || paymentPlan.length > 0 || linesChanged || !!form.amount || !descriptionIsAuto || form.supplier_id !== initialSupplierId);
  const { requestClose, guard } = useCloseGuard({
    isDirty,
    onClose: () => onOpenChange(false),
    onSave: async () => {
      if (createDisabled) {
        toast({ variant: "destructive", title: "Faltan datos", description: "Completa la solicitud (presupuesto adjunto, plan de pagos y, si aplica, distribución por CEBE) para poder guardarla, o continúa editando." });
        return false;
      }
      return handleCreate();
    },
  });

  return (
    <>
    {guard}
    <Dialog open={open} onOpenChange={(next) => { if (next) onOpenChange(true); else if (!loading) requestClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Solicitud de OC</DialogTitle>
          <DialogDescription>
            Proyecto: <strong>{contractName}</strong>
            {contractCebe && <span className="ml-2 text-xs">CEBE: {contractCebe}</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="lines">Líneas de Presupuesto</TabsTrigger>
            <TabsTrigger value="quote">Adjuntar Presupuesto</TabsTrigger>
            <TabsTrigger value="basic" disabled={!quoteFile}>Datos Básicos</TabsTrigger>
            <TabsTrigger value="payments" disabled={!hasSupplier || !(parseFloat(form.amount) > 0)}>Plan de Pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="quote" className="space-y-4 mt-4">
            {!quoteFile ? (
              <div className="space-y-1.5">
                <Label htmlFor="oc-request-quote-file">Presupuesto / Cotización *</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild className="cursor-pointer">
                    <label htmlFor="oc-request-quote-file" className="flex items-center gap-1.5">
                      <FileUp className="h-3.5 w-3.5" />
                      Elegir archivo
                    </label>
                  </Button>
                  <span className="text-sm text-muted-foreground truncate">Ningún archivo seleccionado</span>
                </div>
                <p className="text-[11px] text-muted-foreground">PDF, JPEG, PNG, Excel o Word. Se guarda en la carpeta "Cotizaciones" del repositorio del contrato.</p>
                <input
                  id="oc-request-quote-file"
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  onChange={(e) => handleQuoteFileChange(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                {previewKindOf(quoteFile.name) === "pdf" && quotePreviewUrl && (
                  <iframe src={quotePreviewUrl} title="Previsualización del presupuesto" className="w-full h-[24rem] rounded-md border" />
                )}
                {previewKindOf(quoteFile.name) === "image" && quotePreviewUrl && (
                  <img
                    src={quotePreviewUrl}
                    alt="Previsualización del presupuesto"
                    className="w-full h-[24rem] rounded-md border object-contain bg-muted/30"
                  />
                )}
                {previewKindOf(quoteFile.name) === "none" && (
                  <div className="w-full h-[24rem] rounded-md border flex flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
                    <FileText className="h-10 w-10" />
                    <span className="text-xs">Sin previsualización disponible para este tipo de archivo</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground truncate">{quoteFile.name}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuoteFile(null);
                      setQuotePreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
                    }}
                  >
                    Reemplazar archivo
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setActiveTab("lines")}>Atrás</Button>
              <Button onClick={() => setActiveTab("basic")} disabled={!quoteFile} className="flex-1">
                Continuar a Datos Básicos
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="basic" className="space-y-4 mt-4">
            {/* Admin template (if configured) */}
            {templateUrl && (
              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Formulario Institucional</span>
                  </div>
                  <Button variant="outline" size="sm" asChild className="gap-1">
                    <a href={templateUrl} download={templateFileName} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3 w-3" />
                      Descargar
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {/* Orden(es) CO del proyecto (solo CAPEX, definidas por el admin en Editar contrato) */}
            {requestCoNumbers && (
              <div className="space-y-1">
                <Label>ORDEN CO</Label>
                <Input value={requestCoNumbers} readOnly disabled />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Textarea
                value={form.description}
                onChange={(e) => {
                  setDescriptionIsAuto(false);
                  setForm(prev => ({ ...prev, description: e.target.value }));
                }}
                placeholder="Titulo"
                rows={2}
              />
            </div>

            {/* Amount - always shown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm(prev => ({ ...prev, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">$</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Show equivalent */}
            {parseFloat(form.amount) > 0 && ufValue > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {form.currency === "CLP" ? (
                  <>
                    <p className="font-medium text-foreground">$ {Math.round(parseFloat(form.amount)).toLocaleString("es-CL")}</p>
                    <p>Equivalente: UF {(parseFloat(form.amount) / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-foreground">$ {Math.round(parseFloat(form.amount) * ufValue).toLocaleString("es-CL")}</p>
                    <p>Ingresado: UF {parseFloat(form.amount).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </>
                )}
              </div>
            )}

            {/* Supplier */}
            <div className="space-y-2">
              <Label>Proveedor *</Label>
              <SupplierSelect
                value={form.supplier_id}
                supplierName={form.supplier_name}
                onChange={handleSupplierChange}
              />
            </div>

            {cebeMixed && (
              <CebeDistributionEditor
                cebes={cebes}
                rows={dist.rows}
                totalClp={docTotalClp}
                onEdit={dist.edit}
                check={dist.check}
              />
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setActiveTab("quote")}>Atrás</Button>
              <Button
                onClick={() => setActiveTab("payments")}
                disabled={!hasSupplier || !(parseFloat(form.amount) > 0) || cebesLoading || (cebeMixed && !dist.check.valid)}
                className="flex-1"
              >
                Continuar a Plan de Pagos
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="lines" className="space-y-4 mt-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useMultipleLines"
                checked={useMultipleLines}
                onChange={(e) => setUseMultipleLines(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="useMultipleLines" className="cursor-pointer">
                Asignar a múltiples líneas de presupuesto
              </Label>
            </div>

            {useMultipleLines ? (
              <MultipleLinesSelector
                budgetId={budgetId}
                selectedLines={selectedLines}
                onSelectionChange={setSelectedLines}
                formatUF={formatUF}
                formatCLP={formatCLP}
                ufValue={ufValue}
              />
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                La solicitud se asignará a la línea: <strong>{lineName}</strong>
                <p className="text-xs mt-1">Active la opción de múltiples líneas para seleccionar otras.</p>
              </div>
            )}

            <Button onClick={() => setActiveTab("quote")} className="w-full">
              Continuar a Adjuntar Presupuesto
            </Button>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4 mt-4">
            <PaymentPlanEditor
              items={paymentPlan}
              onChange={setPaymentPlan}
              total={Math.round(totalClpForPayments)}
              currency="CLP"
              ufValue={ufValue}
              newItem={(i) => ({ description: `Pago ${i + 1}`, amount: "", percent: "", due_date: "", input_mode: "amount" })}
              cebeBreakdown={cebeMixed ? { distribution: dist.rows, cebes, totalClp: docTotalClp } : undefined}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={requestClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createDisabled}
            title={!quoteFile ? "Adjunta el presupuesto antes de crear la solicitud" : paymentPlan.length === 0 ? "Agrega al menos un pago al plan de pagos" : cebeMixed && !dist.check.valid ? "Completa la distribución por CEBE" : undefined}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear Solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ShareOCRequestDialog
      open={!!shareData}
      onOpenChange={(o) => { if (!o) setShareData(null); }}
      data={shareData}
      requestId={shareRequestId}
    />
    </>
  );
};
