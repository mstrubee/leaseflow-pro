import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, TrendingUp } from "lucide-react";

export interface Escalation {
  id?: string;
  month_number: number;
  amount: number;
}

interface RentEscalationsProps {
  escalations: Escalation[];
  onChange: (escalations: Escalation[]) => void;
  initialRent: number;
  regimeRent: number;
  durationMonths: number;
  readOnly?: boolean;
}

export const RentEscalations = ({
  escalations,
  onChange,
  initialRent,
  regimeRent,
  durationMonths,
  readOnly = false,
}: RentEscalationsProps) => {
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const formatCurrency = (amount: number) => {
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

    // Check if month already exists
    if (escalations.some((e) => e.month_number === month)) {
      return;
    }

    const newEscalations = [...escalations, { month_number: month, amount }]
      .sort((a, b) => a.month_number - b.month_number);
    
    onChange(newEscalations);
    setNewMonth("");
    setNewAmount("");
  };

  const handleRemove = (monthNumber: number) => {
    onChange(escalations.filter((e) => e.month_number !== monthNumber));
  };

  // Calculate rent timeline
  const getRentTimeline = () => {
    const timeline: { month: number; rent: number }[] = [];
    let currentRent = initialRent || regimeRent;

    for (let month = 1; month <= Math.min(durationMonths, 36); month++) {
      const escalation = escalations.find((e) => e.month_number === month);
      if (escalation) {
        currentRent = escalation.amount;
      }
      timeline.push({ month, rent: currentRent });
    }

    return timeline;
  };

  const timeline = getRentTimeline();
  const sortedEscalations = [...escalations].sort((a, b) => a.month_number - b.month_number);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Escalonamiento de Arriendo
        </CardTitle>
        <CardDescription>
          Define los cambios de canon mes a mes durante el período escalonado
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current escalations */}
        {sortedEscalations.length > 0 ? (
          <div className="space-y-2">
            <Label>Escalones definidos</Label>
            <div className="space-y-2">
              {sortedEscalations.map((escalation) => (
                <div
                  key={escalation.month_number}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Mes </span>
                      <span className="font-semibold">{escalation.month_number}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Canon: </span>
                      <span className="font-semibold text-primary">
                        {formatCurrency(escalation.amount)}
                      </span>
                    </div>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(escalation.month_number)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay escalones definidos. El canon se mantendrá constante.
          </p>
        )}

        {/* Add new escalation */}
        {!readOnly && (
          <div className="space-y-3 pt-4 border-t border-border">
            <Label>Agregar nuevo escalón</Label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Mes"
                  value={newMonth}
                  onChange={(e) => setNewMonth(e.target.value)}
                  min={1}
                  max={durationMonths}
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Monto (CLP)"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  min={0}
                />
              </div>
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
            <p className="text-xs text-muted-foreground">
              Indica el mes (1-{durationMonths}) en que cambia el canon y el nuevo monto
            </p>
          </div>
        )}

        {/* Timeline preview */}
        {(sortedEscalations.length > 0 || initialRent) && (
          <div className="space-y-3 pt-4 border-t border-border">
            <Label>Vista previa del escalonamiento</Label>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {timeline.slice(0, 24).map(({ month, rent }) => {
                const isEscalationMonth = escalations.some((e) => e.month_number === month);
                return (
                  <div
                    key={month}
                    className={`p-2 rounded text-center text-xs border ${
                      isEscalationMonth
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-muted/30 border-border"
                    }`}
                  >
                    <div className="font-medium">M{month}</div>
                    <div className="text-[10px] truncate">
                      {(rent / 1000000).toFixed(1)}M
                    </div>
                  </div>
                );
              })}
            </div>
            {durationMonths > 24 && (
              <p className="text-xs text-muted-foreground text-center">
                Mostrando primeros 24 meses de {durationMonths}
              </p>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
          <div>
            <p className="text-sm text-muted-foreground">Canon Inicial</p>
            <p className="text-lg font-semibold">{formatCurrency(initialRent || regimeRent)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Canon en Régimen</p>
            <p className="text-lg font-semibold">{formatCurrency(regimeRent)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
