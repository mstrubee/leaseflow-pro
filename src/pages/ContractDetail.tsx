import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, User, Calendar, DollarSign, Edit, Check, Loader2, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocumentVersions, DocumentVersion } from "@/components/contracts/DocumentVersions";
import { EscalationDialog, Escalation } from "@/components/contracts/EscalationDialog";
import { RepositorySection } from "@/components/contracts/RepositorySection";
import { RenegotiationDialog } from "@/components/contracts/RenegotiationDialog";

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
    
    try {
      const { error } = await supabase
        .from("contract_documents")
        .insert({
          contract_id: contract.id,
          version_id: currentVersion?.id || null,
          document_type: "borrador",
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
    try {
      const { error } = await supabase
        .from("contract_documents")
        .update({ document_type: "borrador_final" })
        .eq("id", docId);

      if (error) throw error;

      toast({
        title: "Versión final",
        description: "El documento ha sido marcado como versión final",
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

  const handleSaveEscalations = async (escalations: Escalation[]) => {
    if (!contract) return;
    
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion) return;

    try {
      // Delete existing escalations
      const { error: deleteError } = await supabase
        .from("rent_escalations")
        .delete()
        .eq("version_id", currentVersion.id);

      if (deleteError) throw deleteError;

      // Insert new escalations
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

  const handleMarkAsSigned = async () => {
    if (!contract) return;

    // Check if there's a final version
    const hasFinalVersion = contract.contract_documents?.some(
      (d) => d.document_type === "borrador_final"
    );

    if (!hasFinalVersion) {
      toast({
        variant: "destructive",
        title: "Acción requerida",
        description: "Debes marcar una versión del documento como Final antes de firmar",
      });
      return;
    }

    setSigningContract(true);

    try {
      // Update contract status
      const { error: contractError } = await supabase
        .from("contracts")
        .update({
          status: "firmado",
          signed_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", contract.id);

      if (contractError) throw contractError;

      // Update the final document to "firmado"
      const finalDoc = contract.contract_documents?.find(
        (d) => d.document_type === "borrador_final"
      );
      
      if (finalDoc) {
        const { error: docError } = await supabase
          .from("contract_documents")
          .update({ document_type: "firmado" })
          .eq("id", finalDoc.id);

        if (docError) throw docError;
      }

      toast({
        title: "Contrato firmado",
        description: "El contrato ha sido marcado como firmado",
      });

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
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
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
  const documents = contract.contract_documents || [];
  const isNegotiating = contract.status === "en_negociacion";
  const isSigned = contract.status === "firmado";
  const hasFinalVersion = documents.some(
    (d) => d.document_type === "borrador_final" || d.document_type === "firmado"
  );

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
            {isSigned && currentVersion && (
              <RenegotiationDialog
                contractId={contract.id}
                currentVersion={{
                  id: currentVersion.id,
                  version_number: currentVersion.version_number,
                  initial_rent: currentVersion.initial_rent,
                  regime_rent: currentVersion.regime_rent,
                  duration_months: currentVersion.duration_months,
                  notice_type: currentVersion.notice_type,
                  notice_value: currentVersion.notice_value,
                }}
                onSuccess={loadContract}
              />
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
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Empresa</p>
                  <p className="font-medium">{contact.company}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nombre</p>
                  <p className="font-medium">{contact.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Teléfono</p>
                  <p className="font-medium">{contact.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{contact.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No hay contacto registrado</p>
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
                <CardDescription>Versión {currentVersion?.version_number || "N/A"}</CardDescription>
              </div>
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
            </div>
          </CardHeader>
          <CardContent>
            {currentVersion ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentVersion.initial_rent && (
                    <div>
                      <p className="text-sm text-muted-foreground">Canon Inicial</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(currentVersion.initial_rent)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Canon en Régimen</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(currentVersion.regime_rent)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duración</p>
                    <p className="text-lg font-semibold">
                      {currentVersion.duration_months} meses (
                      {Math.floor(currentVersion.duration_months / 12)} años{" "}
                      {currentVersion.duration_months % 12} meses)
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Aviso de Término</p>
                    <p className="text-lg font-semibold">
                      {currentVersion.notice_type === "meses"
                        ? `${currentVersion.notice_value} meses`
                        : formatDate(currentVersion.notice_value)}
                    </p>
                  </div>
                </div>

                {/* Escalations summary */}
                {currentVersion.rent_escalations && currentVersion.rent_escalations.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-2">
                      Escalonamiento ({currentVersion.rent_escalations.length} escalones)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentVersion.rent_escalations
                        .sort((a, b) => a.month_number - b.month_number)
                        .map((e) => (
                          <Badge key={e.id} variant="secondary">
                            Mes {e.month_number}: {formatCurrency(e.amount)}
                          </Badge>
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
                Este contrato tiene {allVersions.length} versiones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {allVersions.map((version) => (
                  <div
                    key={version.id}
                    className={`p-4 rounded-lg border ${
                      version.is_current
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/30"
                    }`}
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
                        </div>
                        {version.effective_date && (
                          <div className="text-sm text-muted-foreground">
                            Vigente desde: {formatDate(version.effective_date)}
                          </div>
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
          onAddDocument={handleAddDocument}
          onMarkAsFinal={handleMarkAsFinal}
          readOnly={!isNegotiating}
        />

        <RepositorySection 
          contractId={contract.id} 
          contractName={contract.name} 
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

        {isNegotiating && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
              <CardDescription>
                {hasFinalVersion
                  ? "El contrato está listo para ser firmado"
                  : "Marca una versión del documento como Final antes de firmar"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleMarkAsSigned}
                disabled={!hasFinalVersion || signingContract}
                className="gap-2"
              >
                {signingContract ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Marcar como Firmado
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ContractDetail;
