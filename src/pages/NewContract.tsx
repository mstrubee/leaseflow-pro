import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { RentEscalations, Escalation } from "@/components/contracts/RentEscalations";

const NewContract = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Contract basic info
  const [name, setName] = useState("");
  
  // Address
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [commune, setCommune] = useState("");
  const [region, setRegion] = useState("");
  
  // Contact
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  
  // Commercial conditions
  const [hasEscalation, setHasEscalation] = useState(false);
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [duration, setDuration] = useState("");
  const [noticeType, setNoticeType] = useState<"fecha" | "meses">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  
  // Document
  const [documentUrl, setDocumentUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create contract
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .insert({
          name,
          status: "en_negociacion",
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Create address
      const { error: addressError } = await supabase
        .from("contract_addresses")
        .insert({
          contract_id: contract.id,
          street,
          number,
          commune,
          region,
          country: "Chile",
        });

      if (addressError) throw addressError;

      // Create contact
      const { error: contactError } = await supabase
        .from("contract_contacts")
        .insert({
          contract_id: contract.id,
          company,
          name: contactName,
          phone,
          email,
        });

      if (contactError) throw contactError;

      // Create version
      const { data: version, error: versionError } = await supabase
        .from("contract_versions")
        .insert({
          contract_id: contract.id,
          version_number: 1,
          is_current: true,
          initial_rent: hasEscalation ? parseFloat(initialRent) : null,
          regime_rent: parseFloat(regimeRent),
          variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
          duration_months: parseInt(duration),
          notice_type: noticeType,
          notice_value: noticeValue,
        })
        .select()
        .single();

      if (versionError) throw versionError;

      // Create escalations if any
      if (hasEscalation && escalations.length > 0) {
        const { error: escalationError } = await supabase
          .from("rent_escalations")
          .insert(
            escalations.map((e) => ({
              version_id: version.id,
              month_number: e.month_number,
              amount: e.amount,
            }))
          );

        if (escalationError) throw escalationError;
      }

      // Create document if URL provided
      if (documentUrl) {
        const { error: docError } = await supabase
          .from("contract_documents")
          .insert({
            contract_id: contract.id,
            version_id: version.id,
            document_type: "borrador",
            url: documentUrl,
          });

        if (docError) throw docError;
      }

      toast({
        title: "Contrato creado",
        description: "El contrato ha sido creado exitosamente",
      });

      navigate(`/contracts/${contract.id}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al crear el contrato",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Nuevo Contrato</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
              <CardDescription>Datos básicos del contrato</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Contrato *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dirección</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Calle *</Label>
                  <Input
                    id="street"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número *</Label>
                  <Input
                    id="number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commune">Comuna *</Label>
                  <Input
                    id="commune"
                    value={commune}
                    onChange={(e) => setCommune(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Región *</Label>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Empresa *</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Nombre *</Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono *</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condiciones Comerciales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>¿Tiene arriendo escalonado?</Label>
                <RadioGroup
                  value={hasEscalation ? "yes" : "no"}
                  onValueChange={(value) => setHasEscalation(value === "yes")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="no" />
                    <Label htmlFor="no">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="yes" />
                    <Label htmlFor="yes">Sí</Label>
                  </div>
                </RadioGroup>
              </div>

              {hasEscalation && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="initialRent">Canon Inicial (CLP) *</Label>
                    <Input
                      id="initialRent"
                      type="number"
                      value={initialRent}
                      onChange={(e) => setInitialRent(e.target.value)}
                      required={hasEscalation}
                    />
                  </div>
                  
                  {duration && (
                    <div className="border border-border rounded-lg p-4 mt-4">
                      <RentEscalations
                        escalations={escalations}
                        onChange={setEscalations}
                        initialRent={parseFloat(initialRent) || 0}
                        regimeRent={parseFloat(regimeRent) || 0}
                        durationMonths={parseInt(duration) || 12}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="regimeRent">Canon en Régimen (CLP) *</Label>
                <Input
                  id="regimeRent"
                  type="number"
                  value={regimeRent}
                  onChange={(e) => setRegimeRent(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="variableRentPercentage">Arriendo Variable (%)</Label>
                <Input
                  id="variableRentPercentage"
                  type="number"
                  step="0.01"
                  placeholder="Ej: 5.5"
                  value={variableRentPercentage}
                  onChange={(e) => setVariableRentPercentage(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duración (meses) *</Label>
                <Input
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Aviso de Término *</Label>
                <Select value={noticeType} onValueChange={(value: any) => setNoticeType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meses">Meses</SelectItem>
                    <SelectItem value="fecha">Fecha específica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="noticeValue">
                  {noticeType === "meses" ? "Número de Meses *" : "Fecha *"}
                </Label>
                <Input
                  id="noticeValue"
                  type={noticeType === "meses" ? "number" : "date"}
                  value={noticeValue}
                  onChange={(e) => setNoticeValue(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documento</CardTitle>
              <CardDescription>Link al borrador del contrato (Google Drive, OneDrive, etc.)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="documentUrl">URL del Documento</Label>
                <Input
                  id="documentUrl"
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate("/")}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear Contrato
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default NewContract;
