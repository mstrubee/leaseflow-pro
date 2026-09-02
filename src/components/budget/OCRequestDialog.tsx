import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveFileUrl } from "@/lib/storageUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { MultipleLinesSelector } from "./MultipleLinesSelector";
import { ShareOCRequestDialog } from "./ShareOCRequestDialog";
import { OCRequestShareData, validatePaymentPlanTotal } from "@/lib/ocRequestShare";

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
  input_mode: "clp" | "percent" | "balance";
}

interface OCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
  contractCebe?: string | null;
  budgetId: string;
  budgetLineId: string;
  lineName: string;
  lineAvailable: number;
  lineBudget: number;
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
  budgetId,
  budgetLineId,
  lineName,
  lineAvailable,
  lineBudget,
  year,
  ufValue,
  formatUF,
  onSuccess
}: OCRequestDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({
    description: "",
    amount: "",
    currency: "CLP",
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [useMultipleLines, setUseMultipleLines] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateFileName, setTemplateName] = useState<string | null>(null);
  const [shareData, setShareData] = useState<OCRequestShareData | null>(null);
  const [shareRequestId, setShareRequestId] = useState<string | undefined>(undefined);
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
        supplier_id: null,
        supplier_name: null
      });
      setSelectedLines([{ lineId: budgetLineId, lineName, amount: 0, maxAmount: lineAvailable }]);
      setUseMultipleLines(false);
      setPaymentPlan([]);
      setActiveTab("basic");
    }
  }, [open, lineName, budgetLineId, lineAvailable]);

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

  /** Resuelve cada línea del plan de pagos a un monto CLP concreto — misma
   *  lógica que se usaba solo al insertar, extraída para poder validar el
   *  total ANTES de crear nada y para reutilizarla en el PDF de la Solicitud. */
  const resolvePaymentPlan = (amountClp: number) => {
    return paymentPlan
      .map((p, idx) => {
        let resolvedClp = 0;
        if (p.input_mode === "balance") {
          const previousSum = paymentPlan.slice(0, idx).reduce((sum, prev) => {
            if (prev.input_mode === "percent") return sum + (amountClp * (parseFloat(prev.amount) || 0) / 100);
            if (prev.input_mode === "balance") return sum;
            return sum + (parseFloat(prev.amount) || 0);
          }, 0);
          resolvedClp = amountClp - previousSum;
        } else if (p.input_mode === "percent") {
          resolvedClp = amountClp * (parseFloat(p.amount) || 0) / 100;
        } else {
          resolvedClp = parseFloat(p.amount) || 0;
        }
        return {
          description: p.description || `Pago ${idx + 1}`,
          amountClp: Math.round(resolvedClp),
          dueDate: p.due_date || null,
        };
      })
      .filter((e) => e.amountClp > 0);
  };

  const handleCreate = async () => {
    if (!form.supplier_id) {
      toast({ variant: "destructive", title: "Error", description: "Seleccione un proveedor" });
      return;
    }

    if (paymentPlan.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Debe agregar al menos un pago al plan de pagos" });
      return;
    }

    // Amount is always entered in basic tab
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }
    
    // Convert to UF if entered in CLP
    let totalAmountUf = form.currency === "CLP" && ufValue > 0 ? amount / ufValue : amount;
    
    // Get line names for the request number
    let lineNamesForNumber: string[] = [];
    if (useMultipleLines) {
      const validLines = selectedLines.filter(l => l.lineId);
      if (validLines.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "Seleccione al menos una línea de presupuesto" });
        return;
      }
      lineNamesForNumber = validLines.map(l => l.lineName);
    } else {
      lineNamesForNumber = [lineName];
      
      // Validate against available (only for single line mode)
      if (totalAmountUf > lineAvailable + 0.01) {
        toast({ 
          variant: "destructive", 
          title: "Monto excede disponible", 
          description: `El monto ($${Math.round(totalAmountUf * ufValue).toLocaleString("es-CL")}) supera el disponible ($${Math.round(lineAvailable * ufValue).toLocaleString("es-CL")})` 
        });
        return;
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
      return;
    }

    setLoading(true);
    try {
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
        created_by: user?.id
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

      toast({ title: "Solicitud creada", description: "Solicitud creada exitosamente" });
      onOpenChange(false);
      onSuccess?.();

      // Se ofrece compartir recién creada, con los mismos datos que se acaban
      // de guardar — así el PDF y lo que quedó en la base nunca se desalinean.
      setShareData({
        requestDate: new Date().toISOString().split("T")[0],
        currency: form.currency as "UF" | "CLP",
        contractNames: [contractName],
        description: form.description,
        lines: useMultipleLines
          ? selectedLines.filter((l) => l.amount > 0).map((l) => ({
              lineName: l.lineName,
              amountClp: Math.round(l.amount * ufValue),
            }))
          : [{ lineName, amountClp }],
        totalAmountClp: amountClp,
        payments: resolvedPayments,
        supplierName: form.supplier_name,
        sequenceNumber: requestData?.sequence_number,
      });
      setShareRequestId(requestData?.id);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierChange = (supplierId: string | null, supplierName: string | null) => {
    setForm(prev => ({ ...prev, supplier_id: supplierId, supplier_name: supplierName }));
  };

  const addPaymentItem = () => {
    setPaymentPlan(prev => [...prev, { description: `Pago ${prev.length + 1}`, amount: "", due_date: "", input_mode: "clp" }]);
  };

  const removePaymentItem = (index: number) => {
    setPaymentPlan(prev => prev.filter((_, i) => i !== index));
  };

  const updatePaymentItem = (index: number, field: keyof PaymentPlanItem, value: string) => {
    setPaymentPlan(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const resolvePaymentClp = (item: PaymentPlanItem, idx: number): number => {
    const totalClp = form.currency === "CLP" ? (parseFloat(form.amount) || 0) : (parseFloat(form.amount) || 0) * ufValue;
    if (item.input_mode === "percent") return totalClp * (parseFloat(item.amount) || 0) / 100;
    if (item.input_mode === "balance") {
      const prevSum = paymentPlan.slice(0, idx).reduce((s, p, i) => s + resolvePaymentClp(p, i), 0);
      return Math.max(0, totalClp - prevSum);
    }
    return parseFloat(item.amount) || 0;
  };

  const totalPlanned = paymentPlan.reduce((sum, p, idx) => sum + resolvePaymentClp(p, idx), 0);
  const totalClpForPayments = form.currency === "CLP" ? (parseFloat(form.amount) || 0) : (parseFloat(form.amount) || 0) * ufValue;
  // Amount is always from the form
  const currentTotal = form.currency === "CLP" && ufValue > 0 
    ? (parseFloat(form.amount) || 0) / ufValue 
    : parseFloat(form.amount) || 0;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Solicitud de OC</DialogTitle>
          <DialogDescription>
            Proyecto: <strong>{contractName}</strong>
            {contractCebe && <span className="ml-2 text-xs">CEBE: {contractCebe}</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
            <TabsTrigger value="lines">Líneas de Presupuesto</TabsTrigger>
            <TabsTrigger value="payments">Plan de Pagos</TabsTrigger>
          </TabsList>

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

            {/* Description */}
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
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
                onChange={handleSupplierChange}
              />
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
              />
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                La solicitud se asignará a la línea: <strong>{lineName}</strong>
                <p className="text-xs mt-1">Active la opción de múltiples líneas para seleccionar otras.</p>
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
                {paymentPlan.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updatePaymentItem(idx, "description", e.target.value)}
                        placeholder={`Pago ${idx + 1}`}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={item.input_mode}
                        onValueChange={(v) => {
                          setPaymentPlan(prev => prev.map((p, i) => i === idx ? { ...p, input_mode: v as "clp" | "percent" | "balance", amount: v === "balance" ? "" : p.amount } : p));
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clp">$ Monto</SelectItem>
                          <SelectItem value="percent">% del Total</SelectItem>
                          {idx > 0 && <SelectItem value="balance">Saldo</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">
                        {item.input_mode === "percent" ? "Porcentaje" : "Monto ($)"}
                      </Label>
                      {item.input_mode === "balance" ? (
                        <div className="h-9 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-mono">
                          $ {Math.round(resolvePaymentClp(item, idx)).toLocaleString("es-CL")}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updatePaymentItem(idx, "amount", e.target.value)}
                          placeholder={item.input_mode === "percent" ? "0-100" : "0"}
                          min="0"
                          max={item.input_mode === "percent" ? "100" : undefined}
                        />
                      )}
                      {/* Equivalency display */}
                      {(() => {
                        const resolved = resolvePaymentClp(item, idx);
                        if (resolved > 0 && ufValue > 0) {
                          return (
                            <p className="text-[10px] text-muted-foreground">
                              {item.input_mode === "percent" && `= $ ${Math.round(resolved).toLocaleString("es-CL")} · `}
                              ≈ UF {(resolved / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Vencimiento</Label>
                      <Input
                        type="date"
                        value={item.due_date}
                        onChange={(e) => updatePaymentItem(idx, "due_date", e.target.value)}
                      />
                    </div>
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
                ))}

                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total planificado:</span>
                    <span className={`font-medium ${totalPlanned > totalClpForPayments + 1 ? 'text-destructive' : ''}`}>
                      $ {Math.round(totalPlanned).toLocaleString("es-CL")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total solicitud:</span>
                    <span className="font-medium">$ {Math.round(totalClpForPayments).toLocaleString("es-CL")}</span>
                  </div>
                  {totalPlanned > totalClpForPayments + 1 && (
                    <p className="text-xs text-destructive mt-1">
                      El plan de pagos excede el monto de la solicitud
                    </p>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={loading || paymentPlan.length === 0} title={paymentPlan.length === 0 ? "Agrega al menos un pago al plan de pagos" : undefined}>
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
