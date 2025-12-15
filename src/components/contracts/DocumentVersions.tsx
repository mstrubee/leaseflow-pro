import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Check, Star, Upload, ChevronDown, ChevronRight, Cloud, Link, Send, FileCheck, Signature, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContractDataImportModal } from "./ContractDataImportModal";

export interface DocumentVersion {
  id: string;
  document_type: string;
  url: string;
  uploaded_at: string;
  version_id: string | null;
}

interface CloudConnection {
  id: string;
  provider: string;
  name: string;
  folder_url: string | null;
}

interface CurrentVersionInfo {
  id: string;
  version_number: number;
  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;
  notice_type: string;
  notice_value: string;
}

interface DocumentVersionsProps {
  documents: DocumentVersion[];
  contractId: string;
  contractName: string;
  currentVersion?: CurrentVersionInfo;
  onAddDocument: (url: string, name: string) => Promise<void>;
  onMarkAsFinal: (docId: string) => Promise<void>;
  onSendForSignature?: (email: string, docId: string) => Promise<void>;
  onMarkAsSigned?: (docId: string) => Promise<void>;
  onChangeDocumentType?: (docId: string, newType: string) => Promise<void>;
  onDeleteDocument?: (docId: string) => Promise<void>;
  readOnly?: boolean;
  isRenegotiation?: boolean;
  isSigned?: boolean;
  hasActiveRenegotiation?: boolean;
  onRenegotiationSuccess?: () => void;
  onDataImported?: () => void;
}

const CLOUD_PROVIDERS = [
  { id: "google_drive", name: "Google Drive", icon: "🔵" },
  { id: "onedrive", name: "OneDrive", icon: "🔷" },
  { id: "dropbox", name: "Dropbox", icon: "📦" },
];

