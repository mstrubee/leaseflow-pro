import { useState } from "react";
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
import { RefreshCw, Loader2, Trash2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CurrentVersion {
  id: string;
  version_number: number;
  initial_rent: number | null;
  regime_rent: number;
  variable_rent_percentage: number | null;
  duration_months: number;
  notice_type: string;
  notice_value: string;
}

interface RenegotiationDialogProps {
  contractId: string;
  currentVersion: CurrentVersion;
  hasActiveRenegotiation?: boolean;
  renegotiationVersionId?: string;
  onSuccess: () => void;
}

export const RenegotiationDialog = ({
  contractId,
  currentVersion,
  hasActiveRenegotiation = false,
  renegotiationVersionId,
  onSuccess,
}: RenegotiationDialogProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  
  // Delete confirmation dialogs
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [initialRent, setInitialRent] = useState(
    currentVersion.initial_rent?.toString() || ""
  );
  const [regimeRent, setRegimeRent] = useState(currentVersion.regime_rent.toString());
  const [variableRentPercentage, setVariableRentPercentage] = useState(
    currentVersion.variable_rent_percentage?.toString() || ""
  );
  const [durationMonths, setDurationMonths] = useState(
    currentVersion.duration_months.toString()
  );
  const [noticeType, setNoticeType] = useState<"meses" | "fecha">(
    currentVersion.notice_type as "meses" | "fecha"
  );
  const [noticeValue, setNoticeValue] = useState(currentVersion.notice_value);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [effectiveFromSignature, setEffectiveFromSignature] = useState(false);

  // Extend current conditions state
  const [extendMonths, setExtendMonths] = useState("");
  const [extendNoticeMonths, setExtendNoticeMonths] = useState(currentVersion.notice_value);

  const handleSave = async () => {
    if (!regimeRent || !durationMonths || !noticeValue) {
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
      const { error: insertError } = await supabase
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
          notice_type: noticeType,
          notice_value: noticeValue,
          effective_date: effectiveFromSignature ? null : effectiveDate,
        });

      if (insertError) throw insertError;

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
      const { error: insertError } = await supabase
        .from("contract_versions")
        .insert({
          contract_id: contractId,
          version_number: currentVersion.version_number + 1,
          is_current: true,
          is_renegotiation: true,
          initial_rent: currentVersion.initial_rent,
          regime_rent: currentVersion.regime_rent,
          variable_rent_percentage: currentVersion.variable_rent_percentage,
          duration_months: parseInt(extendMonths),
          notice_type: "meses",
          notice_value: extendNoticeMonths,
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

  const handleDeleteRenegotiation = async () => {
    if (!renegotiationVersionId) return;
    
    setDeleting(true);

    try {
      // Delete rent escalations for this version
      await supabase
        .from("rent_escalations")
        .delete()
        .eq("version_id", renegotiationVersionId);

      // Delete the renegotiation version
      const { error: deleteError } = await supabase
        .from("contract_versions")
        .delete()
        .eq("id", renegotiationVersionId);

      if (deleteError) throw deleteError;

      // Set the previous version as current
      const { data: versions, error: fetchError } = await supabase
        .from("contract_versions")
        .select("id")
        .eq("contract_id", contractId)
        .order("version_number", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (versions && versions.length > 0) {
        await supabase
          .from("contract_versions")
          .update({ is_current: true })
          .eq("id", versions[0].id);
      }

      // Delete renegotiation draft documents
      await supabase
        .from("contract_documents")
        .delete()
        .eq("contract_id", contractId)
        .in("document_type", ["borrador_r", "borrador_final_r"]);

      toast.success("Renegociación eliminada");
      setShowDeleteConfirm2(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error deleting renegotiation:", error);
      toast.error("Error al eliminar la renegociación");
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // If there's an active renegotiation, show delete button
  if (hasActiveRenegotiation) {
    return (
      <>
        <Button 
          variant="destructive" 
          className="gap-2"
          onClick={() => setShowDeleteConfirm1(true)}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar Renegociación
        </Button>

        {/* First confirmation */}
        <AlertDialog open={showDeleteConfirm1} onOpenChange={setShowDeleteConfirm1}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar la renegociación?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará la renegociación en curso y todos sus documentos asociados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowDeleteConfirm1(false);
                  setShowDeleteConfirm2(true);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Second confirmation */}
        <AlertDialog open={showDeleteConfirm2} onOpenChange={setShowDeleteConfirm2}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Eliminación de Renegociación</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro? Esta acción no se puede deshacer. Se eliminarán todos los borradores de la renegociación.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRenegotiation}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "Eliminar Definitivamente"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Renegociar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Renegociación</DialogTitle>
            <DialogDescription>
              Crea una nueva versión del contrato con condiciones actualizadas.
              La versión actual ({currentVersion.version_number}) quedará como histórico.
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
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
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
                  placeholder="Ej: 150"
                  value={initialRent}
                  onChange={(e) => setInitialRent(e.target.value)}
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="regimeRent">Canon en Régimen *</Label>
                <Input
                  id="regimeRent"
                  type="number"
                  placeholder="Ej: 200"
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
                <Label>Tipo de Aviso de Término *</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="noticeValue">
                {noticeType === "meses" ? "Meses de Anticipación *" : "Fecha de Aviso *"}
              </Label>
              {noticeType === "meses" ? (
                <Input
                  id="noticeValue"
                  type="number"
                  placeholder="Ej: 6"
                  value={noticeValue}
                  onChange={(e) => setNoticeValue(e.target.value)}
                  min={1}
                />
              ) : (
                <Input
                  id="noticeValue"
                  type="date"
                  value={noticeValue}
                  onChange={(e) => setNoticeValue(e.target.value)}
                />
              )}
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
            <DialogDescription>
              Mantiene las mismas condiciones comerciales con nueva duración y aviso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm">
              <p className="font-medium mb-2">Condiciones a mantener:</p>
              <div className="space-y-1 text-muted-foreground">
                <p>Canon Régimen: {formatCurrency(currentVersion.regime_rent)}</p>
                {currentVersion.initial_rent && (
                  <p>Canon Inicial: {formatCurrency(currentVersion.initial_rent)}</p>
                )}
                {currentVersion.variable_rent_percentage && (
                  <p>Arriendo Variable: {currentVersion.variable_rent_percentage}%</p>
                )}
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
                min={1}
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
