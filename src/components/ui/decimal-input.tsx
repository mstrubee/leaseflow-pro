import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * Input numérico que acepta "," o "." indistintamente como separador
 * decimal (siempre se muestra con ","), y permite dejar el campo vacío
 * mientras se edita sin forzar un 0 — si se sale (blur) dejándolo vacío o
 * con algo no numérico, vuelve a mostrar el último valor válido.
 *
 * onChange SOLO se dispara con un número válido, nunca con null/0 por
 * vaciado — así un campo vacío "de paso" no puede pisar un cálculo aguas
 * abajo con 0: el consumidor simplemente sigue viendo el último valor
 * válido hasta que se tipee uno nuevo.
 */
export interface DecimalInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "onBlur" | "onFocus"> {
  value: number | string | null | undefined;
  onChange: (value: number | null) => void;
  /** Si viene, formatea a esta cantidad fija de decimales cuando el campo no tiene foco. */
  decimals?: number;
  allowNegative?: boolean;
}

function parseDraft(raw: string): number | null {
  const normalized = raw.replace(/,/g, ".");
  if (normalized === "" || normalized === "-") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatValue(value: number | string | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : parseDraft(String(value));
  if (n === null || !Number.isFinite(n)) return "";
  const s = decimals != null ? n.toFixed(decimals) : String(n);
  return s.replace(".", ",");
}

export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, decimals, allowNegative = true, className, onKeyDown, ...props }, ref) => {
    const [draft, setDraft] = React.useState(() => formatValue(value, decimals));
    const focused = React.useRef(false);

    // Resincroniza desde el valor del padre solo cuando el input no tiene
    // foco — evita pisar lo que el usuario está tipeando si el padre
    // re-renderiza por otra razón mientras se edita este campo.
    React.useEffect(() => {
      if (!focused.current) setDraft(formatValue(value, decimals));
    }, [value, decimals]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value;
      // Filtra a dígitos + un separador decimal (, o .) + signo inicial opcional.
      const sign = allowNegative && raw.startsWith("-") ? "-" : "";
      raw = raw.replace(/[^0-9.,]/g, "");
      const firstSepIdx = raw.search(/[.,]/);
      let intPart = firstSepIdx === -1 ? raw : raw.slice(0, firstSepIdx);
      let decPart = firstSepIdx === -1 ? "" : raw.slice(firstSepIdx + 1).replace(/[.,]/g, "");
      intPart = intPart.replace(/[.,]/g, "");
      const next = sign + intPart + (firstSepIdx === -1 ? "" : "," + decPart);
      setDraft(next);
      const parsed = parseDraft(next.replace(",", "."));
      if (parsed !== null) onChange(parsed);
    };

    const handleFocus = () => {
      focused.current = true;
    };

    const handleBlur = () => {
      focused.current = false;
      const parsed = parseDraft(draft.replace(",", "."));
      // Vacío o inválido al salir: vuelve a mostrar el último valor válido
      // del padre, no persiste el vacío ni lo guarda en 0.
      setDraft(parsed === null ? formatValue(value, decimals) : formatValue(parsed, decimals));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur();
      onKeyDown?.(e);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        className={className}
        value={draft}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
DecimalInput.displayName = "DecimalInput";
