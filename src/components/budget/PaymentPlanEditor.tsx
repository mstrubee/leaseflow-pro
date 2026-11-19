import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  PaymentPlanRow,
  PaymentInputMode,
  appendPayment,
  formatPaymentAmount,
  paymentDecimals,
  resolvePaymentPlan,
  switchPaymentMode,
} from "@/lib/paymentPlan";

const formatPercent = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`;

interface PaymentPlanEditorProps<T extends PaymentPlanRow> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Total del plan, en la moneda del plan. */
  total: number;
  currency: "CLP" | "UF";
  /** Si viene, se muestra la conversión de cada pago a la otra moneda: UF referencial
   *  en planes en pesos, o pesos en planes en UF. */
  ufValue?: number;
  /** Crea un pago nuevo (cada diálogo puede tener campos extra). */
  newItem: (index: number) => T;
  title?: string;
}

/**
 * Editor de plan de pagos compartido. Cada pago se define por monto o por % del
 * total; el ÚLTIMO pago es el saldo y se recalcula solo, en tiempo real, a
 * partir de los anteriores (ver lib/paymentPlan.ts). El plan siempre cuadra
 * con el total, salvo que los pagos anteriores ya lo superen (se avisa).
 */
export function PaymentPlanEditor<T extends PaymentPlanRow>({
  items,
  onChange,
  total,
  currency,
  ufValue,
  newItem,
  title = "Plan de Pagos *",
}: PaymentPlanEditorProps<T>) {
  const resolved = resolvePaymentPlan(items, total, paymentDecimals(currency));
  const symbol = currency === "UF" ? "UF" : "$";

  const update = (index: number, patch: Partial<T>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            // "Pago único" deja de tener sentido al sumar un segundo pago.
            const base =
              items.length === 1 && items[0].description === "Pago único"
                ? items.map((it) => ({ ...it, description: "Pago 1" }))
                : items;
            onChange(appendPayment(base, resolved, newItem(items.length)));
          }}
          className="h-7 gap-1"
        >
          <Plus className="h-3 w-3" />
          Agregar Pago
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Agrega al menos un pago.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            const mode: PaymentInputMode = item.input_mode ?? "amount";
            const r = resolved.payments[idx];
            return (
              <div key={idx} className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={item.description}
                    onChange={(e) => update(idx, { description: e.target.value } as Partial<T>)}
                    placeholder={`Pago ${idx + 1}`}
                    className="h-8 text-xs flex-1 min-w-0"
                    aria-label={`Descripción del pago ${idx + 1}`}
                  />
                  {isLast ? (
                    <Badge variant="secondary" className="h-8 px-2 shrink-0 text-[11px] font-medium">
                      {items.length === 1 ? "Total" : "Saldo"}
                    </Badge>
                  ) : (
                    <Select
                      value={mode}
                      onValueChange={(v) => onChange(items.map((it, i) => (i === idx ? switchPaymentMode(it, v as PaymentInputMode, r) : it)))}
                    >
                      <SelectTrigger className="h-8 w-[4.5rem] shrink-0 text-xs" aria-label={`Tipo de monto del pago ${idx + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">{symbol}</SelectItem>
                        <SelectItem value="percent">%</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {isLast ? (
                    <div
                      className="h-8 w-32 shrink-0 flex items-center justify-end px-2 border rounded-md bg-muted/50 text-xs font-mono"
                      aria-label={`Monto del pago ${idx + 1} (calculado)`}
                    >
                      {formatPaymentAmount(r.amount, currency)}
                    </div>
                  ) : mode === "percent" ? (
                    <Input
                      type="number"
                      value={item.percent ?? ""}
                      onChange={(e) => update(idx, { percent: e.target.value } as Partial<T>)}
                      placeholder="% del total"
                      min="0"
                      max="100"
                      step="0.01"
                      className="h-8 text-xs w-32 shrink-0"
                      aria-label={`Porcentaje del pago ${idx + 1}`}
                    />
                  ) : (
                    <Input
                      type="number"
                      value={item.amount}
                      onChange={(e) => update(idx, { amount: e.target.value } as Partial<T>)}
                      placeholder={`Monto ${symbol}`}
                      min="0"
                      step={currency === "UF" ? "0.0001" : "1"}
                      className="h-8 text-xs w-32 shrink-0"
                      aria-label={`Monto del pago ${idx + 1}`}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                    aria-label={`Quitar pago ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {!isLast && mode === "percent"
                      ? `= ${formatPaymentAmount(r.amount, currency)}`
                      : `= ${formatPercent(r.percent)} del total`}
                    {ufValue && ufValue > 0 && r.amount > 0
                      ? currency === "CLP"
                        ? ` · ≈ ${formatPaymentAmount(r.amount / ufValue, "UF")}`
                        : ` · ≈ ${formatPaymentAmount(r.amount * ufValue, "CLP")}`
                      : ""}
                  </span>
                  <Input
                    type="date"
                    value={item.due_date}
                    onChange={(e) => update(idx, { due_date: e.target.value } as Partial<T>)}
                    className="h-7 text-xs w-36"
                    aria-label={`Vencimiento del pago ${idx + 1}`}
                  />
                </div>
              </div>
            );
          })}

          <div className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total planificado</span>
              <span className="font-medium">{formatPaymentAmount(resolved.planned, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatPaymentAmount(total, currency)}</span>
            </div>
            {resolved.overflow > 0 && (
              <p className="text-destructive pt-0.5">
                Los pagos anteriores superan el total por {formatPaymentAmount(resolved.overflow, currency)}; el último
                pago no puede ser negativo. Ajusta los montos.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
