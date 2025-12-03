import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CurrentVersion {
  id: string;
  version_number: number;
  initial_rent: number | null;
  regime_rent: number;
  duration_months: number;
  notice_type: string;
  notice_value: string;
}

interface RenegotiationDialogProps {
  contractId: string;
  currentVersion: CurrentVersion;
  onSuccess: () => void;
}

export const RenegotiationDialog = ({
  contractId,
  currentVersion,
  onSuccess,
}: RenegotiationDialogProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [initialRent, setInitialRent] = useState(
    currentVersion.initial_rent?.toString() || ""
  );
  const [regimeRent, setRegimeRent] = useState(currentVersion.regime_rent.toString());
  const [durationMonths, setDurationMonths] = useState(
    currentVersion.duration_months.toString()
  );
  const [noticeType, setNoticeType] = useState<"meses" | "fecha">(
    currentVersion.notice_type as "meses" | "fecha"
  );
  const [noticeValue, setNoticeValue] = useState(currentVersion.notice_value);
  const [effectiveDate, setEffectiveDate] = useState("");

  const handleSave = async () => {
    if (!regimeRent || !durationMonths || !noticeValue || !effectiveDate) {
      toast.error("Por favor completa todos los campos requeridos");
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
          duration_months: parseInt(durationMonths),
          notice_type: noticeType,
          notice_value: noticeValue,
          effective_date: effectiveDate,
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
  };

  return (
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

          {/* Effective date */}
          <div className="space-y-2">
            <Label htmlFor="effectiveDate">Fecha de Vigencia *</Label>
            <Input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Fecha desde la cual aplican las nuevas condiciones
            </p>
          </div>

          {/* New conditions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initialRent">Canon Inicial (opcional)</Label>
              <Input
                id="initialRent"
                type="number"
                placeholder="Ej: 5000000"
                value={initialRent}
                onChange={(e) => setInitialRent(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="regimeRent">Canon en Régimen *</Label>
              <Input
                id="regimeRent"
                type="number"
                placeholder="Ej: 6000000"
                value={regimeRent}
                onChange={(e) => setRegimeRent(e.target.value)}
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
  );
};
