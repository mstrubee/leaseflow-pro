import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

const EditContract = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Contract basic info
  const [name, setName] = useState("");
  
  // Address
  const [addressId, setAddressId] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [commune, setCommune] = useState("");
  const [region, setRegion] = useState("");
  
  // Contact
  const [contactId, setContactId] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  
  // Commercial conditions
  const [versionId, setVersionId] = useState("");
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [duration, setDuration] = useState("");
  const [noticeType, setNoticeType] = useState<"fecha" | "meses">("meses");
  const [noticeValue, setNoticeValue] = useState("");

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
          contract_versions (*)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      setName(data.name);

      const address = data.contract_addresses?.[0];
      if (address) {
        setAddressId(address.id);
        setStreet(address.street);
        setNumber(address.number);
        setCommune(address.commune);
        setRegion(address.region);
      }

      const contact = data.contract_contacts?.[0];
      if (contact) {
        setContactId(contact.id);
        setCompany(contact.company);
        setContactName(contact.name);
        setPhone(contact.phone);
        setEmail(contact.email);
      }

      const version = data.contract_versions?.find((v: any) => v.is_current);
      if (version) {
        setVersionId(version.id);
        setInitialRent(version.initial_rent?.toString() || "");
        setRegimeRent(version.regime_rent.toString());
        setDuration(version.duration_months.toString());
        setNoticeType(version.notice_type);
        setNoticeValue(version.notice_value);
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Update contract
      const { error: contractError } = await supabase
        .from("contracts")
        .update({ name })
        .eq("id", id);

      if (contractError) throw contractError;

      // Update address
      if (addressId) {
        const { error: addressError } = await supabase
          .from("contract_addresses")
          .update({ street, number, commune, region })
          .eq("id", addressId);

        if (addressError) throw addressError;
      }

      // Update contact
      if (contactId) {
        const { error: contactError } = await supabase
          .from("contract_contacts")
          .update({
            company,
            name: contactName,
            phone,
            email,
          })
          .eq("id", contactId);

        if (contactError) throw contactError;
      }

      // Update version
      if (versionId) {
        const { error: versionError } = await supabase
          .from("contract_versions")
          .update({
            initial_rent: initialRent ? parseFloat(initialRent) : null,
            regime_rent: parseFloat(regimeRent),
            duration_months: parseInt(duration),
            notice_type: noticeType,
            notice_value: noticeValue,
          })
          .eq("id", versionId);

        if (versionError) throw versionError;
      }

      toast({
        title: "Contrato actualizado",
        description: "Los cambios han sido guardados",
      });

      navigate(`/contracts/${id}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al actualizar el contrato",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/contracts/${id}`)}
            className="gap-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Editar Contrato</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
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
              <CardDescription>
                Modifica las condiciones de la versión actual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="initialRent">Canon Inicial (CLP)</Label>
                <Input
                  id="initialRent"
                  type="number"
                  value={initialRent}
                  onChange={(e) => setInitialRent(e.target.value)}
                  placeholder="Opcional si no hay escalonamiento"
                />
              </div>

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

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => navigate(`/contracts/${id}`)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default EditContract;
