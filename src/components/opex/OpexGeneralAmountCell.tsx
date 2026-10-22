import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import { parseClpInput } from "@/lib/opexPlanning";

export interface GeneralAmountBreakdownRow {
  name: string;
  companyNames: string[];
  amountClp: number;
}

interface OpexGeneralAmountCellProps {
  // Parte general (sin contrato) de la categoría: es lo único que se edita aquí.
  value: number;
  saving: boolean;
  // Montos de la misma categoría que vienen de contratos (solo lectura).
  breakdown: GeneralAmountBreakdownRow[];
  ariaLabel: string;
  onCommit: (amountClp: number) => void;
}

const formatNumber = (value: number) => (value > 0 ? Math.round(value).toLocaleString("es-CL") : "");
const formatClp = (value: number) => `$ ${Math.round(value).toLocaleString("es-CL")}`;

// Celda editable del "OPEX agregado" general: Enter o salir de la celda guarda,
// Escape cancela, vacío o 0 borra el monto general.
export const OpexGeneralAmountCell = ({ value, saving, breakdown, ariaLabel, onCommit }: OpexGeneralAmountCellProps) => {
  const [draft, setDraft] = useState(formatNumber(value));
  const [focused, setFocused] = useState(false);
  // Escape cancela: evita que el blur posterior guarde lo escrito.
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(formatNumber(value));
  }, [value, focused]);

  const commit = () => {
    const parsed = parseClpInput(draft);
    if (parsed === null) {
      toast.error("Ingresa un monto en CLP válido (solo números)");
      setDraft(formatNumber(value));
      return;
    }
    if (Math.round(parsed) === Math.round(value)) {
      setDraft(formatNumber(value));
      return;
    }
    onCommit(Math.round(parsed));
  };

  const contractsTotal = breakdown.reduce((sum, row) => sum + row.amountClp, 0);

  return (
    <div className="flex items-center justify-end gap-1">
      {breakdown.length > 0 && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <button type="button" aria-label="Ver desglose del OPEX agregado" className="text-muted-foreground hover:text-foreground">
              <Info className="h-4 w-4" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 text-sm space-y-2">
            <div className="flex justify-between">
              <span>General (editable aquí)</span>
              <span className="font-medium">{formatClp(value)}</span>
            </div>
            <div className="border-t pt-2 space-y-1">
              <p className="text-xs text-muted-foreground">Desde contratos (solo lectura, se editan en "Asignar OPEX"):</p>
              {breakdown.map((row) => (
                <div key={row.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CompanyLogo companyNames={row.companyNames} size="sm" />
                    <span className="truncate">{row.name}</span>
                  </div>
                  <span>{formatClp(row.amountClp)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Total agregado</span>
              <span>{formatClp(value + contractsTotal)}</span>
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
      <Input
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder="—"
        disabled={saving}
        className="h-8 w-32 text-right"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (cancelRef.current) {
            cancelRef.current = false;
            setDraft(formatNumber(value));
            return;
          }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelRef.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
};
