import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Upload,
  FileText,
  ShoppingCart,
  Layers,
  ExternalLink,
  X,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFileToStorage } from "@/lib/storageUtils";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface ContractAllocation {
  contract_id: string;
  contract_name: string;
  amount_uf: number;
  amount_clp: number;
}

interface OCRequest {
  id: string;
  request_number: string;
  request_date: string;
  line_name: string;
  project_name: string;
  description: string | null;
  amount_uf: number;
  amount_clp?: number;
  input_currency?: string;
  uf_value_at_entry?: number;
  supplier_id: string | null;
  supplier_name: string | null;
  status: string;
  contract_id: string;
  budget_id?: string | null;
  opex_master_id?: string | null;
  year: number;
  quotation_url?: string | null;
  quotation_file_name?: string | null;
  allocations?: ContractAllocation[];
  opex_category_id?: string | null;
}

interface OpexCategory {
  id: string;
  name: string;
}

interface ConvertOCRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: OCRequest | null;
  ufValue: number;
  formatUF: (value: number) => string;
  onSuccess?: () => void;
}

export const ConvertOCRequestDialog = ({
  open,
  onOpenChange,
  request,
  ufValue,
  formatUF,
  onSuccess,
}: ConvertOCRequestDialogProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [converting, setConverting] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [ocFile, setOcFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [opexCategories, setOpexCategories] = useState<OpexCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const isMultiContract = request?.allocations && request.allocations.length > 0;

  // Load OPEX categories
  useEffect(() => {
    if (open) {
      loadCategories();
      // Set initial category from request if available
      setSelectedCategoryId(request?.opex_category_id || null);
    }
  }, [open, request]);

  const loadCategories = async () => {
    const { data } = await supabase
      .from("opex_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("display_order");
    setOpexCategories(data || []);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateFile(file);
      if (!validation.isValid) {
        toast({
          variant: "destructive",
          title: "Archivo no válido",
          description: validation.error,
        });
        return;
      }
      setOcFile(file);
    }
  };

  const handleRemoveFile = () => {
    setOcFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadOCFile = async (): Promise<{ url: string; fileName: string } | null> => {
    if (!ocFile) return null;

    setUploadingFile(true);
    try {
      const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const sanitizedName = sanitizeFileName(ocFile.name);
      const filePath = `oc-documents/${timestamp}_${sanitizedName}`;

      const { path, error } = await uploadFileToStorage(filePath, ocFile);

      if (error) throw error;

      return { url: path, fileName: ocFile.name };
    } catch (error) {
      console.error("Error uploading OC file:", error);
      throw error;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleConvert = async () => {
    if (!request) return;
    if (!orderNumber.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ingrese el número de OC",
      });
      return;
    }

    setConverting(true);
    try {
      // Upload OC file if provided
      let fileData: { url: string; fileName: string } | null = null;
      if (ocFile) {
        fileData = await uploadOCFile();
      }

      // Determine attachment URL (uploaded file takes priority, then quotation)
      const attachmentUrl = fileData?.url || request.quotation_url || null;

      if (isMultiContract && request.allocations) {
        // Multi-contract: Create a PO for each allocation
        for (const alloc of request.allocations) {
          // Ensure amount_uf is never null/undefined
          const allocAmountUf = alloc.amount_uf ?? 0;
          const allocAmountClp = alloc.amount_clp ?? Math.round(allocAmountUf * ufValue);
          
          if (allocAmountUf <= 0) {
            console.warn(`Skipping allocation for contract ${alloc.contract_id} with zero/null amount`);
            continue;
          }
          
          const { data: ocData, error: ocError } = await supabase
            .from("purchase_orders")
            .insert({
              contract_id: alloc.contract_id,
              budget_id: request.budget_id,
              opex_master_id: request.opex_master_id,
              opex_category_id: selectedCategoryId || request.opex_category_id,
              order_number: orderNumber,
              supplier_id: supplierId || request.supplier_id,
              supplier_name: supplierName || request.supplier_name,
              description: request.description,
              amount_uf: allocAmountUf,
              amount_clp: allocAmountClp,
              input_currency: request.input_currency || "CLP",
              uf_value_at_entry: request.uf_value_at_entry || ufValue,
              year: request.year,
              status: "abierta",
              attachment_url: attachmentUrl,
              is_multi_contract: true,
            })
            .select("id")
            .single();

          if (ocError) throw ocError;

          // Create allocation record for this PO
          await supabase.from("purchase_order_contract_allocations").insert({
            purchase_order_id: ocData.id,
            contract_id: alloc.contract_id,
            amount_uf: allocAmountUf,
            amount_clp: allocAmountClp,
          });
        }
      } else {
        // Single contract: Create one PO
        // Ensure amount_uf is never null/undefined
        const singleAmountUf = request.amount_uf ?? 0;
        const singleAmountClp = request.amount_clp ?? Math.round(singleAmountUf * ufValue);
        
        if (singleAmountUf <= 0) {
          throw new Error("El monto de la solicitud no puede ser cero o vacío");
        }
        
        const { error: ocError } = await supabase.from("purchase_orders").insert({
          contract_id: request.contract_id,
          budget_id: request.budget_id,
          opex_master_id: request.opex_master_id,
          opex_category_id: selectedCategoryId || request.opex_category_id,
          order_number: orderNumber,
          supplier_id: supplierId || request.supplier_id,
          supplier_name: supplierName || request.supplier_name,
          description: request.description,
          amount_uf: singleAmountUf,
          amount_clp: singleAmountClp,
          input_currency: request.input_currency || "CLP",
          uf_value_at_entry: request.uf_value_at_entry || ufValue,
          year: request.year,
          status: "abierta",
          attachment_url: attachmentUrl,
        });

        if (ocError) throw ocError;
      }

      // Update the request status to converted
      const { error: updateError } = await supabase
        .from("oc_requests")
        .update({
          status: "converted",
        })
        .eq("id", request.id);

      if (updateError) throw updateError;

      toast({
        title: "Solicitud convertida",
        description: `OC ${orderNumber} creada exitosamente${isMultiContract ? ` para ${request.allocations?.length} contratos` : ""}`,
      });

      // Reset form and close
      setOrderNumber("");
      setSupplierId(null);
      setSupplierName(null);
      setOcFile(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error converting request:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo convertir la solicitud",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleClose = () => {
    if (!converting) {
      setOrderNumber("");
      setSupplierId(null);
      setSupplierName(null);
      setOcFile(null);
      setSelectedCategoryId(null);
      onOpenChange(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Convertir Solicitud a OC
            {isMultiContract && (
              <Badge variant="outline" className="text-xs gap-1">
                <Layers className="h-3 w-3" />
                Centralizado
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{request.request_number}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Request summary */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Fecha Solicitud</p>
              <p className="font-medium">
                {format(new Date(request.request_date), "dd MMM yyyy", { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monto Total</p>
              <p className="font-medium text-green-600">{formatUF(request.amount_uf)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {isMultiContract ? "Contratos" : "Proyecto"}
              </p>
              <p className="font-medium">
                {isMultiContract
                  ? `${request.allocations?.length} locales`
                  : request.project_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Línea(s)</p>
              <p className="font-medium truncate">{request.line_name}</p>
            </div>
            {request.description && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Descripción</p>
                <p className="font-medium">{request.description}</p>
              </div>
            )}
          </div>

          {/* Multi-contract allocations */}
          {isMultiContract && request.allocations && (
            <div className="border rounded-lg overflow-hidden">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border-b">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Se creará una OC con el mismo número para cada local:
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="text-right">Monto (UF)</TableHead>
                    <TableHead className="text-right">Monto (CLP)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {request.allocations.map((alloc) => (
                    <TableRow key={alloc.contract_id}>
                      <TableCell className="font-medium">{alloc.contract_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUF(alloc.amount_uf)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${Math.round(alloc.amount_clp).toLocaleString("es-CL")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="order_number">
                Número de OC <span className="text-destructive">*</span>
              </Label>
              <Input
                id="order_number"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Ingrese el número de orden de compra"
              />
            </div>

            <div className="space-y-2">
              <Label>Proveedor</Label>
              <SupplierSelect
                value={supplierId || request.supplier_id}
                onChange={(id, name) => {
                  setSupplierId(id);
                  setSupplierName(name);
                }}
              />
              {request.supplier_name && !supplierId && (
                <p className="text-xs text-muted-foreground">
                  Proveedor actual: {request.supplier_name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Categoría OPEX</Label>
              <Select
                value={selectedCategoryId || "none"}
                onValueChange={(v) => setSelectedCategoryId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {opexCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Archivo OC (PDF)</Label>
              {ocFile ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border rounded-lg">
                  <FileText className="h-5 w-5 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ocFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(ocFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    disabled={converting}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click para subir el archivo de la OC
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, máximo 10MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.PDF"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Show existing quotation if no new file */}
              {!ocFile && request.quotation_url && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-muted-foreground">
                    Se utilizará la cotización adjunta:{" "}
                  </span>
                  <span className="font-medium">
                    {request.quotation_file_name || "Cotización"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={converting}>
            Cancelar
          </Button>
          <Button onClick={handleConvert} disabled={converting || !orderNumber.trim()}>
            {converting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Convirtiendo...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Crear OC
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
