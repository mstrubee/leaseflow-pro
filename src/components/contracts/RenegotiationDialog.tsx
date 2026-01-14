import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Loader2, ArrowRight, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Escalation {
  month_number: number;
  amount: number;
}

interface NoticeRange {
  start_month: number;
  end_month: number;
}

interface CurrentVersion {
  id: string;
  version_number: number;

  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;

  notice_type: "meses" | "fecha" | "rangos" | string;
  notice_value: string;
  notice_bilaterality?: "unilateral_gp" | "bilateral" | string | null;

  // Canon escalonado
  rent_escalations?: Array<{ month_number: number; amount: number }>;
  grace_months?: number | null;

  // Garantía
  guarantee_multiplier?: number | null;

  // Reajustes periódicos
  has_periodic_adjustments?: boolean | null;
  adjustment_type?: "percentage" | "fixed" | string | null;
  adjustment_value?: number | null;
  first_adjustment_month?: number | null;
  adjustment_periodicity_months?: number | null;

  // Gastos comunes
  gastos_comunes_methodology?: "uf_m2" | "percentage" | string | null;
  gastos_comunes_uf_m2?: number | null;
  gastos_comunes_percentage?: number | null;
  gastos_comunes_total_centro?: number | null;
  gastos_comunes_tope?: number | null;
  gastos_comunes_tope_type?: "fixed" | "uf_m2" | string | null;

  // Extensión metodología GGCC
  has_extended_gastos_comunes?: boolean | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  adicional_administracion_percentage?: number | null;

  // Fondo / otros
  fondo_promocion_percentage?: number | null;
  otros_egresos_amount?: number | null;
  otros_egresos_description?: string | null;

  // Avisos por rangos
  notice_ranges?: NoticeRange[];
}

interface RenegotiationDialogProps {
  contractId: string;
  currentVersion: CurrentVersion;
  onSuccess: () => void;
  displayCurrency?: "UF" | "CLP";
}

const parseMonths = (raw: string) => {
  const m = raw?.match(/\d+/);
  return m ? m[0] : raw;
};