export const DocumentVersions = ({
  documents,
  contractId,
  contractName,
  currentVersion,
  onAddDocument,
  onMarkAsFinal,
  onSendForSignature,
  onMarkAsSigned,
  onChangeDocumentType,
  onDeleteDocument,
  readOnly = false,
  isRenegotiation = false,
  isSigned = false,
  hasActiveRenegotiation = false,
  onRenegotiationSuccess,
  onDataImported,
}: DocumentVersionsProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isOpen, setIsOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // File upload dialog
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [suggestedFileName, setSuggestedFileName] = useState("");
  
  // Upload method selection
  const [uploadMethod, setUploadMethod] = useState<"file" | "url" | "cloud">("file");
  
  // Cloud connections
  const [cloudConnections, setCloudConnections] = useState<CloudConnection[]>([]);
  const [selectedCloud, setSelectedCloud] = useState<string>("");

  // Action dialog for "Marcar Final" button
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedDocForAction, setSelectedDocForAction] = useState<string | null>(null);

  // Signature confirmation dialog
  const [signConfirmOpen, setSignConfirmOpen] = useState(false);

  // Send for signature dialog
  const [sendSignatureDialogOpen, setSendSignatureDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Status change dialog
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [selectedDocForStatus, setSelectedDocForStatus] = useState<DocumentVersion | null>(null);

  // Import data modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [uploadedDocumentUrl, setUploadedDocumentUrl] = useState("");

  // Delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadCloudConnections();
  }, []);

  const loadCloudConnections = async () => {
    try {
      const { data, error } = await supabase
        .from("cloud_storage_connections")
        .select("id, provider, name, folder_url")
        .eq("is_active", true);
      
      if (error) throw error;
      setCloudConnections(data || []);
    } catch (error) {
      console.error("Error loading cloud connections:", error);
    }
  };

  const generateSuggestedName = () => {
    const today = format(new Date(), "yyyy.MM.dd");
    const draftType = isRenegotiation ? "borrador_r" : "borrador";
    const versionNumber = documents.filter(d => d.document_type === draftType || d.document_type === "borrador").length + 1;
    return `${today} ${contractName} V_${versionNumber}${isRenegotiation ? " R" : ""}`;
  };

  const handleUseSuggested = () => {
    setNewName(generateSuggestedName());
  };

  const handleAdd = async () => {
    if (!newUrl) return;
    setLoading(true);
    try {
      await onAddDocument(newUrl, newName || generateSuggestedName());
      setNewUrl("");
      setNewName("");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setSuggestedFileName(generateSuggestedName());
      setFileDialogOpen(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadFile = async (shouldImportData: boolean = false) => {
    if (!selectedFile || !suggestedFileName.trim()) return;

    setUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop() || '';
      const filePath = `contracts/${contractId}/${Date.now()}_${suggestedFileName.trim()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("repository-files")
        .getPublicUrl(filePath);

      await onAddDocument(urlData.publicUrl, `${suggestedFileName.trim()}.${ext}`);

      toast({
        title: "Archivo subido",
        description: `El archivo ha sido subido exitosamente`,
      });

      setSelectedFile(null);
      setSuggestedFileName("");
      setFileDialogOpen(false);

      // If user wants to import data, open the import modal
      if (shouldImportData) {
        setUploadedDocumentUrl(urlData.publicUrl);
        setImportModalOpen(true);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo subir el archivo: " + error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleOpenCloudFolder = () => {
    const connection = cloudConnections.find(c => c.id === selectedCloud);
    if (connection?.folder_url) {
      window.open(connection.folder_url, "_blank");
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No hay URL configurada para esta conexión",
      });
    }
  };

  const handleOpenActionDialog = (docId: string) => {
    setSelectedDocForAction(docId);
    setActionDialogOpen(true);
  };

  const handleSelectAction = (action: "draft" | "send" | "sign") => {
    setActionDialogOpen(false);
    
    if (action === "draft") {
      if (selectedDocForAction && onChangeDocumentType) {
        onChangeDocumentType(selectedDocForAction, "borrador");
        toast({
          title: "Estado actualizado",
          description: "El documento ha sido cambiado a Borrador",
        });
      }
    } else if (action === "send") {
      setSendSignatureDialogOpen(true);
    } else if (action === "sign") {
      setSignConfirmOpen(true);
    }
  };

  const handleConfirmSign = async () => {
    setSignConfirmOpen(false);
    if (selectedDocForAction && onMarkAsSigned) {
      await onMarkAsSigned(selectedDocForAction);
    }
    setSelectedDocForAction(null);
  };

  const handleSendForSignature = async () => {
    if (!recipientEmail || !selectedDocForAction) return;
    
    setSendingEmail(true);
    try {
      if (onSendForSignature) {
        await onSendForSignature(recipientEmail, selectedDocForAction);
      }
      
      toast({
        title: "Email enviado",
        description: `El contrato ha sido enviado a ${recipientEmail} para firma`,
      });
      
      setSendSignatureDialogOpen(false);
      setRecipientEmail("");
      setSelectedDocForAction(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo enviar el email: " + error.message,
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleOpenStatusChange = (doc: DocumentVersion) => {
    setSelectedDocForStatus(doc);
    setStatusChangeDialogOpen(true);
  };

  const handleChangeStatus = async (newType: string) => {
    if (!selectedDocForStatus || !onChangeDocumentType) return;
    
    try {
      await onChangeDocumentType(selectedDocForStatus.id, newType);
      toast({
        title: "Estado actualizado",
        description: "El estado del documento ha sido cambiado",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cambiar el estado",
      });
    } finally {
      setStatusChangeDialogOpen(false);
      setSelectedDocForStatus(null);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get all signed documents sorted by date for proper numbering
  const getSignedDocumentLabel = (doc: DocumentVersion) => {
    const signedDocs = documents
      .filter(d => d.document_type === "firmado" || d.document_type === "firmado_r")
      .sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
    
    const docIndex = signedDocs.findIndex(d => d.id === doc.id);
    
    if (docIndex === 0) {
      return { label: "Original", isFirst: true };
    }
    return { label: `R#${docIndex}`, isFirst: false };
  };

  const getDocumentTypeBadge = (doc: DocumentVersion) => {
    const type = doc.document_type;
    
    const badgeContent = () => {
      if (type === "borrador_final_r") {
        return <><Star className="h-3 w-3 mr-1" />Borrador Final R</>;
      }
      if (type === "borrador_final") {
        return <><Star className="h-3 w-3 mr-1" />Borrador Final</>;
      }
      if (type === "firmado" || type === "firmado_r") {
        const { label } = getSignedDocumentLabel(doc);
        return <><Check className="h-3 w-3 mr-1" />{label}</>;
      }
      if (type === "borrador_r") {
        return "Borrador R";
      }
      return "Borrador";
    };
    
    const badgeClass = (type === "borrador_final" || type === "borrador_final_r")
      ? "bg-status-signed text-white" 
      : (type === "firmado" || type === "firmado_r")
        ? "bg-primary text-primary-foreground"
        : "";
    
    return (
      <Badge className={badgeClass} variant={(type === "borrador" || type === "borrador_r") ? "secondary" : undefined}>
        {badgeContent()}
      </Badge>
    );
  };

  // Check if document is a draft type (including renegotiation drafts)
  const isDraftType = (type: string) => type === "borrador" || type === "borrador_r";
  const isFinalDraftType = (type: string) => type === "borrador_final" || type === "borrador_final_r";

  const sortedDocuments = [...documents].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <FileText className="h-5 w-5" />
                    Contrato de Arriendo
                  </CardTitle>
                  <CardDescription className="ml-12">
                    {documents.length} versiones registradas
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Document list */}
              {sortedDocuments.length > 0 ? (
                <div className="space-y-3">
                  {sortedDocuments.map((doc, index) => (
                    <div
                      key={doc.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        isFinalDraftType(doc.document_type)
                          ? "bg-status-signed/10 border-status-signed/30" 
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getDocumentTypeBadge(doc)}
                          <span className="text-xs text-muted-foreground">
                            #{sortedDocuments.length - index}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {formatDate(doc.uploaded_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Import data button for drafts */}
                        {!readOnly && (isDraftType(doc.document_type) || isFinalDraftType(doc.document_type)) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setUploadedDocumentUrl(doc.url);
                              setImportModalOpen(true);
                            }}
                            className="gap-1"
                            title="Importar datos del documento"
                          >
                            <Sparkles className="h-3 w-3" />
                          </Button>
                        )}
                        {!readOnly && isDraftType(doc.document_type) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenStatusChange(doc)}
                            className="gap-1"
                          >
                            <Star className="h-3 w-3" />
                            Marcar Final
                          </Button>
                        )}
                        {!readOnly && isFinalDraftType(doc.document_type) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenActionDialog(doc.id)}
                            className="gap-1"
                          >
                            <FileCheck className="h-3 w-3" />
                            Acciones
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(doc.url, "_blank")}
                        >
                          Ver
                        </Button>
                        {/* Delete button for drafts only */}
                        {!readOnly && onDeleteDocument && isDraftType(doc.document_type) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDocToDelete(doc.id);
                              setDeleteConfirmOpen(true);
                            }}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Eliminar borrador"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay versiones registradas
                </p>
              )}

              {/* Add new version */}
              {!readOnly && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <Label>Agregar nueva versión</Label>
                  
                  {/* Upload method selection */}
                  <div className="flex gap-2">
                    <Button
                      variant={uploadMethod === "file" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUploadMethod("file")}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Desde PC
                    </Button>
                    <Button
                      variant={uploadMethod === "url" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUploadMethod("url")}
                      className="gap-2"
                    >
                      <Link className="h-4 w-4" />
                      URL
                    </Button>
                    <Button
                      variant={uploadMethod === "cloud" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUploadMethod("cloud")}
                      className="gap-2"
                    >
                      <Cloud className="h-4 w-4" />
                      Nube
                    </Button>
                  </div>

                  {uploadMethod === "file" && (
                    <div className="space-y-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        Seleccionar archivo desde tu computadora
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Formatos aceptados: PDF, Word, Excel, PowerPoint
                      </p>
                    </div>
                  )}

                  {uploadMethod === "url" && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Nombre del documento (opcional)"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleUseSuggested}
                        >
                          Sugerir
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Formato sugerido: {generateSuggestedName()}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="URL del documento (Google Drive, OneDrive, etc.)"
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          type="url"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={handleAdd}
                          disabled={!newUrl || loading}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Agregar
                        </Button>
                      </div>
                    </div>
                  )}

                  {uploadMethod === "cloud" && (
                    <div className="space-y-3">
                      {cloudConnections.length > 0 ? (
                        <>
                          <Select value={selectedCloud} onValueChange={setSelectedCloud}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona una conexión" />
                            </SelectTrigger>
                            <SelectContent>
                              {cloudConnections.map((conn) => {
                                const provider = CLOUD_PROVIDERS.find(p => p.id === conn.provider);
                                return (
                                  <SelectItem key={conn.id} value={conn.id}>
                                    {provider?.icon} {conn.name}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {selectedCloud && (
                            <div className="space-y-2">
                              <Button
                                variant="outline"
                                onClick={handleOpenCloudFolder}
                                className="w-full gap-2"
                              >
                                <Cloud className="h-4 w-4" />
                                Abrir carpeta en la nube
                              </Button>
                              <p className="text-xs text-muted-foreground">
                                Copia el enlace del archivo y pégalo usando la opción "URL"
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-4 space-y-2">
                          <Cloud className="h-8 w-8 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            No hay conexiones de almacenamiento configuradas
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Un administrador debe configurar las conexiones en el panel de administración
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* File upload dialog */}
      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir documento</DialogTitle>
            <DialogDescription>
              Confirma el nombre del archivo antes de subirlo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del documento</Label>
              <Input
                value={suggestedFileName}
                onChange={(e) => setSuggestedFileName(e.target.value)}
                placeholder="Nombre del documento"
              />
            </div>
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: {selectedFile.name}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFileDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={() => handleUploadFile(false)} disabled={uploading || !suggestedFileName.trim()}>
              {uploading ? "Subiendo..." : "Subir sin importar"}
            </Button>
            <Button onClick={() => handleUploadFile(true)} disabled={uploading || !suggestedFileName.trim()} className="gap-2">
              <Sparkles className="h-4 w-4" />
              {uploading ? "Subiendo..." : "Subir e importar datos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action selection dialog for Borrador Final */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acciones para Borrador Final</DialogTitle>
            <DialogDescription>
              Seleccione una acción para el documento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-4"
              onClick={() => handleSelectAction("draft")}
            >
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="text-left">
                <p className="font-medium">Cambiar a Borrador</p>
                <p className="text-sm text-muted-foreground">
                  Volver al estado de borrador para edición
                </p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-4"
              onClick={() => handleSelectAction("send")}
            >
              <Send className="h-5 w-5 text-blue-500" />
              <div className="text-left">
                <p className="font-medium">Enviar para Firma</p>
                <p className="text-sm text-muted-foreground">
                  Enviar el documento por email para firma
                </p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-4"
              onClick={() => handleSelectAction("sign")}
            >
              <Signature className="h-5 w-5 text-green-500" />
              <div className="text-left">
                <p className="font-medium">Marcar como Firmado</p>
                <p className="text-sm text-muted-foreground">
                  El contrato ya ha sido firmado
                </p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign confirmation dialog */}
      <AlertDialog open={signConfirmOpen} onOpenChange={setSignConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea marcar como firmado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará el contrato como firmado y archivará todos los borradores 
              en la carpeta "Borradores de Contrato". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSign}>
              Confirmar Firma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send for signature dialog */}
      <Dialog open={sendSignatureDialogOpen} onOpenChange={setSendSignatureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para Firma</DialogTitle>
            <DialogDescription>
              Ingresa el email del destinatario para enviar el contrato
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email del destinatario</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendSignatureDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSendForSignature} 
              disabled={sendingEmail || !recipientEmail}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {sendingEmail ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change dialog - For Borrador documents */}
      <AlertDialog open={statusChangeDialogOpen} onOpenChange={setStatusChangeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea marcar como Borrador Final?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará el documento como borrador final, indicando que está listo para revisión y firma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleChangeStatus("borrador_final")}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El documento será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDocToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (docToDelete && onDeleteDocument) {
                  await onDeleteDocument(docToDelete);
                }
                setDocToDelete(null);
                setDeleteConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
