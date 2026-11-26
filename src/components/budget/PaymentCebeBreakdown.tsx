import { buildPaymentSublines } from "@/lib/cebeDistribution";
import type { CebeOption } from "@/hooks/useCebeDistribution";

interface PaymentCebeBreakdownProps {
  /** Monto del pago, en pesos. */
  amountClp: number;
  /** Distribución de la OC (fuente de verdad); solo importan cebeId y amount. */
  distribution: { cebeId: string; amount: number }[];
  cebes: CebeOption[];
}

const clp = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;

/**
 * Desglose por CEBE de UNA línea del plan de pagos. Se calcula con la distribución de la OC
 * (el usuario no vuelve a ingresarla) y es lo mismo que se guarda en oc_payment_plan_cebes.
 * Plegable para mantener limpia la lista de pagos.
 */
export const PaymentCebeBreakdown = ({ amountClp, distribution, cebes }: PaymentCebeBreakdownProps) => {
  const pay = Math.round(amountClp || 0);
  if (distribution.length < 2 || pay <= 0) return null;
  const sublines = buildPaymentSublines([pay], distribution)[0];
  const labelOf = (id: string) => cebes.find((c) => c.id === id)?.label ?? "CEBE";

  return (
    <details className="mt-1 rounded-md border bg-muted/20 px-2 py-1 text-xs" data-testid="payment-cebe-breakdown">
      <summary className="cursor-pointer select-none text-muted-foreground">Desglose por CEBE</summary>
      <table className="mt-1 w-full">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium w-8">#</th>
            <th className="text-left font-medium">CEBE</th>
            <th className="text-right font-medium">%</th>
            <th className="text-right font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {sublines.map((s, i) => (
            <tr key={s.cebeId}>
              <td>{i + 1}</td>
              <td className="truncate max-w-[16rem]" title={labelOf(s.cebeId)}>{labelOf(s.cebeId)}</td>
              <td className="text-right">{s.percent.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%</td>
              <td className="text-right">{clp(s.amount)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td />
            <td>Total del pago</td>
            <td className="text-right">100%</td>
            <td className="text-right">{clp(pay)}</td>
          </tr>
        </tbody>
      </table>
    </details>
  );
};
