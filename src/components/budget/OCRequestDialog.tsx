import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";

interface OCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractName: string;
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
  const [form, setForm] = useState({
    description: "",
    amount: "",
    currency: "UF",
    supplier_id: null as string | null,
    supplier_name: null as string | null
  });
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [templateFileName, setTemplateName] = useState<string | null>(null);
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
    }
  }, [open, lineName]);

  const generateRequestNumber = async (): Promise<{ number: string; correlative: number }> => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '.');
    
    // Get count of requests for today to calculate correlative
    const { count } = await supabase
      .from("oc_requests")
      .select("*", { count: "exact", head: true })
      .eq("request_date", today.toISOString().split('T')[0]);
    
    const correlative = (count || 0) + 1;
    const correlativeStr = correlative.toString().padStart(3, '0');
    
    // Clean names for the number
    const cleanLineName = lineName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 30);
    const cleanProjectName = contractName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 30);
    
    const requestNumber = `${dateStr}_${correlativeStr}_${cleanLineName}_${cleanProjectName}`;
    
    return { number: requestNumber, correlative };
  };

  const handleCreate = async () => {
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese un monto válido" });
      return;
    }

    let amountUf = amount;
    let amountClp = 0;

    if (form.currency === "CLP" && ufValue > 0) {
      amountUf = amount / ufValue;
      amountClp = amount;
    } else {
      amountClp = amount * ufValue;
    }

    // Validate against available
    if (amountUf > lineAvailable + 0.01) {
      toast({ 
        variant: "destructive", 
        title: "Monto excede disponible", 
        description: `El monto (${formatUF(amountUf)}) supera el disponible (${formatUF(lineAvailable)})` 
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { number, correlative } = await generateRequestNumber();

      const { error } = await supabase.from("oc_requests").insert({
        contract_id: contractId,
        budget_id: budgetId,
        budget_line_id: budgetLineId,
        request_number: number,
        correlative_of_day: correlative,
        request_date: new Date().toISOString().split('T')[0],
        line_name: lineName,
        project_name: contractName,
        description: form.description,
        amount_uf: amountUf,
        amount_clp: amountClp,
        input_currency: form.currency,
        uf_value_at_entry: ufValue,
        supplier_id: form.supplier_id,
        supplier_name: form.supplier_name,
        year: year,
        status: "pending",
        created_by: user?.id
      });

      if (error) throw error;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Solicitud de OC</DialogTitle>
          <DialogDescription>
            Línea: <strong>{lineName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          {templateUrl && (
            <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Formulario de Solicitud</span>
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

          {/* Available info */}
          <div className="p-3 rounded-md bg-muted/50 border text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Presupuesto línea:</span>
              <span className="font-medium">{formatUF(lineBudget)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Disponible:</span>
              <span className={`font-medium ${lineAvailable <= 0 ? 'text-destructive' : 'text-green-600'}`}>
                {formatUF(lineAvailable)}
              </span>
            </div>
          </div>

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

          {/* Amount and Currency */}
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
                  <SelectItem value="CLP">CLP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-2">
            <Label>Proveedor (opcional)</Label>
            <SupplierSelect
              value={form.supplier_id}
              onChange={handleSupplierChange}
            />
          </div>
        </div>

        <DialogFooter>
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
