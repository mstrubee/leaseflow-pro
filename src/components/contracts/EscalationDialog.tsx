import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, TrendingUp, Loader2 } from "lucide-react";

export interface Escalation {
  id?: string;
  month_number: number;
  amount: number;
  is_uf_m2?: boolean;
}

interface EscalationDialogProps {
  escalations: Escalation[];
  initialRent: number;
  regimeRent: number;
  durationMonths: number;
  onSave: (escalations: Escalation[]) => Promise<void>;
  trigger?: React.ReactNode;
  superficieM2?: number;
}

export const EscalationDialog = ({
  escalations: initialEscalations,
  initialRent,
  regimeRent,
  durationMonths,
  onSave,
  trigger,
  superficieM2 = 0,
}: EscalationDialogProps) => {
  const [open, setOpen] = useState(false);
  const [escalations, setEscalations] = useState<Escalation[]>(initialEscalations);
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newIsUfM2, setNewIsUfM2] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amount: number, isUfM2: boolean = false) => {
    if (isUfM2) {
      return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} UF/m²`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(amount);
  };

  const handleAdd = () => {
    const month = parseInt(newMonth);
    const amount = parseFloat(newAmount);

    if (isNaN(month) || isNaN(amount) || month < 1 || month > durationMonths) {
      return;
    }

    if (escalations.some((e) => e.month_number === month)) {
      return;
    }

    const newEscalations = [...escalations, { month_number: month, amount, is_uf_m2: newIsUfM2 }]
      .sort((a, b) => a.month_number - b.month_number);
    
    setEscalations(newEscalations);
    setNewMonth("");
    setNewAmount("");
    setNewIsUfM2(false);
  };

  const handleRemove = (monthNumber: number) => {
    setEscalations(escalations.filter((e) => e.month_number !== monthNumber));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(escalations);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setEscalations(initialEscalations);
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Arriendo Escalonado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Gestionar Escalonamiento
          </DialogTitle>
          <DialogDescription>
            Agrega o modifica los escalones de arriendo mes a mes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Canon Inicial</p>
              <p className="text-lg font-semibold">{formatCurrency(initialRent || regimeRent)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Canon en Régimen</p>
              <p className="text-lg font-semibold">{formatCurrency(regimeRent)}</p>
            </div>
          </div>

          {/* Current escalations */}
          {escalations.length > 0 ? (
            <div className="space-y-2">
              <Label>Escalones definidos ({escalations.length})</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {escalations.map((escalation, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Mes</span>
                      <Input
                        type="number"
                        className="w-[70px] h-8 text-sm"
                        value={escalation.month_number}
                        min={1}
                        max={durationMonths}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val)) return;
                          const updated = [...escalations];
                          updated[idx] = { ...updated[idx], month_number: val };
                          setEscalations(updated);
                        }}
                        onBlur={() => {
                          setEscalations(prev => [...prev].sort((a, b) => a.month_number - b.month_number));
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Canon:</span>
                      <Input
                        type="number"
                        className="h-8 text-sm flex-1 min-w-[80px]"
                        value={escalation.amount}
                        min={0}
                        step="0.001"
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val)) return;
                          const updated = [...escalations];
                          updated[idx] = { ...updated[idx], amount: val };
                          setEscalations(updated);
                        }}
                      />
                      {superficieM2 > 0 && (
                        <Select
                          value={escalation.is_uf_m2 ? "uf_m2" : "fixed"}
                          onValueChange={(v) => {
                            const updated = [...escalations];
                            updated[idx] = { ...updated[idx], is_uf_m2: v === "uf_m2" };
                            setEscalations(updated);
                          }}
                        >
                          <SelectTrigger className="w-[72px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fijo</SelectItem>
                            <SelectItem value="uf_m2">UF/m²</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {escalation.is_uf_m2 && superficieM2 > 0 && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        (UF {(escalation.amount * superficieM2).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(escalation.month_number)}
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">
              No hay escalones definidos. Agrega uno para comenzar.
            </p>
          )}

          {/* Add new escalation */}
          <div className="space-y-3 pt-4 border-t border-border">
            <Label>Agregar nuevo escalón</Label>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder={`Mes (1-${durationMonths})`}
                  value={newMonth}
                  onChange={(e) => setNewMonth(e.target.value)}
                  min={1}
                  max={durationMonths}
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder={newIsUfM2 ? "UF/m²" : "Monto"}
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  min={0}
                  step="0.001"
                />
              </div>
              {superficieM2 > 0 && (
                <Select value={newIsUfM2 ? "uf_m2" : "fixed"} onValueChange={(v) => setNewIsUfM2(v === "uf_m2")}>
                  <SelectTrigger className="w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fijo</SelectItem>
                    <SelectItem value="uf_m2">UF/m²</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!newMonth || !newAmount}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
            {newIsUfM2 && superficieM2 > 0 && parseFloat(newAmount) > 0 && (
              <p className="text-xs text-muted-foreground">
                Total: UF {(parseFloat(newAmount) * superficieM2).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({superficieM2.toLocaleString("es-CL")} m²)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Indica el mes (1-{durationMonths}) en que cambia el canon y el nuevo monto
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