const safeNumber = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const RenegotiationDialog = ({
  contractId,
  currentVersion,
  onSuccess,
  displayCurrency = "UF",
}: RenegotiationDialogProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);

  const initialNoticeType = useMemo<"meses" | "fecha" | "rangos">(() => {
    const t = (currentVersion.notice_type || "meses").toString();
    if (t === "fecha" || t === "rangos" || t === "meses") return t;
    return "meses";
  }, [currentVersion.notice_type]);

  const [initialRent, setInitialRent] = useState(currentVersion.initial_rent?.toString() || "");
  const [regimeRent, setRegimeRent] = useState(currentVersion.regime_rent?.toString() || "");
  const [variableRentPercentage, setVariableRentPercentage] = useState(
    currentVersion.variable_rent_percentage?.toString() || ""
  );
  const [durationMonths, setDurationMonths] = useState(currentVersion.duration_months?.toString() || "");

  const [graceMonths, setGraceMonths] = useState(currentVersion.grace_months?.toString() || "");
  const [guaranteeMultiplier, setGuaranteeMultiplier] = useState(
    currentVersion.guarantee_multiplier?.toString() || ""
  );

  const [noticeType, setNoticeType] = useState<"meses" | "fecha" | "rangos">(initialNoticeType);
  const [noticeValue, setNoticeValue] = useState(() =>
    initialNoticeType === "meses" ? parseMonths(currentVersion.notice_value || "") : currentVersion.notice_value || ""
  );
  const [noticeBilaterality, setNoticeBilaterality] = useState<"unilateral_gp" | "bilateral">(
    (currentVersion.notice_bilaterality as any) === "bilateral" ? "bilateral" : "unilateral_gp"
  );

  const [noticeRanges, setNoticeRanges] = useState<NoticeRange[]>(currentVersion.notice_ranges || []);

  const [effectiveDate, setEffectiveDate] = useState("");
  const [effectiveFromSignature, setEffectiveFromSignature] = useState(false);

  // Extend current conditions state
  const [extendMonths, setExtendMonths] = useState("");
  const [extendNoticeMonths, setExtendNoticeMonths] = useState(parseMonths(currentVersion.notice_value || ""));

  // Escalation state
  const [escalations, setEscalations] = useState<Escalation[]>(
    (currentVersion.rent_escalations || []).map((e) => ({ month_number: e.month_number, amount: e.amount }))
  );
  const [newEscalationMonth, setNewEscalationMonth] = useState("");
  const [newEscalationAmount, setNewEscalationAmount] = useState("");

  // Periodic adjustments
  const [hasPeriodicAdjustments, setHasPeriodicAdjustments] = useState(!!currentVersion.has_periodic_adjustments);
  const [adjustmentType, setAdjustmentType] = useState<"percentage" | "fixed">(
    (currentVersion.adjustment_type as any) === "fixed" ? "fixed" : "percentage"
  );
  const [adjustmentValue, setAdjustmentValue] = useState(currentVersion.adjustment_value?.toString() || "");
  const [firstAdjustmentMonth, setFirstAdjustmentMonth] = useState(
    currentVersion.first_adjustment_month?.toString() || ""
  );
  const [adjustmentPeriodicityMonths, setAdjustmentPeriodicityMonths] = useState(
    currentVersion.adjustment_periodicity_months?.toString() || ""
  );

  // Gastos comunes
  const [gastosComunesMethodology, setGastosComunesMethodology] = useState<"uf_m2" | "percentage">(
    (currentVersion.gastos_comunes_methodology as any) === "percentage" ? "percentage" : "uf_m2"
  );
  const [gastosComunesUfM2, setGastosComunesUfM2] = useState(currentVersion.gastos_comunes_uf_m2?.toString() || "");
  const [gastosComunesPercentage, setGastosComunesPercentage] = useState(
    currentVersion.gastos_comunes_percentage?.toString() || ""
  );
  const [gastosComunesTotalCentro, setGastosComunesTotalCentro] = useState(
    currentVersion.gastos_comunes_total_centro?.toString() || ""
  );
  const [gastosComunesTope, setGastosComunesTope] = useState(currentVersion.gastos_comunes_tope?.toString() || "");
  const [gastosComunesTopeType, setGastosComunesTopeType] = useState<"fixed" | "uf_m2">(
    (currentVersion.gastos_comunes_tope_type as any) === "uf_m2" ? "uf_m2" : "fixed"
  );

  const [hasExtendedGastosComunes, setHasExtendedGastosComunes] = useState(!!currentVersion.has_extended_gastos_comunes);
  const [gastosComunesUfMlFrente, setGastosComunesUfMlFrente] = useState(
    currentVersion.gastos_comunes_uf_ml_frente?.toString() || ""
  );
  const [gastosComunesProrrataKwhClima, setGastosComunesProrrataKwhClima] = useState(
    currentVersion.gastos_comunes_prorrata_kwh_clima?.toString() || ""
  );
  const [adicionalAdministracionPercentage, setAdicionalAdministracionPercentage] = useState(
    currentVersion.adicional_administracion_percentage?.toString() || ""
  );

  const [fondoPromocionPercentage, setFondoPromocionPercentage] = useState(
    currentVersion.fondo_promocion_percentage?.toString() || ""
  );
  const [otrosEgresosAmount, setOtrosEgresosAmount] = useState(currentVersion.otros_egresos_amount?.toString() || "");
  const [otrosEgresosDescription, setOtrosEgresosDescription] = useState(currentVersion.otros_egresos_description || "");

  const amountLabel = displayCurrency === "CLP" ? "CLP" : "UF";

  const formatCurrency = (amount: number) => {
    if (displayCurrency === "CLP") {
      return `$${Math.round(amount).toLocaleString("es-CL")}`;
    }
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} UF`;
  };

  const addEscalation = () => {
    if (!newEscalationMonth || !newEscalationAmount) return;
    const month = parseInt(newEscalationMonth);
    const amount = parseFloat(newEscalationAmount);
    if (isNaN(month) || isNaN(amount)) return;

    if (escalations.some((e) => e.month_number === month)) {
      toast.error("Ya existe un escalonamiento para ese mes");
      return;
    }

    setEscalations([...escalations, { month_number: month, amount }].sort((a, b) => a.month_number - b.month_number));
    setNewEscalationMonth("");
    setNewEscalationAmount("");
  };

  const removeEscalation = (month: number) => {
    setEscalations(escalations.filter((e) => e.month_number !== month));
  };

  const addNoticeRange = () => {
    const maxMonth = parseInt(durationMonths) || 12;
    setNoticeRanges([...noticeRanges, { start_month: 1, end_month: Math.min(3, maxMonth) }]);
  };

  const removeNoticeRange = (index: number) => {
    setNoticeRanges(noticeRanges.filter((_, i) => i !== index));
  };

  const updateNoticeRange = (index: number, field: "start_month" | "end_month", value: number) => {
    const next = [...noticeRanges];
    next[index] = { ...next[index], [field]: value };
    setNoticeRanges(next);
  };

  const handleSave = async () => {
    if (!regimeRent || !durationMonths) {
      toast.error("Por favor completa todos los campos requeridos");
      return;
    }

    if (noticeType === "rangos") {
      if (noticeRanges.length === 0) {
        toast.error("Debes definir al menos un rango de aviso");
        return;
      }
    } else if (!noticeValue) {
      toast.error("Por favor completa todos los campos requeridos");
      return;
    }

    if (!effectiveFromSignature && !effectiveDate) {
      toast.error("Por favor indica la fecha de vigencia o selecciona 'Desde la firma'");
      return;
    }

    setSaving(true);

    try {
      // Set current version as not current
      const { error: updateError } = await supabase
        .from("contract_versions")
        .update({ is_current: false })
        .eq("id", currentVersion.id);

      if (updateError) throw updateError;

      // Create new version
      const noticeValueToStore =
        noticeType === "meses" ? parseMonths(noticeValue) : noticeType === "rangos" ? "rangos" : noticeValue;

      const { data: newVersion, error: insertError } = await supabase
        .from("contract_versions")
        .insert({
          contract_id: contractId,
          version_number: currentVersion.version_number + 1,
          is_current: true,
          is_renegotiation: true,

          initial_rent: initialRent ? parseFloat(initialRent) : null,
          regime_rent: parseFloat(regimeRent),
          variable_rent_percentage: variableRentPercentage ? parseFloat(variableRentPercentage) : null,
          duration_months: parseInt(durationMonths),

          grace_months: graceMonths ? parseInt(graceMonths) : null,
          guarantee_multiplier: guaranteeMultiplier ? parseFloat(guaranteeMultiplier) : null,

          has_periodic_adjustments: hasPeriodicAdjustments,
          adjustment_type: hasPeriodicAdjustments ? adjustmentType : null,
          adjustment_value: hasPeriodicAdjustments ? safeNumber(adjustmentValue) : null,
          first_adjustment_month: hasPeriodicAdjustments ? (safeNumber(firstAdjustmentMonth) as any) : null,
          adjustment_periodicity_months: hasPeriodicAdjustments ? (safeNumber(adjustmentPeriodicityMonths) as any) : null,

          gastos_comunes_methodology: gastosComunesMethodology,
          gastos_comunes_uf_m2: gastosComunesMethodology === "uf_m2" ? safeNumber(gastosComunesUfM2) : null,
          gastos_comunes_percentage: gastosComunesMethodology === "percentage" ? safeNumber(gastosComunesPercentage) : null,
          gastos_comunes_total_centro: gastosComunesMethodology === "percentage" ? safeNumber(gastosComunesTotalCentro) : null,
          gastos_comunes_tope: safeNumber(gastosComunesTope),
          gastos_comunes_tope_type: gastosComunesTopeType,

          has_extended_gastos_comunes: hasExtendedGastosComunes,
          gastos_comunes_uf_ml_frente: hasExtendedGastosComunes ? safeNumber(gastosComunesUfMlFrente) : null,
          gastos_comunes_prorrata_kwh_clima: hasExtendedGastosComunes ? safeNumber(gastosComunesProrrataKwhClima) : null,
          adicional_administracion_percentage: hasExtendedGastosComunes ? safeNumber(adicionalAdministracionPercentage) : null,

          fondo_promocion_percentage: safeNumber(fondoPromocionPercentage),
          otros_egresos_amount: safeNumber(otrosEgresosAmount),
          otros_egresos_description: otrosEgresosDescription || null,

          notice_type: noticeType,
          notice_value: noticeValueToStore,
          notice_bilaterality: noticeBilaterality,

          effective_date: effectiveFromSignature ? null : effectiveDate,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Save escalations if any
      if (escalations.length > 0 && newVersion) {
        const { error: escalationError } = await supabase.from("rent_escalations").insert(
          escalations.map((e) => ({
            version_id: newVersion.id,
            month_number: e.month_number,
            amount: e.amount,
          }))
        );
        if (escalationError) throw escalationError;
      }

      // Save notice ranges if needed
      if (noticeType === "rangos" && newVersion) {
        const { error: rangesError } = await supabase.from("notice_ranges").insert(
          noticeRanges.map((r) => ({
            version_id: newVersion.id,
            start_month: r.start_month,
            end_month: r.end_month,
          }))
        );
        if (rangesError) throw rangesError;
      }

      toast.success("Renegociación creada exitosamente");
      setOpen(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating renegotiation:", error);
      toast.error("Error al crear la renegociación");
    } finally {
      setSaving(false);
    }
  };

  const handleExtendConditions = async () => {
    if (!extendMonths || !extendNoticeMonths) {
      toast.error("Por favor completa los campos requeridos");
      return;
    }

    setSaving(true);

    try {
      // Set current version as not current
      const { error: updateError } = await supabase
        .from("contract_versions")
        .update({ is_current: false })
        .eq("id", currentVersion.id);

      if (updateError) throw updateError;

      // Create new version with same conditions but different duration/notice
      const { error: insertError } = await supabase.from("contract_versions").insert({
        contract_id: contractId,
        version_number: currentVersion.version_number + 1,
        is_current: true,
        is_renegotiation: true,
        initial_rent: currentVersion.initial_rent,
        regime_rent: currentVersion.regime_rent,
        variable_rent_percentage: currentVersion.variable_rent_percentage,
        duration_months: parseInt(extendMonths),
        notice_type: "meses",
        notice_value: parseMonths(extendNoticeMonths),
        effective_date: null, // Will be set when signed
      });

      if (insertError) throw insertError;

      toast.success("Extensión creada exitosamente");
      setShowExtendDialog(false);
      setOpen(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error extending conditions:", error);
      toast.error("Error al extender las condiciones");
    } finally {
      setSaving(false);
    }
  };


  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Renegociar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Renegociación</DialogTitle>
            <DialogDescription>
              Crea una nueva versión del contrato con condiciones actualizadas. La versión actual ({currentVersion.version_number})
              quedará como histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Current conditions summary */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm font-medium mb-2">Condiciones actuales (v{currentVersion.version_number})</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div>Canon Régimen: {formatCurrency(currentVersion.regime_rent)}</div>
                <div>Duración: {currentVersion.duration_months} meses</div>
              </div>
            </div>

            {/* Extend current conditions button */}
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2"
              onClick={() => setShowExtendDialog(true)}
            >
              <ArrowRight className="h-4 w-4" />
              Extender Condiciones Actuales
            </Button>

            {/* Effective date */}
            <div className="space-y-3">
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
                <label
                  htmlFor="effectiveFromSignature"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Desde la firma del contrato
                </label>
              </div>
              {!effectiveFromSignature && (
                <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              )}
              <p className="text-xs text-muted-foreground">
                {effectiveFromSignature
                  ? "La fecha se establecerá automáticamente al marcar el contrato como firmado"
                  : "Fecha desde la cual aplican las nuevas condiciones"}
              </p>
            </div>

            {/* New conditions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="initialRent">Canon Inicial (opcional)</Label>
                <Input
                  id="initialRent"
                  type="number"
                  placeholder={displayCurrency === "CLP" ? "Ej: 1500000" : "Ej: 150"}
                  value={initialRent}
                  onChange={(e) => setInitialRent(e.target.value)}
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regimeRent">Canon en Régimen ({amountLabel}) *</Label>
                <Input
                  id="regimeRent"
                  type="number"
                  placeholder={displayCurrency === "CLP" ? "Ej: 2000000" : "Ej: 200"}
                  value={regimeRent}
                  onChange={(e) => setRegimeRent(e.target.value)}
                  step="0.01"
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
                <Label htmlFor="durationMonths">Nueva Duración (meses) *</Label>
                <Input
                  id="durationMonths"
                  type="number"
                  placeholder="Ej: 36"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  min={1}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="graceMonths">Meses de Gracia (opcional)</Label>
                <Input
                  id="graceMonths"
                  type="number"
                  placeholder="Ej: 2"
                  value={graceMonths}
                  onChange={(e) => setGraceMonths(e.target.value)}
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="guaranteeMultiplier">Garantía (multiplicador) (opcional)</Label>
                <Input
                  id="guaranteeMultiplier"
                  type="number"
                  step="0.01"
                  placeholder="Ej: 3"
                  value={guaranteeMultiplier}
                  onChange={(e) => setGuaranteeMultiplier(e.target.value)}
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Aviso de Término *</Label>
                <Select value={noticeType} onValueChange={(v) => setNoticeType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meses">Meses de anticipación</SelectItem>
                    <SelectItem value="fecha">Fecha específica</SelectItem>
                    <SelectItem value="rangos">Rangos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="noticeValue">
                  {noticeType === "meses" ? "Meses de Anticipación *" : noticeType === "fecha" ? "Fecha de Aviso *" : ""}
                </Label>
                {noticeType === "meses" ? (
                  <Input
                    id="noticeValue"
                    type="number"
                    placeholder="Ej: 6"
                    value={noticeValue}
                    onChange={(e) => setNoticeValue(e.target.value)}
                    min={0}
                  />
                ) : noticeType === "fecha" ? (
                  <Input id="noticeValue" type="date" value={noticeValue} onChange={(e) => setNoticeValue(e.target.value)} />
                ) : (
                  <div className="text-xs text-muted-foreground">Define los rangos más abajo.</div>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Tipo de Aviso (Bilateralidad)</Label>
                <Select value={noticeBilaterality} onValueChange={(v) => setNoticeBilaterality(v as any)}>
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

            {/* Notice ranges */}
            {noticeType === "rangos" && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label>Rangos de Aviso</Label>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addNoticeRange}>
                    <Plus className="h-4 w-4" />
                    Agregar rango
                  </Button>
                </div>

                {noticeRanges.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Agrega al menos un rango para continuar.</p>
                ) : (
                  <div className="space-y-2">
                    {noticeRanges.map((r, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-2 items-end p-3 rounded-lg border border-border bg-muted/30">
                        <div className="space-y-1">
                          <Label className="text-xs">Mes inicio</Label>
                          <Input
                            type="number"
                            min={1}
                            max={parseInt(durationMonths) || 999}
                            value={r.start_month}
                            onChange={(e) => updateNoticeRange(idx, "start_month", parseInt(e.target.value || "1"))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Mes fin</Label>
                          <Input
                            type="number"
                            min={1}
                            max={parseInt(durationMonths) || 999}
                            value={r.end_month}
                            onChange={(e) => updateNoticeRange(idx, "end_month", parseInt(e.target.value || "1"))}
                          />
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeNoticeRange(idx)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Periodic adjustments */}
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasPeriodicAdjustments"
                  checked={hasPeriodicAdjustments}
                  onCheckedChange={(checked) => setHasPeriodicAdjustments(checked as boolean)}
                />
                <Label htmlFor="hasPeriodicAdjustments">Tiene reajustes periódicos</Label>
              </div>

              {hasPeriodicAdjustments && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div className="space-y-2">
                    <Label>Tipo de Reajuste</Label>
                    <Select value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as any)}>
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
                    <Label>{adjustmentType === "percentage" ? "Valor (%)" : `Valor (${amountLabel})`}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={adjustmentValue}
                      onChange={(e) => setAdjustmentValue(e.target.value)}
                      placeholder={adjustmentType === "percentage" ? "Ej: 10" : displayCurrency === "CLP" ? "Ej: 50000" : "Ej: 1.5"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Primer Reajuste (mes)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={firstAdjustmentMonth}
                      onChange={(e) => setFirstAdjustmentMonth(e.target.value)}
                      placeholder="Ej: 13"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Periodicidad (meses)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={adjustmentPeriodicityMonths}
                      onChange={(e) => setAdjustmentPeriodicityMonths(e.target.value)}
                      placeholder="Ej: 12"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Gastos comunes */}
            <div className="space-y-3 pt-4 border-t border-border">
              <Label>Gastos Comunes</Label>

              <div className="space-y-2">
                <Label className="text-xs">Metodología</Label>
                <Select value={gastosComunesMethodology} onValueChange={(v) => setGastosComunesMethodology(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uf_m2">UF por m²</SelectItem>
                    <SelectItem value="percentage">Porcentaje</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gastosComunesMethodology === "uf_m2" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>UF por m²</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={gastosComunesUfM2}
                      onChange={(e) => setGastosComunesUfM2(e.target.value)}
                      placeholder="Ej: 0.25"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Porcentaje (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={gastosComunesPercentage}
                      onChange={(e) => setGastosComunesPercentage(e.target.value)}
                      placeholder="Ej: 5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Centro ({amountLabel})</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={gastosComunesTotalCentro}
                      onChange={(e) => setGastosComunesTotalCentro(e.target.value)}
                      placeholder={displayCurrency === "CLP" ? "Ej: 50000000" : "Ej: 1000"}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tope ({amountLabel})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={gastosComunesTope}
                    onChange={(e) => setGastosComunesTope(e.target.value)}
                    placeholder="(opcional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Tope</Label>
                  <Select value={gastosComunesTopeType} onValueChange={(v) => setGastosComunesTopeType(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Monto fijo</SelectItem>
                      <SelectItem value="uf_m2">UF por m²</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasExtendedGastosComunes"
                  checked={hasExtendedGastosComunes}
                  onCheckedChange={(checked) => setHasExtendedGastosComunes(checked as boolean)}
                />
                <Label htmlFor="hasExtendedGastosComunes">Ampliar metodología de cálculo</Label>
              </div>

              {hasExtendedGastosComunes && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div className="space-y-2">
                    <Label>UF por ML Frente</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={gastosComunesUfMlFrente}
                      onChange={(e) => setGastosComunesUfMlFrente(e.target.value)}
                      placeholder="Ej: 0.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prorrata KWH Clima ({amountLabel})</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={gastosComunesProrrataKwhClima}
                      onChange={(e) => setGastosComunesProrrataKwhClima(e.target.value)}
                      placeholder="Ej: 2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Adicional por Administración (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={adicionalAdministracionPercentage}
                      onChange={(e) => setAdicionalAdministracionPercentage(e.target.value)}
                      placeholder="Ej: 3"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Fondo y otros */}
            <div className="space-y-3 pt-4 border-t border-border">
              <Label>Fondo / Otros</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fondo de Promoción (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fondoPromocionPercentage}
                    onChange={(e) => setFondoPromocionPercentage(e.target.value)}
                    placeholder="Ej: 2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Otros Egresos ({amountLabel})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={otrosEgresosAmount}
                    onChange={(e) => setOtrosEgresosAmount(e.target.value)}
                    placeholder="(opcional)"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descripción Otros Egresos</Label>
                  <Input
                    value={otrosEgresosDescription}
                    onChange={(e) => setOtrosEgresosDescription(e.target.value)}
                    placeholder="(opcional)"
                  />
                </div>
              </div>
            </div>

            {/* Escalation section */}
            <div className="space-y-3 pt-4 border-t border-border">
              <Label>Escalonamiento de Arriendo (opcional)</Label>

              {escalations.length > 0 && (
                <div className="space-y-2">
                  {escalations.map((escalation) => (
                    <div
                      key={escalation.month_number}
                      className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                    >
                      <span className="text-sm flex-1">
                        Mes {escalation.month_number}: {formatCurrency(escalation.amount)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEscalation(escalation.month_number)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Mes"
                    value={newEscalationMonth}
                    onChange={(e) => setNewEscalationMonth(e.target.value)}
                    min={1}
                    max={parseInt(durationMonths) || 999}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={`Monto ${amountLabel}`}
                    value={newEscalationAmount}
                    onChange={(e) => setNewEscalationAmount(e.target.value)}
                  />
                </div>
                <Button type="button" variant="outline" onClick={addEscalation}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Define los montos de arriendo para meses específicos</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Crear Renegociación"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend conditions dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extender Condiciones Actuales</DialogTitle>
            <DialogDescription>Mantiene las mismas condiciones comerciales con nueva duración y aviso.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm">
              <p className="font-medium mb-2">Condiciones a mantener:</p>
              <div className="space-y-1 text-muted-foreground">
                <p>Canon Régimen: {formatCurrency(currentVersion.regime_rent)}</p>
                {currentVersion.initial_rent && <p>Canon Inicial: {formatCurrency(currentVersion.initial_rent)}</p>}
                {currentVersion.variable_rent_percentage && <p>Arriendo Variable: {currentVersion.variable_rent_percentage}%</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="extendMonths">Nueva Duración (meses) *</Label>
              <Input
                id="extendMonths"
                type="number"
                placeholder="Ej: 24"
                value={extendMonths}
                onChange={(e) => setExtendMonths(e.target.value)}
                min={1}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="extendNoticeMonths">Meses de Anticipación para Aviso *</Label>
              <Input
                id="extendNoticeMonths"
                type="number"
                placeholder="Ej: 6"
                value={extendNoticeMonths}
                onChange={(e) => setExtendNoticeMonths(e.target.value)}
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                Cantidad de meses previos al término del contrato para dar aviso
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleExtendConditions} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Crear Extensión"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
