import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveFileUrl } from "@/lib/storageUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, Trash2, Download, FileText, Check, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Quotation {
  id: string;
  quotation_number: string;
  supplier_name: string | null;
  amount_uf: number;
  amount_clp: number;
  file_path: string | null;
  file_name: string | null;
  quotation_date: string;
  is_selected: boolean;
}

interface QuotationsManagerProps {
  budgetLineId: string;
  contractId: string;
  lineName: string;
  projectName: string;
  ufValue: number;
  formatUF: (value: number) => string;
  onRefresh?: () => void;
}

export const QuotationsManager = ({
  budgetLineId,
  contractId,
  lineName,
  projectName,
  ufValue,
  formatUF,
  onRefresh
}: QuotationsManagerProps) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    supplier_id: null as string | null,
    supplier_name: "",
    amount: "",
    currency: "UF",
    description: ""
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    loadQuotations();
  }, [budgetLineId]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("oc_quotations")
        .select("*")
        .eq("budget_line_id", budgetLineId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuotations(data || []);
    } catch (error) {
      console.error("Error loading quotations:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateQuotationNumber = async (): Promise<{ number: string; correlative: number }> => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '.');
    
    // Get count of quotations for this line
    const { count } = await supabase
      .from("oc_quotations")
      .select("*", { count: "exact", head: true })
      .eq("budget_line_id", budgetLineId);
    
    const correlative = (count || 0) + 1;
    const correlativeStr = correlative.toString().padStart(3, '0');
    
    const cleanLineName = lineName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 20);
    const cleanProjectName = projectName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 20);
    const cleanSupplier = form.supplier_name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').trim().replace(/\s+/g, '_').substring(0, 20);
    
    const quotationNumber = `${dateStr}_${correlativeStr}_${cleanLineName}_${cleanProjectName}_${cleanSupplier}`;
    
    return { number: quotationNumber, correlative };
  };

  const handleAdd = async () => {
    if (!form.supplier_name.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el proveedor" });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { number, correlative } = await generateQuotationNumber();
      
      let filePath: string | null = null;
      let fileName: string | null = null;

      // Upload file if selected
      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop();
        filePath = `quotations/${contractId}/${budgetLineId}/${number}.${ext}`;
        fileName = selectedFile.name;
        
        const { error: uploadError } = await supabase.storage
          .from("repository-files")
          .upload(filePath, selectedFile);
        
        if (uploadError) throw uploadError;
      }

      const amount = parseFloat(form.amount) || 0;
      let amountUf = amount;
      let amountClp = 0;

      if (form.currency === "CLP" && ufValue > 0) {
        amountUf = amount / ufValue;
        amountClp = amount;
      } else {
        amountClp = amount * ufValue;
      }

      const { error } = await supabase.from("oc_quotations").insert({
        budget_line_id: budgetLineId,
        contract_id: contractId,
        quotation_number: number,
        correlative,
        supplier_id: form.supplier_id,
        supplier_name: form.supplier_name,
        line_name: lineName,
        project_name: projectName,
        description: form.description,
        amount_uf: amountUf,
        amount_clp: amountClp,
        file_path: filePath,
        file_name: fileName,
        quotation_date: new Date().toISOString().split('T')[0],
        created_by: user?.id
      });

      if (error) throw error;

      toast({ title: "Cotización agregada", description: number });
      setShowAddDialog(false);
      setForm({ supplier_id: null, supplier_name: "", amount: "", currency: "UF", description: "" });
      setSelectedFile(null);
      loadQuotations();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSelect = async (id: string) => {
    try {
      // Deselect all
      await supabase
        .from("oc_quotations")
        .update({ is_selected: false })
        .eq("budget_line_id", budgetLineId);
      
      // Select this one
      await supabase
        .from("oc_quotations")
        .update({ is_selected: true })
        .eq("id", id);

      loadQuotations();
      toast({ title: "Cotización seleccionada" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const quotation = quotations.find(q => q.id === deleteId);
      if (quotation?.file_path) {
        await supabase.storage.from("repository-files").remove([quotation.file_path]);
      }

      await supabase.from("oc_quotations").delete().eq("id", deleteId);

      toast({ title: "Cotización eliminada" });
      setDeleteId(null);
      loadQuotations();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const openFile = async (filePath: string) => {
    const url = await resolveFileUrl(filePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast({ variant: "destructive", title: "Error", description: "No se pudo abrir el archivo" });
  };

  const handleSupplierChange = (supplierId: string | null, supplierName: string | null) => {
    setForm(prev => ({ ...prev, supplier_id: supplierId, supplier_name: supplierName || "" }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Cotizaciones ({quotations.length})
        </h4>
        <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)} className="gap-1">
          <Plus className="h-3 w-3" />
          Agregar
        </Button>
      </div>

      {quotations.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Archivo</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((q) => (
              <TableRow key={q.id} className={q.is_selected ? "bg-green-50 dark:bg-green-950/20" : ""}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {q.supplier_name || "-"}
                    {q.is_selected && <Badge className="bg-green-500 text-[10px]">Seleccionada</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatUF(q.amount_uf)}</TableCell>
                <TableCell>
                  {q.file_path ? (
                    <Button variant="ghost" size="sm" onClick={() => openFile(q.file_path!)} className="h-6 px-2">
                      <Download className="h-3 w-3 mr-1" />
                      {q.file_name?.substring(0, 15)}...
                    </Button>
                  ) : "-"}
                </TableCell>
                <TableCell className="text-xs">{format(new Date(q.quotation_date), 'dd/MM/yy', { locale: es })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!q.is_selected && (
                      <Button variant="outline" size="sm" onClick={() => handleSelect(q.id)} className="h-6 px-2" title="Seleccionar">
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(q.id)} className="h-6 px-2 text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-3">No hay cotizaciones</p>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Cotización</DialogTitle>
            <DialogDescription>Línea: {lineName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Proveedor *</Label>
              <SupplierSelect value={form.supplier_id} onChange={handleSupplierChange} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <select
                  className="w-full h-10 px-3 border rounded-md"
                  value={form.currency}
                  onChange={(e) => setForm(prev => ({ ...prev, currency: e.target.value }))}
                >
                  <option value="UF">UF</option>
                  <option value="CLP">CLP</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Archivo de cotización</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cotización?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
