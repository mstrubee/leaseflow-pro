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
import { Loader2, TrendingUp, DollarSign, Calendar, Settings, Plus, X, Bell } from "lucide-react";
import { RenegotiationDraft } from "@/hooks/useRenegotiationDrafts";
import { RentEscalations, Escalation, GraceMonthsInput } from "./RentEscalations";
import { CurrencyInput } from "./CurrencyInput";
import { DurationInput } from "./DurationInput";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface NoticeRange {
  start_month: number;
  end_month: number;
}

interface RenegotiationDraftFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: RenegotiationDraft | null;
  onSave: (data: Partial<RenegotiationDraft>, escalations: Escalation[], noticeRanges: NoticeRange[]) => Promise<void>;
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
  
  // Dates
  const [effectiveDate, setEffectiveDate] = useState("");
  const [effectiveFromSignature, setEffectiveFromSignature] = useState(false);
  
  // Duration
  const [durationMonths, setDurationMonths] = useState("");
  
  // Canon arriendo
  const [hasEscalation, setHasEscalation] = useState(false);
  const [graceMonths, setGraceMonths] = useState(0);
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  
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
  
  // Otros arrendamientos
  const [otrosEgresosAmount, setOtrosEgresosAmount] = useState("");
  const [otrosEgresosDescription, setOtrosEgresosDescription] = useState("");
  
  // Avisos
  const [noticeType, setNoticeType] = useState<"meses" | "fecha" | "rangos" | "desde_mes">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [noticeBilaterality, setNoticeBilaterality] = useState<"unilateral_gp" | "bilateral">("unilateral_gp");
  const [noticeRanges, setNoticeRanges] = useState<NoticeRange[]>([]);

  useEffect(() => {
    if (draft) {
      setName(draft.name);
      setEffectiveDate(draft.effective_date || "");
      setEffectiveFromSignature(draft.effective_from_signature || false);
      setDurationMonths(draft.duration_months?.toString() || "");
      
      // Determine if has escalation
      const hasEsc = (draft.escalations && draft.escalations.length > 0) ||
        (draft.grace_months && draft.grace_months > 0) ||
        (draft.initial_rent !== null && draft.initial_rent !== draft.regime_rent);
      setHasEscalation(hasEsc);
      
      setGraceMonths(draft.grace_months || 0);
      setInitialRent(draft.initial_rent?.toString() || "");
      setRegimeRent(draft.regime_rent?.toString() || "");
      setVariableRentPercentage(draft.variable_rent_percentage?.toString() || "");
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
      setHasExtendedGastosComunes((draft as any).has_extended_gastos_comunes || false);
      setAdicionalAdministracionPercentage((draft as any).adicional_administracion_percentage?.toString() || "");
      
      setFondoPromocionPercentage(draft.fondo_promocion_percentage?.toString() || "");
      setOtrosEgresosAmount(draft.otros_egresos_amount?.toString() || "");
      setOtrosEgresosDescription(draft.otros_egresos_description || "");
      
      setNoticeType((draft.notice_type as "meses" | "fecha" | "rangos") || "meses");
      setNoticeValue(draft.notice_value || "");
      setNoticeBilaterality((draft.notice_bilaterality as "unilateral_gp" | "bilateral") || "unilateral_gp");
      
      setEscalations(draft.escalations?.map(e => ({ month_number: e.month_number, amount: e.amount })) || []);
      setNoticeRanges(draft.notice_ranges?.map(r => ({ start_month: r.start_month, end_month: r.end_month })) || []);
    } else {
      // Reset form for new draft
      resetForm();
    }
  }, [draft]);

  const resetForm = () => {
    setName("");
    setEffectiveDate("");
    setEffectiveFromSignature(false);
    setDurationMonths("");
    setHasEscalation(false);
    setGraceMonths(0);
    setInitialRent("");
    setRegimeRent("");
    setVariableRentPercentage("");
    setGuaranteeMultiplier("");
    setHasPeriodicAdjustments(false);
    setAdjustmentType("percentage");
    setAdjustmentValue("");
    setFirstAdjustmentMonth("");
    setAdjustmentPeriodicity("");
    setGastosComunesMethodology("uf_m2");
    setGastosComunesUfM2("");
    setGastosComunesUfMlFrente("");
    setGastosComunesProrratKwhClima("");
    setGastosComunesPercentage("");
    setGastosComunesTotalCentro("");
    setGastosComunesTope("");
    setGastosComunesTopeType("fixed");
    setAdicionalAdministracionPercentage("");
    setFondoPromocionPercentage("");
    setOtrosEgresosAmount("");
    setOtrosEgresosDescription("");
    setNoticeType("meses");
    setNoticeValue("");
    setNoticeBilaterality("unilateral_gp");
    setEscalations([]);
    setNoticeRanges([]);
  };

  const handleSave = async () => {
    if (!regimeRent || !durationMonths) return;
    if (noticeType !== "rangos" && !noticeValue) return;
    if (noticeType === "rangos" && noticeRanges.length === 0) return;

    const data: Partial<RenegotiationDraft> = {
      name,
      effective_date: effectiveFromSignature ? null : effectiveDate || null,
      effective_from_signature: effectiveFromSignature,
      duration_months: parseInt(durationMonths),
      initial_rent: hasEscalation && initialRent ? parseFloat(initialRent) : null,
      regime_rent: parseFloat(regimeRent),
      variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
      guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
      grace_months: graceMonths || null,
      has_periodic_adjustments: hasPeriodicAdjustments,
      adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
      adjustment_value: hasPeriodicAdjustments && adjustmentValue ? parseFloat(adjustmentValue) : null,
      first_adjustment_month: hasPeriodicAdjustments && firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
      adjustment_periodicity_months: hasPeriodicAdjustments && adjustmentPeriodicity ? parseInt(adjustmentPeriodicity) : null,
      gastos_comunes_methodology: gastosComunesMethodology,
      gastos_comunes_uf_m2: gastosComunesMethodology === "uf_m2" && gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
      gastos_comunes_uf_ml_frente: hasExtendedGastosComunes && gastosComunesUfMlFrente ? parseFloat(gastosComunesUfMlFrente) : null,
      gastos_comunes_prorrata_kwh_clima: hasExtendedGastosComunes && gastosComunesProrratKwhClima ? parseFloat(gastosComunesProrratKwhClima) : null,
      gastos_comunes_percentage: gastosComunesMethodology === "percentage" && gastosComunesPercentage ? parseFloat(gastosComunesPercentage) : null,
      gastos_comunes_total_centro: gastosComunesMethodology === "percentage" && gastosComunesTotalCentro ? parseFloat(gastosComunesTotalCentro) : null,
      gastos_comunes_tope: gastosComunesTope ? parseFloat(gastosComunesTope) : null,
      gastos_comunes_tope_type: gastosComunesTopeType,
      has_extended_gastos_comunes: hasExtendedGastosComunes,
      adicional_administracion_percentage: hasExtendedGastosComunes && adicionalAdministracionPercentage ? parseFloat(adicionalAdministracionPercentage) : null,
      fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
      otros_egresos_amount: otrosEgresosAmount ? parseFloat(otrosEgresosAmount) : null,
      otros_egresos_description: otrosEgresosDescription || null,
      notice_type: noticeType,
      notice_value: noticeType === "rangos" ? "rangos" : noticeValue,
      notice_bilaterality: noticeBilaterality,
    };

    await onSave(data, escalations, noticeRanges);
  };

  const addNoticeRange = () => {
    const maxMonth = parseInt(durationMonths) || 12;
    setNoticeRanges([...noticeRanges, { start_month: 1, end_month: Math.min(3, maxMonth) }]);
  };

  const removeNoticeRange = (index: number) => {
    setNoticeRanges(noticeRanges.filter((_, i) => i !== index));
  };

  const updateNoticeRange = (index: number, field: "start_month" | "end_month", value: number) => {
    const newRanges = [...noticeRanges];
    newRanges[index][field] = value;
    setNoticeRanges(newRanges);
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
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general" className="text-xs gap-1">
              <Calendar className="h-3 w-3" />
              General
            </TabsTrigger>
            <TabsTrigger value="canon" className="text-xs gap-1">
              <DollarSign className="h-3 w-3" />
              Canon
            </TabsTrigger>
            <TabsTrigger value="gastos" className="text-xs gap-1">
              <Settings className="h-3 w-3" />
              Gastos
            </TabsTrigger>
            <TabsTrigger value="avisos" className="text-xs gap-1">
              <Bell className="h-3 w-3" />
              Avisos
            </TabsTrigger>
            <TabsTrigger value="otros" className="text-xs gap-1">
              <TrendingUp className="h-3 w-3" />
              Otros
            </TabsTrigger>
          </TabsList>

          {/* Tab General - Fechas y Duración */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nombre del Borrador *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Propuesta 1 - Aumento 10%"
              />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Fecha de Inicio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Duración</CardTitle>
              </CardHeader>
              <CardContent>
                <DurationInput
                  id="durationMonths"
                  label="Duración del Contrato *"
                  value={durationMonths}
                  onChange={setDurationMonths}
                  description="Duración total del contrato"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Canon Arriendo */}
          <TabsContent value="canon" className="space-y-4 mt-4">
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
              </CardContent>
            </Card>

            {/* Reajustes Periódicos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Reajustes Periódicos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>¿Tiene reajustes periódicos?</Label>
                  <RadioGroup
                    value={hasPeriodicAdjustments ? "yes" : "no"}
                    onValueChange={(value) => setHasPeriodicAdjustments(value === "yes")}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="adj_no" />
                      <Label htmlFor="adj_no">No</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="adj_yes" />
                      <Label htmlFor="adj_yes">Sí</Label>
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
                      <Label>
                        {adjustmentType === "percentage" ? "Porcentaje de reajuste (%)" : "Monto de reajuste (UF)"}
                      </Label>
                      <Input
                        type="number"
                        step={adjustmentType === "percentage" ? "0.1" : "0.01"}
                        min="0"
                        placeholder={adjustmentType === "percentage" ? "Ej: 10" : "Ej: 5.5"}
                        value={adjustmentValue}
                        onChange={(e) => setAdjustmentValue(e.target.value)}
                      />
                    </div>

                    <DurationInput
                      id="firstAdjustmentMonth"
                      label="Mes del primer reajuste"
                      value={firstAdjustmentMonth}
                      onChange={setFirstAdjustmentMonth}
                      showEquivalent={true}
                    />
                    
                    <DurationInput
                      id="adjustmentPeriodicity"
                      label="Periodicidad"
                      value={adjustmentPeriodicity}
                      onChange={setAdjustmentPeriodicity}
                      description="Cada cuánto tiempo se aplica el reajuste"
                    />

                    {adjustmentValue && regimeRent && firstAdjustmentMonth && adjustmentPeriodicity && (
                      <div className="bg-background/50 rounded p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Vista previa de reajustes:</p>
                        <div className="text-xs space-y-1">
                          {(() => {
                            const baseRent = parseFloat(regimeRent);
                            const adjValue = parseFloat(adjustmentValue);
                            const firstMonth = parseInt(firstAdjustmentMonth);
                            const periodicity = parseInt(adjustmentPeriodicity);
                            const duration = parseInt(durationMonths) || 120;
                            const adjustments: { month: number; rent: number }[] = [];
                            
                            let currentRent = baseRent;
                            let month = firstMonth;
                            
                            while (month <= duration && adjustments.length < 5) {
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
                        </div>
                      </div>
                    )}
                  </div>
                )}
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

          {/* Tab Avisos */}
          <TabsContent value="avisos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Aviso de Término</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Término Anticipado</Label>
                  <Select value={noticeType} onValueChange={(value: any) => setNoticeType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meses">Meses antes del vencimiento</SelectItem>
                      <SelectItem value="fecha">Fecha específica</SelectItem>
                      <SelectItem value="rangos">Rangos de meses</SelectItem>
                      <SelectItem value="desde_mes">Desde mes en específico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bilateralidad del Aviso</Label>
                  <RadioGroup
                    value={noticeBilaterality}
                    onValueChange={(value: "unilateral_gp" | "bilateral") => setNoticeBilaterality(value)}
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
                    <Label>Número de Meses *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={noticeValue}
                      onChange={(e) => setNoticeValue(e.target.value)}
                      placeholder="Ej: 6"
                    />
                  </div>
                )}

                {noticeType === "fecha" && (
                  <div className="space-y-2">
                    <Label>Fecha de Aviso *</Label>
                    <Input
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
                        onClick={addNoticeRange}
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
                            max={parseInt(durationMonths) || 999}
                            value={range.start_month}
                            onChange={(e) => updateNoticeRange(index, "start_month", parseInt(e.target.value) || 1)}
                            className="w-20"
                          />
                          <Label className="text-sm">al mes</Label>
                          <Input
                            type="number"
                            min={range.start_month}
                            max={parseInt(durationMonths) || 999}
                            value={range.end_month}
                            onChange={(e) => updateNoticeRange(index, "end_month", parseInt(e.target.value) || range.start_month)}
                            className="w-20"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeNoticeRange(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    {durationMonths && noticeRanges.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        La duración del contrato es de {durationMonths} meses. Los rangos deben estar dentro de este período.
                      </p>
                    )}
                  </div>
                )}

                {noticeType === "desde_mes" && (
                  <div className="space-y-2">
                    <Label>Desde el mes *</Label>
                    <Input
                      type="number"
                      min="1"
                      max={parseInt(durationMonths) || 999}
                      value={noticeValue}
                      onChange={(e) => setNoticeValue(e.target.value)}
                      placeholder="Ej: 12"
                    />
                    <p className="text-xs text-muted-foreground">
                      El aviso podrá darse desde este mes hasta el final del contrato
                      {durationMonths && noticeValue && parseInt(noticeValue) <= parseInt(durationMonths) && (
                        <span className="block mt-1 font-medium">
                          (Mes {noticeValue} al mes {durationMonths})
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Otros */}
          <TabsContent value="otros" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Otros Arrendamientos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Otros Arrendamientos (UF)</Label>
                    {otrosEgresosDescription && (
                      <span className="text-xs text-muted-foreground">Nota: {otrosEgresosDescription}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Monto"
                      value={otrosEgresosAmount}
                      onChange={(e) => setOtrosEgresosAmount(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      placeholder="Nota (opcional)"
                      value={otrosEgresosDescription}
                      onChange={(e) => setOtrosEgresosDescription(e.target.value)}
                      className="flex-1"
                    />
                  </div>
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
            disabled={saving || !regimeRent || !durationMonths || (noticeType !== "rangos" && !noticeValue) || (noticeType === "rangos" && noticeRanges.length === 0)}
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
