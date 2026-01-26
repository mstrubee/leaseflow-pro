import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, User, Calendar, DollarSign, Edit, Loader2, Trash2, ChevronsUpDown, RotateCcw, FileText, FolderOpen, Bell, LayoutGrid, FileCheck, AlertCircle, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { DocumentVersions, DocumentVersion } from "@/components/contracts/DocumentVersions";
import { EscalationDialog, Escalation } from "@/components/contracts/EscalationDialog";
import { RenegotiationDialog } from "@/components/contracts/RenegotiationDialog";
import { RenegotiationDraftsPanel } from "@/components/contracts/RenegotiationDraftsPanel";
import { VersionHistoryPanel } from "@/components/contracts/VersionHistoryPanel";
import { RepositorySection } from "@/components/contracts/RepositorySection";
import { CommercialConditionsSummary } from "@/components/contracts/CommercialConditionsSummary";
import { EntryExpensesSection } from "@/components/contracts/EntryExpensesSection";
import { ContractSurfacesSection } from "@/components/contracts/ContractSurfacesSection";
import { ContractAlerts } from "@/components/alerts/ContractAlerts";
import { BudgetDashboard } from "@/components/budget/BudgetDashboard";
import { GanttModule } from "@/components/gantt/GanttModule";

import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { TerminationNoticesSection } from "@/components/contracts/TerminationNoticesSection";
import { AlertsReturnButton } from "@/components/alerts/AlertsReturnButton";
import { OpexReturnButton } from "@/components/opex/OpexReturnButton";
import { ReportsReturnButton } from "@/components/reports/ReportsReturnButton";
import { DashboardRegionReturnButton } from "@/components/dashboard/DashboardRegionReturnButton";
import { CollapsibleSection } from "@/components/contracts/CollapsibleSection";
import { SelectableElement } from "@/components/admin/SelectableElement";
import { useContractSections, SectionKey } from "@/hooks/useContractSections";
import { useAuth } from "@/hooks/useAuth";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
interface Contract {
  id: string;
  name: string;
  status: string;
  signed_date: string | null;
  created_at: string;
  superficie_edificada_local: number | null;
  metros_lineales_frente: number | null;
  display_currency?: "UF" | "CLP";
  requires_special_attention?: boolean;
  special_attention_reason?: string | null;
  contract_companies?: Array<{
    companies: { name: string } | null;
  }>;
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
    guarantee_multiplier: number | null;
    has_periodic_adjustments: boolean | null;
    first_adjustment_month: number | null;
    adjustment_periodicity_months: number | null;
    rent_escalations: Array<{
      id: string;
      month_number: number;
      amount: number;
    }>;
    notice_ranges?: Array<{
      start_month: number;
      end_month: number;
    }>;
  }>;
  contract_documents: Array<{
    id: string;
    document_type: string;
    url: string;
    uploaded_at: string;
    version_id: string | null;
  }>;
  termination_notices?: Array<{
    id: string;
    notice_type: string;
    notice_date: string;
    required_exit_date: string | null;
    document_url: string | null;
    storage_provider: string | null;
    issuer_name: string | null;
    created_at: string;
  }>;
}
interface CustomField {
  id: string;
  field_name: string;
  display_order: number | null;
}

const ContractDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const sectionParam = searchParams.get("section");
  const returnToParam = searchParams.get("returnTo");
  const backTo = (location.state as any)?.backTo as string | undefined;

  const storedBackTo =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("contracts:lastListUrl")
      : null;

  const isValidBackTo = (v?: string | null) =>
    !!v && v.startsWith("/contracts") && !/^\/contracts\/[^/?#]+/.test(v);

  // Check if coming from purchase-orders dashboard
  const resolvedBackTo = returnToParam === "purchase-orders"
    ? "/purchase-orders"
    : isValidBackTo(backTo)
      ? backTo
      : isValidBackTo(storedBackTo)
        ? storedBackTo!
        : "/contracts";

  const { toast } = useToast();
  const { isAdmin, roleLoaded } = useAuth();
  const { isHidden, loading: permissionsLoading } = useUserPermissions();
  const {
    sections,
    reorderSections,
    isCollapsed,
    setCollapsed,
    collapseAll,
    expandAll,
    resetToDefault,
    canReorder,
  } = useContractSections();

  // Map section keys to permission element IDs
  const sectionPermissionMap: Record<SectionKey, string> = {
    address: "contract_address",
    contact: "contract_contact",
    commercial: "contract_commercial",
    renegotiation: "contract_renegotiation",
    surfaces: "contract_surfaces",
    documentVersions: "contract_documents",
    repository: "contract_repository",
    
    budget: "contract_budget",
    gantt: "contract_gantt",
    alerts: "contract_alerts",
  };
  
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [signingContract, setSigningContract] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSections(active.id as string, over.id as string);
    }
  };

  // Dynamic superficie for real-time recalculation
  const [superficieEdificada, setSuperficieEdificada] = useState<number | null>(null);
  useEffect(() => {
    if (id) {
      loadContract();
      loadCustomFields();
    }
  }, [id]);

  const loadCustomFields = async () => {
    try {
      // Load custom fields
      const { data: fields, error: fieldsError } = await supabase
        .from("contract_custom_fields")
        .select("id, field_name, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (fieldsError) throw fieldsError;
      setCustomFields(fields || []);

      // Load field values for this contract
      if (id) {
        const { data: values, error: valuesError } = await supabase
          .from("contract_custom_field_values")
          .select("field_id, field_value")
          .eq("contract_id", id);

        if (valuesError) throw valuesError;
        
        const valuesMap: Record<string, string> = {};
        (values || []).forEach((v) => {
          if (v.field_value) {
            valuesMap[v.field_id] = v.field_value;
          }
        });
        setCustomFieldValues(valuesMap);
      }
    } catch (error) {
      console.error("Error loading custom fields:", error);
    }
  };
  const loadContract = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("contracts").select(`
          *,
          contract_companies (companies (name)),
          contract_addresses (*),
          contract_contacts (*),
          contract_versions (*, rent_escalations (*), notice_ranges (start_month, end_month), version_notices (notice_type, notice_value, notice_bilaterality)),
          contract_documents (*),
          termination_notices (*)
        `).eq("id", id).single();
      if (error) throw error;
      setContract(data as Contract);
      
      // Extract company names from the relation
      const names = data.contract_companies
        ?.map((cc: any) => cc.companies?.name)
        .filter((n: string | undefined): n is string => !!n) || [];
      setCompanyNames(names);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar el contrato"
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };
  const handleAddDocument = async (url: string, name: string) => {
    if (!contract) return;
    const currentVersion = contract.contract_versions?.find(v => v.is_current);
    const isSigned = contract.status === "firmado";
    const hasActiveRenego = contract.contract_versions?.some(v => v.is_renegotiation && v.is_current);

    // Use renegotiation document type only if there's an active renegotiation
    // Otherwise use regular "borrador" even for signed contracts
    const documentType = isSigned && hasActiveRenego ? "borrador_r" : "borrador";
    try {
      const {
        error
      } = await supabase.from("contract_documents").insert({
        contract_id: contract.id,
        version_id: currentVersion?.id || null,
        document_type: documentType as any,
        url
      });
      if (error) throw error;
      toast({
        title: "Documento agregado",
        description: "La nueva versión ha sido registrada"
      });
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo agregar el documento"
      });
    }
  };
  const handleMarkAsFinal = async (docId: string) => {
    if (!contract) return;
    const doc = contract.contract_documents?.find(d => d.id === docId);
    const newType = doc?.document_type === "borrador_r" ? "borrador_final_r" : "borrador_final";
    try {
      const {
        error
      } = await supabase.from("contract_documents").update({
        document_type: newType as any
      }).eq("id", docId);
      if (error) throw error;
      toast({
        title: "Borrador final",
        description: "El documento ha sido marcado como borrador final"
      });
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo marcar como final"
      });
    }
  };
  const handleChangeDocumentType = async (docId: string, newType: string) => {
    try {
      const {
        error
      } = await supabase.from("contract_documents").update({
        document_type: newType as any
      }).eq("id", docId);
      if (error) throw error;
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cambiar el estado"
      });
    }
  };
  const handleDeleteDocument = async (docId: string) => {
    if (!contract) return;
    try {
      const {
        error
      } = await supabase.from("contract_documents").delete().eq("id", docId);
      if (error) throw error;
      toast({
        title: "Documento eliminado",
        description: "El borrador ha sido eliminado correctamente"
      });
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el documento"
      });
    }
  };
  const handleSendForSignature = async (email: string, docId: string) => {
    if (!contract) return;
    const doc = contract.contract_documents?.find(d => d.id === docId);
    if (!doc) return;
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("send-contract-email", {
        body: {
          recipientEmail: email,
          contractName: contract.name,
          documentUrl: doc.url
        }
      });
      if (error) throw error;
      toast({
        title: "Email enviado",
        description: `El contrato ha sido enviado a ${email}`
      });
    } catch (error: any) {
      throw error;
    }
  };
  const handleMarkAsSigned = async (docId: string) => {
    if (!contract) return;

    // Process signing directly without import modal
    // User can import data when uploading drafts using the "Subir e importar datos" option
    await processContractSigning(docId);
  };
  const processContractSigning = async (docId: string) => {
    if (!contract) return;
    setSigningContract(true);
    try {
      const doc = contract.contract_documents?.find(d => d.id === docId);
      const isRenegotiationDoc = doc?.document_type === "borrador_final_r" || doc?.document_type === "borrador_r";

      // Get the "Borradores de Contrato" folder for this contract
      const {
        data: borradorFolder
      } = await supabase.from("repository_folders").select("id").eq("contract_id", contract.id).eq("folder_type", "borradores").single();

      // Get ALL draft documents (borrador, borrador_final, borrador_r, borrador_final_r except the one being signed)
      const draftDocs = contract.contract_documents?.filter(d => d.id !== docId && (d.document_type === "borrador" || d.document_type === "borrador_final" || d.document_type === "borrador_r" || d.document_type === "borrador_final_r")) || [];

      // Move all draft documents to the repository folder
      if (borradorFolder && draftDocs.length > 0) {
        for (const draftDoc of draftDocs) {
          const typeLabel = draftDoc.document_type.includes("_r") ? "Borrador_Renego" : "Borrador";
          await supabase.from("repository_files").insert({
            folder_id: borradorFolder.id,
            name: `${typeLabel}_${new Date(draftDoc.uploaded_at).toISOString().split('T')[0]}`,
            url: draftDoc.url,
            file_type: "pdf"
          });
        }

        // Delete the draft documents from contract_documents
        const draftIds = draftDocs.map(d => d.id);
        await supabase.from("contract_documents").delete().in("id", draftIds);
      }
      if (isRenegotiationDoc) {
        // For renegotiation: mark document as firmado_r with correlative number
        // Count existing renegotiation signed documents + 1
        const renegoSignedCount = contract.contract_documents?.filter(d => d.document_type === "firmado_r").length || 0;
        const {
          error: docError
        } = await supabase.from("contract_documents").update({
          document_type: "firmado_r" as any
        }).eq("id", docId);
        if (docError) throw docError;

        // Mark renegotiation version as no longer current and set effective_date if null
        const renegoVersion = contract.contract_versions?.find(v => v.is_renegotiation && v.is_current);
        if (renegoVersion) {
          const updateData: any = {
            is_renegotiation: false
          };
          if (!renegoVersion.effective_date) {
            updateData.effective_date = new Date().toISOString().split("T")[0];
          }
          await supabase.from("contract_versions").update(updateData).eq("id", renegoVersion.id);
        }
        toast({
          title: "Renegociación firmada",
          description: `La renegociación #${renegoSignedCount + 1} ha sido marcada como firmada`
        });
      } else {
        // For initial contract
        const {
          error: contractError
        } = await supabase.from("contracts").update({
          status: "firmado",
          signed_date: new Date().toISOString().split("T")[0]
        }).eq("id", contract.id);
        if (contractError) throw contractError;
        const {
          error: docError
        } = await supabase.from("contract_documents").update({
          document_type: "firmado"
        }).eq("id", docId);
        if (docError) throw docError;
        toast({
          title: "Contrato firmado",
          description: "El contrato ha sido marcado como firmado y los borradores han sido archivados"
        });
      }
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo firmar el contrato"
      });
    } finally {
      setSigningContract(false);
    }
  };
  const handleSaveEscalations = async (escalations: Escalation[]) => {
    if (!contract) return;
    const currentVersion = contract.contract_versions?.find(v => v.is_current);
    if (!currentVersion) return;
    try {
      const {
        error: deleteError
      } = await supabase.from("rent_escalations").delete().eq("version_id", currentVersion.id);
      if (deleteError) throw deleteError;
      if (escalations.length > 0) {
        const {
          error: insertError
        } = await supabase.from("rent_escalations").insert(escalations.map(e => ({
          version_id: currentVersion.id,
          month_number: e.month_number,
          amount: e.amount
        })));
        if (insertError) throw insertError;
      }
      toast({
        title: "Escalonamiento guardado",
        description: "Los cambios han sido aplicados"
      });
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el escalonamiento"
      });
    }
  };
  const handleDeleteRenegotiation = async (renegotiationVersionId: string) => {
    if (!contract) return;
    try {
      // Delete rent escalations for this version
      await supabase.from("rent_escalations").delete().eq("version_id", renegotiationVersionId);

      // Delete the renegotiation version
      const {
        error: deleteError
      } = await supabase.from("contract_versions").delete().eq("id", renegotiationVersionId);
      if (deleteError) throw deleteError;

      // Set the previous version as current
      const {
        data: versions,
        error: fetchError
      } = await supabase.from("contract_versions").select("id").eq("contract_id", contract.id).order("version_number", {
        ascending: false
      }).limit(1);
      if (fetchError) throw fetchError;
      if (versions && versions.length > 0) {
        await supabase.from("contract_versions").update({
          is_current: true
        }).eq("id", versions[0].id);
      }

      // Delete renegotiation draft documents
      await supabase.from("contract_documents").delete().eq("contract_id", contract.id).in("document_type", ["borrador_r", "borrador_final_r"]);
      toast({
        title: "Renegociación eliminada",
        description: "La renegociación ha sido eliminada exitosamente"
      });
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la renegociación"
      });
    }
  };

  const handleAcceptRenegotiation = async (versionId: string, documentUrl: string) => {
    if (!contract) return;
    
    try {
      // Get the renegotiation version
      const renegotiationVersion = contract.contract_versions?.find(v => v.id === versionId);
      if (!renegotiationVersion) throw new Error("Versión de renegociación no encontrada");

      // The renegotiation version becomes the new signed version
      // Mark it as not a renegotiation anymore and set effective date
      const { error: updateVersionError } = await supabase
        .from("contract_versions")
        .update({
          is_renegotiation: false,
          effective_date: new Date().toISOString().split('T')[0],
        })
        .eq("id", versionId);

      if (updateVersionError) throw updateVersionError;

      // Add the document as a signed renegotiation document
      const { error: docError } = await supabase
        .from("contract_documents")
        .insert({
          contract_id: contract.id,
          version_id: versionId,
          document_type: "borrador_r" as any,
          url: documentUrl,
        });

      if (docError) throw docError;

      // Delete any draft documents for renegotiation
      await supabase
        .from("contract_documents")
        .delete()
        .eq("contract_id", contract.id)
        .in("document_type", ["borrador_r", "borrador_final_r"])
        .neq("url", documentUrl);

      // Delete renegotiation drafts
      await supabase
        .from("renegotiation_drafts")
        .delete()
        .eq("contract_id", contract.id);

      toast({
        title: "Renegociación aceptada",
        description: "Las condiciones comerciales han sido actualizadas. El documento ha sido subido como borrador de renegociación.",
      });
      
      loadContract();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo aceptar la renegociación: " + error.message,
      });
    }
  };
  const getStatusBadge = (status: string) => {
    const statusMap: {
      [key: string]: {
        label: string;
        className: string;
      };
    } = {
      en_negociacion: {
        label: "En Negociación",
        className: "bg-yellow-500 text-white"
      },
      firmado: {
        label: "Vigente",
        className: "bg-green-500 text-white"
      },
      vencido: {
        label: "Vencido",
        className: "bg-red-500 text-white"
      }
    };
    const statusInfo = statusMap[status] || {
      label: status,
      className: ""
    };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };
  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };
  if (loading || !roleLoaded || permissionsLoading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  if (!contract) {
    return null;
  }
  const address = contract.contract_addresses?.[0];
  const contact = contract.contract_contacts?.[0];
  const currentVersion = contract.contract_versions?.find(v => v.is_current);
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
  const documents = isSigned ? allDocuments.filter(d => d.document_type === "firmado" || d.document_type === "firmado_r" || d.document_type === "borrador" || d.document_type === "borrador_final" || hasActiveRenegotiation && (d.document_type === "borrador_r" || d.document_type === "borrador_final_r")) : allDocuments;
  return <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button variant="ghost" onClick={() => navigate(resolvedBackTo)} className="gap-2 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <CompanyLogo 
                  companyNames={companyNames} 
                  size="md" 
                />
                <h1 className="text-2xl font-semibold text-foreground">{contract.name}</h1>
                {getStatusBadge(contract.status)}
              </div>
              {(companyNames.length > 0 || customFields.some(f => customFieldValues[f.id])) && (
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  {companyNames.length > 0 && (
                    <span>
                      <span className="font-medium">Empresa{companyNames.length > 1 ? 's' : ''}:</span> {companyNames.join(', ')}
                    </span>
                  )}
                  {customFields.map((field) => {
                    const value = customFieldValues[field.id];
                    if (!value) return null;
                    return (
                      <span key={field.id}>
                        <span className="font-medium">{field.field_name}:</span> {value}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (isSigned || contract.status === "vencido") && <ContractStatusActions contractId={contract.id} contractName={contract.name} currentStatus={contract.status} isExpiredButOperating={false} requiresSpecialAttention={contract.requires_special_attention} specialAttentionReason={contract.special_attention_reason} onStatusChange={loadContract} />}
              {isAdmin && (
                <Button variant="outline" onClick={() => navigate(`/contracts/${contract.id}/edit`)} className="gap-2">
                  <Edit className="h-4 w-4" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-15xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Special Attention Banner */}
        {contract.requires_special_attention && contract.special_attention_reason && (
          <div className="flex items-center gap-2 p-3 border-2 border-destructive rounded-lg bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="font-bold text-foreground">{contract.special_attention_reason}</p>
          </div>
        )}

        {/* Section controls for admin */}
        {isAdmin && (
          <div className="flex items-center justify-between gap-2 mb-4">
            {/* Left side: Special Attention Banner (when no reason) */}
            <div className="flex-1">
              {contract.requires_special_attention && !contract.special_attention_reason && (
                <div className="inline-flex items-center gap-2 p-2 border-2 border-destructive rounded-lg bg-destructive/10">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="font-bold text-foreground text-sm">Requiere Atención Especial</span>
                </div>
              )}
            </div>

            {/* Right side: Controls */}
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={collapseAll}>
                      <ChevronsUpDown className="h-4 w-4 mr-1" />
                      Colapsar todo
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Colapsar todas las secciones</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={expandAll}>
                      <ChevronsUpDown className="h-4 w-4 mr-1" />
                      Expandir todo
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Expandir todas las secciones</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={resetToDefault}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Restablecer orden predeterminado</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.key)}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section) => {
              const sectionKey = section.key as SectionKey;

              // Render each section based on its key
              switch (sectionKey) {
                case "address": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Dirección"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Dirección"
                        icon={<MapPin className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                      >
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
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }

                case "contact": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Contacto"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Contacto"
                        icon={<User className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                      >
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
                            <div>
                              <p className="text-sm text-muted-foreground">Teléfono</p>
                              <p className="font-medium">{contact.phone || "No se ha entregado"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Email</p>
                              {contact.email ? (
                                <div className="space-y-1">
                                  {contact.email.split(/[,;]/).map((email, idx) => (
                                    <p key={idx} className="font-medium">{email.trim()}</p>
                                  ))}
                                </div>
                              ) : (
                                <p className="font-medium text-muted-foreground">No se ha entregado</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            No hay contacto registrado. Use el botón Editar de la parte superior para agregar.
                          </p>
                        )}
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }

                case "commercial": {
                  if (!displayVersion) return null;
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Condiciones Comerciales"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Condiciones Comerciales"
                        icon={<DollarSign className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        <CommercialConditionsSummary
                          version={{
                            id: displayVersion.id,
                            version_number: displayVersion.version_number,
                            is_current: displayVersion.is_current,
                            is_renegotiation: displayVersion.is_renegotiation,
                            initial_rent: displayVersion.initial_rent,
                            regime_rent: displayVersion.regime_rent,
                            variable_rent_percentage: displayVersion.variable_rent_percentage,
                            duration_months: displayVersion.duration_months,
                            notice_type: displayVersion.notice_type,
                            notice_value: displayVersion.notice_value,
                            effective_date: displayVersion.effective_date,
                            guarantee_type: (displayVersion as any).guarantee_type,
                            guarantee_multiplier: displayVersion.guarantee_multiplier,
                            guarantee_fixed_amount: (displayVersion as any).guarantee_fixed_amount,
                            guarantee_fixed_currency: (displayVersion as any).guarantee_fixed_currency,
                            has_periodic_adjustments: displayVersion.has_periodic_adjustments,
                            first_adjustment_month: displayVersion.first_adjustment_month,
                            adjustment_periodicity_months: displayVersion.adjustment_periodicity_months,
                            adjustment_type: (displayVersion as any).adjustment_type,
                            adjustment_value: (displayVersion as any).adjustment_value,
                            gastos_comunes_methodology: (displayVersion as any).gastos_comunes_methodology,
                            gastos_comunes_percentage: (displayVersion as any).gastos_comunes_percentage,
                            gastos_comunes_total_centro: (displayVersion as any).gastos_comunes_total_centro,
                            gastos_comunes_tope: (displayVersion as any).gastos_comunes_tope,
                            gastos_comunes_tope_type: (displayVersion as any).gastos_comunes_tope_type,
                            gastos_comunes_uf_m2: (displayVersion as any).gastos_comunes_uf_m2,
                            gastos_comunes_uf_ml_frente: (displayVersion as any).gastos_comunes_uf_ml_frente,
                            gastos_comunes_prorrata_kwh_clima: (displayVersion as any).gastos_comunes_prorrata_kwh_clima,
                            fondo_promocion_percentage: (displayVersion as any).fondo_promocion_percentage,
                            adicional_administracion_percentage: (displayVersion as any).adicional_administracion_percentage,
                            has_extended_gastos_comunes: (displayVersion as any).has_extended_gastos_comunes,
                            grace_months: (displayVersion as any).grace_months,
                            otros_egresos_amount: (displayVersion as any).otros_egresos_amount,
                            otros_egresos_description: (displayVersion as any).otros_egresos_description,
                            notice_bilaterality: (displayVersion as any).notice_bilaterality,
                            regime_rent_is_uf_m2: (displayVersion as any).regime_rent_is_uf_m2,
                            initial_rent_is_uf_m2: (displayVersion as any).initial_rent_is_uf_m2,
                            rent_escalations: displayVersion.rent_escalations || [],
                          }}
                          signedDate={contract.signed_date}
                          allVersions={allVersions}
                          superficieEdificadaLocal={superficieEdificada ?? contract.superficie_edificada_local}
                          metrosLinealesFrente={contract.metros_lineales_frente}
                          noticeRanges={displayVersion.notice_ranges || []}
                          versionNotices={(displayVersion as any).version_notices || []}
                          contractId={contract.id}
                          displayCurrency={contract.display_currency}
                        />
                        {isNegotiating && currentVersion && (
                          <Card className="p-4 mt-6">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">Gestionar condiciones comerciales</p>
                              <div className="flex items-center gap-2">
                                <EscalationDialog
                                  escalations={currentVersion.rent_escalations?.map((e) => ({
                                    id: e.id,
                                    month_number: e.month_number,
                                    amount: e.amount,
                                  })) || []}
                                  initialRent={currentVersion.initial_rent || currentVersion.regime_rent}
                                  regimeRent={currentVersion.regime_rent}
                                  durationMonths={currentVersion.duration_months}
                                  onSave={handleSaveEscalations}
                                />
                              </div>
                            </div>
                          </Card>
                        )}
                        
                        {/* Renegotiation sub-section within Commercial Conditions */}
                        {isSigned && currentVersion && (
                          <div className="mt-6 border-t pt-6">
                            <div className="flex items-center gap-2 mb-4">
                              <RefreshCw className="h-4 w-4 text-muted-foreground" />
                              <h4 className="text-sm font-medium">Renegociación</h4>
                            </div>
                            <RenegotiationDraftsPanel
                              contractId={contract.id}
                              contractName={contract.name}
                              currentVersion={{
                                id: currentVersion.id,
                                version_number: currentVersion.version_number,
                                initial_rent: currentVersion.initial_rent,
                                regime_rent: currentVersion.regime_rent,
                                variable_rent_percentage: currentVersion.variable_rent_percentage,
                                duration_months: currentVersion.duration_months,
                                notice_type: currentVersion.notice_type,
                                notice_value: currentVersion.notice_value,
                                effective_date: currentVersion.effective_date,
                                guarantee_multiplier: currentVersion.guarantee_multiplier,
                                has_periodic_adjustments: currentVersion.has_periodic_adjustments,
                                first_adjustment_month: currentVersion.first_adjustment_month,
                                adjustment_periodicity_months: currentVersion.adjustment_periodicity_months,
                                adjustment_type: (currentVersion as any).adjustment_type,
                                adjustment_value: (currentVersion as any).adjustment_value,
                                gastos_comunes_methodology: (currentVersion as any).gastos_comunes_methodology,
                                gastos_comunes_uf_m2: (currentVersion as any).gastos_comunes_uf_m2,
                                gastos_comunes_uf_ml_frente: (currentVersion as any).gastos_comunes_uf_ml_frente,
                                gastos_comunes_prorrata_kwh_clima: (currentVersion as any).gastos_comunes_prorrata_kwh_clima,
                                gastos_comunes_percentage: (currentVersion as any).gastos_comunes_percentage,
                                gastos_comunes_total_centro: (currentVersion as any).gastos_comunes_total_centro,
                                gastos_comunes_tope: (currentVersion as any).gastos_comunes_tope,
                                gastos_comunes_tope_type: (currentVersion as any).gastos_comunes_tope_type,
                                has_extended_gastos_comunes: (currentVersion as any).has_extended_gastos_comunes,
                                adicional_administracion_percentage: (currentVersion as any).adicional_administracion_percentage,
                                fondo_promocion_percentage: (currentVersion as any).fondo_promocion_percentage,
                                grace_months: (currentVersion as any).grace_months,
                                notice_bilaterality: (currentVersion as any).notice_bilaterality,
                                otros_egresos_amount: (currentVersion as any).otros_egresos_amount,
                                otros_egresos_description: (currentVersion as any).otros_egresos_description,
                                rent_escalations: currentVersion.rent_escalations || [],
                                notice_ranges: currentVersion.notice_ranges || [],
                              }}
                              onSuccess={loadContract}
                            />
                          </div>
                        )}
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }

                case "surfaces": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Superficies y Datos"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Superficies y Datos"
                        icon={<LayoutGrid className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        <ContractSurfacesSection
                          contractId={contract.id}
                          onSurfaceChange={(superficie) => setSuperficieEdificada(superficie)}
                        />
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }

                case "documentVersions": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Contrato de Arriendo"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Contrato de Arriendo"
                        icon={<FileText className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        {hasActiveRenegotiation && (
                          <Card className="p-4 border-amber-500/30 bg-amber-500/5 mb-6">
                            <p className="text-sm text-amber-700 dark:text-amber-400">
                              ⚠️ Hay una renegociación en curso. Las condiciones mostradas son las vigentes hasta que se firme la renegociación.
                            </p>
                          </Card>
                        )}
                        {allVersions.length > 1 && (
                          <VersionHistoryPanel
                            contractId={contract.id}
                            contractName={contract.name}
                            versions={allVersions.map(v => ({
                              ...v,
                              gastos_comunes_methodology: (v as any).gastos_comunes_methodology,
                              gastos_comunes_uf_m2: (v as any).gastos_comunes_uf_m2,
                              gastos_comunes_uf_ml_frente: (v as any).gastos_comunes_uf_ml_frente,
                              gastos_comunes_prorrata_kwh_clima: (v as any).gastos_comunes_prorrata_kwh_clima,
                              gastos_comunes_percentage: (v as any).gastos_comunes_percentage,
                              gastos_comunes_total_centro: (v as any).gastos_comunes_total_centro,
                              gastos_comunes_tope: (v as any).gastos_comunes_tope,
                              gastos_comunes_tope_type: (v as any).gastos_comunes_tope_type,
                              has_extended_gastos_comunes: (v as any).has_extended_gastos_comunes,
                              adicional_administracion_percentage: (v as any).adicional_administracion_percentage,
                              fondo_promocion_percentage: (v as any).fondo_promocion_percentage,
                              grace_months: (v as any).grace_months,
                              notice_bilaterality: (v as any).notice_bilaterality,
                              otros_egresos_amount: (v as any).otros_egresos_amount,
                              otros_egresos_description: (v as any).otros_egresos_description,
                              adjustment_type: (v as any).adjustment_type,
                              adjustment_value: (v as any).adjustment_value,
                            }))}
                            signedVersionId={lastSignedVersion?.id || null}
                            onDeleteRenegotiation={handleDeleteRenegotiation}
                            onAcceptRenegotiation={handleAcceptRenegotiation}
                            onRefresh={loadContract}
                          />
                        )}
                        <DocumentVersions
                          documents={documents.map((d) => ({
                            id: d.id,
                            document_type: d.document_type,
                            url: d.url,
                            uploaded_at: d.uploaded_at,
                            version_id: d.version_id,
                          }))}
                          contractId={contract.id}
                          contractName={contract.name}
                          currentVersion={
                            currentVersion
                              ? {
                                  id: currentVersion.id,
                                  version_number: currentVersion.version_number,
                                  initial_rent: currentVersion.initial_rent,
                                  regime_rent: currentVersion.regime_rent,
                                  variable_rent_percentage: currentVersion.variable_rent_percentage,
                                  duration_months: currentVersion.duration_months,
                                  notice_type: currentVersion.notice_type,
                                  notice_value: currentVersion.notice_value,
                                }
                              : undefined
                          }
                          onAddDocument={handleAddDocument}
                          onMarkAsFinal={handleMarkAsFinal}
                          onSendForSignature={handleSendForSignature}
                          onMarkAsSigned={handleMarkAsSigned}
                          onChangeDocumentType={handleChangeDocumentType}
                          onDeleteDocument={handleDeleteDocument}
                          readOnly={false}
                          isRenegotiation={isSigned && hasActiveRenegotiation}
                          isSigned={isSigned}
                          hasActiveRenegotiation={hasActiveRenegotiation}
                          onRenegotiationSuccess={loadContract}
                          onDataImported={loadContract}
                        />
                        {isSigned && (
                          <div className="mt-6">
                            <TerminationNoticesSection
                              contractId={contract.id}
                              contractName={contract.name}
                              notices={contract.termination_notices || []}
                              onRefresh={loadContract}
                            />
                          </div>
                        )}
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }


                case "repository": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Repositorio de Documentos"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Repositorio de Documentos"
                        icon={<FolderOpen className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        <RepositorySection
                          contractId={contract.id}
                          contractName={contract.name}
                          contractStatus={contract.status}
                        />
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }


                case "budget": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Control Presupuestario"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Control Presupuestario"
                        icon={<DollarSign className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        <BudgetDashboard contractId={contract.id} displayCurrency={contract.display_currency || "UF"} initialTab={sectionParam === "ordenes-compra" ? "purchase-orders" : undefined} />
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }

                case "gantt": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Línea de Tiempo / Gantt"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Línea de Tiempo / Gantt"
                        icon={<Calendar className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        <GanttModule contractId={contract.id} />
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }

                case "alerts": {
                  const permId = sectionPermissionMap[sectionKey];
                  if (isHidden(permId)) return null;
                  return (
                    <SelectableElement
                      key={sectionKey}
                      elementId={permId}
                      label="Alertas y Recordatorios"
                    >
                      <CollapsibleSection
                        id={sectionKey}
                        title="Alertas y Recordatorios"
                        icon={<Bell className="h-5 w-5" />}
                        isCollapsed={isCollapsed(sectionKey)}
                        onCollapsedChange={(collapsed) => setCollapsed(sectionKey, collapsed)}
                        isDraggable={canReorder}
                        wrapperOnly
                      >
                        <ContractAlerts
                          contractId={contract.id}
                          contractName={contract.name}
                          expirationDate={
                            currentVersion?.effective_date
                              ? new Date(
                                  new Date(currentVersion.effective_date).getTime() +
                                    currentVersion.duration_months * 30 * 24 * 60 * 60 * 1000
                                )
                              : undefined
                          }
                        />
                      </CollapsibleSection>
                    </SelectableElement>
                  );
                }


                default:
                  return null;
              }
            })}
          </SortableContext>
        </DndContext>
      </main>

      {/* Floating return button when coming from alerts */}
      <AlertsReturnButton />
      
      {/* Floating return button when coming from OPEX */}
      <OpexReturnButton />
      
      {/* Floating return button when coming from Reports */}
      <ReportsReturnButton />
      
      {/* Floating return button when coming from Dashboard Region */}
      <DashboardRegionReturnButton />
    </div>;
};
export default ContractDetail;