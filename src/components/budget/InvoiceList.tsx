import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, FileText, Mail, CheckCircle, Clock, Trash2, Upload, Folder, ArrowLeft, Paperclip, ExternalLink, Check, Pencil, AlertTriangle, CreditCard, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";
import { BudgetSemaphore } from "./BudgetSemaphore";
import { cn } from "@/lib/utils";
import { validateFile, sanitizeFileName } from "@/lib/fileValidation";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  amount_uf: number;
  reception_status: string;
  received_at: string | null;
  email_sent_to: string | null;
  attachment_url: string | null;
}

interface CreditNote {
  id: string;
  credit_note_number: string;
  credit_note_date: string;
  amount_uf: number;
  invoice_id: string;
  reason: string | null;
  attachment_url: string | null;
}

interface RepositoryFolder {
  id: string;
  name: string;
  parent_id: string | null;
  folder_type: string | null;
}

interface RepositoryFile {
  id: string;
  name: string;
  url: string;
  file_type: string | null;
  folder_id: string;
}

interface InvoiceListProps {
  purchaseOrder: {
    id: string;
    order_number: string;
    amount_uf: number;
    // Multi-contract allocation info (optional)
    is_multi_contract?: boolean;
    allocated_amount_uf?: number;
    total_order_amount_uf?: number;
  };
  onUpdate: () => void;
}

