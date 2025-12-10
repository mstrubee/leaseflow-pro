import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, User, Calendar, DollarSign, Edit, Check, Loader2, History, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DocumentVersions, DocumentVersion } from "@/components/contracts/DocumentVersions";
import { EscalationDialog, Escalation } from "@/components/contracts/EscalationDialog";
import { RenegotiationDialog } from "@/components/contracts/RenegotiationDialog";
import { RepositorySection } from "@/components/contracts/RepositorySection";
import { ContractAlerts } from "@/components/alerts/ContractAlerts";
import { BudgetDashboard } from "@/components/budget/BudgetDashboard";

interface Contract {
  id: string;
  name: string;
  status: string;
  signed_date: string | null;
  created_at: string;
  contract_addresses: Array<{
    street: string;
    number: string;
    commune: string;
    region: string;
    country: string;
  }>;
  contract_contacts: Array<{
    company: string;
    name: string;
    phone: string;
    email: string;
  }>;
  contract_versions: Array<{
    id: string;
    version_number: number;
    is_current: boolean;
    is_renegotiation: boolean;
    initial_rent: number | null;
    regime_rent: number;
    variable_rent_percentage: number | null;
    duration_months: number;
    notice_type: string;
    notice_value: string;
    effective_date: string | null;
    created_at: string;
    rent_escalations: Array<{
      id: string;
      month_number: number;
      amount: number;
    }>;
  }>;
  contract_documents: Array<{
    id: string;
    document_type: string;
    url: string;
    uploaded_at: string;
    version_id: string | null;
  }>;
}

const ContractDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingContract, setSigningContract] = useState(false);
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deletingRenegotiation, setDeletingRenegotiation] = useState(false);
  
  // Contact edit state
  const [showContactEdit, setShowContactEdit] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    company: "",
    name: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    if (id) {
      loadContract();
    }
  }, [id]);

  const loadContract = async () => {
    try {
      const { data, error } = await supabase
        .from("contracts")
        .select(`
          *,
          contract_addresses (*),
          contract_contacts (*),
          contract_versions (*, rent_escalations (*)),
          contract_documents (*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setContract(data as Contract);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar el contrato",
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleAddDocument = async (url: string, name: string) => {
    if (!contract) return;
    
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    const isSigned = contract.status === "firmado";
    const hasActiveRenego = contract.contract_versions?.some(v => v.is_renegotiation && v.is_current);
    
    // Use renegotiation document type only if there's an active renegotiation
    // Otherwise use regular "borrador" even for signed contracts
    const documentType = (isSigned && hasActiveRenego) ? "borrador_r" : "borrador";
    
    try {
      const { error } = await supabase
        .from("contract_documents")
        .insert({
          contract_id: contract.id,
          version_id: currentVersion?.id || null,
          document_type: documentType as any,
          url,
        });

      if (error) throw error;

      toast({
        title: "Documento agregado",
        description: "La nueva versión ha sido registrada",
      });

      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar el documento",
      });
    }
  };

  const handleMarkAsFinal = async (docId: string) => {
    if (!contract) return;
    
    const doc = contract.contract_documents?.find(d => d.id === docId);
    const newType = doc?.document_type === "borrador_r" ? "borrador_final_r" : "borrador_final";
    
    try {
      const { error } = await supabase
        .from("contract_documents")
        .update({ document_type: newType as any })
        .eq("id", docId);

      if (error) throw error;

      toast({
        title: "Borrador final",
        description: "El documento ha sido marcado como borrador final",
      });

      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo marcar como final",
      });
    }
  };

  const handleChangeDocumentType = async (docId: string, newType: string) => {
    try {
      const { error } = await supabase
        .from("contract_documents")
        .update({ document_type: newType as any })
        .eq("id", docId);

      if (error) throw error;

      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cambiar el estado",
      });
    }
  };

  const handleSendForSignature = async (email: string, docId: string) => {
    if (!contract) return;

    const doc = contract.contract_documents?.find(d => d.id === docId);
    if (!doc) return;

    try {
      const { data, error } = await supabase.functions.invoke("send-contract-email", {
        body: {
          recipientEmail: email,
          contractName: contract.name,
          documentUrl: doc.url,
        },
      });

      if (error) throw error;

      toast({
        title: "Email enviado",
        description: `El contrato ha sido enviado a ${email}`,
      });
    } catch (error: any) {
      throw error;
    }
  };

  const handleMarkAsSigned = async (docId: string) => {
    if (!contract) return;

    setSigningContract(true);

    try {
      const doc = contract.contract_documents?.find(d => d.id === docId);
      const isRenegotiationDoc = doc?.document_type === "borrador_final_r" || doc?.document_type === "borrador_r";
      
      // Get the "Borradores de Contrato" folder for this contract
      const { data: borradorFolder } = await supabase
        .from("repository_folders")
        .select("id")
        .eq("contract_id", contract.id)
        .eq("folder_type", "borradores")
        .single();

      // Get ALL draft documents (borrador, borrador_final, borrador_r, borrador_final_r except the one being signed)
      const draftDocs = contract.contract_documents?.filter(
        (d) => d.id !== docId && 
          (d.document_type === "borrador" || 
           d.document_type === "borrador_final" ||
           d.document_type === "borrador_r" ||
           d.document_type === "borrador_final_r")
      ) || [];

      // Move all draft documents to the repository folder
      if (borradorFolder && draftDocs.length > 0) {
        for (const draftDoc of draftDocs) {
          const typeLabel = draftDoc.document_type.includes("_r") ? "Borrador_Renego" : "Borrador";
          await supabase
            .from("repository_files")
            .insert({
              folder_id: borradorFolder.id,
              name: `${typeLabel}_${new Date(draftDoc.uploaded_at).toISOString().split('T')[0]}`,
              url: draftDoc.url,
              file_type: "pdf",
            });
        }

        // Delete the draft documents from contract_documents
        const draftIds = draftDocs.map(d => d.id);
        await supabase
          .from("contract_documents")
          .delete()
          .in("id", draftIds);
      }

      if (isRenegotiationDoc) {
        // For renegotiation: mark document as firmado_r with correlative number
        // Count existing renegotiation signed documents + 1
        const renegoSignedCount = contract.contract_documents?.filter(
          d => d.document_type === "firmado_r"
        ).length || 0;
        
        const { error: docError } = await supabase
          .from("contract_documents")
          .update({ document_type: "firmado_r" as any })
          .eq("id", docId);

        if (docError) throw docError;

        // Mark renegotiation version as no longer current and set effective_date if null
        const renegoVersion = contract.contract_versions?.find(v => v.is_renegotiation && v.is_current);
        if (renegoVersion) {
          const updateData: any = { is_renegotiation: false };
          if (!renegoVersion.effective_date) {
            updateData.effective_date = new Date().toISOString().split("T")[0];
          }
          await supabase
            .from("contract_versions")
            .update(updateData)
            .eq("id", renegoVersion.id);
        }

        toast({
          title: "Renegociación firmada",
          description: `La renegociación #${renegoSignedCount + 1} ha sido marcada como firmada`,
        });
      } else {
        // For initial contract
        const { error: contractError } = await supabase
          .from("contracts")
          .update({
            status: "firmado",
            signed_date: new Date().toISOString().split("T")[0],
          })
          .eq("id", contract.id);

        if (contractError) throw contractError;

        const { error: docError } = await supabase
          .from("contract_documents")
          .update({ document_type: "firmado" })
          .eq("id", docId);

        if (docError) throw docError;

        toast({
          title: "Contrato firmado",
          description: "El contrato ha sido marcado como firmado y los borradores han sido archivados",
        });
      }

      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo firmar el contrato",
      });
    } finally {
      setSigningContract(false);
    }
  };

  const handleSaveEscalations = async (escalations: Escalation[]) => {
    if (!contract) return;
    
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion) return;

    try {
      const { error: deleteError } = await supabase
        .from("rent_escalations")
        .delete()
        .eq("version_id", currentVersion.id);

      if (deleteError) throw deleteError;

      if (escalations.length > 0) {
        const { error: insertError } = await supabase
          .from("rent_escalations")
          .insert(
            escalations.map((e) => ({
              version_id: currentVersion.id,
              month_number: e.month_number,
              amount: e.amount,
            }))
          );

        if (insertError) throw insertError;
      }

      toast({
        title: "Escalonamiento guardado",
        description: "Los cambios han sido aplicados",
      });

      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el escalonamiento",
      });
    }
  };

  const handleDeleteRenegotiation = async (renegotiationVersionId: string) => {
    if (!contract) return;
    
    setDeletingRenegotiation(true);

    try {
      // Delete rent escalations for this version
      await supabase
        .from("rent_escalations")
        .delete()
        .eq("version_id", renegotiationVersionId);

      // Delete the renegotiation version
      const { error: deleteError } = await supabase
        .from("contract_versions")
        .delete()
        .eq("id", renegotiationVersionId);

      if (deleteError) throw deleteError;

      // Set the previous version as current
      const { data: versions, error: fetchError } = await supabase
        .from("contract_versions")
        .select("id")
        .eq("contract_id", contract.id)
        .order("version_number", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (versions && versions.length > 0) {
        await supabase
          .from("contract_versions")
          .update({ is_current: true })
          .eq("id", versions[0].id);
      }

      // Delete renegotiation draft documents
      await supabase
        .from("contract_documents")
        .delete()
        .eq("contract_id", contract.id)
        .in("document_type", ["borrador_r", "borrador_final_r"]);

      toast({
        title: "Renegociación eliminada",
        description: "La renegociación ha sido eliminada exitosamente",
      });
      
      setShowDeleteConfirm2(false);
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la renegociación",
      });
    } finally {
      setDeletingRenegotiation(false);
    }
  };

  const handleSaveContact = async () => {
    if (!contract) return;
    
    setEditingContact(true);
    try {
      // Check if contact exists
      const existingContact = contract.contract_contacts?.[0];
      
      if (existingContact) {
        // Update existing contact
        const { error } = await supabase
          .from("contract_contacts")
          .update({
            company: contactForm.company,
            name: contactForm.name,
            phone: contactForm.phone,
            email: contactForm.email,
          })
          .eq("contract_id", contract.id);
        
        if (error) throw error;
      } else {
        // Create new contact
        const { error } = await supabase
          .from("contract_contacts")
          .insert({
            contract_id: contract.id,
            company: contactForm.company || "",
            name: contactForm.name || "",
            phone: contactForm.phone || "",
            email: contactForm.email || "",
          });
        
        if (error) throw error;
      }
      
      toast({
        title: "Contacto guardado",
        description: "La información de contacto ha sido actualizada",
      });
      
      setShowContactEdit(false);
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el contacto",
      });
    } finally {
      setEditingContact(false);
    }
  };

  const openContactEdit = () => {
    const existingContact = contract?.contract_contacts?.[0];
    setContactForm({
      company: existingContact?.company || "",
      name: existingContact?.name || "",
      phone: existingContact?.phone || "",
      email: existingContact?.email || "",
    });
    setShowContactEdit(true);
  }

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-yellow-500 text-white" },
      firmado: { label: "Vigente", className: "bg-green-500 text-white" },
      vencido: { label: "Vencido", className: "bg-red-500 text-white" },
    };

    const statusInfo = statusMap[status] || { label: status, className: "" };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  const address = contract.contract_addresses?.[0];
  const contact = contract.contract_contacts?.[0];
  const currentVersion = contract.contract_versions?.find((v) => v.is_current);
  const allVersions = contract.contract_versions?.sort((a, b) => b.version_number - a.version_number) || [];
  const allDocuments = contract.contract_documents || [];
  const isNegotiating = contract.status === "en_negociacion";
  const isSigned = contract.status === "firmado";
  const currentRenegotiation = allVersions.find(v => v.is_renegotiation && v.is_current);
  const hasActiveRenegotiation = !!currentRenegotiation;
  
  // Count signed renegotiations for correlative numbering
  const signedRenegotiationDocs = allDocuments.filter(d => d.document_type === "firmado_r");
  
  // Version to display in commercial conditions: last signed version if there's active renegotiation
  const lastSignedVersion = allVersions.find(v => !v.is_renegotiation);
  const displayVersion = hasActiveRenegotiation ? lastSignedVersion : currentVersion;
  
  // Filter documents: show signed docs always, drafts for renegotiation, and regular drafts for signed contracts
  const documents = isSigned 
    ? allDocuments.filter(d => 
        d.document_type === "firmado" || 
        d.document_type === "firmado_r" ||
        d.document_type === "borrador" ||
        d.document_type === "borrador_final" ||
        (hasActiveRenegotiation && (d.document_type === "borrador_r" || d.document_type === "borrador_final_r"))
      )
    : allDocuments;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{contract.name}</h1>
              {getStatusBadge(contract.status)}
            </div>
            {isNegotiating && (
              <Button
                variant="outline"
                onClick={() => navigate(`/contracts/${contract.id}/edit`)}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Dirección
            </CardTitle>
          </CardHeader>
          <CardContent>
            {address ? (
              <div className="space-y-1">
                <p className="text-lg font-medium">
                  {address.street} {address.number}
                </p>
                <p className="text-muted-foreground">
                  {address.commune}, {address.region}
                </p>
                <p className="text-muted-foreground">{address.country}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">No hay dirección registrada</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Contacto
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={openContactEdit}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                Editar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contact && (contact.company || contact.name || contact.phone || contact.email) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contact.company && (
                  <div>
                    <p className="text-sm text-muted-foreground">Empresa</p>
                    <p className="font-medium">{contact.company}</p>
                  </div>
                )}
                {contact.name && (
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre</p>
                    <p className="font-medium">{contact.name}</p>
                  </div>
                )}
                {contact.phone && (
                  <div>
                    <p className="text-sm text-muted-foreground">Teléfono</p>
                    <p className="font-medium">{contact.phone}</p>
                  </div>
                )}
                {contact.email && (
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{contact.email}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No hay contacto registrado. Use el botón Editar para agregar.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Condiciones Comerciales
                </CardTitle>
                <CardDescription>
                  {hasActiveRenegotiation 
                    ? `Versión vigente: ${displayVersion?.version_number || "N/A"} (renegociación en curso)`
                    : `Versión ${displayVersion?.version_number || "N/A"}`
                  }
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isNegotiating && currentVersion && (
                  <EscalationDialog
                    escalations={currentVersion.rent_escalations?.map(e => ({
                      id: e.id,
                      month_number: e.month_number,
                      amount: e.amount
                    })) || []}
                    initialRent={currentVersion.initial_rent || currentVersion.regime_rent}
                    regimeRent={currentVersion.regime_rent}
                    durationMonths={currentVersion.duration_months}
                    onSave={handleSaveEscalations}
                  />
                )}
                {isSigned && displayVersion && !hasActiveRenegotiation && (
                  <RenegotiationDialog
                    contractId={contract.id}
                    currentVersion={{
                      id: displayVersion.id,
                      version_number: displayVersion.version_number,
                      initial_rent: displayVersion.initial_rent,
                      regime_rent: displayVersion.regime_rent,
                      variable_rent_percentage: displayVersion.variable_rent_percentage,
                      duration_months: displayVersion.duration_months,
                      notice_type: displayVersion.notice_type,
                      notice_value: displayVersion.notice_value,
                    }}
                    hasActiveRenegotiation={false}
                    onSuccess={loadContract}
                  />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {displayVersion ? (
              <div className="space-y-4">
                {/* Renegotiation in progress notice */}
                {hasActiveRenegotiation && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      ⚠️ Hay una renegociación en curso. Las condiciones mostradas son las vigentes hasta que se firme la renegociación.
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayVersion.initial_rent && (
                    <div>
                      <p className="text-sm text-muted-foreground">Canon Inicial</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(displayVersion.initial_rent)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Canon en Régimen</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(displayVersion.regime_rent)}
                    </p>
                  </div>
                  {displayVersion.variable_rent_percentage && (
                    <div>
                      <p className="text-sm text-muted-foreground">Arriendo Variable</p>
                      <p className="text-lg font-semibold">
                        {displayVersion.variable_rent_percentage}%
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Duración</p>
                    <p className="text-lg font-semibold">
                      {displayVersion.duration_months} meses (
                      {Math.floor(displayVersion.duration_months / 12)} años{" "}
                      {displayVersion.duration_months % 12} meses)
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Aviso de Término</p>
                    <p className="text-lg font-semibold">
                      {displayVersion.notice_type === "meses"
                        ? `${displayVersion.notice_value} meses`
                        : formatDate(displayVersion.notice_value)}
                    </p>
                  </div>
                </div>

                {/* Original Contract Dates */}
                {contract.signed_date && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm font-medium text-muted-foreground mb-3">Contrato Original</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Fecha de Firma</p>
                        <p className="font-medium">{formatDate(contract.signed_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fecha de Término</p>
                        <p className="font-medium">
                          {(() => {
                            const originalVersion = allVersions.find(v => v.version_number === 1);
                            if (originalVersion && contract.signed_date) {
                              const endDate = new Date(contract.signed_date);
                              endDate.setMonth(endDate.getMonth() + originalVersion.duration_months);
                              return formatDate(endDate.toISOString());
                            }
                            return "N/A";
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Aviso Término Anticipado</p>
                        <p className="font-medium">
                          {(() => {
                            const originalVersion = allVersions.find(v => v.version_number === 1);
                            if (originalVersion && contract.signed_date) {
                              if (originalVersion.notice_type === "fecha") {
                                return formatDate(originalVersion.notice_value);
                              } else {
                                const endDate = new Date(contract.signed_date);
                                endDate.setMonth(endDate.getMonth() + originalVersion.duration_months);
                                const noticeDate = new Date(endDate);
                                noticeDate.setMonth(noticeDate.getMonth() - parseInt(originalVersion.notice_value));
                                return formatDate(noticeDate.toISOString());
                              }
                            }
                            return "N/A";
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Extension/Prorroga Dates */}
                {(() => {
                  const signedExtensions = allVersions
                    .filter(v => v.version_number > 1 && !v.is_renegotiation && v.effective_date)
                    .sort((a, b) => a.version_number - b.version_number);
                  
                  if (signedExtensions.length === 0) return null;
                  
                  return signedExtensions.map((extension, idx) => (
                    <div key={extension.id} className="pt-4 border-t border-border">
                      <p className="text-sm font-medium text-muted-foreground mb-3">
                        Prórroga #{idx + 1}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Fecha de Firma</p>
                          <p className="font-medium">
                            {extension.effective_date ? formatDate(extension.effective_date) : "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Fecha de Término</p>
                          <p className="font-medium">
                            {(() => {
                              if (extension.effective_date) {
                                const endDate = new Date(extension.effective_date);
                                endDate.setMonth(endDate.getMonth() + extension.duration_months);
                                return formatDate(endDate.toISOString());
                              }
                              return "N/A";
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Aviso Término Anticipado</p>
                          <p className="font-medium">
                            {(() => {
                              if (extension.effective_date) {
                                if (extension.notice_type === "fecha") {
                                  return formatDate(extension.notice_value);
                                } else {
                                  const endDate = new Date(extension.effective_date);
                                  endDate.setMonth(endDate.getMonth() + extension.duration_months);
                                  const noticeDate = new Date(endDate);
                                  noticeDate.setMonth(noticeDate.getMonth() - parseInt(extension.notice_value));
                                  return formatDate(noticeDate.toISOString());
                                }
                              }
                              return "N/A";
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ));
                })()}

                {/* Escalation display */}
                {displayVersion.rent_escalations && displayVersion.rent_escalations.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-3">Escalonamiento de Arriendo</p>
                    <div className="space-y-2">
                      {displayVersion.rent_escalations
                        .sort((a, b) => a.month_number - b.month_number)
                        .map((escalation, idx) => (
                          <div
                            key={escalation.id}
                            className="flex items-center gap-4 p-2 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {idx + 1}
                            </div>
                            <span className="text-sm">
                              <span className="text-muted-foreground">Mes {escalation.month_number}:</span>{" "}
                              <span className="font-semibold text-primary">{formatCurrency(escalation.amount)}</span>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No hay condiciones comerciales registradas
              </p>
            )}
          </CardContent>
        </Card>

        {/* Version History */}
        {allVersions.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historial de Versiones
              </CardTitle>
              <CardDescription>
                Este contrato tiene {allVersions.length} versiones. Haz clic en una renegociación para editarla.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {allVersions.map((version) => (
                  <div
                    key={version.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      version.is_current
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/30"
                    } ${version.is_renegotiation && version.is_current ? "cursor-pointer hover:bg-primary/10" : ""}`}
                    onClick={() => {
                      if (version.is_renegotiation && version.is_current) {
                        navigate(`/contracts/${contract.id}/edit`);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Versión {version.version_number}</span>
                          {version.is_current && (
                            <Badge variant="default">Actual</Badge>
                          )}
                          {version.is_renegotiation && (
                            <Badge variant="secondary">Renegociación</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Canon: {formatCurrency(version.regime_rent)} · {version.duration_months} meses
                          {version.variable_rent_percentage && ` · Variable: ${version.variable_rent_percentage}%`}
                        </div>
                        {version.effective_date && (
                          <div className="text-sm text-muted-foreground">
                            Vigente desde: {formatDate(version.effective_date)}
                          </div>
                        )}
                        {/* Delete renegotiation button */}
                        {version.is_renegotiation && version.is_current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 mt-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm1(true);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                            Eliminar Renegociación
                          </Button>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(version.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete renegotiation confirmation dialogs */}
        <AlertDialog open={showDeleteConfirm1} onOpenChange={setShowDeleteConfirm1}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar la renegociación?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará la renegociación en curso y todos sus documentos asociados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowDeleteConfirm1(false);
                  setShowDeleteConfirm2(true);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeleteConfirm2} onOpenChange={setShowDeleteConfirm2}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Eliminación de Renegociación</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro? Esta acción no se puede deshacer. Se eliminarán todos los borradores de la renegociación.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingRenegotiation}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (currentRenegotiation) {
                    handleDeleteRenegotiation(currentRenegotiation.id);
                  }
                }}
                disabled={deletingRenegotiation}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingRenegotiation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "Eliminar Definitivamente"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DocumentVersions
          documents={documents.map(d => ({
            id: d.id,
            document_type: d.document_type,
            url: d.url,
            uploaded_at: d.uploaded_at,
            version_id: d.version_id,
          }))}
          contractId={contract.id}
          contractName={contract.name}
          currentVersion={currentVersion ? {
            id: currentVersion.id,
            version_number: currentVersion.version_number,
            initial_rent: currentVersion.initial_rent,
            regime_rent: currentVersion.regime_rent,
            variable_rent_percentage: currentVersion.variable_rent_percentage,
            duration_months: currentVersion.duration_months,
            notice_type: currentVersion.notice_type,
            notice_value: currentVersion.notice_value,
          } : undefined}
          onAddDocument={handleAddDocument}
          onMarkAsFinal={handleMarkAsFinal}
          onSendForSignature={handleSendForSignature}
          onMarkAsSigned={handleMarkAsSigned}
          onChangeDocumentType={handleChangeDocumentType}
          readOnly={false}
          isRenegotiation={isSigned && hasActiveRenegotiation}
          isSigned={isSigned}
          hasActiveRenegotiation={hasActiveRenegotiation}
          onRenegotiationSuccess={loadContract}
        />

        <RepositorySection 
          contractId={contract.id} 
          contractName={contract.name}
          contractStatus={contract.status}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Control Presupuestario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetDashboard contractId={contract.id} />
          </CardContent>
        </Card>

        <ContractAlerts
          contractId={contract.id}
          contractName={contract.name}
          expirationDate={currentVersion?.effective_date 
            ? new Date(new Date(currentVersion.effective_date).getTime() + (currentVersion.duration_months * 30 * 24 * 60 * 60 * 1000))
            : undefined
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Información Adicional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Fecha de Creación</p>
                <p className="font-medium">{formatDate(contract.created_at)}</p>
              </div>
              {contract.signed_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Fecha de Firma</p>
                  <p className="font-medium">{formatDate(contract.signed_date)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Dialog: Editar Contacto */}
      <Dialog open={showContactEdit} onOpenChange={setShowContactEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-company">Empresa</Label>
              <Input
                id="edit-company"
                value={contactForm.company}
                onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                placeholder="Nombre de la empresa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre</Label>
              <Input
                id="edit-name"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Nombre del contacto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Teléfono</Label>
              <Input
                id="edit-phone"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="+56 9 1234 5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveContact} disabled={editingContact}>
              {editingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractDetail;
