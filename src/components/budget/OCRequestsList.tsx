import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Upload, Eye, Trash2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface OCRequest {
  id: string;
  request_number: string;
  request_date: string;
  line_name: string;
  project_name: string;
  description: string | null;
  amount_uf: number;
  amount_clp: number;
  supplier_name: string | null;
  status: "pending" | "converted";
  purchase_order_id: string | null;
  created_at: string;
}

interface OCRequestsListProps {
  contractId: string;
  budgetId?: string;
  year: number;
  ufValue: number;
  formatUF: (value: number) => string;
  formatCLP: (value: number) => string;
  onRefresh?: () => void;
  isAdmin?: boolean;
}

export const OCRequestsList = ({
  contractId,
  budgetId,
  year,
  ufValue,
  formatUF,
  formatCLP,
  onRefresh,
  isAdmin = false
}: OCRequestsListProps) => {
  const [requests, setRequests] = useState<OCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<OCRequest | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertForm, setConvertForm] = useState({
    order_number: "",
    supplier_name: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    loadRequests();
  }, [contractId, year]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("oc_requests")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", year)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests((data || []) as OCRequest[]);
    } catch (error) {
      console.error("Error loading OC requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToOC = async () => {
    if (!selectedRequest) return;
    if (!convertForm.order_number.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Ingrese el número de OC" });
      return;
    }

    setConverting(true);
    try {
      // Create the actual purchase order
      const { data: ocData, error: ocError } = await supabase.from("purchase_orders").insert({
        contract_id: selectedRequest.id ? contractId : contractId,
        budget_id: budgetId,
        budget_line_id: selectedRequest.id, // This should be the original budget_line_id from request
        order_number: convertForm.order_number,
        supplier_name: convertForm.supplier_name || selectedRequest.supplier_name,
        description: selectedRequest.description,
        amount_uf: selectedRequest.amount_uf,
        amount_clp: selectedRequest.amount_clp,
        input_currency: "UF",
        uf_value_at_entry: ufValue,
        year: year,
        status: "abierta"
      }).select("id").single();

      if (ocError) throw ocError;

      // Update the request status to converted
      const { error: updateError } = await supabase
        .from("oc_requests")
        .update({ 
          status: "converted",
          purchase_order_id: ocData.id
        })
        .eq("id", selectedRequest.id);

      if (updateError) throw updateError;

      toast({ title: "Solicitud convertida", description: `OC ${convertForm.order_number} creada exitosamente` });
      setShowConvertDialog(false);
      setSelectedRequest(null);
      setConvertForm({ order_number: "", supplier_name: "" });
      loadRequests();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRequest) return;

    try {
      const { error } = await supabase
        .from("oc_requests")
        .delete()
        .eq("id", selectedRequest.id);

      if (error) throw error;

      toast({ title: "Solicitud eliminada" });
      setShowDeleteDialog(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const exportToExcel = (request: OCRequest) => {
    // Generate CSV content
    const BOM = '\uFEFF';
    const headers = ['Número Solicitud', 'Fecha', 'Línea', 'Proyecto', 'Descripción', 'Monto UF', 'Monto CLP', 'Proveedor', 'Estado'];
    const row = [
      request.request_number,
      format(new Date(request.request_date), 'dd/MM/yyyy'),
      request.line_name,
      request.project_name,
      request.description || '',
      request.amount_uf.toFixed(2),
      Math.round(request.amount_clp).toString(),
      request.supplier_name || '',
      request.status === 'pending' ? 'Pendiente' : 'Convertida'
    ];

    const csvContent = BOM + [
      headers.join(';'),
      row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${request.request_number}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const convertedRequests = requests.filter(r => r.status === "converted");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No hay solicitudes de OC para este año
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
              Pendientes ({pendingRequests.length})
            </Badge>
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-mono text-xs">{request.request_number}</TableCell>
                  <TableCell>{format(new Date(request.request_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                  <TableCell className="truncate max-w-[150px]">{request.line_name}</TableCell>
                  <TableCell className="text-right">{formatUF(request.amount_uf)}</TableCell>
                  <TableCell className="truncate max-w-[120px]">{request.supplier_name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToExcel(request)}
                        className="h-7 px-2"
                        title="Descargar Excel"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setConvertForm({ 
                            order_number: "", 
                            supplier_name: request.supplier_name || "" 
                          });
                          setShowConvertDialog(true);
                        }}
                        className="h-7 px-2 gap-1"
                      >
                        <Upload className="h-3 w-3" />
                        Cargar OC
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowDeleteDialog(true);
                          }}
                          className="h-7 px-2 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Converted Requests */}
      {convertedRequests.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              Convertidas ({convertedRequests.length})
            </Badge>
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número Solicitud</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {convertedRequests.map((request) => (
                <TableRow key={request.id} className="opacity-60">
                  <TableCell className="font-mono text-xs">{request.request_number}</TableCell>
                  <TableCell>{format(new Date(request.request_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                  <TableCell className="truncate max-w-[150px]">{request.line_name}</TableCell>
                  <TableCell className="text-right">{formatUF(request.amount_uf)}</TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-500">
                      Convertida a OC
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Convert to OC Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cargar OC a Solicitud</DialogTitle>
            <DialogDescription>
              Solicitud: <strong>{selectedRequest?.request_number}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-muted/50 border text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto:</span>
                <span className="font-medium">{selectedRequest && formatUF(selectedRequest.amount_uf)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Línea:</span>
                <span>{selectedRequest?.line_name}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Número de OC *</Label>
              <Input
                value={convertForm.order_number}
                onChange={(e) => setConvertForm(prev => ({ ...prev, order_number: e.target.value }))}
                placeholder="Ej: OC-2024-001"
              />
            </div>

            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input
                value={convertForm.supplier_name}
                onChange={(e) => setConvertForm(prev => ({ ...prev, supplier_name: e.target.value }))}
                placeholder="Nombre del proveedor"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConvertToOC} disabled={converting}>
              {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear OC
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la solicitud {selectedRequest?.request_number}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