export const InvoiceList = ({ purchaseOrder, onUpdate }: InvoiceListProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [groupTotals, setGroupTotals] = useState<{
    totalInvoiced: number;
    totalCreditNotes: number;
    totalAmountUF: number;
  } | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showCreditNoteDialog, setShowCreditNoteDialog] = useState(false);
  const [invoiceWarning, setInvoiceWarning] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editInvoice, setEditInvoice] = useState({
    invoice_number: "",
    invoice_date: "",
    amount: "",
    currency: "UF" as "UF" | "CLP",
  });
  const [email, setEmail] = useState("");
  const [newInvoice, setNewInvoice] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    amount: "",
    currency: "UF" as "UF" | "CLP",
    attachment_url: "",
    attachment_name: "",
  });
  const [newCreditNote, setNewCreditNote] = useState({
    credit_note_number: "",
    credit_note_date: new Date().toISOString().split("T")[0],
    amount: "",
    currency: "UF" as "UF" | "CLP",
    invoice_id: "",
    reason: "",
    attachment_url: "",
    attachment_name: "",
  });
  
  // File picker states
  const [folders, setFolders] = useState<RepositoryFolder[]>([]);
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<RepositoryFolder | null>(null);
  const [folderPath, setFolderPath] = useState<RepositoryFolder[]>([]);
  const [selectedFile, setSelectedFile] = useState<RepositoryFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"select" | "upload">("select");
  const [uploadedFile, setUploadedFile] = useState<RepositoryFile | null>(null);
  const [askSendEmail, setAskSendEmail] = useState(false);
  const [contractId, setContractId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos, convertPesosToUF, ufValue } = useBudgetContext();

  useEffect(() => {
    loadInvoices();
    loadCreditNotes();
    loadGroupTotals();
    loadLastEmail();
    loadContractId();
  }, [purchaseOrder.id]);

  useEffect(() => {
    // If the user opens the same OC (same id) but order_number changes, refresh group totals.
    loadGroupTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrder.order_number, purchaseOrder.is_multi_contract, purchaseOrder.total_order_amount_uf, purchaseOrder.allocated_amount_uf]);

  const loadContractId = async () => {
    const { data } = await supabase
      .from("purchase_orders")
      .select("contract_id")
      .eq("id", purchaseOrder.id)
      .single();
    if (data) {
      setContractId(data.contract_id);
    }
  };

  const loadInvoices = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("purchase_order_id", purchaseOrder.id)
      .order("invoice_date", { ascending: false });
    setInvoices(data || []);
  };

  const loadCreditNotes = async () => {
    const { data } = await supabase
      .from("credit_notes")
      .select("*")
      .eq("purchase_order_id", purchaseOrder.id)
      .order("credit_note_date", { ascending: false });
    setCreditNotes(data || []);
  };

  const loadGroupTotals = async () => {
    if (!purchaseOrder.is_multi_contract) {
      setGroupTotals(null);
      return;
    }

    try {
      // Aggregate totals across all purchase_orders that share this OC number.
      const { data: poRows, error: poError } = await supabase
        .from("purchase_orders")
        .select("id, amount_uf")
        .eq("order_number", purchaseOrder.order_number)
        .is("deleted_at", null);

      if (poError) throw poError;

      const ids = (poRows || []).map((r: any) => r.id);
      const totalAmountUF = (poRows || []).reduce((sum: number, r: any) => sum + (r.amount_uf || 0), 0);

      if (ids.length === 0) {
        setGroupTotals({ totalInvoiced: 0, totalCreditNotes: 0, totalAmountUF: 0 });
        return;
      }

      const { data: invRows, error: invError } = await supabase
        .from("invoices")
        .select("purchase_order_id, amount_uf")
        .in("purchase_order_id", ids)
        .is("deleted_at", null);
      if (invError) throw invError;

      const { data: cnRows, error: cnError } = await supabase
        .from("credit_notes")
        .select("purchase_order_id, amount_uf")
        .in("purchase_order_id", ids)
        .is("deleted_at", null);
      if (cnError) throw cnError;

      const totalInvoiced = (invRows || []).reduce((sum: number, r: any) => sum + (r.amount_uf || 0), 0);
      const totalCreditNotes = (cnRows || []).reduce((sum: number, r: any) => sum + (r.amount_uf || 0), 0);

      setGroupTotals({ totalInvoiced, totalCreditNotes, totalAmountUF });
    } catch (error) {
      console.error("Error loading grouped invoice totals:", error);
      setGroupTotals(null);
    }
  };

  const loadLastEmail = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("user_settings")
        .select("last_invoice_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.last_invoice_email) {
        setEmail(data.last_invoice_email);
      }
    }
  };

  const loadFolderContents = async (folderId: string | null) => {
    if (!contractId) return;
    
    try {
      let query = supabase
        .from("repository_folders")
        .select("*")
        .eq("contract_id", contractId);

      if (folderId) {
        query = query.eq("parent_id", folderId);
      } else {
        query = query.is("parent_id", null);
      }

      const { data: folderData } = await query;
      setFolders(folderData || []);

      if (folderId) {
        const { data: fileData } = await supabase
          .from("repository_files")
          .select("*")
          .eq("folder_id", folderId)
          .order("uploaded_at", { ascending: false });
        setFiles(fileData || []);
      } else {
        setFiles([]);
      }
    } catch (error) {
      console.error("Error loading folder contents:", error);
    }
  };

  const findFacturasFolder = async (): Promise<RepositoryFolder | null> => {
    if (!contractId) return null;
    
    const { data } = await supabase
      .from("repository_folders")
      .select("*")
      .eq("contract_id", contractId)
      .or("folder_type.ilike.%factura%,name.ilike.%factura%")
      .limit(1);
    
    return data?.[0] || null;
  };

  // Calculate totals
  const localTotalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount_uf, 0);
  const localTotalCreditNotes = creditNotes.reduce((sum, cn) => sum + cn.amount_uf, 0);

  // For multi-contract OCs shown in a contract context, we display invoicing proportionally
  // to the allocated amount (so % and amounts match the global OC status).
  const localAmountUF = purchaseOrder.amount_uf || 0;
  const totalOrderAmountUF = groupTotals?.totalAmountUF ?? purchaseOrder.total_order_amount_uf ?? localAmountUF;
  const allocatedAmountUF = purchaseOrder.allocated_amount_uf ?? localAmountUF;
  const isMultiContract = Boolean(purchaseOrder.is_multi_contract && totalOrderAmountUF > 0);
  const allocationWeight = isMultiContract ? allocatedAmountUF / totalOrderAmountUF : 1;

  const sourceTotalInvoiced = groupTotals?.totalInvoiced ?? localTotalInvoiced;
  const sourceTotalCreditNotes = groupTotals?.totalCreditNotes ?? localTotalCreditNotes;

  const displayedTotalInvoiced = sourceTotalInvoiced * allocationWeight;
  const displayedTotalCreditNotes = sourceTotalCreditNotes * allocationWeight;
  const displayedNetInvoiced = displayedTotalInvoiced - displayedTotalCreditNotes;
  const pendingAmount = localAmountUF - displayedNetInvoiced;
  
  // Determine OC status
  const getOCStatus = () => {
    if (displayedNetInvoiced > localAmountUF) {
      return "sobrepasado";
    } else if (Math.abs(displayedNetInvoiced - localAmountUF) < 0.01) {
      return "cerrada";
    } else {
      return "ok";
    }
  };

  const ocStatus = getOCStatus();
  const percentageConsumed = localAmountUF > 0 ? (displayedNetInvoiced / localAmountUF) * 100 : 0;

  // Validate invoice amount
  const validateInvoiceAmount = (amount: number, excludeInvoiceId?: string) => {
    const currentTotalInvoiced = invoices
      .filter(inv => inv.id !== excludeInvoiceId)
      .reduce((sum, inv) => sum + inv.amount_uf, 0);
    
    const projectedTotal = currentTotalInvoiced + amount - localTotalCreditNotes;
    
    if (projectedTotal > localAmountUF) {
      return {
        valid: false,
        warning: "Factura o suma de facturas sobrepasa el monto de la OC. Regularizar",
        exceedsBy: projectedTotal - localAmountUF
      };
    }
    
    return { valid: true, warning: null };
  };

  const handleCreateInvoice = async () => {
    try {
      const inputAmount = parseFloat(newInvoice.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (newInvoice.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = convertUFToPesos(inputAmount);
      } else {
        amountCLP = inputAmount;
        amountUF = convertPesosToUF(inputAmount);
      }

      // Validate against OC
      const validation = validateInvoiceAmount(amountUF);
      if (!validation.valid) {
        setInvoiceWarning(validation.warning);
        // Still allow creation but show warning
      }

      const { error } = await supabase.from("invoices").insert({
        purchase_order_id: purchaseOrder.id,
        invoice_number: newInvoice.invoice_number,
        invoice_date: newInvoice.invoice_date,
        amount_uf: amountUF,
        amount_clp: amountCLP,
        input_currency: newInvoice.currency,
        uf_value_at_entry: ufValue,
        attachment_url: newInvoice.attachment_url || null,
      });

      if (error) throw error;

      if (!validation.valid) {
        toast({ 
          variant: "destructive",
          title: "Advertencia", 
          description: validation.warning 
        });
      } else {
        toast({ title: "Factura agregada" });
      }
      
      setShowNewDialog(false);
      setNewInvoice({ 
        invoice_number: "", 
        invoice_date: new Date().toISOString().split("T")[0], 
        amount: "", 
        currency: "UF",
        attachment_url: "",
        attachment_name: "",
      });
      setInvoiceWarning(null);
      loadInvoices();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleCreateCreditNote = async () => {
    try {
      const inputAmount = parseFloat(newCreditNote.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (newCreditNote.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = convertUFToPesos(inputAmount);
      } else {
        amountCLP = inputAmount;
        amountUF = convertPesosToUF(inputAmount);
      }

      const { error } = await supabase.from("credit_notes").insert({
        purchase_order_id: purchaseOrder.id,
        invoice_id: newCreditNote.invoice_id,
        credit_note_number: newCreditNote.credit_note_number,
        credit_note_date: newCreditNote.credit_note_date,
        amount_uf: amountUF,
        amount_clp: amountCLP,
        input_currency: newCreditNote.currency,
        uf_value_at_entry: ufValue,
        reason: newCreditNote.reason || null,
        attachment_url: newCreditNote.attachment_url || null,
      });

      if (error) throw error;

      toast({ title: "Nota de crédito agregada" });
      setShowCreditNoteDialog(false);
      setNewCreditNote({ 
        credit_note_number: "", 
        credit_note_date: new Date().toISOString().split("T")[0], 
        amount: "", 
        currency: "UF",
        invoice_id: "",
        reason: "",
        attachment_url: "",
        attachment_name: "",
      });
      loadCreditNotes();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleStatusClick = async (invoice: Invoice) => {
    if (invoice.reception_status === "recibido") {
      toast({ title: "Factura ya recibida", description: `Enviada a ${invoice.email_sent_to}` });
      return;
    }
    
    setSelectedInvoice(invoice);
    setSelectedFile(null);
    setUploadedFile(null);
    setAskSendEmail(false);
    setActiveTab("select");
    setCurrentFolder(null);
    setFolderPath([]);
    setShowStatusDialog(true);
    
    await loadFolderContents(null);
  };

  const navigateToFolder = async (folder: RepositoryFolder) => {
    setCurrentFolder(folder);
    setFolderPath([...folderPath, folder]);
    setSelectedFile(null);
    await loadFolderContents(folder.id);
  };

  const navigateBack = async () => {
    const newPath = [...folderPath];
    newPath.pop();
    const parentFolder = newPath[newPath.length - 1] || null;
    setFolderPath(newPath);
    setCurrentFolder(parentFolder);
    setSelectedFile(null);
    await loadFolderContents(parentFolder?.id || null);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file before upload
    const validation = validateFile(file);
    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "Archivo no válido",
        description: validation.error,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setUploading(true);
    try {
      let targetFolder = await findFacturasFolder();
      
      if (!targetFolder) {
        const { data: newFolder, error: folderError } = await supabase
          .from("repository_folders")
          .insert({
            contract_id: contractId,
            name: "Facturas",
            is_base_folder: false,
            folder_type: "facturas",
          })
          .select()
          .single();
        
        if (folderError) throw folderError;
        targetFolder = newFolder;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${contractId}/${targetFolder.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the storage path reference instead of public URL for security
      // The path will be converted to a signed URL when accessed
      const storagePath = `storage://repository-files/${filePath}`;

      const { data: newFile, error: dbError } = await supabase
        .from("repository_files")
        .insert({
          folder_id: targetFolder.id,
          name: file.name,
          url: storagePath,
          file_type: fileExt || null,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast({ title: "Archivo subido", description: `Archivo guardado en carpeta Facturas` });
      setUploadedFile(newFile);
      setAskSendEmail(true);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirmReceived = async (fileUrl: string) => {
    if (!selectedInvoice) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase
        .from("invoices")
        .update({
          reception_status: "recibido",
          received_at: new Date().toISOString(),
          received_by: user?.id,
          attachment_url: fileUrl,
          email_sent_to: email,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", selectedInvoice.id);

      if (user) {
        await supabase
          .from("user_settings")
          .upsert({ user_id: user.id, last_invoice_email: email }, { onConflict: "user_id" });
      }

      toast({ title: "Factura recibida", description: `Email enviado a ${email}` });
      setShowStatusDialog(false);
      setAskSendEmail(false);
      loadInvoices();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    try {
      // Delete associated credit notes first
      await supabase.from("credit_notes").delete().eq("invoice_id", id);
      // Delete the invoice
      await supabase.from("invoices").delete().eq("id", id);
      loadInvoices();
      loadCreditNotes();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteCreditNote = async (id: string) => {
    try {
      await supabase.from("credit_notes").delete().eq("id", id);
      loadCreditNotes();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleEditClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEditInvoice({
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      amount: invoice.amount_uf.toString(),
      currency: "UF",
    });
    setShowEditDialog(true);
  };

  const handleUpdateInvoice = async () => {
    if (!selectedInvoice) return;
    
    try {
      const inputAmount = parseFloat(editInvoice.amount) || 0;
      let amountUF: number;
      let amountCLP: number;

      if (editInvoice.currency === "UF") {
        amountUF = inputAmount;
        amountCLP = convertUFToPesos(inputAmount);
      } else {
        amountCLP = inputAmount;
        amountUF = convertPesosToUF(inputAmount);
      }

      // Validate against OC (excluding current invoice)
      const validation = validateInvoiceAmount(amountUF, selectedInvoice.id);
      if (!validation.valid) {
        setInvoiceWarning(validation.warning);
      }

      const { error } = await supabase
        .from("invoices")
        .update({
          invoice_number: editInvoice.invoice_number,
          invoice_date: editInvoice.invoice_date,
          amount_uf: amountUF,
          amount_clp: amountCLP,
          input_currency: editInvoice.currency,
          uf_value_at_entry: ufValue,
        })
        .eq("id", selectedInvoice.id);

      if (error) throw error;

      if (!validation.valid) {
        toast({ 
          variant: "destructive",
          title: "Advertencia", 
          description: validation.warning 
        });
      } else {
        toast({ title: "Factura actualizada" });
      }
      
      setShowEditDialog(false);
      setSelectedInvoice(null);
      setInvoiceWarning(null);
      loadInvoices();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const openFilePicker = () => {
    setShowFilePicker(true);
    loadFolderContents(null);
  };

  const handleRequestCreditNote = () => {
    // Open email with pre-filled subject for credit note request
    const subject = encodeURIComponent(`Solicitud de Nota de Crédito - OC ${purchaseOrder.order_number}`);
    const body = encodeURIComponent(`Estimados,\n\nPor medio del presente, solicito la emisión de una nota de crédito correspondiente a la Orden de Compra ${purchaseOrder.order_number}.\n\nMotivo: La facturación excede el monto de la OC.\n\nSaludos cordiales.`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  // Get credit notes for a specific invoice
  const getCreditNotesForInvoice = (invoiceId: string) => {
    return creditNotes.filter(cn => cn.invoice_id === invoiceId);
  };

  // Check if this is a multi-contract OC viewed from within a contract
  const isMultiContractInLocalView = isMultiContract && contractId;

  const handleMultiContractWarning = () => {
    toast({
      title: "OC Multilocal",
      description: "Esta OC es multilocal. Solo se puede gestionar desde la Central de OC.",
      action: (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.href = `/purchase-orders?search=${purchaseOrder.order_number}`}
        >
          Ir a Central
        </Button>
      ),
    });
  };

  return (
    <div className="space-y-4">
      {isMultiContractInLocalView && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">
            OC Multilocal - Solo se puede gestionar desde la{" "}
            <a 
              href={`/purchase-orders?search=${encodeURIComponent(purchaseOrder.order_number)}`}
              className="font-medium underline hover:text-amber-900"
            >
              Central de OC
            </a>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Monto OC</p>
            <p className="font-bold">{formatUF(localAmountUF)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Facturado</p>
            <p className="font-bold">{formatUF(displayedNetInvoiced)}</p>
          </div>
          {displayedTotalCreditNotes > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Notas Crédito</p>
              <p className="font-bold text-green-600">-{formatUF(displayedTotalCreditNotes)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className={cn("font-bold", pendingAmount < 0 && "text-red-600")}>
              {formatUF(pendingAmount)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ocStatus === "ok" && (
              <Badge className="bg-green-500">
                OK ({percentageConsumed.toFixed(0)}%)
              </Badge>
            )}
            {ocStatus === "cerrada" && (
              <Badge className="bg-blue-500">Cerrada</Badge>
            )}
            {ocStatus === "sobrepasado" && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Sobrepasado
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ocStatus === "sobrepasado" && !isMultiContractInLocalView && (
            <Button 
              size="sm" 
              variant="outline" 
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
              onClick={handleRequestCreditNote}
            >
              <Send className="h-4 w-4 mr-1" />
              Solicitar Nota Crédito
            </Button>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            onClick={isMultiContractInLocalView ? handleMultiContractWarning : () => setShowCreditNoteDialog(true)}
            disabled={invoices.length === 0 && !isMultiContractInLocalView}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Nota Crédito
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={isMultiContractInLocalView ? handleMultiContractWarning : () => setShowNewDialog(true)}
            disabled={ocStatus === "cerrada" && !isMultiContractInLocalView}
            title={isMultiContractInLocalView ? "OC Multilocal - gestionar desde Central de OC" : ocStatus === "cerrada" ? "OC cerrada - no se permiten más facturas" : undefined}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nueva Factura
          </Button>
        </div>
      </div>

      {invoices.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Factura</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Notas Crédito</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const invoiceCreditNotes = getCreditNotesForInvoice(invoice.id);
              const invoiceCreditTotal = invoiceCreditNotes.reduce((sum, cn) => sum + cn.amount_uf, 0);
              
              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {invoice.invoice_number}
                      {invoice.attachment_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => window.open(invoice.attachment_url!, "_blank")}
                        >
                          <Paperclip className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(invoice.invoice_date).toLocaleDateString("es-CL")}</TableCell>
                  <TableCell className="text-right font-mono">{formatUF(invoice.amount_uf)}</TableCell>
                  <TableCell>
                    {invoiceCreditNotes.length > 0 ? (
                      <div className="space-y-1">
                        {invoiceCreditNotes.map((cn) => (
                          <div key={cn.id} className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-green-600 border-green-300">
                              NC {cn.credit_note_number}: -{formatUF(cn.amount_uf)}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0 text-destructive"
                              onClick={() => handleDeleteCreditNote(cn.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                          Neto: {formatUF(invoice.amount_uf - invoiceCreditTotal)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => handleStatusClick(invoice)}>
                      {invoice.reception_status === "recibido" ? (
                        <Badge className="bg-green-500 flex items-center gap-1 w-fit cursor-default">
                          <CheckCircle className="h-3 w-3" />
                          Recibido
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit cursor-pointer hover:bg-accent">
                          <Clock className="h-3 w-3" />
                          Pendiente
                        </Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEditClick(invoice)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteInvoice(invoice.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* New Invoice Dialog */}
      <Dialog open={showNewDialog} onOpenChange={(open) => { setShowNewDialog(open); if (!open) setInvoiceWarning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Factura - OC {purchaseOrder.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Factura</Label>
                <Input value={newInvoice.invoice_number} onChange={(e) => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={newInvoice.invoice_date} onChange={(e) => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step={newInvoice.currency === "UF" ? "0.01" : "1"} 
                  value={newInvoice.amount} 
                  onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })} 
                  className="flex-1"
                />
                <Select value={newInvoice.currency} onValueChange={(v) => setNewInvoice({ ...newInvoice, currency: v as "UF" | "CLP" })}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newInvoice.amount && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivalente: {newInvoice.currency === "CLP" 
                    ? formatUF(convertPesosToUF(parseFloat(newInvoice.amount))) 
                    : formatCLP(convertUFToPesos(parseFloat(newInvoice.amount)))}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Disponible en OC: {formatUF(pendingAmount)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Archivo Adjunto</Label>
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={openFilePicker}
                  className="flex items-center gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  {newInvoice.attachment_name || "Seleccionar archivo"}
                </Button>
                {newInvoice.attachment_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(newInvoice.attachment_url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {invoiceWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">ADVERTENCIA</p>
                    <p className="text-sm text-amber-800">{invoiceWarning}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewDialog(false); setInvoiceWarning(null); }}>Cancelar</Button>
            <Button onClick={handleCreateInvoice}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Note Dialog */}
      <Dialog open={showCreditNoteDialog} onOpenChange={setShowCreditNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Nota de Crédito - OC {purchaseOrder.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Nota de Crédito</Label>
                <Input 
                  value={newCreditNote.credit_note_number} 
                  onChange={(e) => setNewCreditNote({ ...newCreditNote, credit_note_number: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input 
                  type="date" 
                  value={newCreditNote.credit_note_date} 
                  onChange={(e) => setNewCreditNote({ ...newCreditNote, credit_note_date: e.target.value })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Factura Asociada *</Label>
              <Select 
                value={newCreditNote.invoice_id} 
                onValueChange={(v) => setNewCreditNote({ ...newCreditNote, invoice_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione una factura" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number} - {formatUF(invoice.amount_uf)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step={newCreditNote.currency === "UF" ? "0.01" : "1"} 
                  value={newCreditNote.amount} 
                  onChange={(e) => setNewCreditNote({ ...newCreditNote, amount: e.target.value })} 
                  className="flex-1"
                />
                <Select 
                  value={newCreditNote.currency} 
                  onValueChange={(v) => setNewCreditNote({ ...newCreditNote, currency: v as "UF" | "CLP" })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newCreditNote.amount && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivalente: {newCreditNote.currency === "CLP" 
                    ? formatUF(convertPesosToUF(parseFloat(newCreditNote.amount))) 
                    : formatCLP(convertUFToPesos(parseFloat(newCreditNote.amount)))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input 
                value={newCreditNote.reason} 
                onChange={(e) => setNewCreditNote({ ...newCreditNote, reason: e.target.value })} 
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditNoteDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleCreateCreditNote}
              disabled={!newCreditNote.invoice_id || !newCreditNote.credit_note_number || !newCreditNote.amount}
            >
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setInvoiceWarning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Factura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Factura</Label>
                <Input 
                  value={editInvoice.invoice_number} 
                  onChange={(e) => setEditInvoice({ ...editInvoice, invoice_number: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input 
                  type="date" 
                  value={editInvoice.invoice_date} 
                  onChange={(e) => setEditInvoice({ ...editInvoice, invoice_date: e.target.value })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  step={editInvoice.currency === "UF" ? "0.01" : "1"} 
                  value={editInvoice.amount} 
                  onChange={(e) => setEditInvoice({ ...editInvoice, amount: e.target.value })} 
                  className="flex-1"
                />
                <Select 
                  value={editInvoice.currency} 
                  onValueChange={(v) => setEditInvoice({ ...editInvoice, currency: v as "UF" | "CLP" })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">CLP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editInvoice.amount && ufValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivalente: {editInvoice.currency === "CLP" 
                    ? formatUF(convertPesosToUF(parseFloat(editInvoice.amount))) 
                    : formatCLP(convertUFToPesos(parseFloat(editInvoice.amount)))}
                </p>
              )}
            </div>

            {invoiceWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">ADVERTENCIA</p>
                    <p className="text-sm text-amber-800">{invoiceWarning}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setInvoiceWarning(null); }}>Cancelar</Button>
            <Button onClick={handleUpdateInvoice}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Marcar Factura como Recibida</DialogTitle>
            <DialogDescription>
              Factura {selectedInvoice?.invoice_number} - Seleccione o suba el archivo PDF de la factura
            </DialogDescription>
          </DialogHeader>

          {askSendEmail ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Archivo subido correctamente. ¿Desea enviar el archivo vía Email?
              </p>
              <div className="space-y-2">
                <Label>Email del destinatario</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowStatusDialog(false);
                  setAskSendEmail(false);
                }}>
                  No enviar
                </Button>
                <Button onClick={() => uploadedFile && handleConfirmReceived(uploadedFile.url)} disabled={!email}>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar Email
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "select" | "upload")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="select">Seleccionar del Repositorio</TabsTrigger>
                  <TabsTrigger value="upload">Subir Archivo</TabsTrigger>
                </TabsList>

                <TabsContent value="select" className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button onClick={() => { setCurrentFolder(null); setFolderPath([]); loadFolderContents(null); }} className="hover:underline">
                      Repositorio
                    </button>
                    {folderPath.map((folder, index) => (
                      <span key={folder.id} className="flex items-center gap-2">
                        <span>/</span>
                        <button
                          onClick={() => {
                            const newPath = folderPath.slice(0, index + 1);
                            setFolderPath(newPath);
                            setCurrentFolder(folder);
                            loadFolderContents(folder.id);
                          }}
                          className="hover:underline"
                        >
                          {folder.name}
                        </button>
                      </span>
                    ))}
                  </div>

                  <ScrollArea className="h-[250px] border rounded-lg p-2">
                    <div className="space-y-1">
                      {currentFolder && (
                        <button
                          onClick={navigateBack}
                          className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          <span>Volver</span>
                        </button>
                      )}

                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => navigateToFolder(folder)}
                          className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                        >
                          <Folder className="h-4 w-4 text-amber-500" />
                          <span>{folder.name}</span>
                        </button>
                      ))}

                      {files.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => setSelectedFile(file)}
                          className={cn(
                            "w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left",
                            selectedFile?.id === file.id && "bg-primary/10 ring-1 ring-primary"
                          )}
                        >
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="flex-1 truncate">{file.name}</span>
                          {selectedFile?.id === file.id && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      ))}

                      {folders.length === 0 && files.length === 0 && currentFolder && (
                        <div className="py-8 text-center text-muted-foreground">
                          Esta carpeta está vacía
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="space-y-2">
                    <Label>Email del destinatario</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
                  </div>
                </TabsContent>

                <TabsContent value="upload" className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".pdf"
                    />
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      El archivo se guardará en la carpeta Facturas del repositorio
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? "Subiendo..." : "Seleccionar Archivo PDF"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancelar</Button>
                <Button 
                  onClick={() => selectedFile && handleConfirmReceived(selectedFile.url)} 
                  disabled={!selectedFile || !email}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Confirmar y Enviar Email
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* File Picker for new invoice attachment */}
      <Dialog open={showFilePicker} onOpenChange={setShowFilePicker}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seleccionar Archivo de Factura</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <button onClick={() => { setCurrentFolder(null); setFolderPath([]); loadFolderContents(null); }} className="hover:underline">
              Repositorio
            </button>
            {folderPath.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-2">
                <span>/</span>
                <button
                  onClick={() => {
                    const newPath = folderPath.slice(0, index + 1);
                    setFolderPath(newPath);
                    setCurrentFolder(folder);
                    loadFolderContents(folder.id);
                  }}
                  className="hover:underline"
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>

          <ScrollArea className="h-[300px] border rounded-lg p-2">
            <div className="space-y-1">
              {currentFolder && (
                <button
                  onClick={navigateBack}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Volver</span>
                </button>
              )}

              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => navigateToFolder(folder)}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left"
                >
                  <Folder className="h-4 w-4 text-amber-500" />
                  <span>{folder.name}</span>
                </button>
              ))}

              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left",
                    selectedFile?.id === file.id && "bg-primary/10 ring-1 ring-primary"
                  )}
                >
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="flex-1 truncate">{file.name}</span>
                  {selectedFile?.id === file.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}

              {folders.length === 0 && files.length === 0 && currentFolder && (
                <div className="py-8 text-center text-muted-foreground">
                  Esta carpeta está vacía
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFilePicker(false)}>Cancelar</Button>
            <Button 
              onClick={() => {
                if (selectedFile) {
                  setNewInvoice({ ...newInvoice, attachment_url: selectedFile.url, attachment_name: selectedFile.name });
                  setShowFilePicker(false);
                  setSelectedFile(null);
                }
              }} 
              disabled={!selectedFile}
            >
              Seleccionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
