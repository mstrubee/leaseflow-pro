import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { RentEscalations, Escalation } from "@/components/contracts/RentEscalations";
import { CurrencyInput } from "@/components/contracts/CurrencyInput";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
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
  const [rolSii, setRolSii] = useState("");
  
  // Contact
  const [contactId, setContactId] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [emails, setEmails] = useState<string[]>([""]);
  const [countryCode, setCountryCode] = useState("+56");
  
  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  
  // Commercial conditions
  const [versionId, setVersionId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [hasSeparateDates, setHasSeparateDates] = useState(false);
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");
  const [hasEscalation, setHasEscalation] = useState(false);
  const [graceMonths, setGraceMonths] = useState(0);
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [duration, setDuration] = useState("");
  const [noticeType, setNoticeType] = useState<"fecha" | "meses" | "rangos">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [noticeRanges, setNoticeRanges] = useState<Array<{ id?: string; start_month: number; end_month: number }>>([]);
  const [escalations, setEscalations] = useState<Array<{ id?: string; month_number: number; amount: number }>>([]);
  const [noticeBilaterality, setNoticeBilaterality] = useState<"unilateral_gp" | "bilateral">("unilateral_gp");
  
  // Guarantee and periodic adjustments
  const [guaranteeMultiplier, setGuaranteeMultiplier] = useState("");
  const [hasPeriodicAdjustments, setHasPeriodicAdjustments] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [firstAdjustmentMonth, setFirstAdjustmentMonth] = useState("");
  const [adjustmentPeriodicityMonths, setAdjustmentPeriodicityMonths] = useState("");
  
  // Gastos comunes and fondo promoción
  const [hasExtendedGastosComunes, setHasExtendedGastosComunes] = useState(false);
  const [gastosComunesUfM2, setGastosComunesUfM2] = useState("");
  const [gastosComunesUfMlFrente, setGastosComunesUfMlFrente] = useState("");
  const [gastosComunesProrratKwhClima, setGastosComunesProrratKwhClima] = useState("");
  const [fondoPromocionPercentage, setFondoPromocionPercentage] = useState("");
  const [adicionalAdministracionPercentage, setAdicionalAdministracionPercentage] = useState("");
  
  // Surface data for gastos comunes calculation
  const [superficieEdificadaLocal, setSuperficieEdificadaLocal] = useState<number>(0);
  const [metrosLinealesFrente, setMetrosLinealesFrente] = useState<number>(0);
  
  const { ufValue, convertPesosToUF } = useEconomicIndicators();

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
          contract_versions (*, rent_escalations (*))
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      setName(data.name);
      setSuperficieEdificadaLocal(data.superficie_edificada_local || 0);
      setMetrosLinealesFrente(data.metros_lineales_frente || 0);

      const address = data.contract_addresses?.[0];
      if (address) {
        setAddressId(address.id);
        setStreet(address.street);
        setNumber(address.number);
        setCommune(address.commune);
        setRegion(address.region);
        setRolSii(address.rol_sii || "");
      }

      const contact = data.contract_contacts?.[0];
      if (contact) {
        setContactId(contact.id);
        setCompany(contact.company);
        setContactName(contact.name);
        // Parse phone: extract digits after country code
        const phoneMatch = contact.phone?.match(/^\+(\d+)\s?(.*)$/);
        if (phoneMatch) {
          setCountryCode(`+${phoneMatch[1]}`);
          setPhoneDigits(phoneMatch[2]?.replace(/\D/g, "") || "");
        } else {
          setPhoneDigits(contact.phone?.replace(/\D/g, "") || "");
        }
        // Parse emails: split by comma or semicolon
        const emailList = contact.email?.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean) || [""];
        setEmails(emailList.length > 0 ? emailList : [""]);
      }
      
      // Get country code from address
      const addressData = data.contract_addresses?.[0];
      if (addressData) {
        const countryCodes: Record<string, string> = {
          "Chile": "+56",
          "Argentina": "+54",
          "Perú": "+51",
          "Colombia": "+57",
          "México": "+52",
        };
        setCountryCode(countryCodes[addressData.country] || "+56");
      }

      const version = data.contract_versions?.find((v: any) => v.is_current);
      if (version) {
        setVersionId(version.id);
        setEffectiveDate(version.effective_date || "");
        // hasEscalation is true if there are escalations, grace months, or initial_rent differs from regime_rent
        const hasEscalationsData = (version.rent_escalations && version.rent_escalations.length > 0) ||
          ((version as any).grace_months && (version as any).grace_months > 0) ||
          (version.initial_rent !== null && version.initial_rent !== version.regime_rent);
        setHasEscalation(hasEscalationsData);
        setGraceMonths((version as any).grace_months || 0);
        setInitialRent(version.initial_rent?.toString() || "");
        setRegimeRent(version.regime_rent.toString());
        setVariableRentPercentage(version.variable_rent_percentage?.toString() || "");
        setDuration(version.duration_months.toString());
        setNoticeType(version.notice_type as "fecha" | "meses" | "rangos");
        setNoticeValue(version.notice_value);
        setEscalations(version.rent_escalations || []);
        
        // Load signed date - check if different from effective date
        if (data.signed_date) {
          setSignedDate(data.signed_date);
          if (data.signed_date !== version.effective_date) {
            setHasSeparateDates(true);
          }
        }
        
        // Load notice ranges if notice_type is "rangos"
        if (version.notice_type === "rangos") {
          const { data: ranges } = await supabase
            .from("notice_ranges")
            .select("*")
            .eq("version_id", version.id)
            .order("start_month");
          setNoticeRanges(ranges || []);
        }
        
        // Load guarantee and periodic adjustments
        setGuaranteeMultiplier(version.guarantee_multiplier?.toString() || "");
        setHasPeriodicAdjustments(version.has_periodic_adjustments || false);
        setAdjustmentType((version as any).adjustment_type || "percentage");
        setAdjustmentValue((version as any).adjustment_value?.toString() || "");
        setFirstAdjustmentMonth(version.first_adjustment_month?.toString() || "");
        setAdjustmentPeriodicityMonths(version.adjustment_periodicity_months?.toString() || "");
        
        // Load gastos comunes and fondo promoción
        setGastosComunesUfM2(version.gastos_comunes_uf_m2?.toString() || "");
        setGastosComunesUfMlFrente((version as any).gastos_comunes_uf_ml_frente?.toString() || "");
        setGastosComunesProrratKwhClima((version as any).gastos_comunes_prorrata_kwh_clima?.toString() || "");
        setFondoPromocionPercentage(version.fondo_promocion_percentage?.toString() || "");
        setAdicionalAdministracionPercentage((version as any).adicional_administracion_percentage?.toString() || "");
        
        // Set extended gastos comunes if any extended field is set
        setHasExtendedGastosComunes(
          !!(version as any).gastos_comunes_uf_ml_frente || 
          !!(version as any).gastos_comunes_prorrata_kwh_clima
        );
        
        // Load notice bilaterality
        setNoticeBilaterality((version as any).notice_bilaterality || "unilateral_gp");
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
      // Update contract including signed_date
      const { error: contractError } = await supabase
        .from("contracts")
        .update({ 
          name,
          signed_date: hasSeparateDates ? signedDate || null : effectiveDate || null,
        })
        .eq("id", id);

      if (contractError) throw contractError;

      // Update or create address
      const fullPhone = phoneDigits ? `${countryCode} ${phoneDigits}` : "";
      const fullEmail = emails.filter(e => e.trim()).join(", ");

      if (addressId) {
        const { error: addressError } = await supabase
          .from("contract_addresses")
          .update({ street, number, commune, region, rol_sii: rolSii || null })
          .eq("id", addressId);

        if (addressError) throw addressError;
      } else if (street || number || commune || region || rolSii) {
        // Create new address if doesn't exist
        const { error: addressError } = await supabase
          .from("contract_addresses")
          .insert({
            contract_id: id,
            street: street || "",
            number: number || "",
            commune: commune || "",
            region: region || "",
            rol_sii: rolSii || null,
          });

        if (addressError) throw addressError;
      }

      // Update or create contact - always save if any contact data exists
      const hasContactData = company || contactName || fullEmail || fullPhone;
      
      if (contactId) {
        const { error: contactError } = await supabase
          .from("contract_contacts")
          .update({
            company: company || "",
            name: contactName || "",
            phone: fullPhone,
            email: fullEmail,
          })
          .eq("id", contactId);

        if (contactError) throw contactError;
      } else if (hasContactData) {
        // Create new contact if doesn't exist but has some data
        const { data: newContact, error: contactError } = await supabase
          .from("contract_contacts")
          .insert({
            contract_id: id,
            company: company || "",
            name: contactName || "",
            phone: fullPhone,
            email: fullEmail,
          })
          .select()
          .single();

        if (contactError) throw contactError;
        if (newContact) setContactId(newContact.id);
      }

      // Update or create version
      let currentVersionId = versionId;
      
      if (versionId) {
        const { error: versionError } = await supabase
          .from("contract_versions")
          .update({
            effective_date: effectiveDate || null,
            initial_rent: hasEscalation ? (initialRent !== "" ? parseFloat(initialRent) : (graceMonths > 0 ? 0 : null)) : null,
            regime_rent: parseFloat(regimeRent) || 0,
            variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
            duration_months: parseInt(duration) || 12,
            notice_type: noticeType === "rangos" ? "rangos" as any : noticeType,
            notice_value: noticeType === "rangos" ? "" : (noticeValue || "3"),
            guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
            has_periodic_adjustments: hasPeriodicAdjustments,
            adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
            adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
            first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
            adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicityMonths ? parseInt(adjustmentPeriodicityMonths) : null,
            gastos_comunes_uf_m2: gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
            gastos_comunes_uf_ml_frente: gastosComunesUfMlFrente ? parseFloat(gastosComunesUfMlFrente) : null,
            gastos_comunes_prorrata_kwh_clima: gastosComunesProrratKwhClima ? parseFloat(gastosComunesProrratKwhClima) : null,
            fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
            adicional_administracion_percentage: adicionalAdministracionPercentage ? parseFloat(adicionalAdministracionPercentage) : null,
            notice_bilaterality: noticeBilaterality,
            grace_months: graceMonths || 0,
          } as any)
          .eq("id", versionId);

        if (versionError) throw versionError;
      } else {
        // Create new version if doesn't exist
        const { data: newVersion, error: versionError } = await supabase
          .from("contract_versions")
          .insert({
            contract_id: id,
            version_number: 1,
            is_current: true,
            effective_date: effectiveDate || null,
            initial_rent: hasEscalation ? (initialRent !== "" ? parseFloat(initialRent) : (graceMonths > 0 ? 0 : null)) : null,
            regime_rent: parseFloat(regimeRent) || 0,
            variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
            duration_months: parseInt(duration) || 12,
            notice_type: (noticeType === "rangos" ? "rangos" : noticeType) as any,
            notice_value: noticeType === "rangos" ? "" : (noticeValue || "3"),
            guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
            has_periodic_adjustments: hasPeriodicAdjustments,
            adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
            adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
            first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
            adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicityMonths ? parseInt(adjustmentPeriodicityMonths) : null,
            gastos_comunes_uf_m2: gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
            gastos_comunes_uf_ml_frente: gastosComunesUfMlFrente ? parseFloat(gastosComunesUfMlFrente) : null,
            gastos_comunes_prorrata_kwh_clima: gastosComunesProrratKwhClima ? parseFloat(gastosComunesProrratKwhClima) : null,
            fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
            adicional_administracion_percentage: adicionalAdministracionPercentage ? parseFloat(adicionalAdministracionPercentage) : null,
            notice_bilaterality: noticeBilaterality,
          } as any)
          .select()
          .single();

        if (versionError) throw versionError;
        currentVersionId = newVersion.id;
      }

      // Handle escalations
      if (currentVersionId) {
        if (hasEscalation) {
          // Delete existing escalations
          await supabase
            .from("rent_escalations")
            .delete()
            .eq("version_id", currentVersionId);

          // Insert new escalations
          if (escalations.length > 0) {
            const { error: escalationError } = await supabase
              .from("rent_escalations")
              .insert(
                escalations.map((e) => ({
                  version_id: currentVersionId,
                  month_number: e.month_number,
                  amount: e.amount,
                }))
              );

            if (escalationError) throw escalationError;
          }
        } else {
          // Remove escalations if hasEscalation is false
          await supabase
            .from("rent_escalations")
            .delete()
            .eq("version_id", currentVersionId);
        }
      }

      // Handle notice ranges
      if (currentVersionId && noticeType === "rangos") {
        // Delete existing notice ranges
        await supabase
          .from("notice_ranges")
          .delete()
          .eq("version_id", currentVersionId);

        // Insert new notice ranges
        if (noticeRanges.length > 0) {
          const { error: rangeError } = await supabase
            .from("notice_ranges")
            .insert(
              noticeRanges.map((r) => ({
                version_id: currentVersionId,
                start_month: r.start_month,
                end_month: r.end_month,
              }))
            );

          if (rangeError) throw rangeError;
        }
      } else if (currentVersionId) {
        // Remove notice ranges if not using "rangos" type
        await supabase
          .from("notice_ranges")
          .delete()
          .eq("version_id", currentVersionId);
      }

      // Generate termination notice alert
      if (effectiveDate && duration && (noticeType === 'meses' || noticeType === 'fecha' || noticeType === 'rangos')) {
        // Delete existing early_termination_notice alerts for this contract
        await supabase
          .from("alerts")
          .delete()
          .eq("contract_id", id)
          .eq("alert_type", "early_termination_notice");

        // Calculate expiration date
        const startDate = new Date(effectiveDate);
        const expirationDate = new Date(startDate);
        expirationDate.setMonth(expirationDate.getMonth() + (parseInt(duration) || 12));

        let alertDate: Date | null = null;

        if (noticeType === 'meses' && noticeValue) {
          // Alert date is X months before expiration
          alertDate = new Date(expirationDate);
          alertDate.setMonth(alertDate.getMonth() - parseInt(noticeValue));
        } else if (noticeType === 'fecha' && noticeValue) {
          // Alert date is the specific date
          alertDate = new Date(noticeValue);
        } else if (noticeType === 'rangos' && noticeRanges.length > 0) {
          // Alert date is the start of the first range (in months from start)
          const firstRange = noticeRanges.sort((a, b) => a.start_month - b.start_month)[0];
          alertDate = new Date(startDate);
          alertDate.setMonth(alertDate.getMonth() + firstRange.start_month - 1);
        }

        if (alertDate && alertDate > new Date()) {
          const { error: alertError } = await supabase
            .from("alerts")
            .insert({
              contract_id: id,
              title: `Aviso de término anticipado: ${name}`,
              message: `Fecha límite para dar aviso de término anticipado del contrato ${name}.`,
              alert_type: "early_termination_notice",
              due_date: alertDate.toISOString().split('T')[0],
              days_before: [30, 15, 7, 1],
              channels: ["email"],
              is_active: true,
            });

          if (alertError) {
            console.error("Error creating alert:", alertError);
          }
        }
      }

      setHasUnsavedChanges(false);

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

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation(`/contracts/${id}`);
      setShowUnsavedDialog(true);
    } else {
      navigate(`/contracts/${id}`);
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
  };

  const handleConfirmSave = async () => {
    setShowUnsavedDialog(false);
    // Trigger form submission
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="gap-2 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">Editar Contrato</h1>
        </div>
      </header>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea guardar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tiene cambios sin guardar. ¿Qué desea hacer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleConfirmDiscard}>
              Descartar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>
              Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  onChange={(e) => { setName(e.target.value); setHasUnsavedChanges(true); }}
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
                    onChange={(e) => { setStreet(e.target.value); setHasUnsavedChanges(true); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número *</Label>
                  <Input
                    id="number"
                    value={number}
                    onChange={(e) => { setNumber(e.target.value); setHasUnsavedChanges(true); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commune">Comuna *</Label>
                  <Input
                    id="commune"
                    value={commune}
                    onChange={(e) => { setCommune(e.target.value); setHasUnsavedChanges(true); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Región *</Label>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => { setRegion(e.target.value); setHasUnsavedChanges(true); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rolSii">ROL SII</Label>
                  <Input
                    id="rolSii"
                    value={rolSii}
                    onChange={(e) => { setRolSii(e.target.value); setHasUnsavedChanges(true); }}
                    placeholder="Ej: 1234-5"
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
                    onChange={(e) => { setCompany(e.target.value); setHasUnsavedChanges(true); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Nombre *</Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => { setContactName(e.target.value); setHasUnsavedChanges(true); }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono (opcional)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground min-w-[45px]">{countryCode}</span>
                    <Input
                      id="phone"
                      value={phoneDigits}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                        setPhoneDigits(digits);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="912345678"
                      maxLength={9}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">9 dígitos máximo</p>
                </div>
              </div>
              
              {/* Multiple Emails */}
              <div className="space-y-2">
                <Label>Emails</Label>
                {emails.map((email, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const newEmails = [...emails];
                        newEmails[index] = e.target.value;
                        setEmails(newEmails);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="correo@ejemplo.com"
                    />
                    {emails.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newEmails = emails.filter((_, i) => i !== index);
                          setEmails(newEmails);
                          setHasUnsavedChanges(true);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmails([...emails, ""]);
                    setHasUnsavedChanges(true);
                  }}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Agregar email
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condiciones Comerciales</CardTitle>
              <CardDescription>
                Modifica las condiciones de la versión actual (valores en UF)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hasSeparateDates"
                    checked={hasSeparateDates}
                    onChange={(e) => {
                      setHasSeparateDates(e.target.checked);
                      setHasUnsavedChanges(true);
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="hasSeparateDates" className="text-sm">
                    Fecha de firma diferente a fecha de inicio
                  </Label>
                </div>

                {hasSeparateDates && (
                  <div className="space-y-2">
                    <Label htmlFor="signedDate">Fecha de Firma</Label>
                    <Input
                      id="signedDate"
                      type="date"
                      value={signedDate}
                      onChange={(e) => {
                        setSignedDate(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="effectiveDate">
                    {hasSeparateDates ? "Fecha de Inicio" : "Fecha Firma e Inicio"}
                  </Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {hasSeparateDates 
                      ? "La fecha de inicio del contrato puede completarse más adelante"
                      : "Fecha de firma e inicio del contrato"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Moneda para edición</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "UF" | "CLP")}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">Pesos (CLP)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Los valores se almacenan en UF.
                </p>
              </div>

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
                  <CurrencyInput
                    id="initialRent"
                    label="Canon Inicial"
                    value={initialRent}
                    onChange={setInitialRent}
                    currency={currency}
                    onCurrencyChange={setCurrency}
                    required
                    showCurrencySelector={false}
                  />
                  
                  <CurrencyInput
                    id="regimeRent"
                    label="Canon en Régimen"
                    value={regimeRent}
                    onChange={setRegimeRent}
                    currency={currency}
                    onCurrencyChange={setCurrency}
                    required
                    showCurrencySelector={false}
                  />
                  
                  {duration && (
                    <div className="border border-border rounded-lg p-4 mt-4">
                      <RentEscalations
                        escalations={escalations}
                        onChange={setEscalations}
                        initialRent={parseFloat(initialRent) || 0}
                        regimeRent={parseFloat(regimeRent) || 0}
                        durationMonths={parseInt(duration) || 12}
                        currency={currency}
                        graceMonths={graceMonths}
                        onGraceMonthsChange={setGraceMonths}
                        effectiveDate={effectiveDate}
                        hasPeriodicAdjustments={hasPeriodicAdjustments}
                        adjustmentType={adjustmentType}
                        adjustmentValue={parseFloat(adjustmentValue) || 0}
                        firstAdjustmentMonth={parseInt(firstAdjustmentMonth) || 0}
                        adjustmentPeriodicityMonths={parseInt(adjustmentPeriodicityMonths) || 0}
                      />
                    </div>
                  )}
                </>
              )}

              {!hasEscalation && (
                <CurrencyInput
                  id="regimeRent"
                  label="Canon en Régimen"
                  value={regimeRent}
                  onChange={setRegimeRent}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  required
                  showCurrencySelector={false}
                />
              )}

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

              {/* Garantía */}
              <div className="space-y-2">
                <Label htmlFor="guaranteeMultiplier">Garantía (multiplicador del arriendo)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="guaranteeMultiplier"
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Ej: 2"
                    value={guaranteeMultiplier}
                    onChange={(e) => setGuaranteeMultiplier(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">×</span>
                  <span className="text-sm text-muted-foreground">
                    {regimeRent || "0"} UF
                  </span>
                  <span className="text-sm text-muted-foreground">=</span>
                  <span className="text-sm font-medium">
                    {guaranteeMultiplier && regimeRent
                      ? (parseFloat(guaranteeMultiplier) * parseFloat(regimeRent)).toFixed(2)
                      : "0"} UF
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monto de Garantía de Arriendo
                </p>
              </div>

              {/* Gastos Comunes */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hasExtendedGastosComunes"
                    checked={hasExtendedGastosComunes}
                    onChange={(e) => {
                      setHasExtendedGastosComunes(e.target.checked);
                      setHasUnsavedChanges(true);
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="hasExtendedGastosComunes" className="text-sm font-medium">
                    Ampliar metodología de cálculo de Gastos Comunes
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gastosComunesUfM2">Gastos Comunes (UF/m² de superficie)</Label>
                  <Input
                    id="gastosComunesUfM2"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 0.05"
                    value={gastosComunesUfM2}
                    onChange={(e) => setGastosComunesUfM2(e.target.value)}
                  />
                </div>

                {hasExtendedGastosComunes && (
                  <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="gastosComunesUfMlFrente">Gastos Comunes (UF/mL de frente)</Label>
                      <Input
                        id="gastosComunesUfMlFrente"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ej: 0.10"
                        value={gastosComunesUfMlFrente}
                        onChange={(e) => setGastosComunesUfMlFrente(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gastosComunesProrratKwhClima">Prorrata KWH Clima (UF)</Label>
                      <Input
                        id="gastosComunesProrratKwhClima"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ej: 5.00"
                        value={gastosComunesProrratKwhClima}
                        onChange={(e) => setGastosComunesProrratKwhClima(e.target.value)}
                      />
                    </div>

                    {/* Adicional por Administración - inside extended gastos comunes */}
                    <div className="space-y-2">
                      <Label htmlFor="adicionalAdministracionPercentage">Adicional por Administración (%)</Label>
                      <Input
                        id="adicionalAdministracionPercentage"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ej: 5"
                        value={adicionalAdministracionPercentage}
                        onChange={(e) => setAdicionalAdministracionPercentage(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Porcentaje sobre el Canon en Régimen (se suma a Gastos Comunes)
                      </p>
                    </div>
                  </div>
                )}

                {/* Gastos Comunes Preview/Total */}
                {(gastosComunesUfM2 || (hasExtendedGastosComunes && (gastosComunesUfMlFrente || gastosComunesProrratKwhClima || adicionalAdministracionPercentage))) && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-primary">Total Gastos Comunes Estimado:</p>
                    {(() => {
                      const gastosM2 = (parseFloat(gastosComunesUfM2) || 0) * superficieEdificadaLocal;
                      // Only include extended fields if checkbox is checked
                      const gastosMlFrente = hasExtendedGastosComunes ? (parseFloat(gastosComunesUfMlFrente) || 0) * metrosLinealesFrente : 0;
                      const gastosKwhClima = hasExtendedGastosComunes ? (parseFloat(gastosComunesProrratKwhClima) || 0) : 0;
                      const adicionalAdmin = hasExtendedGastosComunes ? (parseFloat(regimeRent) || 0) * ((parseFloat(adicionalAdministracionPercentage) || 0) / 100) : 0;
                      const totalUF = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdmin;
                      const totalCLP = totalUF * (ufValue || 0);
                      
                      return (
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-semibold">{totalUF.toFixed(2)} UF</span>
                          </div>
                          {ufValue > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Equivalente:</span>
                              <span className="font-medium">${Math.round(totalCLP).toLocaleString("es-CL")}</span>
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-2 space-y-0.5">
                            {gastosM2 > 0 && <div>UF/m² × {superficieEdificadaLocal}m² = {gastosM2.toFixed(2)} UF</div>}
                            {gastosMlFrente > 0 && <div>UF/mL × {metrosLinealesFrente}mL = {gastosMlFrente.toFixed(2)} UF</div>}
                            {gastosKwhClima > 0 && <div>Prorrata KWH Clima = {gastosKwhClima.toFixed(2)} UF</div>}
                            {adicionalAdmin > 0 && <div>Adic. Admin ({adicionalAdministracionPercentage}%) = {adicionalAdmin.toFixed(2)} UF</div>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Fondo de Promoción */}
              <div className="space-y-2">
                <Label htmlFor="fondoPromocionPercentage">Fondo de Promoción (%)</Label>
                <Input
                  id="fondoPromocionPercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ej: 2.5"
                  value={fondoPromocionPercentage}
                  onChange={(e) => setFondoPromocionPercentage(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Porcentaje sobre el Canon en Régimen (puede ser 0)
                </p>
              </div>

              {/* Reajustes Periódicos */}
              <div className="space-y-2">
                <Label>¿Tiene reajustes periódicos?</Label>
                <RadioGroup
                  value={hasPeriodicAdjustments ? "yes" : "no"}
                  onValueChange={(value) => setHasPeriodicAdjustments(value === "yes")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="periodicNo" />
                    <Label htmlFor="periodicNo">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="periodicYes" />
                    <Label htmlFor="periodicYes">Sí</Label>
                  </div>
                </RadioGroup>
              </div>

              {hasPeriodicAdjustments && (
                <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="space-y-2">
                    <Label>Tipo de reajuste</Label>
                    <RadioGroup
                      value={adjustmentType}
                      onValueChange={(value: "percentage" | "fixed") => {
                        setAdjustmentType(value);
                        setHasUnsavedChanges(true);
                      }}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="percentage" id="adjPercentage" />
                        <Label htmlFor="adjPercentage">Porcentaje (%)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="fixed" id="adjFixed" />
                        <Label htmlFor="adjFixed">Monto fijo (UF)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adjustmentValue">
                      {adjustmentType === "percentage" ? "Porcentaje de reajuste (%)" : "Monto de reajuste (UF)"}
                    </Label>
                    <Input
                      id="adjustmentValue"
                      type="number"
                      step={adjustmentType === "percentage" ? "0.1" : "0.01"}
                      min="0"
                      placeholder={adjustmentType === "percentage" ? "Ej: 10" : "Ej: 5.5"}
                      value={adjustmentValue}
                      onChange={(e) => {
                        setAdjustmentValue(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="firstAdjustmentMonth">Mes del primer reajuste</Label>
                    <Input
                      id="firstAdjustmentMonth"
                      type="number"
                      min="1"
                      placeholder="Ej: 60"
                      value={firstAdjustmentMonth}
                      onChange={(e) => {
                        setFirstAdjustmentMonth(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="adjustmentPeriodicityMonths">Periodicidad (meses)</Label>
                    <Input
                      id="adjustmentPeriodicityMonths"
                      type="number"
                      min="1"
                      placeholder="Ej: 60"
                      value={adjustmentPeriodicityMonths}
                      onChange={(e) => {
                        setAdjustmentPeriodicityMonths(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>

                  {/* Preview of adjustment calculation */}
                  {adjustmentValue && regimeRent && firstAdjustmentMonth && adjustmentPeriodicityMonths && (
                    <div className="bg-background/50 rounded p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Vista previa de reajustes:</p>
                      <div className="text-xs space-y-1">
                        {(() => {
                          const baseRent = parseFloat(regimeRent);
                          const adjValue = parseFloat(adjustmentValue);
                          const firstMonth = parseInt(firstAdjustmentMonth);
                          const periodicity = parseInt(adjustmentPeriodicityMonths);
                          const durationMonths = parseInt(duration) || 120;
                          const adjustments: { month: number; rent: number }[] = [];
                          
                          let currentRent = baseRent;
                          let month = firstMonth;
                          
                          while (month <= durationMonths && adjustments.length < 5) {
                            if (adjustmentType === "percentage") {
                              currentRent = currentRent * (1 + adjValue / 100);
                            } else {
                              currentRent = currentRent + adjValue;
                            }
                            adjustments.push({ month, rent: currentRent });
                            month += periodicity;
                          }
                          
                          return adjustments.map((adj, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>Mes {adj.month}:</span>
                              <span className="font-medium">{adj.rent.toFixed(2)} UF</span>
                            </div>
                          ));
                        })()}
                        <p className="text-muted-foreground mt-2 italic">
                          {adjustmentType === "percentage" 
                            ? "Los reajustes se aplican sobre la renta ya reajustada (compuesto)"
                            : "Los reajustes se suman a la renta acumulada"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                <Select value={noticeType} onValueChange={(value: any) => {
                  setNoticeType(value);
                  setHasUnsavedChanges(true);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meses">Meses antes del vencimiento</SelectItem>
                    <SelectItem value="fecha">Fecha específica</SelectItem>
                    <SelectItem value="rangos">Rangos de meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo de Aviso</Label>
                <RadioGroup
                  value={noticeBilaterality}
                  onValueChange={(value: "unilateral_gp" | "bilateral") => {
                    setNoticeBilaterality(value);
                    setHasUnsavedChanges(true);
                  }}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unilateral_gp" id="unilateralGp" />
                    <Label htmlFor="unilateralGp">Unilateral GP</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bilateral" id="bilateral" />
                    <Label htmlFor="bilateral">Bilateral</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  Bilateral: el propietario también puede dar aviso de término
                </p>
              </div>

              {noticeType === "meses" && (
                <div className="space-y-2">
                  <Label htmlFor="noticeValue">Número de Meses *</Label>
                  <Input
                    id="noticeValue"
                    type="number"
                    min="1"
                    value={noticeValue}
                    onChange={(e) => {
                      setNoticeValue(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    required
                  />
                </div>
              )}

              {noticeType === "fecha" && (
                <div className="space-y-2">
                  <Label htmlFor="noticeValue">Fecha *</Label>
                  <Input
                    id="noticeValue"
                    type="date"
                    value={noticeValue}
                    onChange={(e) => {
                      setNoticeValue(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    required
                  />
                </div>
              )}

              {noticeType === "rangos" && (
                <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label>Rangos de Aviso (meses dentro de la vigencia)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const maxMonth = parseInt(duration) || 12;
                        setNoticeRanges([...noticeRanges, { start_month: 1, end_month: Math.min(3, maxMonth) }]);
                        setHasUnsavedChanges(true);
                      }}
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar rango
                    </Button>
                  </div>
                  
                  {noticeRanges.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No hay rangos definidos. Agrega uno o más rangos de meses.
                    </p>
                  )}

                  {noticeRanges.map((range, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-background rounded-md border">
                      <span className="text-sm font-medium">Rango {index + 1}:</span>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Del mes</Label>
                        <Input
                          type="number"
                          min="1"
                          max={parseInt(duration) || 999}
                          value={range.start_month}
                          onChange={(e) => {
                            const newRanges = [...noticeRanges];
                            newRanges[index].start_month = parseInt(e.target.value) || 1;
                            setNoticeRanges(newRanges);
                            setHasUnsavedChanges(true);
                          }}
                          className="w-20"
                        />
                        <Label className="text-sm">al mes</Label>
                        <Input
                          type="number"
                          min={range.start_month}
                          max={parseInt(duration) || 999}
                          value={range.end_month}
                          onChange={(e) => {
                            const newRanges = [...noticeRanges];
                            newRanges[index].end_month = parseInt(e.target.value) || range.start_month;
                            setNoticeRanges(newRanges);
                            setHasUnsavedChanges(true);
                          }}
                          className="w-20"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newRanges = noticeRanges.filter((_, i) => i !== index);
                          setNoticeRanges(newRanges);
                          setHasUnsavedChanges(true);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {duration && noticeRanges.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      La duración del contrato es de {duration} meses. Los rangos deben estar dentro de este período.
                    </p>
                  )}
                </div>
              )}
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
