import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarClock } from "lucide-react";
import { calculateEndDate } from "@/lib/ganttDateUtils";
import { format } from "date-fns";
import { scheduleMaintenanceTask } from "@/lib/scheduleMaintenanceTask";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string | null;
  formId: string;
  formNumber: string;
  /** Datos ya guardados si el form ya fue programado antes — precargan el
   *  formulario para editar en vez de partir de cero. */
  existingTaskId: string | null;
  existingName?: string | null;
  existingStartDate?: string | null;
  existingDurationDays?: number | null;
  onScheduled: (taskId: string) => void;
}

export function ScheduleMaintenanceDialog({
  open, onOpenChange, contractId, formId, formNumber,
  existingTaskId, existingName, existingStartDate, existingDurationDays, onScheduled,
}: Props) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(existingName || `Mantención Form ${formNumber}`);
    setStartDate(existingStartDate || "");
    setDurationDays(existingDurationDays ? String(existingDurationDays) : "");
  }, [open, existingName, existingStartDate, existingDurationDays, formNumber]);

  const durationNum = parseInt(durationDays, 10);
  const endDate = startDate && !isNaN(durationNum) && durationNum > 0
    ? format(calculateEndDate(startDate, durationNum, "calendar", []), "dd/MM/yyyy")
    : null;

  const handleSave = async () => {
    if (!contractId || !name.trim() || !startDate || isNaN(durationNum) || durationNum <= 0) return;
    setSaving(true);
    try {
      const result = await scheduleMaintenanceTask({
        contractId,
        formId,
        existingTaskId,
        name: name.trim(),
        startDate,
        durationDays: durationNum,
      });
      if ("error" in result) {
        toast({ variant: "destructive", title: "Error al programar", description: result.error });
        return;
      }
      toast({ title: existingTaskId ? "Programación actualizada" : "Tarea agregada al cronograma de mantenciones" });
      onScheduled(result.taskId);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-amber-500" />
            Programar en Cronograma de Mantenciones
          </DialogTitle>
          <DialogDescription>
            Crea (o actualiza) una tarea en el cronograma de mantenciones de este contrato para el FORM {formNumber}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre de la tarea</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cambio de filtros" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fecha de inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Plazo (días)</Label>
              <Input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de término</Label>
            <Input value={endDate || ""} readOnly className="bg-muted text-muted-foreground" placeholder="Se calcula con inicio + plazo" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !contractId || !name.trim() || !startDate || isNaN(durationNum) || durationNum <= 0}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
