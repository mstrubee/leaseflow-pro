import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, TrendingUp, TrendingDown, Minus, CheckCircle2 } from "lucide-react";
import { RenegotiationDraft } from "@/hooks/useRenegotiationDrafts";

interface CompareItem {
  type: "current" | "draft";
  id: string;
  name: string;
  data: any;
  escalations?: Array<{ month_number: number; amount: number }>;
}

interface RenegotiationCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CompareItem[];
}

export function RenegotiationCompareDialog({
  open,
  onOpenChange,
  items,
}: RenegotiationCompareDialogProps) {
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "-";
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    return `${value}%`;
  };

  const formatMonths = (months: number | null | undefined) => {
    if (months === null || months === undefined) return "-";
    return `${months} meses`;
  };

  const getChangeIndicator = (current: number | null | undefined, proposed: number | null | undefined) => {
    if (current === null || current === undefined || proposed === null || proposed === undefined) {
      return null;
    }
    if (proposed > current) {
      const percentChange = ((proposed - current) / current * 100).toFixed(1);
      return (
        <span className="flex items-center text-xs text-green-600">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{percentChange}%
        </span>
      );
    } else if (proposed < current) {
      const percentChange = ((current - proposed) / current * 100).toFixed(1);
      return (
        <span className="flex items-center text-xs text-red-600">
          <TrendingDown className="h-3 w-3 mr-1" />
          -{percentChange}%
        </span>
      );
    }
    return (
      <span className="flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-1" />
        Sin cambio
      </span>
    );
  };

  const fields = [
    { key: "initial_rent", label: "Canon Inicial", format: formatCurrency },
    { key: "regime_rent", label: "Canon Régimen", format: formatCurrency },
    { key: "variable_rent_percentage", label: "Arriendo Variable", format: formatPercentage },
    { key: "duration_months", label: "Duración", format: formatMonths },
    { key: "notice_value", label: "Aviso", format: (v: any, item: CompareItem) => 
      item.data.notice_type === "meses" ? `${v} meses` : v 
    },
    { key: "guarantee_multiplier", label: "Multiplicador Garantía", format: (v: number) => v ? `${v}x` : "-" },
    { key: "grace_months", label: "Meses de Gracia", format: formatMonths },
    { key: "gastos_comunes_uf_m2", label: "GGCC (UF/m²)", format: formatCurrency },
    { key: "gastos_comunes_percentage", label: "GGCC (%)", format: formatPercentage },
    { key: "fondo_promocion_percentage", label: "Fondo Promoción", format: formatPercentage },
    { key: "otros_egresos_amount", label: "Otros Egresos", format: formatCurrency },
  ];

  const baseItem = items[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Comparar Condiciones</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${items.length}, 1fr)` }}>
            {/* Header row */}
            <div className="font-medium text-sm text-muted-foreground p-2">Campo</div>
            {items.map((item, index) => (
              <Card key={item.id} className={item.type === "current" ? "border-primary/50 bg-primary/5" : ""}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {item.type === "current" && (
                      <Badge variant="default" className="text-xs">Actual</Badge>
                    )}
                    {item.name}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}

            {/* Data rows */}
            {fields.map((field) => (
              <>
                <div key={`label-${field.key}`} className="text-sm font-medium p-2 flex items-center border-b">
                  {field.label}
                </div>
                {items.map((item, index) => {
                  const value = item.data[field.key];
                  const formatted = field.format(value, item);
                  const showChange = index > 0 && baseItem;
                  
                  return (
                    <div
                      key={`${item.id}-${field.key}`}
                      className={`p-2 border-b ${item.type === "current" ? "bg-primary/5" : ""}`}
                    >
                      <div className="text-sm font-medium">{formatted}</div>
                      {showChange && typeof value === "number" && typeof baseItem.data[field.key] === "number" && (
                        <div className="mt-1">
                          {getChangeIndicator(baseItem.data[field.key], value)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ))}

            {/* Escalations row */}
            <div className="text-sm font-medium p-2 flex items-center border-b">
              Escalonamientos
            </div>
            {items.map((item) => (
              <div
                key={`${item.id}-escalations`}
                className={`p-2 border-b ${item.type === "current" ? "bg-primary/5" : ""}`}
              >
                {item.escalations && item.escalations.length > 0 ? (
                  <div className="space-y-1">
                    {item.escalations.map((esc) => (
                      <div key={esc.month_number} className="text-xs">
                        Mes {esc.month_number}: {formatCurrency(esc.amount)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin escalonamientos</span>
                )}
              </div>
            ))}

            {/* Periodic adjustments row */}
            <div className="text-sm font-medium p-2 flex items-center border-b">
              Ajustes Periódicos
            </div>
            {items.map((item) => (
              <div
                key={`${item.id}-adjustments`}
                className={`p-2 border-b ${item.type === "current" ? "bg-primary/5" : ""}`}
              >
                {item.data.has_periodic_adjustments ? (
                  <div className="text-xs space-y-1">
                    <div>Inicio: Mes {item.data.first_adjustment_month}</div>
                    <div>Cada: {item.data.adjustment_periodicity_months} meses</div>
                    <div>
                      Valor: {item.data.adjustment_type === "percentage" 
                        ? `${item.data.adjustment_value}%` 
                        : formatCurrency(item.data.adjustment_value)}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin ajustes</span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
