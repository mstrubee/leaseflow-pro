import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
// Card component removed - not in use currently
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Eye, Trash2, Download, Plus, FileSpreadsheet, FileText, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { OCRequestViewDialog } from "./OCRequestViewDialog";
import { generateOCRequestTemplate, parseOCRequestExcel } from "@/lib/generateOCRequestTemplate";
import { ShareOCRequestDialog } from "./ShareOCRequestDialog";
import type { OCRequestShareData } from "@/lib/ocRequestShare";
import { OCRequestCreateDialog, OCRequestCreateDialogHandle } from "./OCRequestCreateDialog";
export type { OCRequestPrefillDraft } from "./OCRequestCreateDialog";
import { loadOCRequestShareData } from "@/lib/loadOCRequestShareData";
import { softDeletePurchaseOrder } from "@/lib/purchaseOrderDelete";

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
  budget_id: string | null;
  budget_line_id?: string | null;
  opex_master_id?: string | null;
  budget_type?: string; // Derived from fields or contract_budgets
  quotation_url?: string | null;
  quotation_file_name?: string | null;
  // Requerimiento de OC de origen (ver OCRequiredList.tsx) -- si existe y la
  // solicitud sigue "pending", permite "Revertir a Requerimiento".
  source_quotation_number?: string | null;
  // Multi-contract allocation info
  is_multi_contract?: boolean;
  allocated_amount_uf?: number;
  allocated_amount_clp?: number;
  total_request_amount_uf?: number;
  total_request_amount_clp?: number;
}

interface OCRequestsListProps {
  contractId: string;
  contractName?: string;
  contractCebe?: string | null;
  budgetId?: string;
  year: number;
  ufValue: number;
  formatUF: (value: number) => string;
  formatCLP: (value: number) => string;
  onRefresh?: () => void;
  isAdmin?: boolean;
  budgetLineId?: string;
  allowCreate?: boolean;
  prefillDraft?: import("./OCRequestCreateDialog").OCRequestPrefillDraft | null;
  onPrefillConsumed?: () => void;
  /** Búsqueda y filtro de tipo compartidos con OCRequiredList y PurchaseOrdersModule (ver BudgetDashboard). */
  searchTerm?: string;
  typeFilter?: "all" | "capex" | "opex";
}

