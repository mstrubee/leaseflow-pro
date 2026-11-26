import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { DistRow, DistributionCheck, percentsFor } from "@/lib/cebeDistribution";
import type { CebeOption } from "@/hooks/useCebeDistribution";

interface CebeDistributionEditorProps {
  cebes: CebeOption[];
  rows: DistRow[];
  /** Total del documento, en pesos. */
  totalClp: number;
  onEdit: (idx: number, field: "amount" | "percent", value: number) => void;
  check: DistributionCheck;
  disabled?: boolean;
}

const clp = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;
const fmtPct = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Mientras se tipea se muestra lo tipeado (para no pisar "30." o un campo vacío), SALVO que el valor
 * efectivo ya sea otro (p. ej. el sistema lo limitó para no pasar el total): ahí manda el efectivo.
 */
const shownText = (typedText: string, effective: number, tolerance: number): string => {
  const typed = parseFloat(typedText.replace(",", "."));
  const typedNum = Number.isFinite(typed) ? typed : 0;
  return Math.abs(typedNum - effective) <= tolerance ? typedText : String(effective);
};

const SOURCE_BADGE = {
  manual: { text: "Ingresado", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  auto: { text: "Calculado", className: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
  pending: { text: "Sin asignar", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
} as const;

/**
 * Distribución del gasto por CEBE (local mixto). Muestra SIEMPRE % y monto de cada CEBE; el
 * usuario puede escribir en cualquiera de los dos y el otro se calcula. Al editar un CEBE
 * otro absorbe la diferencia (ver lib/cebeDistribution.ts), así el total siempre cuadra.
 */
export const CebeDistributionEditor = ({ cebes, rows, totalClp, onEdit, check, disabled }: CebeDistributionEditorProps) => {
  // Mientras se tipea en un campo, se muestra lo tipeado (no el valor re-formateado).
  const [typing, setTyping] = useState<{ idx: number; field: "amount" | "percent"; text: string } | null>(null);
  const total = Math.round(totalClp || 0);
  const pcts = percentsFor(rows, total, 2);
  const sumAmount = rows.reduce((a, r) => a + r.amount, 0);
  const sumPct = pcts.reduce((a, b) => a + b, 0);
  const labelOf = (id: string) => cebes.find((c) => c.id === id)?.label ?? "CEBE";

  const handleChange = (idx: number, field: "amount" | "percent", text: string) => {
    setTyping({ idx, field, text });
    const n = parseFloat(text.replace(",", "."));
    onEdit(idx, field, Number.isFinite(n) ? n : 0);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="cebe-distribution">
      <div>
        <p className="text-sm font-semibold">Distribución del gasto por CEBE</p>
        <p className="text-xs text-muted-foreground">
          Este local tiene más de un CEBE: distribuye el gasto entre ellos. Puedes ingresar el % o el monto; el otro
          valor y el último CEBE se calculan solos.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
        <div className="col-span-5">CEBE</div>
        <div className="col-span-2 text-right">% Distribución</div>
        <div className="col-span-3 text-right">Monto ($)</div>
        <div className="col-span-2 text-right">Origen</div>
      </div>

      {rows.map((r, idx) => {
        const badge = SOURCE_BADGE[r.source];
        const typingPct = typing?.idx === idx && typing.field === "percent";
        const typingAmt = typing?.idx === idx && typing.field === "amount";
        return (
          <div key={r.cebeId} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5 text-sm truncate" title={labelOf(r.cebeId)}>{labelOf(r.cebeId)}</div>
            <div className="col-span-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                className="h-8 text-right"
                disabled={disabled || total <= 0}
                value={typingPct ? shownText(typing!.text, pcts[idx], 0.005) : String(pcts[idx])}
                onChange={(e) => handleChange(idx, "percent", e.target.value)}
                onBlur={() => setTyping(null)}
                aria-label={`% de ${labelOf(r.cebeId)}`}
              />
            </div>
            <div className="col-span-3">
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="h-8 text-right"
                disabled={disabled || total <= 0}
                value={typingAmt ? shownText(typing!.text, r.amount, 0.5) : String(r.amount)}
                onChange={(e) => handleChange(idx, "amount", e.target.value)}
                onBlur={() => setTyping(null)}
                aria-label={`Monto de ${labelOf(r.cebeId)}`}
              />
            </div>
            <div className="col-span-2 text-right">
              <Badge variant="secondary" className={`text-[10px] ${badge.className}`}>{badge.text}</Badge>
            </div>
          </div>
        );
      })}

      <div className="grid grid-cols-12 gap-2 items-center border-t pt-2 text-sm font-semibold">
        <div className="col-span-5">Total</div>
        <div className="col-span-2 text-right">{fmtPct(sumPct)}%</div>
        <div className="col-span-3 text-right">{clp(sumAmount)}</div>
        <div className="col-span-2 text-right text-xs font-normal text-muted-foreground">de {clp(total)}</div>
      </div>

      {check.valid ? (
        <div className="flex items-center gap-2 text-xs text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Distribución completa: 100% · {clp(total)}
        </div>
      ) : (
        <div className="flex items-start gap-2 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{check.errors[0]}</span>
        </div>
      )}
    </div>
  );
};
