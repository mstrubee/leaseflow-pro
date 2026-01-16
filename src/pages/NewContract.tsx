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
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { RentEscalations, Escalation, GraceMonthsInput } from "@/components/contracts/RentEscalations";
import { CurrencyInput } from "@/components/contracts/CurrencyInput";
import { DurationInput } from "@/components/contracts/DurationInput";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import { CompanySelect } from "@/components/contracts/CompanySelect";
import { CustomFieldsManager } from "@/components/contracts/CustomFieldsManager";
import { useCustomFieldValues } from "@/hooks/useCustomFieldValues";
import { RegionCommuneSelect } from "@/components/contracts/RegionCommuneSelect";
import { MultipleNoticesSection, NoticeEntry, createAlertsFromNotices } from "@/components/contracts/MultipleNoticesSection";

const NewContract = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Contract basic info
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  
  // Address (Datos de la Propiedad)
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [commune, setCommune] = useState("");
  const [region, setRegion] = useState("");
  const [rolSii, setRolSii] = useState("");
  
  // Contact (Arrendador)
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cedulaIdentidad, setCedulaIdentidad] = useState("");
  const [domicilioComercial, setDomicilioComercial] = useState("");
  
  // Commercial conditions
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");
  const [hasEscalation, setHasEscalation] = useState(false);
  const [graceMonths, setGraceMonths] = useState(0);
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [duration, setDuration] = useState("");
  const [noticeType, setNoticeType] = useState<"fecha" | "meses" | "rangos">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [noticeRanges, setNoticeRanges] = useState<Array<{ start_month: number; end_month: number }>>([]);
  const [noticeBilaterality, setNoticeBilaterality] = useState<"unilateral_gp" | "bilateral">("unilateral_gp");
  const [multipleNotices, setMultipleNotices] = useState<NoticeEntry[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [hasSeparateDates, setHasSeparateDates] = useState(false);
  
  // Guarantee and periodic adjustments
  const [guaranteeMultiplier, setGuaranteeMultiplier] = useState("");
  const [hasPeriodicAdjustments, setHasPeriodicAdjustments] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [firstAdjustmentMonth, setFirstAdjustmentMonth] = useState("");
  const [adjustmentPeriodicityMonths, setAdjustmentPeriodicityMonths] = useState("");
  
  // Gastos comunes and fondo promoción
  const [hasExtendedGastosComunes, setHasExtendedGastosComunes] = useState(false);
  const [gastosComunesMethodology, setGastosComunesMethodology] = useState<"uf_m2" | "percentage">("uf_m2");
  const [gastosComunesUfM2, setGastosComunesUfM2] = useState("");
  const [gastosComunesUfMlFrente, setGastosComunesUfMlFrente] = useState("");
  const [gastosComunesProrratKwhClima, setGastosComunesProrratKwhClima] = useState("");
  const [gastosComunesPercentage, setGastosComunesPercentage] = useState("");
  const [gastosComunesTotalCentro, setGastosComunesTotalCentro] = useState("");
  const [gastosComunesTope, setGastosComunesTope] = useState("");
  const [gastosComunesTopeType, setGastosComunesTopeType] = useState<"fixed" | "uf_m2">("fixed");
  const [fondoPromocionPercentage, setFondoPromocionPercentage] = useState("");
  const [adicionalAdministracionPercentage, setAdicionalAdministracionPercentage] = useState("");
  const [otrosEgresosAmount, setOtrosEgresosAmount] = useState("");
  const [otrosEgresosDescription, setOtrosEgresosDescription] = useState("");
  
  const { ufValue, convertPesosToUF } = useEconomicIndicators();
  const { values: customFieldValues, updateValue: updateCustomFieldValue, saveValues: saveCustomFieldValues } = useCustomFieldValues();
  
  // Document
  const [documentUrl, setDocumentUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create contract with display_currency
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .insert({
          name,
          status: "en_negociacion",
          signed_date: hasSeparateDates ? signedDate || null : fechaInicio || null,
          display_currency: currency,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Insert company associations
      if (companyIds.length > 0) {
        const { error: companyError } = await supabase
          .from("contract_companies")
          .insert(companyIds.map(companyId => ({
            contract_id: contract.id,
            company_id: companyId,
          })));
        if (companyError) throw companyError;
      }

      // Create address (Datos de la Propiedad) only if at least one field is filled
      if (street || number || commune || region || rolSii) {
        const { error: addressError } = await supabase
          .from("contract_addresses")
          .insert({
            contract_id: contract.id,
            street: street || "",
            number: number || "",
            commune: commune || "",
            region: region || "",
            country: "Chile",
            rol_sii: rolSii || null,
          });

        if (addressError) throw addressError;
      }

      // Create contact (Arrendador) only if at least one field is filled
      if (company || contactName || phone || email || cedulaIdentidad || domicilioComercial) {
        const { error: contactError } = await supabase
          .from("contract_contacts")
          .insert({
            contract_id: contract.id,
            company: company || "",
            name: contactName || "",
            phone: phone || "",
            email: email || "",
            cedula_identidad: cedulaIdentidad || null,
            domicilio_comercial: domicilioComercial || null,
          });

        if (contactError) throw contactError;
      }

      // Convert values to UF if needed
      const getUFValue = (value: string) => {
        const num = parseFloat(value);
        if (currency === "CLP" && ufValue > 0) {
          return convertPesosToUF(num);
        }
        return num;
      };

      // Create version only if commercial conditions are provided
      const hasCommercialConditions = regimeRent || duration || noticeValue || noticeRanges.length > 0;
      let version = null;
      
      if (hasCommercialConditions) {
        const { data: versionData, error: versionError } = await supabase
          .from("contract_versions")
          .insert({
            contract_id: contract.id,
            version_number: 1,
            is_current: true,
            initial_rent: hasEscalation && initialRent ? getUFValue(initialRent) : null,
            regime_rent: regimeRent ? getUFValue(regimeRent) : 0,
            variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
            duration_months: duration ? parseInt(duration) : 12,
            notice_type: noticeType,
            notice_value: noticeType === "rangos" ? "rangos" : (noticeValue || "6"),
            notice_bilaterality: noticeBilaterality,
            effective_date: fechaInicio || null,
            guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
            has_periodic_adjustments: hasPeriodicAdjustments,
            adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
            adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
            first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
            adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicityMonths ? parseInt(adjustmentPeriodicityMonths) : null,
            gastos_comunes_uf_m2: gastosComunesMethodology === "uf_m2" && gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
            gastos_comunes_uf_ml_frente: gastosComunesMethodology === "uf_m2" && gastosComunesUfMlFrente ? parseFloat(gastosComunesUfMlFrente) : null,
            gastos_comunes_prorrata_kwh_clima: gastosComunesMethodology === "uf_m2" && gastosComunesProrratKwhClima ? parseFloat(gastosComunesProrratKwhClima) : null,
            gastos_comunes_methodology: gastosComunesMethodology,
            gastos_comunes_percentage: gastosComunesMethodology === "percentage" && gastosComunesPercentage ? parseFloat(gastosComunesPercentage) : null,
            gastos_comunes_total_centro: gastosComunesMethodology === "percentage" && gastosComunesTotalCentro ? parseFloat(gastosComunesTotalCentro) : null,
            gastos_comunes_tope: gastosComunesMethodology === "percentage" && gastosComunesTope ? parseFloat(gastosComunesTope) : null,
            gastos_comunes_tope_type: gastosComunesMethodology === "percentage" ? gastosComunesTopeType : null,
            fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
            adicional_administracion_percentage: adicionalAdministracionPercentage ? parseFloat(adicionalAdministracionPercentage) : null,
            has_extended_gastos_comunes: gastosComunesMethodology === "uf_m2" ? hasExtendedGastosComunes : false,
            grace_months: graceMonths || 0,
            otros_egresos_amount: otrosEgresosAmount ? getUFValue(otrosEgresosAmount) : null,
            otros_egresos_description: otrosEgresosDescription || null,
          } as any)
          .select()
          .single();

        if (versionError) throw versionError;
        version = versionData;

        // Create notice ranges if any
        if (noticeType === "rangos" && noticeRanges.length > 0) {
          const { error: rangesError } = await supabase
            .from("notice_ranges")
            .insert(
              noticeRanges.map((range) => ({
                version_id: version.id,
                start_month: range.start_month,
                end_month: range.end_month,
              }))
            );

          if (rangesError) throw rangesError;
        }

        // Create multiple notices if any
        if (multipleNotices.length > 0) {
          const { error: noticesError } = await supabase
            .from("version_notices")
            .insert(
              multipleNotices.map((n) => ({
                version_id: version.id,
                notice_type: n.notice_type,
                notice_value: n.notice_value,
                notice_bilaterality: n.notice_bilaterality,
                description: n.description || null,
              }))
            );

          if (noticesError) throw noticesError;

          // Create alerts from notices that have create_alert enabled
          const noticesToAlert = multipleNotices.filter(n => n.create_alert);
          if (noticesToAlert.length > 0 && fechaInicio && duration) {
            const alertResult = await createAlertsFromNotices(
              supabase,
              contract.id,
              name,
              noticesToAlert,
              fechaInicio,
              parseInt(duration)
            );
            
            if (alertResult.alertsCreated > 0) {
              console.log(`Created ${alertResult.alertsCreated} alerts from notices`);
            }
            if (alertResult.errors.length > 0) {
              console.error("Alert creation errors:", alertResult.errors);
            }
          }
        }
      }
      // Create escalations if any
      if (version && hasEscalation && escalations.length > 0) {
        const { error: escalationError } = await supabase
          .from("rent_escalations")
          .insert(
            escalations.map((e) => ({
              version_id: version.id,
              month_number: e.month_number,
              amount: currency === "CLP" && ufValue > 0 ? convertPesosToUF(e.amount) : e.amount,
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
            version_id: version?.id || null,
            document_type: "borrador",
            url: documentUrl,
          });

        if (docError) throw docError;
      }

      // Save custom field values
      await saveCustomFieldValues(contract.id);

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
              <CompanySelect value={companyIds} onChange={setCompanyIds} />
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Contrato *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <CustomFieldsManager
                values={customFieldValues}
                onChange={updateCustomFieldValue}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos de la Propiedad</CardTitle>
              <CardDescription>Opcional - puede completarse más adelante</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Calle</Label>
                  <Input
                    id="street"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Ej: Av. Providencia"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input
                    id="number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Ej: 1234"
                  />
                </div>
                <RegionCommuneSelect
                  region={region}
                  commune={commune}
                  onRegionChange={setRegion}
                  onCommuneChange={setCommune}
                />
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rolSii">Rol SII</Label>
                  <Input
                    id="rolSii"
                    value={rolSii}
                    onChange={(e) => setRolSii(e.target.value)}
                    placeholder="Ej: 1234-5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Arrendador</CardTitle>
              <CardDescription>Opcional - puede completarse más adelante desde la vista del contrato</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Empresa</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Nombre de la empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactName">Nombre</Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cedulaIdentidad">Cédula de Identidad</Label>
                  <Input
                    id="cedulaIdentidad"
                    value={cedulaIdentidad}
                    onChange={(e) => setCedulaIdentidad(e.target.value)}
                    placeholder="12.345.678-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domicilioComercial">Domicilio Comercial</Label>
                  <Input
                    id="domicilioComercial"
                    value={domicilioComercial}
                    onChange={(e) => setDomicilioComercial(e.target.value)}
                    placeholder="Dirección comercial"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+56 9 1234 5678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condiciones Comerciales</CardTitle>
              <CardDescription>Opcional - puede completarse más adelante</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hasSeparateDatesNew"
                    checked={hasSeparateDates}
                    onChange={(e) => setHasSeparateDates(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="hasSeparateDatesNew" className="text-sm">
                    Fecha de firma diferente a fecha de inicio
                  </Label>
                </div>

                {hasSeparateDates && (
                  <div className="space-y-2">
                    <Label htmlFor="signedDateNew">Fecha de Firma</Label>
                    <Input
                      id="signedDateNew"
                      type="date"
                      value={signedDate}
                      onChange={(e) => setSignedDate(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="fechaInicio">
                    {hasSeparateDates ? "Fecha de Inicio" : "Fecha Firma e Inicio"}
                  </Label>
                  <Input
                    id="fechaInicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {hasSeparateDates 
                      ? "La fecha de inicio puede completarse más adelante"
                      : "Fecha de firma e inicio del contrato"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Moneda</Label>
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
                  Los valores se almacenan en UF. Si ingresa en Pesos, se convertirán automáticamente.
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
                    showCurrencySelector={false}
                  />
                  
                  {duration && (
                    <div className="border border-border rounded-lg p-4 mt-4">
                      <RentEscalations
                        escalations={escalations}
                        onChange={setEscalations}
                        initialRent={parseFloat(initialRent) || 0}
                        regimeRent={0}
                        durationMonths={parseInt(duration) || 12}
                        currency={currency}
                        graceMonths={graceMonths}
                        onGraceMonthsChange={setGraceMonths}
                        effectiveDate={fechaInicio}
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
                <>
                  <CurrencyInput
                    id="regimeRent"
                    label="Canon en Régimen"
                    value={regimeRent}
                    onChange={setRegimeRent}
                    currency={currency}
                    onCurrencyChange={setCurrency}
                    showCurrencySelector={false}
                  />
                  
                  {/* Meses de gracia sin escalonado */}
                  <div className="space-y-2">
                    <Label>Meses de Gracia</Label>
                    <GraceMonthsInput
                      value={graceMonths}
                      onChange={setGraceMonths}
                      maxMonths={parseInt(duration) || 12}
                    />
                  </div>
                </>
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
                      ? (parseFloat(guaranteeMultiplier) * parseFloat(regimeRent)).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "0"} UF
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monto de Garantía de Arriendo. Si el canon está en UF/m², el monto final se calculará al definir la superficie.
                </p>
              </div>

              {/* Gastos Comunes */}
              <div className="space-y-4">
                {/* Metodología selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Metodología de Cálculo de Gastos Comunes</Label>
                  <RadioGroup
                    value={gastosComunesMethodology}
                    onValueChange={(value) => setGastosComunesMethodology(value as "uf_m2" | "percentage")}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="uf_m2" id="new_methodology_uf_m2" />
                      <Label htmlFor="new_methodology_uf_m2" className="text-sm font-normal cursor-pointer">
                        UF por superficie (UF/m², UF/mL, etc.)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="percentage" id="new_methodology_percentage" />
                      <Label htmlFor="new_methodology_percentage" className="text-sm font-normal cursor-pointer">
                        Porcentaje del total de GGCC del centro comercial
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Metodología UF/m2 */}
                {gastosComunesMethodology === "uf_m2" && (
                  <>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="hasExtendedGastosComunesNew"
                        checked={hasExtendedGastosComunes}
                        onChange={(e) => setHasExtendedGastosComunes(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="hasExtendedGastosComunesNew" className="text-sm font-medium">
                        Ampliar metodología de cálculo
                      </Label>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gastosComunesUfM2New">Gastos Comunes (UF/m² de superficie)</Label>
                      <Input
                        id="gastosComunesUfM2New"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="Ej: 0.05"
                        value={gastosComunesUfM2}
                        onChange={(e) => setGastosComunesUfM2(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se multiplica por la Superficie Edificada Local
                      </p>
                    </div>

                    {hasExtendedGastosComunes && (
                      <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                        <div className="space-y-2">
                          <Label htmlFor="gastosComunesUfMlFrenteNew">Gastos Comunes (UF/mL de frente)</Label>
                          <Input
                            id="gastosComunesUfMlFrenteNew"
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="Ej: 0.10"
                            value={gastosComunesUfMlFrente}
                            onChange={(e) => setGastosComunesUfMlFrente(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Se multiplica por los Metros Lineales de Frente
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="gastosComunesProrratKwhClimaNew">Prorrata KWH Clima (UF)</Label>
                          <Input
                            id="gastosComunesProrratKwhClimaNew"
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="Ej: 5.00"
                            value={gastosComunesProrratKwhClima}
                            onChange={(e) => setGastosComunesProrratKwhClima(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Monto fijo en UF por prorrata de consumo eléctrico de clima
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="adicionalAdministracionPercentageNew">Adicional por Administración (%)</Label>
                          <Input
                            id="adicionalAdministracionPercentageNew"
                            type="number"
                            step="0.001"
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

                    {(gastosComunesUfM2 || (hasExtendedGastosComunes && (gastosComunesUfMlFrente || gastosComunesProrratKwhClima || adicionalAdministracionPercentage))) && (
                      <div className="bg-muted/50 border border-border rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">
                          💡 El total de Gastos Comunes se calculará automáticamente al ingresar las superficies del local en la vista del contrato.
                        </p>
                        {hasExtendedGastosComunes && (parseFloat(gastosComunesProrratKwhClima) > 0 || parseFloat(adicionalAdministracionPercentage) > 0) && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {parseFloat(gastosComunesProrratKwhClima) > 0 && (
                              <div>• Prorrata KWH Clima: {gastosComunesProrratKwhClima} UF (fijo)</div>
                            )}
                            {parseFloat(adicionalAdministracionPercentage) > 0 && regimeRent && (
                              <div>• Adic. Admin ({adicionalAdministracionPercentage}%): {((parseFloat(regimeRent) || 0) * (parseFloat(adicionalAdministracionPercentage) / 100)).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Metodología Porcentaje */}
                {gastosComunesMethodology === "percentage" && (
                  <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="gastosComunesTotalCentroNew">Total GGCC del Centro Comercial (UF/mes)</Label>
                      <Input
                        id="gastosComunesTotalCentroNew"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="Ej: 10000"
                        value={gastosComunesTotalCentro}
                        onChange={(e) => setGastosComunesTotalCentro(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Monto total de gastos comunes del centro comercial
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gastosComunesPercentageNew">Porcentaje de Participación (%)</Label>
                      <Input
                        id="gastosComunesPercentageNew"
                        type="number"
                        step="0.001"
                        min="0"
                        max="100"
                        placeholder="Ej: 2.5"
                        value={gastosComunesPercentage}
                        onChange={(e) => setGastosComunesPercentage(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Porcentaje del total de GGCC que corresponde al local
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Tope Máximo (opcional)</Label>
                      <RadioGroup
                        value={gastosComunesTopeType}
                        onValueChange={(value) => setGastosComunesTopeType(value as "fixed" | "uf_m2")}
                        className="flex flex-col gap-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="fixed" id="new_tope_fixed" />
                          <Label htmlFor="new_tope_fixed" className="text-sm font-normal cursor-pointer">
                            Monto fijo (UF/mes)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="uf_m2" id="new_tope_uf_m2" />
                          <Label htmlFor="new_tope_uf_m2" className="text-sm font-normal cursor-pointer">
                            Por superficie (UF/m²)
                          </Label>
                        </div>
                      </RadioGroup>
                      <Input
                        id="gastosComunesTopeNew"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder={gastosComunesTopeType === "fixed" ? "Ej: 150 UF/mes" : "Ej: 0.15 UF/m²"}
                        value={gastosComunesTope}
                        onChange={(e) => setGastosComunesTope(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        {gastosComunesTopeType === "fixed" 
                          ? "Monto máximo a pagar por concepto de GGCC" 
                          : "Monto máximo por m² de superficie edificada"}
                      </p>
                    </div>

                    {(gastosComunesTotalCentro && gastosComunesPercentage) && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <p className="text-sm font-medium text-primary">Total Gastos Comunes Estimado:</p>
                        {(() => {
                          const totalCentro = parseFloat(gastosComunesTotalCentro) || 0;
                          const percentage = parseFloat(gastosComunesPercentage) || 0;
                          const tope = parseFloat(gastosComunesTope) || Infinity;
                          const calculatedAmount = (totalCentro * percentage) / 100;
                          const finalAmount = Math.min(calculatedAmount, tope);
                          const isTopApplied = calculatedAmount > tope && tope !== Infinity;
                          
                          return (
                            <div className="space-y-1 mt-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Cálculo:</span>
                                <span className="font-medium">{calculatedAmount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF</span>
                              </div>
                              {isTopApplied && (
                                <div className="flex justify-between text-sm text-amber-600">
                                  <span>Tope aplicado:</span>
                                  <span className="font-medium">-{(calculatedAmount - tope).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm border-t pt-1 mt-1">
                                <span className="text-muted-foreground font-medium">Total:</span>
                                <span className="font-semibold">{finalAmount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-2">
                                {totalCentro.toLocaleString("es-CL")} UF × {percentage}% = {calculatedAmount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
                                {isTopApplied && <span className="text-amber-600 ml-2">(tope: {tope.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF)</span>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fondo de Promoción */}
              <div className="space-y-2">
                <Label htmlFor="fondoPromocionPercentageNew">Fondo de Promoción (%)</Label>
                <Input
                  id="fondoPromocionPercentageNew"
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

              {/* Otros Arrendamientos */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="otrosEgresosAmountNew">Otros Arrendamientos ({currency})</Label>
                  {otrosEgresosDescription && (
                    <span className="text-xs text-muted-foreground">Nota: {otrosEgresosDescription}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="otrosEgresosAmountNew"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Monto"
                    value={otrosEgresosAmount}
                    onChange={(e) => setOtrosEgresosAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    id="otrosEgresosDescriptionNew"
                    type="text"
                    placeholder="Nota (opcional)"
                    value={otrosEgresosDescription}
                    onChange={(e) => setOtrosEgresosDescription(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Reajustes Periódicos */}
              <div className="space-y-2">
                <Label>¿Tiene reajustes periódicos?</Label>
                <RadioGroup
                  value={hasPeriodicAdjustments ? "yes" : "no"}
                  onValueChange={(value) => setHasPeriodicAdjustments(value === "yes")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="periodicNoNew" />
                    <Label htmlFor="periodicNoNew">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="periodicYesNew" />
                    <Label htmlFor="periodicYesNew">Sí</Label>
                  </div>
                </RadioGroup>
              </div>

              {hasPeriodicAdjustments && (
                <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="space-y-2">
                    <Label>Tipo de reajuste</Label>
                    <RadioGroup
                      value={adjustmentType}
                      onValueChange={(value: "percentage" | "fixed") => setAdjustmentType(value)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="percentage" id="adjPercentageNew" />
                        <Label htmlFor="adjPercentageNew">Porcentaje (%)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="fixed" id="adjFixedNew" />
                        <Label htmlFor="adjFixedNew">Monto fijo (UF)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adjustmentValueNew">
                      {adjustmentType === "percentage" ? "Porcentaje de reajuste (%)" : "Monto de reajuste (UF)"}
                    </Label>
                    <Input
                      id="adjustmentValueNew"
                      type="number"
                      step={adjustmentType === "percentage" ? "0.1" : "0.01"}
                      min="0"
                      placeholder={adjustmentType === "percentage" ? "Ej: 10" : "Ej: 5.5"}
                      value={adjustmentValue}
                      onChange={(e) => setAdjustmentValue(e.target.value)}
                    />
                  </div>

                  <DurationInput
                    id="firstAdjustmentMonthNew"
                    label="Mes del primer reajuste"
                    value={firstAdjustmentMonth}
                    onChange={setFirstAdjustmentMonth}
                    showEquivalent={true}
                  />
                  
                  <DurationInput
                    id="adjustmentPeriodicityMonthsNew"
                    label="Periodicidad (opcional)"
                    value={adjustmentPeriodicityMonths}
                    onChange={setAdjustmentPeriodicityMonths}
                    description="Cada cuánto tiempo se aplica el reajuste. Dejar vacío para un reajuste único."
                  />
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
                              <span className="font-medium">{adj.rent.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF</span>
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

              <DurationInput
                id="duration"
                label="Duración"
                value={duration}
                onChange={setDuration}
                description="Duración total del contrato"
              />

              <div className="space-y-2">
                <Label>Tipo de Aviso de Término</Label>
                <Select value={noticeType} onValueChange={(value: any) => setNoticeType(value)}>
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
                  onValueChange={(value: "unilateral_gp" | "bilateral") => setNoticeBilaterality(value)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unilateral_gp" id="unilateralGpNew" />
                    <Label htmlFor="unilateralGpNew">Unilateral GP</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bilateral" id="bilateralNew" />
                    <Label htmlFor="bilateralNew">Bilateral</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  Bilateral: el propietario también puede dar aviso de término
                </p>
              </div>

              {noticeType === "meses" && (
                <div className="space-y-2">
                  <Label htmlFor="noticeValue">Número de Meses</Label>
                  <Input
                    id="noticeValue"
                    type="number"
                    min="1"
                    value={noticeValue}
                    onChange={(e) => setNoticeValue(e.target.value)}
                  />
                </div>
              )}

              {noticeType === "fecha" && (
                <div className="space-y-2">
                  <Label htmlFor="noticeValue">Fecha</Label>
                  <Input
                    id="noticeValue"
                    type="date"
                    value={noticeValue}
                    onChange={(e) => setNoticeValue(e.target.value)}
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

              {/* Multiple Notices Section */}
              <div className="mt-6 pt-6 border-t border-border">
                <MultipleNoticesSection
                  notices={multipleNotices}
                  onChange={setMultipleNotices}
                  durationMonths={parseInt(duration) || undefined}
                  signedDate={fechaInicio}
                  contractName={name}
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
