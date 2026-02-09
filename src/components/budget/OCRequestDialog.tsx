import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { MultipleLinesSelector } from "./MultipleLinesSelector";
import { generateOCRequestTemplate, parseOCRequestExcel } from "@/lib/generateOCRequestTemplate";

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
    currency: "UF",
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);
  const [useMultipleLines, setUseMultipleLines] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateFileName, setTemplateName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const { data: urlData } = supabase.storage
          .from("repository-files")
          .getPublicUrl(data.file_path);
        setTemplateUrl(urlData?.publicUrl || null);
        setTemplateName(data.file_name);
      }
    };
    if (open) {
      loadTemplate();
      setForm({
        description: lineName,
        amount: "",
        currency: "UF",
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

  const handleCreate = async () => {
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
          description: `El monto (${formatUF(totalAmountUf)}) supera el disponible (${formatUF(lineAvailable)})` 
        });
        return;
      }
    }

    // Round to 4 decimal places to avoid floating point issues
    totalAmountUf = Math.round(totalAmountUf * 10000) / 10000;
    
    // Calculate CLP equivalent (round to integer)
    const amountClp = Math.round(totalAmountUf * ufValue);

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
        if (paymentPlan.length > 0) {
          const planEntries = paymentPlan
            .filter(p => parseFloat(p.amount) > 0)
            .map((p, idx) => ({
              oc_request_id: requestData.id,
              payment_number: idx + 1,
              description: p.description || `Pago ${idx + 1}`,
              amount_uf: parseFloat(p.amount),
              due_date: p.due_date || null,
              status: "pending"
            }));

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
            due_date: null,
            status: "pending"
          });
        }
      }

      toast({ title: "Solicitud creada", description: `Solicitud ${number} creada exitosamente` });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierChange = (supplierId: string | null, supplierName: string | null) => {
    setForm(prev => ({ ...prev, supplier_id: supplierId, supplier_name: supplierName }));
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const parsed = await parseOCRequestExcel(file);
      
      setForm(prev => ({
        ...prev,
        description: parsed.description || prev.description,
        amount: parsed.amount > 0 ? String(parsed.amount) : prev.amount,
        currency: parsed.currency,
        supplier_name: parsed.supplier_name || prev.supplier_name,
      }));

      if (parsed.paymentPlan.length > 0) {
        setPaymentPlan(parsed.paymentPlan.map(p => ({
          description: p.description,
          amount: p.amount > 0 ? String(p.amount) : "",
          due_date: p.due_date,
        })));
      }

      toast({ title: "Datos importados", description: "Los campos se han completado con los datos del archivo" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al importar", description: error.message });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

  const totalPlanned = paymentPlan.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  // Amount is always from the form
  const currentTotal = form.currency === "CLP" && ufValue > 0 
    ? (parseFloat(form.amount) || 0) / ufValue 
    : parseFloat(form.amount) || 0;

  return (
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
            {/* Template download & upload */}
            <div className="p-3 rounded-md bg-muted/50 border space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Plantilla de Solicitud</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1"
                    onClick={() => generateOCRequestTemplate(contractName, lineName)}
                  >
                    <Download className="h-3 w-3" />
                    Descargar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    Importar
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Descargue la plantilla, complétela y luego impórtela para llenar los campos automáticamente.
              </p>
            </div>

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
              <Label>Descripción</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descripción de la solicitud"
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
              <p className="text-xs text-muted-foreground">
                Equivalente: {form.currency === "CLP" 
                  ? `UF ${(parseFloat(form.amount) / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$ ${Math.round(parseFloat(form.amount) * ufValue).toLocaleString("es-CL")}`
                }
              </p>
            )}

            {/* Supplier */}
            <div className="space-y-2">
              <Label>Proveedor (opcional)</Label>
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
              <Label>Plan de Pagos (opcional)</Label>
              <Button size="sm" variant="outline" onClick={addPaymentItem} className="gap-1">
                <Plus className="h-3 w-3" />
                Agregar Pago
              </Button>
            </div>

            {paymentPlan.length === 0 ? (
              <div className="p-4 bg-muted/30 rounded-lg text-center text-sm text-muted-foreground">
                <p>No hay pagos planificados.</p>
                <p className="text-xs mt-1">Se asumirá un pago único por el total de la solicitud.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentPlan.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updatePaymentItem(idx, "description", e.target.value)}
                        placeholder={`Pago ${idx + 1}`}
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Monto (UF)</Label>
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updatePaymentItem(idx, "amount", e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Vencimiento (opcional)</Label>
                      <Input
                        type="date"
                        value={item.due_date}
                        onChange={(e) => updatePaymentItem(idx, "due_date", e.target.value)}
                        placeholder="Sin fecha"
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
                    <span className={`font-medium ${totalPlanned > currentTotal ? 'text-destructive' : ''}`}>
                      {formatUF(totalPlanned)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total solicitud:</span>
                    <span className="font-medium">{formatUF(currentTotal)}</span>
                  </div>
                  {totalPlanned > currentTotal && (
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
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear Solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