export const OCRequestsList = ({
  contractId,
  contractName = "",
  contractCebe = null,
  budgetId,
  year,
  ufValue,
  formatUF,
  formatCLP,
  onRefresh,
  isAdmin = false,
  budgetLineId,
  allowCreate = true,
  prefillDraft,
  onPrefillConsumed,
  searchTerm = "",
  typeFilter = "all"
}: OCRequestsListProps) => {
  const [requests, setRequests] = useState<OCRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<OCRequest | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewRequestId, setViewRequestId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertForm, setConvertForm] = useState({
    order_number: "",
    supplier_name: ""
  });

  // PDF de una solicitud ya existente (botón de la fila), distinto del que se
  // ofrece justo al crear una: aquí Con Migo/Sin Migo ya está elegido.
  const [pdfShareData, setPdfShareData] = useState<OCRequestShareData | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const createDialogRef = useRef<OCRequestCreateDialogHandle>(null);
  // El spinner que reemplaza toda la lista solo se muestra en la primera carga
  // (o al cambiar de contrato/año). En recargas posteriores -- ej. tras
  // "Guardar Cambios" en Ver/Editar Solicitud -- la lista sigue montada: si se
  // reemplazara por el spinner, se desmontarían OCRequestViewDialog y su
  // ventana de compartir, y el PDF nunca llegaría a mostrarse.
  const hasLoadedOnce = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    hasLoadedOnce.current = false;
    loadRequests();
  }, [contractId, year, budgetLineId]);

  const loadRequests = async () => {
    if (!hasLoadedOnce.current) setLoading(true);
    try {
      // First get direct requests for this contract
      let query = supabase
        .from("oc_requests")
        .select("*")
        .eq("contract_id", contractId)
        .eq("year", year)
        .order("created_at", { ascending: false });
      
      if (budgetLineId) {
        query = query.eq("budget_line_id", budgetLineId);
      }

      const { data: directData, error: directError } = await query;
      if (directError) throw directError;

      // Also get multi-contract allocations for this contract
      const { data: allocationsData, error: allocError } = await supabase
        .from("oc_request_contract_allocations")
        .select(`
          oc_request_id,
          amount_uf,
          amount_clp,
          oc_requests!inner(
            id, request_number, request_date, line_name, project_name,
            description, amount_uf, amount_clp, supplier_name, status,
            purchase_order_id, created_at, budget_id, budget_line_id, opex_master_id, quotation_url, quotation_file_name,
            source_quotation_number
          )
        `)
        .eq("contract_id", contractId);

      if (allocError) {
        console.error("Error loading oc_request_contract_allocations:", allocError);
      }

      // Build a map of allocations by request ID for this contract
      const allocationsByRequestId: Record<string, { amount_uf: number; amount_clp: number }> = {};
      for (const alloc of (allocationsData || [])) {
        allocationsByRequestId[alloc.oc_request_id] = {
          amount_uf: alloc.amount_uf,
          amount_clp: alloc.amount_clp
        };
      }

      // Process direct requests - check if they have allocations and update amounts accordingly
      const processedDirectRequests = (directData || []).map(req => {
        const allocation = allocationsByRequestId[req.id];
        if (allocation) {
          // This direct request has an allocation for this contract - use allocated amounts
          return {
            ...req,
            is_multi_contract: true,
            allocated_amount_uf: allocation.amount_uf,
            allocated_amount_clp: allocation.amount_clp,
            total_request_amount_uf: req.amount_uf,
            total_request_amount_clp: req.amount_clp,
            // Override displayed amounts with allocated amounts
            amount_uf: allocation.amount_uf,
            amount_clp: allocation.amount_clp
          };
        }
        return req;
      });

      const multiContractRequests: OCRequest[] = [];

      // Process multi-contract allocations that are NOT already in direct requests
      const directIds = new Set(processedDirectRequests.map(r => r.id));
      for (const alloc of (allocationsData || [])) {
        const req = alloc.oc_requests as any;
        if (req && !directIds.has(req.id)) {
          // Filter by year
          const reqDate = new Date(req.request_date);
          if (reqDate.getFullYear() === year) {
            multiContractRequests.push({
              ...req,
              is_multi_contract: true,
              allocated_amount_uf: alloc.amount_uf,
              allocated_amount_clp: alloc.amount_clp,
              total_request_amount_uf: req.amount_uf,
              total_request_amount_clp: req.amount_clp,
              // Override displayed amounts with allocated amounts
              amount_uf: alloc.amount_uf,
              amount_clp: alloc.amount_clp
            });
          }
        }
      }

      const combinedRequests = [...processedDirectRequests, ...multiContractRequests];
      const budgetIds = [...new Set(combinedRequests.map(r => r.budget_id).filter(Boolean))];
      
      let budgetTypeMap: Record<string, string> = {};
      if (budgetIds.length > 0) {
        const { data: budgets } = await supabase
          .from("contract_budgets")
          .select("id, budget_type")
          .in("id", budgetIds);
        
        budgetTypeMap = (budgets || []).reduce((acc, b) => {
          acc[b.id] = b.budget_type;
          return acc;
        }, {} as Record<string, string>);
      }

      // Derive budget_type using the same logic as BudgetDashboard/PurchaseOrdersModule
      const deriveBudgetType = (req: any): string => {
        if (req.opex_master_id) return "opex";
        if (req.budget_id && budgetTypeMap[req.budget_id]) return budgetTypeMap[req.budget_id];
        if (req.budget_line_id) return "capex";
        return "capex";
      };

      const requestsWithType: OCRequest[] = combinedRequests.map(req => ({
        ...req,
        budget_type: deriveBudgetType(req)
      })) as OCRequest[];

      // Sort by created_at descending
      requestsWithType.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRequests(requestsWithType);
    } catch (error) {
      console.error("Error loading OC requests:", error);
    } finally {
      hasLoadedOnce.current = true;
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
      // Create the actual purchase order using the budget_id from the request
      const { data: ocData, error: ocError } = await supabase.from("purchase_orders").insert({
        contract_id: contractId,
        budget_id: selectedRequest.budget_id || budgetId, // Use request's budget_id first
        order_number: convertForm.order_number,
        supplier_name: convertForm.supplier_name || selectedRequest.supplier_name,
        description: selectedRequest.description,
        amount_uf: selectedRequest.amount_uf,
        amount_clp: selectedRequest.amount_clp,
        input_currency: "UF",
        uf_value_at_entry: ufValue,
        year: year,
        status: "abierta",
        attachment_url: selectedRequest.quotation_url || null
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
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // "Volver atrás": una Solicitud de OC que vino de un Requerimiento (ver
  // OCRequiredList.tsx) se puede reconvertir en Requerimiento eliminando la
  // solicitud -- source_quotation_number ya no tendrá ninguna solicitud que
  // lo marque "Convertida", así que OCRequiredList vuelve a mostrarlo como
  // pendiente.
  //
  // Una Solicitud "Convertida a OC" que NO viene de un Requerimiento (se
  // creó directo con "Nueva Solicitud") también se puede revertir -- no hay
  // ningún Requerimiento al que volver, así que en ese caso la solicitud no
  // se elimina: vuelve a quedar "pending" (desvinculada de la OC), lista
  // para cargarle una OC de nuevo. Este es el caso típico de una OC que se
  // eliminó manualmente desde "Órdenes de Compra y Facturas" dejando la
  // solicitud "huérfana", apuntando a una OC que ya no existe.
  //
  // En ambos casos, si la solicitud estaba "Convertida a OC", la OC creada
  // en esa conversión se manda a eliminados también (salvo que ya la
  // hubieran borrado manualmente antes -- softDeletePurchaseOrder no hace
  // nada si ya estaba eliminada). RLS solo permite el delete/update a
  // admins: si la respuesta no trae filas afectadas, no se reventó por
  // error sino que no tenía permiso.
  const handleRevertToRequired = async () => {
    if (!selectedRequest) return;
    const hasRequerimientoOrigin = !!selectedRequest.source_quotation_number;

    setReverting(true);
    try {
      if (hasRequerimientoOrigin) {
        const { data, error } = await supabase
          .from("oc_requests")
          .delete()
          .eq("id", selectedRequest.id)
          .select("id");

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("No se pudo revertir la solicitud (sin permisos suficientes)");
        }
      } else {
        const { data, error } = await supabase
          .from("oc_requests")
          .update({ status: "pending", purchase_order_id: null })
          .eq("id", selectedRequest.id)
          .select("id");

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("No se pudo revertir la solicitud (sin permisos suficientes)");
        }
      }

      let ocDeleteWarning: string | null = null;
      if (selectedRequest.status === "converted" && selectedRequest.purchase_order_id) {
        try {
          await softDeletePurchaseOrder(selectedRequest.purchase_order_id);
        } catch (ocError: any) {
          console.error("Error al eliminar la OC asociada al revertir:", ocError);
          ocDeleteWarning = ocError.message || "No se pudo eliminar automáticamente la OC asociada";
        }
      }

      toast(
        ocDeleteWarning
          ? { variant: "destructive", title: "Solicitud revertida con advertencia", description: `${ocDeleteWarning}. Elimínela manualmente desde "Órdenes de Compra y Facturas".` }
          : {
              title: "Solicitud revertida",
              description: hasRequerimientoOrigin
                ? "Vuelve a estar disponible como Requerimiento de OC pendiente"
                : "La solicitud vuelve a estado Pendiente",
            }
      );
      setShowRevertDialog(false);
      setSelectedRequest(null);
      loadRequests();
      onRefresh?.();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setReverting(false);
    }
  };

  const handleOpenRequestPdf = async (request: OCRequest) => {
    setPdfLoadingId(request.id);
    try {
      setPdfShareData(await loadOCRequestShareData(request.id, { ufValue, contractCebe }));
    } catch (error) {
      console.error("Error al preparar el PDF de la solicitud:", error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo preparar el PDF de la solicitud" });
    } finally {
      setPdfLoadingId(null);
    }
  };

  const exportToExcel = (request: OCRequest) => {
    const headers = ['Número Solicitud', 'Fecha', 'Línea', 'Proyecto', 'Descripción', 'Monto UF', 'Monto CLP', 'Proveedor', 'Estado'];
    const row = [
      request.request_number,
      format(new Date(request.request_date), 'dd/MM/yyyy'),
      request.line_name,
      request.project_name,
      request.description || '',
      request.amount_uf,
      Math.round(request.amount_clp),
      request.supplier_name || '',
      request.status === 'pending' ? 'Pendiente' : 'Convertida'
    ];

    const sheet = XLSX.utils.aoa_to_sheet([headers, row]);
    sheet['!cols'] = [
      { wch: 30 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 30 },
      { wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Solicitud de OC");

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${request.request_number}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtro de tipo y búsqueda compartidos con OCRequiredList/PurchaseOrdersModule
  // (ver BudgetDashboard) — se aplican sobre las solicitudes ya cargadas.
  const typeFiltered = typeFilter === "all"
    ? requests
    : requests.filter(r => r.budget_type === typeFilter);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRequests = !normalizedSearch
    ? typeFiltered
    : typeFiltered.filter(r =>
        r.request_number.toLowerCase().includes(normalizedSearch) ||
        (r.description || "").toLowerCase().includes(normalizedSearch) ||
        r.line_name.toLowerCase().includes(normalizedSearch) ||
        (r.supplier_name || "").toLowerCase().includes(normalizedSearch)
      );

  const handleImportOCRequest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportingFile(true);
    try {
      const parsed = await parseOCRequestExcel(file);
      
      // Open the new request dialog and pre-fill with parsed data
      await createDialogRef.current?.openFromImport(parsed);

      toast({ title: "Datos importados", description: "Los campos se han completado con los datos del archivo" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error al importar", description: error.message });
    } finally {
      setImportingFile(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Nueva Solicitud / Plantilla / Importar — la búsqueda y el filtro de
          tipo ahora viven en BudgetDashboard, compartidos con OCRequiredList
          y PurchaseOrdersModule. */}
      {allowCreate && (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateOCRequestTemplate(contractName)}
            title="Descargar plantilla Excel"
            className="gap-1"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Plantilla</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => importFileRef.current?.click()}
            disabled={importingFile}
            title="Importar solicitud desde Excel"
            className="gap-1"
          >
            {importingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="hidden sm:inline">Importar</span>
          </Button>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportOCRequest}
          />
          <Button size="sm" onClick={() => void createDialogRef.current?.openNew()} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Solicitud
          </Button>
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          {requests.length === 0
            ? "No hay solicitudes de OC para este año"
            : "No hay solicitudes de OC para la búsqueda o el filtro aplicado"
          }
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nº Solicitud</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Línea</TableHead>
              <TableHead>Titulo</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.map((request) => {
              const isConverted = request.status === "converted";
              return (
                <TableRow key={request.id} className={isConverted ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={request.budget_type === "capex"
                        ? "bg-blue-50 text-blue-700 border-blue-300 text-[10px]"
                        : "bg-orange-50 text-orange-700 border-orange-300 text-[10px]"
                      }>
                        {request.budget_type?.toUpperCase() || "N/A"}
                      </Badge>
                      {request.is_multi_contract && (
                        <Badge variant="secondary" className="text-[9px] px-1">
                          Multi
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{request.request_number}</TableCell>
                  <TableCell className="text-xs">{format(new Date(request.request_date), 'dd MMM yyyy', { locale: es })}</TableCell>
                  <TableCell className="truncate max-w-[150px]">{request.line_name}</TableCell>
                  <TableCell className="truncate max-w-[150px] text-muted-foreground">{request.description || "-"}</TableCell>
                  <TableCell className="truncate max-w-[120px]">{request.supplier_name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span>{formatCLP(request.amount_clp || Math.round(request.amount_uf * ufValue))}</span>
                      <span className="text-[10px] text-muted-foreground">{formatUF(request.amount_uf)}</span>
                      {request.is_multi_contract && request.total_request_amount_uf && (
                        <span className="text-[10px] text-muted-foreground">
                          (Total: {formatCLP(request.total_request_amount_clp || Math.round(request.total_request_amount_uf * ufValue))})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Badge
                        variant={isConverted ? "default" : "outline"}
                        className={`cursor-pointer gap-1 ${isConverted
                          ? "bg-green-500 hover:bg-green-600"
                          : "bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100"
                        }`}
                        title={request.source_quotation_number ? "Revertir a Requerimiento de OC" : "Revertir a Pendiente"}
                        onClick={() => {
                          // Pendiente sin Requerimiento de origen: no hay nada que revertir.
                          // Convertida a OC sí se puede revertir aunque no tenga Requerimiento
                          // de origen -- típicamente porque la OC asociada ya se eliminó
                          // manualmente y la solicitud quedó "huérfana".
                          const canRevert = !!request.source_quotation_number || isConverted;
                          if (!canRevert) {
                            toast({
                              variant: "destructive",
                              title: "No se puede revertir",
                              description: "Esta solicitud no proviene de un Requerimiento de OC convertido.",
                            });
                            return;
                          }
                          setSelectedRequest(request);
                          setShowRevertDialog(true);
                        }}
                      >
                        {isConverted ? "Convertida a OC" : "Pendiente"}
                        <RotateCcw className="h-3 w-3" />
                      </Badge>
                    ) : isConverted ? (
                      <Badge variant="default" className="bg-green-500">Convertida a OC</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pendiente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setViewRequestId(request.id);
                          setShowViewDialog(true);
                        }}
                        className="h-7 px-2"
                        title="Ver/Editar Solicitud"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenRequestPdf(request)}
                        disabled={pdfLoadingId === request.id}
                        className="h-7 px-2"
                        title="Descargar PDF de la solicitud"
                      >
                        {pdfLoadingId === request.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <FileText className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToExcel(request)}
                        className="h-7 px-2"
                        title="Descargar datos (CSV, abre en Excel)"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      {!isConverted && (
                        <>
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
                              title="Eliminar"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
                <span className="font-medium">{selectedRequest && formatCLP(selectedRequest.amount_clp || Math.round(selectedRequest.amount_uf * ufValue))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">UF:</span>
                <span className="text-xs">{selectedRequest && formatUF(selectedRequest.amount_uf)}</span>
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

      {/* Revert Confirmation */}
      <AlertDialog open={showRevertDialog} onOpenChange={setShowRevertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedRequest?.source_quotation_number ? "¿Revertir a Requerimiento de OC?" : "¿Revertir solicitud a Pendiente?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRequest?.source_quotation_number ? (
                <>
                  La solicitud {selectedRequest?.request_number} se eliminará y el requerimiento de OC de origen volverá a
                  quedar pendiente, disponible para editar o volver a convertir.
                </>
              ) : (
                <>
                  La solicitud {selectedRequest?.request_number} no viene de un Requerimiento de OC, así que volverá a
                  quedar en estado "Pendiente" (no se elimina) para poder cargarle una OC nuevamente.
                </>
              )}{" "}
              {selectedRequest?.status === "converted" && selectedRequest?.purchase_order_id && (
                <> La orden de compra que se había creado a partir de esta solicitud también se enviará a eliminados.</>
              )}{" "}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevertToRequired} disabled={reverting}>
              {reverting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revertir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View/Edit Dialog */}
      <OCRequestViewDialog
        open={showViewDialog}
        onOpenChange={setShowViewDialog}
        requestId={viewRequestId}
        formatUF={formatUF}
        ufValue={ufValue}
        isAdmin={isAdmin}
        contractCebe={contractCebe}
        onRefresh={() => {
          loadRequests();
          onRefresh?.();
        }}
      />

      <OCRequestCreateDialog
        ref={createDialogRef}
        contractId={contractId}
        contractName={contractName}
        contractCebe={contractCebe}
        year={year}
        ufValue={ufValue}
        formatUF={formatUF}
        formatCLP={formatCLP}
        prefillDraft={prefillDraft}
        onPrefillConsumed={onPrefillConsumed}
        onCreated={() => {
          loadRequests();
          onRefresh?.();
        }}
      />

      <ShareOCRequestDialog
        open={!!pdfShareData}
        onOpenChange={(o) => { if (!o) setPdfShareData(null); }}
        data={pdfShareData}
        requireMigoChoice={false}
      />
    </div>
  );
};
