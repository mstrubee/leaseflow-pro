import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MultipleLinesSelector } from "./MultipleLinesSelector";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { ShareOCRequestDialog } from "./ShareOCRequestDialog";
import { OCRequestShareData, buildShareLines, validatePaymentPlanTotal } from "@/lib/ocRequestShare";
import type { parseOCRequestExcel } from "@/lib/generateOCRequestTemplate";

interface SelectedLine {
  lineId: string;
  lineName: string;
  amount: number;
  maxAmount: number;
}

interface PaymentPlanItem {
  description: string;
  amount: string;
  due_date: string;
}

/** Prellenado al convertir un Requerimiento de OC (oc_quotations) en
 *  Solicitud de OC: abre el diálogo de "Nueva Solicitud" con las
 *  líneas/monto/archivo/proveedor/plan de pagos del requerimiento ya cargados.
 *  Las líneas quedan fijas. */
export interface OCRequestPrefillDraft {
  quotationNumber: string;
  lines: { lineId: string; lineName: string; amountUf: number }[];
  totalAmountClp: number;
  fileUrl: string | null;
  fileName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  paymentPlan: PaymentPlanItem[];
}

type ParsedOCRequestExcel = Awaited<ReturnType<typeof parseOCRequestExcel>>;

/** Métodos que el padre puede invocar sobre el diálogo (botón "Nueva Solicitud"
 *  e importación desde Excel en OCRequestsList). */
export interface OCRequestCreateDialogHandle {
  openNew: () => Promise<void>;
  openFromImport: (parsed: ParsedOCRequestExcel) => Promise<void>;
}

interface OCRequestCreateDialogProps {
  contractId: string;
  contractName?: string;
  contractCebe?: string | null;
  year: number;
  ufValue: number;
  formatUF: (value: number) => string;
  formatCLP: (value: number) => string;
  prefillDraft?: OCRequestPrefillDraft | null;
  onPrefillConsumed?: () => void;
  /** Se invoca una vez creada la solicitud (el padre recarga sus datos). */
  onCreated?: () => void;
}

/**
 * Diálogo "Nueva Solicitud de OC" de un contrato (tipo/datos, líneas, plan de
 * pagos) más la ventana de compartir/PDF posterior. Extraído de
 * OCRequestsList para poder abrirlo también desde /purchase-orders al pasar un
 * Requerimiento de OC a Solicitud, sin duplicar la lógica de creación.
 */
