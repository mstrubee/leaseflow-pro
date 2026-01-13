import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus, X, TrendingUp, DollarSign, Calendar, Settings } from "lucide-react";
import { RenegotiationDraft } from "@/hooks/useRenegotiationDrafts";

interface Escalation {
  month_number: number;
  amount: number;
}

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
  const [name, setName] = useState("");
  const [initialRent, setInitialRent] = useState("");
  const [regimeRent, setRegimeRent] = useState("");
  const [variableRentPercentage, setVariableRentPercentage] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [noticeType, setNoticeType] = useState<"meses" | "fecha">("meses");
  const [noticeValue, setNoticeValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [effectiveFromSignature, setEffectiveFromSignature] = useState(false);
  
  // Additional fields
  const [guaranteeMultiplier, setGuaranteeMultiplier] = useState("");
  const [hasPeriodicAdjustments, setHasPeriodicAdjustments] = useState(false);
  const [firstAdjustmentMonth, setFirstAdjustmentMonth] = useState("");
  const [adjustmentPeriodicity, setAdjustmentPeriodicity] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  
  // Gastos comunes
  const [gastosComunesMethodology, setGastosComunesMethodology] = useState("uf_m2");
  const [gastosComunesUfM2, setGastosComunesUfM2] = useState("");
  const [gastosComunesPercentage, setGastosComunesPercentage] = useState("");
  const [gastosComunesTotalCentro, setGastosComunesTotalCentro] = useState("");
  
  // Other
  const [fondoPromocionPercentage, setFondoPromocionPercentage] = useState("");
  const [graceMonths, setGraceMonths] = useState("");
  const [noticeBilaterality, setNoticeBilaterality] = useState("unilateral");
  const [otrosEgresosAmount, setOtrosEgresosAmount] = useState("");
  const [otrosEgresosDescription, setOtrosEgresosDescription] = useState("");
  
  // Escalations
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [newEscalationMonth, setNewEscalationMonth] = useState("");
  const [newEscalationAmount, setNewEscalationAmount] = useState("");

  useEffect(() => {
    if (draft) {
      setName(draft.name);
      setInitialRent(draft.initial_rent?.toString() || "");
      setRegimeRent(draft.regime_rent?.toString() || "");
      setVariableRentPercentage(draft.variable_rent_percentage?.toString() || "");
      setDurationMonths(draft.duration_months?.toString() || "");
      setNoticeType((draft.notice_type as "meses" | "fecha") || "meses");
      setNoticeValue(draft.notice_value || "");
      setEffectiveDate(draft.effective_date || "");
      setEffectiveFromSignature(draft.effective_from_signature || false);
      setGuaranteeMultiplier(draft.guarantee_multiplier?.toString() || "");
      setHasPeriodicAdjustments(draft.has_periodic_adjustments || false);
      setFirstAdjustmentMonth(draft.first_adjustment_month?.toString() || "");
      setAdjustmentPeriodicity(draft.adjustment_periodicity_months?.toString() || "");
      setAdjustmentType((draft.adjustment_type as "percentage" | "fixed") || "percentage");
      setAdjustmentValue(draft.adjustment_value?.toString() || "");
      setGastosComunesMethodology(draft.gastos_comunes_methodology || "uf_m2");
      setGastosComunesUfM2(draft.gastos_comunes_uf_m2?.toString() || "");
      setGastosComunesPercentage(draft.gastos_comunes_percentage?.toString() || "");
      setGastosComunesTotalCentro(draft.gastos_comunes_total_centro?.toString() || "");
      setFondoPromocionPercentage(draft.fondo_promocion_percentage?.toString() || "");
      setGraceMonths(draft.grace_months?.toString() || "");
      setNoticeBilaterality(draft.notice_bilaterality || "unilateral");
      setOtrosEgresosAmount(draft.otros_egresos_amount?.toString() || "");
      setOtrosEgresosDescription(draft.otros_egresos_description || "");
      setEscalations(draft.escalations?.map(e => ({ month_number: e.month_number, amount: e.amount })) || []);
    }
  }, [draft]);

  const addEscalation = () => {
    if (!newEscalationMonth || !newEscalationAmount) return;
    const month = parseInt(newEscalationMonth);
    const amount = parseFloat(newEscalationAmount);
    if (isNaN(month) || isNaN(amount)) return;
    
    if (escalations.some(e => e.month_number === month)) {
      return;
    }
    
    setEscalations([...escalations, { month_number: month, amount }].sort((a, b) => a.month_number - b.month_number));
    setNewEscalationMonth("");
    setNewEscalationAmount("");
  };

  const removeEscalation = (month: number) => {
    setEscalations(escalations.filter(e => e.month_number !== month));
  };

  const handleSave = async () => {
    if (!regimeRent || !durationMonths || !noticeValue) {
      return;
    }

    const data: Partial<RenegotiationDraft> = {
      name,
      initial_rent: initialRent ? parseFloat(initialRent) : null,
      regime_rent: parseFloat(regimeRent),
      variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
      duration_months: parseInt(durationMonths),
      notice_type: noticeType,
      notice_value: noticeValue,
      effective_date: effectiveFromSignature ? null : effectiveDate || null,
      effective_from_signature: effectiveFromSignature,
      guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,
      has_periodic_adjustments: hasPeriodicAdjustments,
      first_adjustment_month: firstAdjustmentMonth ? parseInt(firstAdjustmentMonth) : null,
      adjustment_periodicity_months: adjustmentPeriodicity ? parseInt(adjustmentPeriodicity) : null,
      adjustment_type: adjustmentType,
      adjustment_value: adjustmentValue ? parseFloat(adjustmentValue) : null,
      gastos_comunes_methodology: gastosComunesMethodology,
      gastos_comunes_uf_m2: gastosComunesUfM2 ? parseFloat(gastosComunesUfM2) : null,
      gastos_comunes_percentage: gastosComunesPercentage ? parseFloat(gastosComunesPercentage) : null,
      gastos_comunes_total_centro: gastosComunesTotalCentro ? parseFloat(gastosComunesTotalCentro) : null,
      fondo_promocion_percentage: fondoPromocionPercentage ? parseFloat(fondoPromocionPercentage) : null,
      grace_months: graceMonths ? parseInt(graceMonths) : null,
      notice_bilaterality: noticeBilaterality,
      otros_egresos_amount: otrosEgresosAmount ? parseFloat(otrosEgresosAmount) : null,
      otros_egresos_description: otrosEgresosDescription || null,
    };

    await onSave(data, escalations);
  };

  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
              Escalonados
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

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Nombre del Borrador</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Propuesta 1 - Aumento 10%"
                />
              </div>

              <div className="space-y-2">
                <Label>Canon Inicial (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={initialRent}
                  onChange={(e) => setInitialRent(e.target.value)}
                  placeholder="UF"
                />
              </div>

              <div className="space-y-2">
                <Label>Canon en Régimen *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={regimeRent}
                  onChange={(e) => setRegimeRent(e.target.value)}
                  placeholder="UF"
                />
              </div>

              <div className="space-y-2">
                <Label>Arriendo Variable (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={variableRentPercentage}
                  onChange={(e) => setVariableRentPercentage(e.target.value)}
                  placeholder="%"
                />
              </div>

              <div className="space-y-2">
                <Label>Duración (meses) *</Label>
                <Input
                  type="number"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  min={1}
                />
              </div>

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

              <div className="space-y-2">
                <Label>Multiplicador de Garantía</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={guaranteeMultiplier}
                  onChange={(e) => setGuaranteeMultiplier(e.target.value)}
                  placeholder="Ej: 2"
                />
              </div>

              <div className="space-y-2">
                <Label>Bilateralidad de Aviso</Label>
                <Select value={noticeBilaterality} onValueChange={setNoticeBilaterality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unilateral">Unilateral GP</SelectItem>
                    <SelectItem value="bilateral">Bilateral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="escalations" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Escalonamientos de Renta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Mes</Label>
                    <Input
                      type="number"
                      placeholder="Mes"
                      value={newEscalationMonth}
                      onChange={(e) => setNewEscalationMonth(e.target.value)}
                      min={1}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Monto (UF)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="UF"
                      value={newEscalationAmount}
                      onChange={(e) => setNewEscalationAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" size="icon" onClick={addEscalation}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {escalations.length > 0 && (
                  <div className="space-y-2">
                    {escalations.map((esc) => (
                      <div
                        key={esc.month_number}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <span className="text-sm">
                          Mes {esc.month_number}: {formatCurrency(esc.amount)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeEscalation(esc.month_number)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasPeriodicAdjustments"
                      checked={hasPeriodicAdjustments}
                      onCheckedChange={(checked) => setHasPeriodicAdjustments(checked as boolean)}
                    />
                    <label htmlFor="hasPeriodicAdjustments" className="text-sm font-medium">
                      Tiene ajustes periódicos
                    </label>
                  </div>

                  {hasPeriodicAdjustments && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div className="space-y-2">
                        <Label className="text-xs">Primer ajuste (mes)</Label>
                        <Input
                          type="number"
                          value={firstAdjustmentMonth}
                          onChange={(e) => setFirstAdjustmentMonth(e.target.value)}
                          min={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Periodicidad (meses)</Label>
                        <Input
                          type="number"
                          value={adjustmentPeriodicity}
                          onChange={(e) => setAdjustmentPeriodicity(e.target.value)}
                          min={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Tipo de ajuste</Label>
                        <Select value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as "percentage" | "fixed")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Porcentaje</SelectItem>
                            <SelectItem value="fixed">Monto fijo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">
                          {adjustmentType === "percentage" ? "Porcentaje (%)" : "Monto (UF)"}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={adjustmentValue}
                          onChange={(e) => setAdjustmentValue(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gastos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Gastos Comunes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Metodología</Label>
                  <Select value={gastosComunesMethodology} onValueChange={setGastosComunesMethodology}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uf_m2">UF/m²</SelectItem>
                      <SelectItem value="percentage">Porcentaje de GGCC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {gastosComunesMethodology === "uf_m2" ? (
                  <div className="space-y-2">
                    <Label>UF/m²</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={gastosComunesUfM2}
                      onChange={(e) => setGastosComunesUfM2(e.target.value)}
                      placeholder="UF por m²"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Total GGCC Centro (UF)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={gastosComunesTotalCentro}
                        onChange={(e) => setGastosComunesTotalCentro(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Porcentaje (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={gastosComunesPercentage}
                        onChange={(e) => setGastosComunesPercentage(e.target.value)}
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
                  <Label>Porcentaje del Canon (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fondoPromocionPercentage}
                    onChange={(e) => setFondoPromocionPercentage(e.target.value)}
                    placeholder="Ej: 2"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="otros" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Meses de Gracia</Label>
                <Input
                  type="number"
                  value={graceMonths}
                  onChange={(e) => setGraceMonths(e.target.value)}
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <Label>Otros Egresos (UF)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={otrosEgresosAmount}
                  onChange={(e) => setOtrosEgresosAmount(e.target.value)}
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Descripción Otros Egresos</Label>
                <Textarea
                  value={otrosEgresosDescription}
                  onChange={(e) => setOtrosEgresosDescription(e.target.value)}
                  placeholder="Describe los otros egresos..."
                  rows={3}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !regimeRent || !durationMonths || !noticeValue}>
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
