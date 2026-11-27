import { useLayoutEffect, useRef, useState } from "react";
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

const fmtAmount = (n: number) => Math.round(n).toLocaleString("es-CL");

/** Solo dígitos (máx. 12: hasta 999 mil millones). */
const digitsOf = (s: string) => s.replace(/\D/g, "").slice(0, 12);
/** "1234567" -> "1.234.567" (separador de miles mientras se escribe). */
const groupThousands = (digits: string) => (digits ? Number(digits).toLocaleString("es-CL") : "");

/**
 * Normaliza lo tipeado en un campo de %: dígitos y una coma (o punto) con hasta 2 decimales, entero
 * de hasta 3 dígitos y sin ceros a la izquierda ("05" -> "5", "," -> "0,").
 */
const sanitizePercent = (raw: string): string => {
  const t = raw.replace(/[^\d.,]/g, "");
  const sep = t.search(/[.,]/);
  if (sep === -1) return t.replace(/^0+(?=\d)/, "").slice(0, 3);
  const intPart = t.slice(0, sep).replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3) || "0";
  const dec = t.slice(sep + 1).replace(/\D/g, "").slice(0, 2);
  return `${intPart},${dec}`;
};
const parsePercent = (text: string): number => {
  const n = parseFloat(text.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Mientras se escribe se muestra lo tipeado (para no pisar "30," ni un campo en blanco), SALVO que el
 * valor efectivo ya sea otro (p. ej. el sistema lo limitó para no pasar el total): ahí manda el efectivo.
 * Un campo en blanco se deja en blanco hasta que se confirma (Enter o clic en otro campo).
 */
const shownAmount = (typedText: string, effective: number): string => {
  if (typedText === "") return "";
  return Number(digitsOf(typedText)) === Math.round(effective) ? typedText : fmtAmount(effective);
};
const shownPercent = (typedText: string, effective: number): string => {
  if (typedText === "") return "";
  return Math.abs(parsePercent(typedText) - effective) <= 0.005 ? typedText : fmtPct(effective);
};

type Field = "amount" | "percent";

/**
 * Campo de monto con separador de miles en vivo ("1.234.567"). Al dar formato el texto cambia de largo:
 * se recuerda cuántos dígitos había a la izquierda del cursor y se repone el cursor en ese mismo lugar.
 * Al entrar al campo se selecciona todo, para poder escribir encima sin borrar a mano.
 */
const AmountField = ({
  value,
  onDigits,
  onCommit,
  ...rest
}: {
  value: string;
  onDigits: (digits: string) => void;
  onCommit: () => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">) => {
  const ref = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  const justFocused = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (caretDigits.current === null || !el || document.activeElement !== el) return;
    let seen = 0;
    let pos = 0;
    while (pos < el.value.length && seen < caretDigits.current) {
      if (/\d/.test(el.value[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  });

  return (
    <Input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        caretDigits.current = digitsOf(raw.slice(0, e.target.selectionStart ?? raw.length)).length;
        onDigits(digitsOf(raw));
      }}
      // Backspace/Suprimir pegado a un punto de miles: borra el dígito vecino (borrar solo el punto no cambiaría
      // nada porque el formato lo vuelve a poner).
      onKeyDown={(e) => {
        const el = e.currentTarget;
        const start = el.selectionStart;
        if (start === null || start !== el.selectionEnd) return;
        const left = digitsOf(el.value.slice(0, start));
        const right = digitsOf(el.value.slice(start));
        if (e.key === "Backspace" && start > 0 && el.value[start - 1] === ".") {
          e.preventDefault();
          caretDigits.current = Math.max(0, left.length - 1);
          onDigits(digitsOf(left.slice(0, -1) + right));
        } else if (e.key === "Delete" && el.value[start] === ".") {
          e.preventDefault();
          caretDigits.current = left.length;
          onDigits(digitsOf(left + right.slice(1)));
        }
      }}
      onFocus={(e) => {
        justFocused.current = true;
        e.currentTarget.select();
      }}
      // El primer clic que da foco no debe deshacer la selección; los siguientes colocan el cursor.
      onMouseUp={(e) => {
        if (justFocused.current) e.preventDefault();
        justFocused.current = false;
      }}
      onBlur={() => {
        justFocused.current = false;
        onCommit();
      }}
    />
  );
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
  const [typing, setTyping] = useState<{ idx: number; field: Field; text: string } | null>(null);
  const justFocusedPct = useRef(false);
  const total = Math.round(totalClp || 0);
  const pcts = percentsFor(rows, total, 2);
  const sumAmount = rows.reduce((a, r) => a + r.amount, 0);
  const sumPct = pcts.reduce((a, b) => a + b, 0);
  const labelOf = (id: string) => cebes.find((c) => c.id === id)?.label ?? "CEBE";

  // Escribir recalcula en vivo, salvo que el campo quede en blanco: eso espera a confirmarse.
  const handleAmountDigits = (idx: number, digits: string) => {
    setTyping({ idx, field: "amount", text: groupThousands(digits) });
    if (digits !== "") onEdit(idx, "amount", Number(digits));
  };
  const handlePercentText = (idx: number, raw: string) => {
    const text = sanitizePercent(raw);
    setTyping({ idx, field: "percent", text });
    if (text !== "") onEdit(idx, "percent", parsePercent(text));
  };
  // Enter o clic en otro campo: un campo en blanco vale 0 (el otro toma el total; con 3 o más CEBE, la cascada reparte).
  const commit = () => {
    if (typing && typing.text === "") onEdit(typing.idx, typing.field, 0);
    setTyping(null);
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
        <div className="col-span-4">CEBE</div>
        <div className="col-span-2 text-right">% Distribución</div>
        <div className="col-span-4 text-right">Monto ($)</div>
        <div className="col-span-2 text-right">Origen</div>
      </div>

      {rows.map((r, idx) => {
        const badge = SOURCE_BADGE[r.source];
        const typingPct = typing?.idx === idx && typing.field === "percent";
        const typingAmt = typing?.idx === idx && typing.field === "amount";
        return (
          <div key={r.cebeId} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4 text-sm truncate" title={labelOf(r.cebeId)}>{labelOf(r.cebeId)}</div>
            <div className="col-span-2">
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="h-8 text-right"
                disabled={disabled || total <= 0}
                value={typingPct ? shownPercent(typing!.text, pcts[idx]) : fmtPct(pcts[idx])}
                onChange={(e) => handlePercentText(idx, e.target.value)}
                onFocus={(e) => {
                  justFocusedPct.current = true;
                  e.currentTarget.select();
                }}
                onMouseUp={(e) => {
                  if (justFocusedPct.current) e.preventDefault();
                  justFocusedPct.current = false;
                }}
                onBlur={() => {
                  justFocusedPct.current = false;
                  commit();
                }}
                aria-label={`% de ${labelOf(r.cebeId)}`}
              />
            </div>
            <div className="col-span-4">
              <AmountField
                className="h-8 text-right"
                disabled={disabled || total <= 0}
                value={typingAmt ? shownAmount(typing!.text, r.amount) : fmtAmount(r.amount)}
                onDigits={(digits) => handleAmountDigits(idx, digits)}
                onCommit={commit}
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
        <div className="col-span-4">Total</div>
        <div className="col-span-2 text-right">{fmtPct(sumPct)}%</div>
        <div className="col-span-4 text-right">{clp(sumAmount)}</div>
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
