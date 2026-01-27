import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Upload, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupplierSelect } from "@/components/suppliers/SupplierSelect";
import { useAuth } from "@/hooks/useAuth";
import { uploadFileToStorage } from "@/lib/storageUtils";
interface Contract {
  id: string;
  name: string;
  cebe: string | null;
}

interface OpexCategory {
  id: string;
  name: string;
}

interface OpexMasterLine {
  id: string;
  category_id: string;
  category_name: string;
  amount_clp: number;
  year: number;
}

interface ContractAllocation {
  contractId: string;
  contractName: string;
  cebe: string | null;
  amount: number;
}

interface PaymentPlanItem {
  description: string;
  amount: string;
  due_date: string;
}

interface CentralizedOrderCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "request" | "order";
  year: number;
  ufValue: number;
  onSuccess: () => void;
}

export const CentralizedOrderCreator = ({
  open,
  onOpenChange,
  mode,
  year,
  ufValue,
  onSuccess
}: CentralizedOrderCreatorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("basic");
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [opexCategories, setOpexCategories] = useState<OpexCategory[]>([]);
  const [opexMasterLines, setOpexMasterLines] = useState<OpexMasterLine[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  // Form state
  const [budgetType, setBudgetType] = useState<"capex" | "opex">("opex");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [isMultiContract, setIsMultiContract] = useState(false);
  const [singleContractId, setSingleContractId] = useState("");
  const [contractAllocations, setContractAllocations] = useState<ContractAllocation[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanItem[]>([]);
  
  // Quotation file state
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    currency: "CLP" as "UF" | "CLP",
    order_number: "",
    order_date: new Date().toISOString().split('T')[0],
    supplier_id: null as string | null,
    supplier_name: null as string | null,
    project_name: ""
  });
  
  // Load initial data
  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open, year]);
  
  const loadInitialData = async () => {
    setLoadingData(true);
    try {
      // Load contracts with CEBE custom field
      const { data: contractsData } = await supabase
        .from("contracts")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      
      // Get CEBE field definition
      const { data: cebeFieldData } = await supabase
        .from("contract_custom_fields")
        .select("id")
        .ilike("field_name", "cebe")
        .eq("is_active", true)
        .limit(1)
        .single();
      
      let contractsWithCebe: Contract[] = [];
      
      if (cebeFieldData && contractsData) {
        // Get CEBE values for all contracts
        const { data: cebeValues } = await supabase
          .from("contract_custom_field_values")
          .select("contract_id, field_value")
          .eq("field_id", cebeFieldData.id);
        
        const cebeMap = new Map<string, string>();
        (cebeValues || []).forEach(v => {
          if (v.field_value) cebeMap.set(v.contract_id, v.field_value);
        });
        
        contractsWithCebe = (contractsData || []).map(c => ({
          ...c,
          cebe: cebeMap.get(c.id) || null
        }));
      } else {
        contractsWithCebe = (contractsData || []).map(c => ({ ...c, cebe: null }));
      }
      
      setContracts(contractsWithCebe);
      
      // Load OPEX categories
      const { data: categoriesData } = await supabase
        .from("opex_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order");
      setOpexCategories(categoriesData || []);
      
      // Load OPEX master budget lines
      const { data: masterData } = await supabase
        .from("opex_master_budget")
        .select("id, category_id, amount_clp, year, opex_categories(name)")
        .eq("year", year);
      
      const processedMaster = (masterData || []).map((m: any) => ({
        id: m.id,
        category_id: m.category_id,
        category_name: m.opex_categories?.name || "Sin categoría",
        amount_clp: m.amount_clp || 0,
        year: m.year
      }));
      setOpexMasterLines(processedMaster);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoadingData(false);
    }
  };
  
  // Calculate available budget for selected category
  const availableBudget = useMemo(() => {
    if (!selectedCategoryId) return 0;
    const masterLine = opexMasterLines.find(m => m.category_id === selectedCategoryId);
    return masterLine?.amount_clp || 0;
  }, [selectedCategoryId, opexMasterLines]);
  
  // Calculate total allocated amount
  const totalAllocated = useMemo(() => {
    return contractAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  }, [contractAllocations]);
  
  // Parse entered amount
  const enteredAmount = parseFloat(formData.amount) || 0;
  
  // Converted amount display
  const convertedAmount = useMemo(() => {
    if (formData.currency === "CLP") {
      return ufValue > 0 ? (enteredAmount / ufValue).toFixed(4) : "0";
    } else {
      return Math.round(enteredAmount * ufValue).toLocaleString("es-CL");
    }
  }, [enteredAmount, formData.currency, ufValue]);
  
  // Handle adding a contract allocation
  const handleAddAllocation = () => {
    const availableContracts = contracts.filter(
      c => !contractAllocations.some(a => a.contractId === c.id)
    );
    if (availableContracts.length > 0) {
      setContractAllocations(prev => [
        ...prev,
        { contractId: availableContracts[0].id, contractName: availableContracts[0].name, cebe: availableContracts[0].cebe, amount: 0 }
      ]);
    }
  };
  
  // Handle updating allocation
  const handleUpdateAllocation = (index: number, field: keyof ContractAllocation, value: any) => {
    setContractAllocations(prev => {
      const updated = [...prev];
      if (field === "contractId") {
        const contract = contracts.find(c => c.id === value);
        updated[index] = { ...updated[index], contractId: value, contractName: contract?.name || "", cebe: contract?.cebe || null };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };
  
  // Handle removing allocation
  const handleRemoveAllocation = (index: number) => {
    setContractAllocations(prev => prev.filter((_, i) => i !== index));
  };
  
  // Handle adding payment plan item
  const handleAddPaymentItem = () => {
    setPaymentPlan(prev => [...prev, { description: "", amount: "", due_date: "" }]);
  };
  
  // Handle updating payment item
  const handleUpdatePaymentItem = (index: number, field: keyof PaymentPlanItem, value: string) => {
    setPaymentPlan(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };
  
  // Handle removing payment item
  const handleRemovePaymentItem = (index: number) => {
    setPaymentPlan(prev => prev.filter((_, i) => i !== index));
  };
  
  // Handle quotation file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setQuotationFile(file);
    }
  };
  
  const handleRemoveFile = () => {
    setQuotationFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // Upload quotation file
  const uploadQuotationFile = async (): Promise<{ url: string; fileName: string } | null> => {
    if (!quotationFile) return null;
    
    setUploadingFile(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const sanitizedName = quotationFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `quotations/${timestamp}_${sanitizedName}`;
      
      const { path, error } = await uploadFileToStorage(filePath, quotationFile);
      
      if (error) throw error;
      
      return { url: `storage://${path}`, fileName: quotationFile.name };
    } catch (error) {
      console.error("Error uploading quotation file:", error);
      throw error;
    } finally {
      setUploadingFile(false);
    }
  };
  
  // Generate request/order number
  const generateNumber = async () => {
    const today = new Date();
    const datePrefix = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    
    const table = mode === "request" ? "oc_requests" : "purchase_orders";
    const numberField = mode === "request" ? "request_number" : "order_number";
    
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .like(numberField, `${datePrefix}%`);
    
    const correlative = (count || 0) + 1;
    const categoryName = opexCategories.find(c => c.id === selectedCategoryId)?.name || "OPEX";
    
    return {
      number: `${datePrefix}_${correlative}_${categoryName}_${formData.project_name || "Centralizado"}`,
      correlative
    };
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    // Validation
    if (!enteredAmount || enteredAmount <= 0) {
      toast({ title: "Error", description: "Ingrese un monto válido", variant: "destructive" });
      return;
    }
    
    if (budgetType === "opex" && !selectedCategoryId) {
      toast({ title: "Error", description: "Seleccione una categoría OPEX", variant: "destructive" });
      return;
    }
    
    if (isMultiContract && contractAllocations.length === 0) {
      toast({ title: "Error", description: "Agregue al menos un contrato", variant: "destructive" });
      return;
    }
    
    if (!isMultiContract && !singleContractId) {
      toast({ title: "Error", description: "Seleccione un contrato", variant: "destructive" });
      return;
    }
    
    if (isMultiContract && Math.abs(totalAllocated - enteredAmount) > 0.01) {
      toast({ 
        title: "Error", 
        description: `El monto total asignado (${totalAllocated.toLocaleString("es-CL")}) debe ser igual al monto ingresado (${enteredAmount.toLocaleString("es-CL")})`, 
        variant: "destructive" 
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Calculate UF and CLP amounts - ensure never NaN or null
      let totalAmountUf: number;
      let totalAmountClp: number;
      
      if (formData.currency === "CLP") {
        totalAmountClp = Math.round(enteredAmount) || 0;
        totalAmountUf = ufValue > 0 ? Math.round((enteredAmount / ufValue) * 10000) / 10000 : 0;
      } else {
        totalAmountUf = Math.round(enteredAmount * 10000) / 10000 || 0;
        totalAmountClp = Math.round(enteredAmount * ufValue) || 0;
      }
      
      // Final validation to prevent null/NaN
      if (!totalAmountUf || isNaN(totalAmountUf) || totalAmountUf <= 0) {
        throw new Error("El monto en UF calculado no es válido");
      }
      
      // Get master line id for selected category
      const masterLine = opexMasterLines.find(m => m.category_id === selectedCategoryId);
      
      const primaryContractId = isMultiContract ? contractAllocations[0]?.contractId : singleContractId;
      
      if (mode === "request") {
        // Create OC Request
        const { number, correlative } = await generateNumber();
        
        // Upload quotation file if present
        let quotationData: { url: string; fileName: string } | null = null;
        if (quotationFile) {
          quotationData = await uploadQuotationFile();
        }
        
        const requestPayload: any = {
          contract_id: primaryContractId,
          budget_id: null,
          budget_line_id: null,
          opex_master_id: masterLine?.id || null,
          request_number: number,
          correlative_of_day: correlative,
          request_date: new Date().toISOString().split('T')[0],
          line_name: opexCategories.find(c => c.id === selectedCategoryId)?.name || "OPEX Centralizado",
          project_name: formData.project_name || "Centralizado",
          description: formData.description,
          amount_uf: totalAmountUf,
          amount_clp: totalAmountClp,
          input_currency: formData.currency,
          uf_value_at_entry: ufValue,
          supplier_id: formData.supplier_id,
          supplier_name: formData.supplier_name,
          year: year,
          status: "pending",
          created_by: user?.id,
          quotation_url: quotationData?.url || null,
          quotation_file_name: quotationData?.fileName || null,
          is_multi_contract: isMultiContract
        };
        
        const { data: requestData, error: requestError } = await supabase
          .from("oc_requests")
          .insert(requestPayload)
          .select()
          .single();
        
        if (requestError) throw requestError;
        
        // Create contract allocations if multi-contract
        if (isMultiContract && requestData) {
          const allocations = contractAllocations.map(a => {
            let allocUf: number;
            let allocClp: number;
            if (formData.currency === "CLP") {
              allocClp = Math.round(a.amount);
              allocUf = Math.round((a.amount / ufValue) * 10000) / 10000;
            } else {
              allocUf = Math.round(a.amount * 10000) / 10000;
              allocClp = Math.round(a.amount * ufValue);
            }
            return {
              oc_request_id: requestData.id,
              contract_id: a.contractId,
              amount_uf: allocUf,
              amount_clp: allocClp
            };
          });
          
          const { error: allocError } = await supabase
            .from("oc_request_contract_allocations")
            .insert(allocations);
          
          if (allocError) throw allocError;
        }
        
        // Create payment plan
        if (paymentPlan.length > 0) {
          const planItems = paymentPlan.map((p, idx) => {
            const pAmount = parseFloat(p.amount) || 0;
            let pUf: number;
            if (formData.currency === "CLP") {
              pUf = ufValue > 0 ? pAmount / ufValue : 0;
            } else {
              pUf = pAmount;
            }
            return {
              oc_request_id: requestData.id,
              payment_number: idx + 1,
              description: p.description || `Pago ${idx + 1}`,
              amount_uf: Math.round(pUf * 10000) / 10000,
              due_date: p.due_date || null,
              status: "pending"
            };
          });
          await supabase.from("oc_payment_plans").insert(planItems);
        } else {
          // Create single payment
          await supabase.from("oc_payment_plans").insert({
            oc_request_id: requestData.id,
            payment_number: 1,
            description: "Pago único",
            amount_uf: totalAmountUf,
            due_date: null,
            status: "pending"
          });
        }
        
        toast({ title: "Solicitud creada", description: `Solicitud ${number} creada exitosamente` });
      } else {
        // Create Purchase Order directly
        const { number } = await generateNumber();
        
        // Upload quotation file if present
        let quotationData: { url: string; fileName: string } | null = null;
        if (quotationFile) {
          quotationData = await uploadQuotationFile();
        }
        
        const orderPayload: any = {
          contract_id: primaryContractId,
          budget_id: null,
          budget_line_id: null,
          opex_master_id: masterLine?.id || null,
          opex_category_id: selectedCategoryId || null,
          order_number: formData.order_number || number,
          order_date: formData.order_date,
          description: formData.description,
          amount_uf: totalAmountUf,
          amount_clp: totalAmountClp,
          input_currency: formData.currency,
          uf_value_at_entry: ufValue,
          supplier_id: formData.supplier_id,
          supplier_name: formData.supplier_name,
          year: year,
          status: "abierta",
          budget_classification: "OPEX",
          attachment_url: quotationData?.url || null
        };
        
        const { data: orderData, error: orderError } = await supabase
          .from("purchase_orders")
          .insert(orderPayload)
          .select()
          .single();
        
        if (orderError) throw orderError;
        
        // Create contract allocations if multi-contract
        if (isMultiContract && orderData) {
          const allocations = contractAllocations.map(a => {
            let allocUf: number;
            let allocClp: number;
            if (formData.currency === "CLP") {
              allocClp = Math.round(a.amount);
              allocUf = Math.round((a.amount / ufValue) * 10000) / 10000;
            } else {
              allocUf = Math.round(a.amount * 10000) / 10000;
              allocClp = Math.round(a.amount * ufValue);
            }
            return {
              purchase_order_id: orderData.id,
              contract_id: a.contractId,
              amount_uf: allocUf,
              amount_clp: allocClp
            };
          });
          
          const { error: allocError } = await supabase
            .from("purchase_order_contract_allocations")
            .insert(allocations);
          
          if (allocError) throw allocError;
        }
        
        toast({ title: "Orden creada", description: `OC ${formData.order_number || number} creada exitosamente` });
      }
      
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error creating:", error);
      toast({ title: "Error", description: error.message || "Error al crear", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  
  // Reset and close
  const handleClose = () => {
    setActiveTab("basic");
    setBudgetType("opex");
    setSelectedCategoryId("");
    setIsMultiContract(false);
    setSingleContractId("");
    setContractAllocations([]);
    setPaymentPlan([]);
    setQuotationFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFormData({
      description: "",
      amount: "",
      currency: "CLP",
      order_number: "",
      order_date: new Date().toISOString().split('T')[0],
      supplier_id: null,
      supplier_name: null,
      project_name: ""
    });
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "request" ? "Nueva Solicitud de OC" : "Nueva Orden de Compra"}
          </DialogTitle>
          <DialogDescription>
            Crear {mode === "request" ? "solicitud" : "orden"} centralizada con asignación a contratos
          </DialogDescription>
        </DialogHeader>
        
        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="basic">Datos</TabsTrigger>
              <TabsTrigger value="contracts">Contratos</TabsTrigger>
              <TabsTrigger value="payments">Pagos</TabsTrigger>
            </TabsList>
            
            <ScrollArea className="flex-1 p-1">
              <TabsContent value="basic" className="mt-4 space-y-4">
                {/* Category Selection */}
                <div className="space-y-2">
                  <Label>Categoría OPEX *</Label>
                  <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {opexCategories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCategoryId && (
                    <p className="text-xs text-muted-foreground">
                      Presupuesto disponible: ${availableBudget.toLocaleString("es-CL")}
                    </p>
                  )}
                </div>
                
                {/* Amount and Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Monto *</Label>
                    <Input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0"
                      min="0"
                      step="1"
                    />
                    {enteredAmount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        ≈ {formData.currency === "CLP" ? `${convertedAmount} UF` : `$${convertedAmount}`}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select 
                      value={formData.currency} 
                      onValueChange={(v: "UF" | "CLP") => setFormData(prev => ({ ...prev, currency: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLP">$ (CLP)</SelectItem>
                        <SelectItem value="UF">UF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Project Name */}
                <div className="space-y-2">
                  <Label>Nombre Proyecto</Label>
                  <Input
                    value={formData.project_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, project_name: e.target.value }))}
                    placeholder="Nombre del proyecto o referencia"
                  />
                </div>
                
                {/* Supplier */}
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <SupplierSelect
                    value={formData.supplier_id}
                    onChange={(id, name) => setFormData(prev => ({ 
                      ...prev, 
                      supplier_id: id, 
                      supplier_name: name 
                    }))}
                  />
                </div>
                
                {/* Description */}
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción del trabajo o servicio"
                    rows={2}
                  />
                </div>
                
                {/* Quotation File Upload */}
                <div className="space-y-2">
                  <Label>Cotización (archivo)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  />
                  {!quotationFile ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Subir cotización
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 p-2 border rounded bg-muted/50">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{quotationFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={handleRemoveFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                
                {/* Order specific fields */}
                {mode === "order" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Número OC</Label>
                      <Input
                        value={formData.order_number}
                        onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                        placeholder="Auto-generado si vacío"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha OC</Label>
                      <Input
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="contracts" className="mt-4 space-y-4">
                {/* Multi-contract toggle */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="multi-contract"
                    checked={isMultiContract}
                    onCheckedChange={(checked) => setIsMultiContract(checked === true)}
                  />
                  <Label htmlFor="multi-contract" className="cursor-pointer">
                    Asignar a múltiples contratos
                  </Label>
                </div>
                
                {!isMultiContract ? (
                  <div className="space-y-2">
                    <Label>Contrato *</Label>
                    <Select value={singleContractId} onValueChange={setSingleContractId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        {contracts.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <span>{c.name}</span>
                              {c.cebe && <span className="text-xs text-muted-foreground">({c.cebe})</span>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {singleContractId && (
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const selectedContract = contracts.find(c => c.id === singleContractId);
                          return selectedContract?.cebe ? `CEBE: ${selectedContract.cebe}` : null;
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Asignación por Contrato</Label>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddAllocation}>
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    
                    {contractAllocations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Agregue contratos para asignar montos
                      </p>
                    ) : (
                      <div className="border rounded-md max-h-[200px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Contrato</TableHead>
                              <TableHead>CEBE</TableHead>
                              <TableHead>Monto ({formData.currency})</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {contractAllocations.map((alloc, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <Select 
                                    value={alloc.contractId} 
                                    onValueChange={(v) => handleUpdateAllocation(idx, "contractId", v)}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {contracts.map(c => (
                                        <SelectItem 
                                          key={c.id} 
                                          value={c.id}
                                          disabled={contractAllocations.some((a, i) => i !== idx && a.contractId === c.id)}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span>{c.name}</span>
                                            {c.cebe && <span className="text-xs text-muted-foreground">({c.cebe})</span>}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {alloc.cebe || "-"}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    value={alloc.amount || ""}
                                    onChange={(e) => handleUpdateAllocation(idx, "amount", parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="1"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveAllocation(idx)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    
                    {contractAllocations.length > 0 && (
                      <div className="flex justify-between text-sm p-2 bg-muted rounded">
                        <span>Total asignado:</span>
                        <span className={totalAllocated !== enteredAmount ? "text-destructive font-medium" : "font-medium"}>
                          {formData.currency === "CLP" ? "$" : ""}{totalAllocated.toLocaleString("es-CL")} {formData.currency === "UF" ? "UF" : ""}
                          {totalAllocated !== enteredAmount && ` (debe ser ${enteredAmount.toLocaleString("es-CL")})`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="payments" className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Plan de Pagos (opcional)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddPaymentItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Pago
                  </Button>
                </div>
                
                {paymentPlan.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Sin plan de pagos definido (se creará pago único automáticamente)
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Monto ({formData.currency})</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentPlan.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(e) => handleUpdatePaymentItem(idx, "description", e.target.value)}
                              placeholder={`Pago ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.amount}
                              onChange={(e) => handleUpdatePaymentItem(idx, "amount", e.target.value)}
                              min="0"
                              step="1"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={item.due_date}
                              onChange={(e) => handleUpdatePaymentItem(idx, "due_date", e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePaymentItem(idx)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || loadingData}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "request" ? "Crear Solicitud" : "Crear OC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
