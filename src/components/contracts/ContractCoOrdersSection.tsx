import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { CoOrderDraft, newDraft, parseCoAmount, sumCoAmounts } from "@/lib/coOrders";

interface ContractCoOrdersSectionProps {
  /** Valor UF del día, solo para mostrar el equivalente informativo. */
  ufValue?: number;
  drafts: CoOrderDraft[];
  onChange: (drafts: CoOrderDraft[]) => void;
  /** Solo el ADMIN puede editar; el resto ve la información en solo lectura. */
  canEdit: boolean;
  /** CEBE disponibles (de contract_cebes) para asignar a cada CO. Vacío = no se muestra el selector. */
  cebeOptions?: { key: string; label: string }[];
}

const NO_CEBE = "__none__";
const formatClp = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;
const formatUf = (n: number) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Órdenes CO del contrato (una por línea). La suma de los montos es el
 * "Monto Congelado" del CAPEX y reemplaza al congelado manual.
 */
export const ContractCoOrdersSection = ({ drafts, onChange, canEdit, cebeOptions = [], ufValue = 0 }: ContractCoOrdersSectionProps) => {
  const update = (key: string, patch: Partial<CoOrderDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const remove = (key: string) => onChange(drafts.filter((d) => d.key !== key));

  const hasCebes = cebeOptions.length > 0;
  const total = sumCoAmounts(drafts.map((d) => ({ amount_clp: parseCoAmount(d.amount) })));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-base">Órdenes CO</Label>
          <p className="text-xs text-muted-foreground">
            La suma de los montos es el Monto Congelado del CAPEX de este proyecto y reemplaza al
            monto congelado manual. Se incluye en cada Solicitud de OC de CAPEX.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 shrink-0"
            onClick={() => onChange([...drafts, newDraft()])}
          >
            <Plus className="h-3 w-3" /> Agregar Orden CO
          </Button>
        )}
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "Sin Órdenes CO. Rige el monto congelado establecido por el administrador."
            : "Sin Órdenes CO."}
        </p>
      ) : (
        <div className="space-y-2">
          {drafts.map((d, idx) => (
            <div key={d.key} className="grid grid-cols-12 gap-2 items-end">
              <div className={`${hasCebes ? "col-span-4" : "col-span-6"} space-y-1`}>
                {idx === 0 && <Label className="text-xs">ORDEN CO</Label>}
                <Input
                  value={d.co_number}
                  onChange={(e) => update(d.key, { co_number: e.target.value })}
                  placeholder="Ej: CO-12345"
                  disabled={!canEdit}
                  maxLength={100}
                />
              </div>
              <div className={`${hasCebes ? "col-span-3" : "col-span-5"} space-y-1`}>
                {idx === 0 && <Label className="text-xs">Monto ($)</Label>}
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={d.amount}
                  onChange={(e) => update(d.key, { amount: e.target.value })}
                  placeholder="0"
                  disabled={!canEdit}
                />
              </div>
              {hasCebes && (
                <div className="col-span-4 space-y-1">
                  {idx === 0 && <Label className="text-xs">CEBE</Label>}
                  <Select
                    value={cebeOptions.some((o) => o.key === d.cebeKey) ? d.cebeKey : NO_CEBE}
                    onValueChange={(v) => update(d.key, { cebeKey: v === NO_CEBE ? "" : v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CEBE}>Sin asignar</SelectItem>
                      {cebeOptions.map((o) => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-1">
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => remove(d.key)}
                    aria-label="Eliminar Orden CO"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Monto Congelado (suma de CO):</span>
            <span className="font-semibold">
              {total > 0 ? formatClp(total) : "—"}
              {total > 0 && ufValue > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ≈ UF {formatUf(total / ufValue)}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
