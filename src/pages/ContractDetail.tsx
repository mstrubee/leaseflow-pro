import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText, MapPin, User, Calendar, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    initial_rent: number | null;
    regime_rent: number;
    duration_months: number;
    notice_type: string;
    notice_value: string;
    created_at: string;
  }>;
  contract_documents: Array<{
    id: string;
    document_type: string;
    url: string;
    uploaded_at: string;
  }>;
}

const ContractDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);

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
          contract_versions (*),
          contract_documents (*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setContract(data);
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

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-status-negotiation text-white" },
      firmado: { label: "Firmado", className: "bg-status-signed text-white" },
      vencido: { label: "Vencido", className: "bg-status-expired text-white" },
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
  const documents = contract.contract_documents || [];

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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{contract.name}</h1>
            {getStatusBadge(contract.status)}
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
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Condiciones Comerciales Actuales
            </CardTitle>
            <CardDescription>Versión {currentVersion?.version_number || "N/A"}</CardDescription>
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
              </div>
            ) : (
              <p className="text-muted-foreground">
                No hay condiciones comerciales registradas
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {doc.document_type === "borrador" && "Borrador"}
                        {doc.document_type === "borrador_final" && "Borrador Final"}
                        {doc.document_type === "firmado" && "Contrato Firmado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Subido el {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(doc.url, "_blank")}
                    >
                      Ver Documento
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No hay documentos subidos</p>
            )}
          </CardContent>
        </Card>

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

        {contract.status === "en_negociacion" && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
              <CardDescription>
                Cuando el contrato esté listo, puedes marcarlo como firmado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button>Marcar como Firmado</Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ContractDetail;
