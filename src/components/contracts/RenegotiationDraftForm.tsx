import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Calendar, Settings } from "lucide-react";
import { RenegotiationDraft } from "@/hooks/useRenegotiationDrafts";
import { RentEscalations, Escalation, GraceMonthsInput } from "./RentEscalations";
import { CurrencyInput } from "./CurrencyInput";
import { DurationInput } from "./DurationInput";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface RenegotiationDraftFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RenegotiationDraft | null;
  onSave: (data: Partial<RenegotiationDraft>, escalations: Escalation[]) => Promise<void>;
  saving: boolean;
}

export function RenegotiationDraftForm({
  open,
  onOpenChange,
  draft,
  onSave,
  saving,
}: RenegotiationDraftFormProps) {
  const { ufValue, convertPesosToUF } = useEconomicIndicators();
  
  // Basic info
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");
  
  // Canon arriendo
  const [hasEscalation, setHasEscalation] = useState(false);
  const [graceMonths, setGraceMonths] = useState(0);
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  
  // Duration
  const [durationMonths, setDurationMonths] = useState("");
  
  // Notice
  const [noticeType, setNoticeType] = useState<"meses" | "fecha">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [noticeBilaterality, setNoticeBilaterality] = useState<"unilateral_gp" | "bilateral">("unilateral_gp");
  
  // Effective date
  const [effectiveDate, setEffectiveDate] = useState("");
  const [effectiveFromSignature, setEffectiveFromSignature] = useState(false);
  
  // Guarantee
  const [guaranteeMultiplier, setGuaranteeMultiplier] = useState("");
  
  // Periodic adjustments
  const [hasPeriodicAdjustments, setHasPeriodicAdjustments] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [firstAdjustmentMonth, setFirstAdjustmentMonth] = useState("");
  const [adjustmentPeriodicity, setAdjustmentPeriodicity] = useState("");
  
  // Gastos comunes
  const [hasExtendedGastosComunes, setHasExtendedGastosComunes] = useState(false);
  const [gastosComunesMethodology, setGastosComunesMethodology] = useState<"uf_m2" | "percentage">("uf_m2");
  const [gastosComunesUfM2, setGastosComunesUfM2] = useState("");
  const [gastosComunesUfMlFrente, setGastosComunesUfMlFrente] = useState("");
  const [gastosComunesProrratKwhClima, setGastosComunesProrratKwhClima] = useState("");
  const [gastosComunesPercentage, setGastosComunesPercentage] = useState("");
  const [gastosComunesTotalCentro, setGastosComunesTotalCentro] = useState("");
  const [gastosComunesTope, setGastosComunesTope] = useState("");
  const [gastosComunesTopeType, setGastosComunesTopeType] = useState<"fixed" | "uf_m2">("fixed");
  const [adicionalAdministracionPercentage, setAdicionalAdministracionPercentage] = useState("");
  
  // Fondo promoción
  const [fondoPromocionPercentage, setFondoPromocionPercentage] = useState("");
  
  // Otros egresos
  const [otrosEgresosAmount, setOtrosEgresosAmount] = useState("");
  const [otrosEgresosDescription, setOtrosEgresosDescription] = useState("");

  useEffect(() => {
    if (draft) {
      setName(draft.name);
      
      // Determine if has escalation
      const hasEsc = (draft.escalations && draft.escalations.length > 0) ||
        (draft.grace_months && draft.grace_months > 0) ||
        (draft.initial_rent !== null && draft.initial_rent !== draft.regime_rent);
      setHasEscalation(hasEsc);
      
      setGraceMonths(draft.grace_months || 0);
      setInitialRent(draft.initial_rent?.toString() || "");
      setRegimeRent(draft.regime_rent?.toString() || "");
      setVariableRentPercentage(draft.variable_rent_percentage?.toString() || "");
      setDurationMonths(draft.duration_months?.toString() || "");
      setNoticeType((draft.notice_type as "meses" | "fecha") || "meses");
      setNoticeValue(draft.notice_value || "");
      setNoticeBilaterality((draft.notice_bilaterality as "unilateral_gp" | "bilateral") || "unilateral_gp");
      setEffectiveDate(draft.effective_date || "");
      setEffectiveFromSignature(draft.effective_from_signature || false);
      setGuaranteeMultiplier(draft.guarantee_multiplier?.toString() || "");
      setHasPeriodicAdjustments(draft.has_periodic_adjustments || false);
      setAdjustmentType((draft.adjustment_type as "percentage" | "fixed") || "percentage");
      setAdjustmentValue(draft.adjustment_value?.toString() || "");
      setFirstAdjustmentMonth(draft.first_adjustment_month?.toString() || "");
      setAdjustmentPeriodicity(draft.adjustment_periodicity_months?.toString() || "");
      setGastosComunesMethodology((draft.gastos_comunes_methodology as "uf_m2" | "percentage") || "uf_m2");
      setGastosComunesUfM2(draft.gastos_comunes_uf_m2?.toString() || "");
      setGastosComunesUfMlFrente((draft as any).gastos_comunes_uf_ml_frente?.toString() || "");
      setGastosComunesProrratKwhClima((draft as any).gastos_comunes_prorrata_kwh_clima?.toString() || "");
      setGastosComunesPercentage(draft.gastos_comunes_percentage?.toString() || "");
      setGastosComunesTotalCentro(draft.gastos_comunes_total_centro?.toString() || "");
      setGastosComunesTope((draft as any).gastos_comunes_tope?.toString() || "");
      setGastosComunesTopeType((draft as any).gastos_comunes_tope_type || "fixed");
      setAdicionalAdministracionPercentage((draft as any).adicional_administracion_percentage?.toString() || "");
      setFondoPromocionPercentage(draft.fondo_promocion_percentage?.toString() || "");
      setOtrosEgresosAmount(draft.otros_egresos_amount?.toString() || "");
      setOtrosEgresosDescription(draft.otros_egresos_description || "");
      setEscalations(draft.escalations?.map(e => ({ month_number: e.month_number, amount: e.amount })) || []);
    } else {
      // Reset form for new draft
      setName("");
      setHasEscalation(false);
      setGraceMonths(0);
      setInitialRent("");
      setRegimeRent("");
      setVariableRentPercentage("");
      setDurationMonths("");
      setNoticeType("meses");
      setNoticeValue("");
      setNoticeBilaterality("unilateral_gp");
      setEffectiveDate("");
      setEffectiveFromSignature(false);
      setGuaranteeMultiplier("");
      setHasPeriodicAdjustments(false);
      setAdjustmentType("percentage");
      setAdjustmentValue("");
      setFirstAdjustmentMonth("");
      setAdjustmentPeriodicity("");
      setGastosComunesMethodology("uf_m2");
      setGastosComunesUfM2("");
      setGastosComunesPercentage("");
      setGastosComunesTotalCentro("");
      setFondoPromocionPercentage("");
      setOtrosEgresosAmount("");
      setOtrosEgresosDescription("");
      setEscalations([]);
    }
  }, [draft]);

  const handleSave = async () => {
    if (!regimeRent || !durationMonths || !noticeValue) {
      return;
    }

    const data: Partial<RenegotiationDraft> = {
      name,
      initial_rent: hasEscalation && initialRent ? parseFloat(initialRent) : null,
      regime_rent: parseFloat(regimeRent),
      variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
      duration_months: parseInt(durationMonths),
      notice_type: noticeType,
      notice_value: noticeValue,
      notice_bilaterality: noticeBilaterality,
      effective_date: effectiveFromSignature ? null : effectiveDate || null,
      effective_from_signature: effectiveFromSignature,
      guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
      grace_months: graceMonths || null,
      has_periodic_adjustments: hasPeriodicAdjustments,
      adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
      adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
      first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
      adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicity ? parseInt(adjustmentPeriodicity) : null,
      gastos_comunes_methodology: gastosComunesMethodology,
      gastos_comunes_uf_m2: gastosComunesMethodology === "uf_m2" && gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
      gastos_comunes_percentage: gastosComunesMethodology === "percentage" && gastosComunesPercentage ? parseFloat(gastosComunesPercentage) : null,
      gastos_comunes_total_centro: gastosComunesMethodology === "percentage" && gastosComunesTotalCentro ? parseFloat(gastosComunesTotalCentro) : null,
      fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
      otros_egresos_amount: otrosEgresosAmount ? parseFloat(otrosEgresosAmount) : null,
      otros_egresos_description: otrosEgresosDescription || null,
    };

    await onSave(data, escalations);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft ? `Editar Borrador: ${draft.name}` : "Nuevo Borrador"}
          </DialogTitle>
          <DialogDescription>
            Define las condiciones comerciales para este borrador de renegociación.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="gap-2">
              <DollarSign className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="escalations" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Canon
            </TabsTrigger>
            <TabsTrigger value="gastos" className="gap-2">
              <Settings className="h-4 w-4" />
              Gastos
            </TabsTrigger>
            <TabsTrigger value="otros" className="gap-2">
              <Calendar className="h-4 w-4" />
              Otros
            </TabsTrigger>
          </TabsList>

          {/* Tab General */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nombre del Borrador *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Propuesta 1 - Aumento 10%"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-3">
                <Label>Fecha de Vigencia</Label>
                <div className="flex items-center space-x-2 mb-2">
                  <Checkbox
                    id="effectiveFromSignature"
                    checked={effectiveFromSignature}
                    onCheckedChange={(checked) => {
                      setEffectiveFromSignature(checked as boolean);
                      if (checked) setEffectiveDate("");
                    }}
                  />
                  <label htmlFor="effectiveFromSignature" className="text-sm">
                    Desde la firma del contrato
                  </label>
                </div>
                {!effectiveFromSignature && (
                  <Input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                )}
              </div>

              <DurationInput
                id="durationMonths"
                label="Duración *"
                value={durationMonths}
                onChange={setDurationMonths}
              />

              <div className="space-y-2">
                <Label>Tipo de Aviso *</Label>
                <Select value={noticeType} onValueChange={(v) => setNoticeType(v as "meses" | "fecha")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meses">Meses de anticipación</SelectItem>
                    <SelectItem value="fecha">Fecha específica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{noticeType === "meses" ? "Meses de Aviso *" : "Fecha de Aviso *"}</Label>
                {noticeType === "meses" ? (
                  <Input
                    type="number"
                    value={noticeValue}
                    onChange={(e) => setNoticeValue(e.target.value)}
                    min={1}
                  />
                ) : (
                  <Input
                    type="date"
                    value={noticeValue}
                    onChange={(e) => setNoticeValue(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Bilateralidad de Aviso</Label>
                <Select value={noticeBilaterality} onValueChange={(v) => setNoticeBilaterality(v as "unilateral_gp" | "bilateral")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unilateral_gp">Unilateral GP</SelectItem>
                    <SelectItem value="bilateral">Bilateral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Tab Canon Arriendo */}
          <TabsContent value="escalations" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Canon de Arriendo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>¿Tiene arriendo escalonado?</Label>
                  <RadioGroup
                    value={hasEscalation ? "yes" : "no"}
                    onValueChange={(value) => setHasEscalation(value === "yes")}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="esc_no" />
                      <Label htmlFor="esc_no">No</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="esc_yes" />
                      <Label htmlFor="esc_yes">Sí</Label>
                    </div>
                  </RadioGroup>
                </div>

                {hasEscalation ? (
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
                    
                    <CurrencyInput
                      id="regimeRent"
                      label="Canon en Régimen *"
                      value={regimeRent}
                      onChange={setRegimeRent}
                      currency={currency}
                      onCurrencyChange={setCurrency}
                      showCurrencySelector={true}
                    />
                    
                    {durationMonths && (
                      <div className="border border-border rounded-lg p-4 mt-4">
                        <RentEscalations
                          escalations={escalations}
                          onChange={setEscalations}
                          initialRent={parseFloat(initialRent) || 0}
                          regimeRent={parseFloat(regimeRent) || 0}
                          durationMonths={parseInt(durationMonths) || 12}
                          currency={currency}
                          graceMonths={graceMonths}
                          onGraceMonthsChange={setGraceMonths}
                          effectiveDate={effectiveFromSignature ? undefined : effectiveDate}
                          hasPeriodicAdjustments={hasPeriodicAdjustments}
                          adjustmentType={adjustmentType}
                          adjustmentValue={parseFloat(adjustmentValue) || 0}
                          firstAdjustmentMonth={parseInt(firstAdjustmentMonth) || 0}
                          adjustmentPeriodicityMonths={parseInt(adjustmentPeriodicity) || 0}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <CurrencyInput
                      id="regimeRent"
                      label="Canon en Régimen *"
                      value={regimeRent}
                      onChange={setRegimeRent}
                      currency={currency}
                      onCurrencyChange={setCurrency}
                      showCurrencySelector={true}
                    />
                    
                    <div className="space-y-2">
                      <Label>Meses de Gracia</Label>
                      <GraceMonthsInput
                        value={graceMonths}
                        onChange={setGraceMonths}
                        maxMonths={parseInt(durationMonths) || 12}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Arriendo Variable (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 5.5"
                    value={variableRentPercentage}
                    onChange={(e) => setVariableRentPercentage(e.target.value)}
                  />
                </div>

                {/* Garantía */}
                <div className="space-y-2">
                  <Label>Garantía (multiplicador del arriendo)</Label>
                  <div className="flex items-center gap-4">
                    <Input
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
                </div>

                {/* Reajustes Periódicos */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasPeriodicAdjustments"
                      checked={hasPeriodicAdjustments}
                      onCheckedChange={(checked) => setHasPeriodicAdjustments(checked as boolean)}
                    />
                    <Label htmlFor="hasPeriodicAdjustments" className="text-sm font-medium">
                      Tiene reajustes periódicos
                    </Label>
                  </div>

                  {hasPeriodicAdjustments && (
                    <div className="pl-6 space-y-4 border-l-2 border-primary/20">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Tipo de Reajuste</Label>
                          <Select value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as "percentage" | "fixed")}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                              <SelectItem value="fixed">Monto fijo (UF)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">
                            Valor {adjustmentType === "percentage" ? "(%)" : "(UF)"}
                          </Label>
                          <Input
                            type="number"
                            step={adjustmentType === "percentage" ? "0.1" : "0.01"}
                            value={adjustmentValue}
                            onChange={(e) => setAdjustmentValue(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Primer Reajuste (mes)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={firstAdjustmentMonth}
                            onChange={(e) => setFirstAdjustmentMonth(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Periodicidad (meses)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={adjustmentPeriodicity}
                            onChange={(e) => setAdjustmentPeriodicity(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Gastos Comunes */}
          <TabsContent value="gastos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Gastos Comunes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Metodología selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Metodología de Cálculo</Label>
                  <RadioGroup
                    value={gastosComunesMethodology}
                    onValueChange={(value) => setGastosComunesMethodology(value as "uf_m2" | "percentage")}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="uf_m2" id="methodology_uf_m2" />
                      <Label htmlFor="methodology_uf_m2" className="text-sm font-normal cursor-pointer">
                        UF por superficie (UF/m², UF/mL, etc.)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="percentage" id="methodology_percentage" />
                      <Label htmlFor="methodology_percentage" className="text-sm font-normal cursor-pointer">
                        Porcentaje del total de GGCC del centro comercial
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Metodología UF/m2 */}
                {gastosComunesMethodology === "uf_m2" && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="hasExtendedGastosComunes"
                        checked={hasExtendedGastosComunes}
                        onCheckedChange={(c) => setHasExtendedGastosComunes(c as boolean)}
                      />
                      <Label htmlFor="hasExtendedGastosComunes" className="text-sm font-medium">
                        Ampliar metodología de cálculo
                      </Label>
                    </div>

                    <div className="space-y-2">
                      <Label>Gastos Comunes (UF/m² de superficie)</Label>
                      <Input
                        type="number"
                        step="0.01"
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
                          <Label>Gastos Comunes (UF/mL de frente)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ej: 0.10"
                            value={gastosComunesUfMlFrente}
                            onChange={(e) => setGastosComunesUfMlFrente(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Prorrata KWH Clima (UF)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ej: 5.00"
                            value={gastosComunesProrratKwhClima}
                            onChange={(e) => setGastosComunesProrratKwhClima(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Adicional por Administración (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ej: 5"
                            value={adicionalAdministracionPercentage}
                            onChange={(e) => setAdicionalAdministracionPercentage(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Metodología Porcentaje */}
                {gastosComunesMethodology === "percentage" && (
                  <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div className="space-y-2">
                      <Label>Total GGCC del Centro Comercial (UF/mes)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ej: 10000"
                        value={gastosComunesTotalCentro}
                        onChange={(e) => setGastosComunesTotalCentro(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Porcentaje de Participación (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="Ej: 2.5"
                        value={gastosComunesPercentage}
                        onChange={(e) => setGastosComunesPercentage(e.target.value)}
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Tope Máximo (opcional)</Label>
                      <RadioGroup
                        value={gastosComunesTopeType}
                        onValueChange={(value) => setGastosComunesTopeType(value as "fixed" | "uf_m2")}
                        className="flex flex-col gap-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="fixed" id="tope_fixed" />
                          <Label htmlFor="tope_fixed" className="text-sm font-normal cursor-pointer">
                            Monto fijo (UF/mes)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="uf_m2" id="tope_uf_m2" />
                          <Label htmlFor="tope_uf_m2" className="text-sm font-normal cursor-pointer">
                            Por superficie (UF/m²)
                          </Label>
                        </div>
                      </RadioGroup>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={gastosComunesTopeType === "fixed" ? "Ej: 150 UF/mes" : "Ej: 0.15 UF/m²"}
                        value={gastosComunesTope}
                        onChange={(e) => setGastosComunesTope(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fondo de Promoción */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Fondo de Promoción</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Porcentaje sobre Canon (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 2"
                    value={fondoPromocionPercentage}
                    onChange={(e) => setFondoPromocionPercentage(e.target.value)}
                  />
                  {fondoPromocionPercentage && regimeRent && (
                    <p className="text-xs text-muted-foreground">
                      = {((parseFloat(fondoPromocionPercentage) / 100) * parseFloat(regimeRent)).toFixed(2)} UF/mes
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Otros */}
          <TabsContent value="otros" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Otros Egresos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Monto (UF/mes)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 10"
                    value={otrosEgresosAmount}
                    onChange={(e) => setOtrosEgresosAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Ej: Publicidad, seguros, etc."
                    value={otrosEgresosDescription}
                    onChange={(e) => setOtrosEgresosDescription(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !regimeRent || !durationMonths || !noticeValue}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar Borrador"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