export const OCRequestCreateDialog = forwardRef<OCRequestCreateDialogHandle, OCRequestCreateDialogProps>(function OCRequestCreateDialog({
  contractId,
  contractName = "",
  contractCebe = null,
  year,
  ufValue,
  formatUF,
  formatCLP,
  prefillDraft,
  onPrefillConsumed,
  onCreated,
}, ref) {
  const { toast } = useToast();
  // New request dialog state
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [newRequestTab, setNewRequestTab] = useState("basic");
  const [budgetType, setBudgetType] = useState<"capex" | "opex">("capex");
  const [availableBudgets, setAvailableBudgets] = useState<{ id: string; type: string; hasLines: boolean }[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
  const [newRequestForm, setNewRequestForm] = useState({
    description: "",
    amount: "",
    currency: "CLP" as "UF" | "CLP",
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  // Al convertir una "OC Requerida" en Solicitud (ver OCRequiredList.tsx):
  // archivo a transferir y quotation_number de origen, para marcarlo
  // "Convertida" una vez creada la solicitud.
  const [prefillFile, setPrefillFile] = useState<{ url: string | null; name: string | null }>({ url: null, name: null });
  const [conversionQuotationNumber, setConversionQuotationNumber] = useState<string | null>(null);
  // Al convertir, las líneas quedan fijas a las que ya traía el requerimiento
  // -- no se puede agregar ni quitar ninguna (a diferencia de una solicitud
  // creada desde cero).
  const [linesLocked, setLinesLocked] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [shareData, setShareData] = useState<OCRequestShareData | null>(null);
  const [shareRequestId, setShareRequestId] = useState<string | undefined>(undefined);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [projectName, setProjectName] = useState(contractName);

  // Load available budgets when opening new request dialog
  const handleOpenNewRequestDialog = async () => {
    setShowNewRequestDialog(true);
    setNewRequestTab("basic");
    setBudgetType("capex");
    setSelectedLines([]);
    setPaymentPlan([]);
    setCancelConfirm(false);
    setNewRequestForm({ description: "", amount: "", currency: "CLP", supplier_id: null, supplier_name: null });
    setPrefillFile({ url: null, name: null });
    setConversionQuotationNumber(null);
    setLinesLocked(false);
    setLoadingBudgets(true);

    try {
      // Round 1 — all independent queries fire in parallel
      // Note: is_closed filter intentionally omitted so lines from closed budgets
      // remain accessible for OC request creation (budget closing ≠ line removal).
      const [
        contractResult,
        capexBudgetsResult,
        opexMasterResult,
        opexContractResult
      ] = await Promise.all([
        !projectName
          ? supabase.from("contracts").select("name").eq("id", contractId).single()
          : Promise.resolve(null),
        supabase.from("contract_budgets")
          .select("id")
          .eq("contract_id", contractId)
          .eq("year", year)
          .eq("budget_type", "capex"),
        supabase.from("opex_master_budget")
          .select("*", { count: "exact", head: true })
          .eq("year", year),
        supabase.from("contract_budgets")
          .select("id")
          .eq("contract_id", contractId)
          .eq("year", year)
          .eq("budget_type", "opex")
          .maybeSingle()
      ]);

      if (contractResult?.data) setProjectName((contractResult.data as any).name);

      const capexBudgets = capexBudgetsResult.data || [];
      const hasOpexMaster = (opexMasterResult.count || 0) > 0;
      const opexContractBudget = (opexContractResult as any)?.data ?? null;

      // Build the list of budget IDs to check for lines
      const countTargets: Array<{ id: string; type: "capex" | "opex" }> = [
        ...capexBudgets.map(b => ({ id: b.id, type: "capex" as const })),
        ...(opexContractBudget ? [{ id: opexContractBudget.id, type: "opex" as const }] : [])
      ];

      // Round 2 — line-count queries for all budgets in parallel (replaces the N+1 serial loop)
      const lineCounts = await Promise.all(
        countTargets.map(t =>
          supabase
            .from("budget_lines")
            .select("*", { count: "exact", head: true })
            .eq("budget_id", t.id)
            .eq("status", "autorizado")
        )
      );

      const budgetsWithLines: { id: string; type: string; hasLines: boolean }[] = [];
      countTargets.forEach((t, i) => {
        budgetsWithLines.push({ id: t.id, type: t.type, hasLines: (lineCounts[i].count || 0) > 0 });
      });

      // Fall back to centralised OPEX master when no contract-specific OPEX budget
      if (!opexContractBudget && hasOpexMaster) {
        budgetsWithLines.push({ id: "opex_master", type: "opex", hasLines: true });
      }

      setAvailableBudgets(budgetsWithLines);

      // Auto-select first available budget
      const firstWithLines = budgetsWithLines.find(b => b.hasLines);
      if (firstWithLines) {
        setBudgetType(firstWithLines.type as "capex" | "opex");
        setSelectedBudgetId(firstWithLines.id);
      }
    } catch (error) {
      console.error("Error loading budgets:", error);
    } finally {
      setLoadingBudgets(false);
    }
  };

  const handleBudgetTypeChange = (type: "capex" | "opex") => {
    setBudgetType(type);
    setSelectedLines([]);
    const budget = availableBudgets.find(b => b.type === type);
    setSelectedBudgetId(budget?.id || "");
  };

  // Llega un draft desde "Convertir a Solicitud" en OCRequiredList: abre el
  // diálogo de siempre y lo prellena por completo (líneas, monto, archivo,
  // proveedor y plan de pagos ya vienen del requerimiento) -- las líneas
  // quedan fijas, no se pueden agregar ni quitar.
  useEffect(() => {
    if (!prefillDraft) return;
    (async () => {
      await handleOpenNewRequestDialog();
      setSelectedLines(
        prefillDraft.lines.map((l) => ({
          lineId: l.lineId,
          lineName: l.lineName,
          amount: l.amountUf,
          maxAmount: l.amountUf,
        }))
      );
      setNewRequestForm((prev) => ({
        ...prev,
        amount: String(Math.round(prefillDraft.totalAmountClp)),
        currency: "CLP",
        supplier_id: prefillDraft.supplierId,
        supplier_name: prefillDraft.supplierName,
      }));
      setPaymentPlan(prefillDraft.paymentPlan);
      setPrefillFile({ url: prefillDraft.fileUrl, name: prefillDraft.fileName });
      setConversionQuotationNumber(prefillDraft.quotationNumber);
      setLinesLocked(true);
      onPrefillConsumed?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillDraft]);

  const addPaymentItem = () => {
    setPaymentPlan(prev => [...prev, { description: `Pago ${prev.length + 1}`, amount: "", due_date: "" }]);
  };

  const removePaymentItem = (index: number) => {
    setPaymentPlan(prev => prev.filter((_, i) => i !== index));
  };

  const updatePaymentItem = (index: number, field: keyof PaymentPlanItem, value: string) => {
    setPaymentPlan(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const generateRequestNumber = async (lineNames: string[]): Promise<{ number: string; correlative: number }> => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '.');
    
    const { count } = await supabase
      .from("oc_requests")
      .select("*", { count: "exact", head: true })
      .eq("request_date", today.toISOString().split('T')[0]);
    
    const correlative = (count || 0) + 1;
    const correlativeStr = correlative.toString().padStart(3, '0');
    
    const cleanLineNames = lineNames.map(name => 
      name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_')
    ).join('+').substring(0, 60);
    
    const cleanProjectName = projectName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 30);
    
    return { number: `${dateStr}_${correlativeStr}_${cleanLineNames}_${cleanProjectName}`, correlative };
  };

  const handleCreateNewRequest = async () => {
    // Validate amount from form
    const enteredAmount = parseFloat(newRequestForm.amount) || 0;
    if (enteredAmount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }

    // Supplier is required
    if (!newRequestForm.supplier_id) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un proveedor" });
      return;
    }

    if (paymentPlan.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Debe agregar al menos un pago al plan de pagos" });
      return;
    }

    const validLines = selectedLines.filter(l => l.lineId);
    if (validLines.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: budgetType === "opex" ? "Seleccione al menos una categoría OPEX" : "Seleccione al menos una línea de imputación"
      });
      return;
    }

    // Use provided UF value or fallback
    const currentUfValue = ufValue > 0 ? ufValue : 38000;
    
    // Convert amount based on currency and budget type
    // OPEX always works in CLP, CAPEX can be UF or CLP
    let totalAmountUf: number;
    let totalAmountClp: number;
    const inputCurrency = newRequestForm.currency;
    
    if (inputCurrency === "CLP") {
      totalAmountClp = Math.round(enteredAmount);
      totalAmountUf = Math.round((enteredAmount / currentUfValue) * 10000) / 10000;
    } else {
      // UF
      totalAmountUf = Math.round(enteredAmount * 10000) / 10000;
      totalAmountClp = Math.round(enteredAmount * currentUfValue);
    }

    // El plan de pagos debe sumar EXACTO el monto solicitado, no solo "no
    // superarlo": un plan incompleto dejaría un pago sin registrar. Se
    // convierte a CLP antes de comparar — si la moneda es UF, comparar los
    // montos crudos con una tolerancia de "1 peso" habría sido inútil (1 UF
    // son ~$38.000).
    if (paymentPlan.length > 0) {
      const resolvedPaymentsClp = paymentPlan.map((p) => {
        const raw = parseFloat(p.amount) || 0;
        return inputCurrency === "CLP" ? Math.round(raw) : Math.round(raw * currentUfValue);
      });
      const planError = validatePaymentPlanTotal(resolvedPaymentsClp, totalAmountClp);
      if (planError) {
        toast({ variant: "destructive", title: "Plan de pagos inconsistente", description: `${planError} Usa "Cuadrar" para ajustar.` });
        return;
      }
    }

    const lineNames = validLines.map(l => l.lineName);
    const displayLineName = lineNames.join(' + ');

    setCreatingRequest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { number, correlative } = await generateRequestNumber(lineNames);

      // For OPEX master, budget_id is "opex_master" - we need to handle this
      const isOpexMaster = selectedBudgetId === "opex_master";
      
      // Create request
      const { data: requestData, error } = await supabase.from("oc_requests").insert({
        contract_id: contractId,
        budget_id: isOpexMaster ? null : selectedBudgetId,
        budget_line_id: validLines.length === 1 && !isOpexMaster ? validLines[0].lineId : null,
        opex_master_id: isOpexMaster && validLines.length === 1 ? validLines[0].lineId : null,
        request_number: number,
        correlative_of_day: correlative,
        request_date: new Date().toISOString().split('T')[0],
        line_name: displayLineName,
        project_name: projectName,
        description: newRequestForm.description,
        amount_uf: totalAmountUf,
        amount_clp: totalAmountClp,
        input_currency: inputCurrency,
        uf_value_at_entry: currentUfValue,
        supplier_id: newRequestForm.supplier_id,
        supplier_name: newRequestForm.supplier_name,
        year: year,
        status: "pending",
        created_by: user?.id,
        quotation_url: prefillFile.url,
        quotation_file_name: prefillFile.name,
      }).select().single();

      if (error) throw error;

      // Viene de "Convertir a Solicitud" en OCRequiredList -- marca el
      // requerimiento de origen como convertido. Si esto falla la solicitud
      // igual queda creada, pero sin este vínculo no se podrá "Revertir" más
      // adelante -- de ahí que se registre y avise en vez de ignorarlo.
      if (requestData && conversionQuotationNumber) {
        const { error: linkError } = await supabase
          .from("oc_requests")
          .update({ source_quotation_number: conversionQuotationNumber } as any)
          .eq("id", requestData.id);
        if (linkError) {
          console.error("Error al vincular la solicitud con su Requerimiento de origen:", linkError);
          toast({
            variant: "destructive",
            title: "Solicitud creada con advertencia",
            description: "No se pudo vincular con el Requerimiento de OC de origen; no podrá revertirse más adelante.",
          });
        }
      }

      // Create budget line assignments
      if (requestData) {
        const lineAssignments = validLines.map(l => ({
          oc_request_id: requestData.id,
          budget_line_id: l.lineId,
          amount_uf: l.amount
        }));
        await supabase.from("oc_budget_lines").insert(lineAssignments);

        // Create payment plans
        if (paymentPlan.length > 0) {
          const planEntries = paymentPlan
            .filter(p => parseFloat(p.amount) > 0)
            .map((p, idx) => {
              const pAmount = parseFloat(p.amount);
              const amountUf = inputCurrency === "CLP" && currentUfValue > 0
                ? Math.round((pAmount / currentUfValue) * 10000) / 10000
                : pAmount;
              const amountClp = inputCurrency === "CLP" ? Math.round(pAmount) : Math.round(pAmount * currentUfValue);
              return {
                oc_request_id: requestData.id,
                payment_number: idx + 1,
                description: p.description || `Pago ${idx + 1}`,
                amount_uf: amountUf,
                amount_clp: amountClp,
                due_date: p.due_date || null,
                status: "pending"
              };
            });
          if (planEntries.length > 0) {
            await supabase.from("oc_payment_plans").insert(planEntries);
          }
        } else {
          // No payment plan defined - assume single payment with full amount
          await supabase.from("oc_payment_plans").insert({
            oc_request_id: requestData.id,
            payment_number: 1,
            description: "Pago único",
            amount_uf: totalAmountUf,
            amount_clp: totalAmountClp,
            due_date: null,
            status: "pending"
          });
        }
      }

      toast({ title: "Solicitud creada", description: "Solicitud creada exitosamente" });
      setShowNewRequestDialog(false);
      setPrefillFile({ url: null, name: null });
      setConversionQuotationNumber(null);
      onCreated?.();

      let supplierRut: string | null = null;
      if (newRequestForm.supplier_id) {
        const { data: supplierData } = await supabase
          .from("suppliers")
          .select("rut")
          .eq("id", newRequestForm.supplier_id)
          .single();
        supplierRut = supplierData?.rut || null;
      }

      setShareData({
        requestDate: new Date().toISOString().split("T")[0],
        currency: inputCurrency as "UF" | "CLP",
        contractNames: [contractName || ""].filter(Boolean),
        contractCebe,
        description: newRequestForm.description,
        lines: buildShareLines(validLines, {
          totalAmountClp,
          amountsInClp: selectedBudgetId === "opex_master",
          ufValue: currentUfValue,
        }),
        totalAmountClp,
        sequenceNumber: requestData?.sequence_number,
        requestId: requestData?.id,
        verificationCode: (requestData as any)?.verification_code,
        payments: paymentPlan
          .filter((p) => parseFloat(p.amount) > 0)
          .map((p) => ({
            description: p.description || "Pago",
            amountClp: inputCurrency === "CLP"
              ? Math.round(parseFloat(p.amount))
              : Math.round(parseFloat(p.amount) * currentUfValue),
            dueDate: p.due_date || null,
          })),
        supplierName: newRequestForm.supplier_name,
        supplierRut,
      });
      setShareRequestId(requestData?.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingRequest(false);
    }
  };

  const totalPlanned = paymentPlan.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  // totalSelected in same currency as form input
  const totalSelected = parseFloat(newRequestForm.amount) || 0;

  const capexBudget = availableBudgets.find(b => b.type === "capex");
  const opexBudget = availableBudgets.find(b => b.type === "opex");

  useImperativeHandle(ref, () => ({
    openNew: handleOpenNewRequestDialog,
    openFromImport: async (parsed: ParsedOCRequestExcel) => {
      await handleOpenNewRequestDialog();
      setNewRequestForm(prev => ({
        ...prev,
        description: parsed.description || prev.description,
        amount: parsed.amount > 0 ? String(parsed.amount) : prev.amount,
        currency: parsed.currency as "UF" | "CLP",
        supplier_name: parsed.supplier_name || prev.supplier_name,
      }));
      if (parsed.paymentPlan.length > 0) {
        setPaymentPlan(parsed.paymentPlan.map(p => ({
          description: p.description,
          amount: p.amount > 0 ? String(p.amount) : "",
          due_date: p.due_date,
        })));
      }
    },
  }));

  return (
    <>
      {/* New Request Dialog */}
      <Dialog
        open={showNewRequestDialog}
        onOpenChange={(open) => {
          // Any close trigger (backdrop click, Escape, X button) shows inline
          // confirmation instead of immediately closing the dialog.
          if (!open) setCancelConfirm(true);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Solicitud de OC{contractName ? `, ${contractName}` : ""}</DialogTitle>
            <DialogDescription>
              Crear solicitud para el año {year}
            </DialogDescription>
          </DialogHeader>

          {loadingBudgets ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : availableBudgets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay presupuestos disponibles para el año {year}.</p>
              <p className="text-sm mt-2">Cree un presupuesto CAPEX u OPEX primero.</p>
            </div>
          ) : (
            <Tabs value={newRequestTab} onValueChange={setNewRequestTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Tipo y Datos</TabsTrigger>
                <TabsTrigger value="lines" disabled={!selectedBudgetId}>
                  {budgetType === "opex" ? "Categoría OPEX" : "Líneas"}
                </TabsTrigger>
                <TabsTrigger value="payments" disabled={selectedLines.length === 0}>Pagos</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                {/* Budget Type Selection */}
                <div className="space-y-2">
                  <Label>Tipo de Presupuesto *</Label>
                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant={budgetType === "capex" ? "default" : "outline"}
                      onClick={() => handleBudgetTypeChange("capex")}
                      disabled={!capexBudget?.hasLines}
                      className="flex-1"
                    >
                      CAPEX
                      {capexBudget?.hasLines ? (
                        <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">Disponible</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">Sin líneas</Badge>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant={budgetType === "opex" ? "default" : "outline"}
                      onClick={() => handleBudgetTypeChange("opex")}
                      disabled={!opexBudget?.hasLines}
                      className="flex-1"
                    >
                      OPEX
                      {opexBudget?.hasLines ? (
                        <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">Disponible</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">Sin líneas</Badge>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label>Titulo</Label>
                  <Textarea
                    value={newRequestForm.description}
                    onChange={(e) => setNewRequestForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Titulo"
                    rows={2}
                  />
                </div>

                {/* Amount + Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Monto *</Label>
                    <Input
                      type="number"
                      value={newRequestForm.amount}
                      onChange={(e) => setNewRequestForm(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select 
                      value={newRequestForm.currency} 
                      onValueChange={(v: "UF" | "CLP") => setNewRequestForm(prev => ({ ...prev, currency: v }))}
                    >
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
                {parseFloat(newRequestForm.amount) > 0 && ufValue > 0 && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {newRequestForm.currency === "CLP" ? (
                      <>
                        <p className="font-medium text-foreground">$ {Math.round(parseFloat(newRequestForm.amount)).toLocaleString("es-CL")}</p>
                        <p>Equivalente: UF {(parseFloat(newRequestForm.amount) / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-foreground">$ {Math.round(parseFloat(newRequestForm.amount) * ufValue).toLocaleString("es-CL")}</p>
                        <p>Ingresado: UF {parseFloat(newRequestForm.amount).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </>
                    )}
                  </div>
                )}

                {/* Supplier */}
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <SupplierSelect
                    value={newRequestForm.supplier_id}
                    supplierName={newRequestForm.supplier_name}
                    onChange={(id, name) => setNewRequestForm(prev => ({
                      ...prev,
                      supplier_id: id,
                      supplier_name: name
                    }))}
                  />
                </div>

                {selectedBudgetId && (
                  <Button 
                    onClick={() => setNewRequestTab("lines")} 
                    className="w-full"
                  >
                    Continuar a Selección de Líneas
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="lines" className="space-y-4 mt-4">
                {linesLocked ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Estas líneas vienen del requerimiento de OC convertido y no se pueden modificar.
                    </p>
                    <div className="rounded-md border divide-y">
                      {selectedLines.map((l) => (
                        <div key={l.lineId} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="truncate">{l.lineName}</span>
                          <span className="text-muted-foreground shrink-0">
                            UF {l.amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  selectedBudgetId && (
                    <MultipleLinesSelector
                      budgetId={selectedBudgetId}
                      selectedLines={selectedLines}
                      onSelectionChange={setSelectedLines}
                      formatUF={formatUF}
                      formatCLP={formatCLP}
                      year={year}
                      contractId={contractId}
                      ufValue={ufValue}
                    />
                  )
                )}

                {selectedLines.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setNewRequestTab("basic")}>
                      Atrás
                    </Button>
                    <Button onClick={() => setNewRequestTab("payments")} className="flex-1">
                      Continuar a Plan de Pagos
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <Label>Plan de Pagos *</Label>
                  <Button size="sm" variant="outline" onClick={addPaymentItem} className="gap-1">
                    <Plus className="h-3 w-3" />
                    Agregar Pago
                  </Button>
                </div>

                {paymentPlan.length === 0 ? (
                  <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                    <p>No hay pagos planificados.</p>
                    <p className="text-xs mt-1">Debes agregar al menos un pago para poder crear la solicitud.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentPlan.map((item, idx) => {
                      const isLastRow = idx === paymentPlan.length - 1;
                      const showCuadrar = isLastRow && totalPlanned > totalSelected;
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                          <div className={`space-y-1 ${showCuadrar ? "col-span-3" : "col-span-4"}`}>
                            <Label className="text-xs">Descripción</Label>
                            <Input
                              value={item.description}
                              onChange={(e) => updatePaymentItem(idx, "description", e.target.value)}
                              placeholder={`Pago ${idx + 1}`}
                            />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Monto ({newRequestForm.currency})</Label>
                            <Input
                              type="number"
                              value={item.amount}
                              onChange={(e) => updatePaymentItem(idx, "amount", e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                            />
                          </div>
                          <div className={`space-y-1 ${showCuadrar ? "col-span-3" : "col-span-4"}`}>
                            <Label className="text-xs">Vencimiento (opcional)</Label>
                            <Input
                              type="date"
                              value={item.due_date}
                              onChange={(e) => updatePaymentItem(idx, "due_date", e.target.value)}
                            />
                          </div>
                          {showCuadrar && (
                            <div className="col-span-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-9 w-full text-xs"
                                title="Ajustar este pago para que el total no supere el monto de la solicitud"
                                onClick={() => {
                                  const otherSum = paymentPlan.slice(0, -1).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                                  const adjusted = Math.max(0, totalSelected - otherSum);
                                  updatePaymentItem(idx, "amount", adjusted.toFixed(2));
                                }}
                              >
                                Cuadrar
                              </Button>
                            </div>
                          )}
                          <div className="col-span-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePaymentItem(idx)}
                              className="h-9 w-9 text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total planificado:</span>
                        <div className="text-right">
                          <span className={`font-medium ${totalPlanned > totalSelected ? 'text-destructive' : ''}`}>
                            {newRequestForm.currency === "CLP" 
                              ? formatCLP(totalPlanned) 
                              : formatCLP(totalPlanned * (ufValue > 0 ? ufValue : 38000))}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            {newRequestForm.currency === "CLP" 
                              ? formatUF(ufValue > 0 ? totalPlanned / ufValue : 0)
                              : formatUF(totalPlanned)}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total solicitud:</span>
                        <div className="text-right">
                          <span className="font-medium">
                            {newRequestForm.currency === "CLP" 
                              ? formatCLP(totalSelected) 
                              : formatCLP(totalSelected * (ufValue > 0 ? ufValue : 38000))}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            {newRequestForm.currency === "CLP" 
                              ? formatUF(ufValue > 0 ? totalSelected / ufValue : 0)
                              : formatUF(totalSelected)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setNewRequestTab("lines")}>
                    Atrás
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            {cancelConfirm ? (
              <div className="flex items-center gap-3 w-full">
                <span className="text-sm text-muted-foreground flex-1">
                  ¿Cancelar y perder los datos ingresados?
                </span>
                <Button variant="outline" size="sm" onClick={() => setCancelConfirm(false)}>
                  No, volver
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setCancelConfirm(false);
                    setShowNewRequestDialog(false);
                  }}
                >
                  Sí, cancelar
                </Button>
              </div>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCancelConfirm(true)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateNewRequest}
                  disabled={
                    creatingRequest ||
                    selectedLines.length === 0 ||
                    availableBudgets.length === 0 ||
                    !newRequestForm.amount ||
                    parseFloat(newRequestForm.amount) <= 0 ||
                    !newRequestForm.supplier_id ||
                    paymentPlan.length === 0 ||
                    Math.abs(totalPlanned - totalSelected) > 0.01
                  }
                >
                  {creatingRequest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear Solicitud
                </Button>
              </>
            )}
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
});
