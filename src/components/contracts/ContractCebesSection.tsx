import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { CebeDraft, newCebeDraft } from "@/lib/contractCebes";

interface ContractCebesSectionProps {
  /** Empresas actualmente asignadas al contrato. */
  companyIds: string[];
  companyNames: Record<string, string>;
  drafts: CebeDraft[];
  onChange: (drafts: CebeDraft[]) => void;
  canEdit: boolean;
}

/**
 * CEBE adicionales por empresa. Solo aparece cuando el contrato tiene más de una empresa
 * (o ya tiene CEBE por empresa guardados). Cada CEBE pertenece a UNA empresa.
 * El CEBE principal del contrato (campo personalizado) no se modifica aquí.
 */
export const ContractCebesSection = ({ companyIds, companyNames, drafts, onChange, canEdit }: ContractCebesSectionProps) => {
  if (companyIds.length < 2 && drafts.length === 0) return null;

  const update = (key: string, patch: Partial<CebeDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-base">CEBE por empresa</Label>
          <p className="text-xs text-muted-foreground">
            Este contrato tiene más de una empresa: asigna cada CEBE a la empresa que corresponda.
            Cada Orden CO puede asignarse luego a uno de estos CEBE.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 shrink-0"
            onClick={() => onChange([...drafts, newCebeDraft(companyIds.length === 1 ? companyIds[0] : "")])}
          >
            <Plus className="h-3 w-3" /> Agregar CEBE
          </Button>
        )}
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin CEBE por empresa.</p>
      ) : (
        <div className="space-y-2">
          {drafts.map((d, idx) => {
            const orphan = !!d.company_id && !companyIds.includes(d.company_id);
            return (
              <div key={d.key} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1">
                  {idx === 0 && <Label className="text-xs">CEBE</Label>}
                  <Input
                    value={d.cebe}
                    onChange={(e) => update(d.key, { cebe: e.target.value })}
                    placeholder="Ej: H04C8P1290"
                    disabled={!canEdit}
                    maxLength={50}
                  />
                </div>
                <div className="col-span-6 space-y-1">
                  {idx === 0 && <Label className="text-xs">Empresa</Label>}
                  <Select
                    value={d.company_id || undefined}
                    onValueChange={(v) => update(d.key, { company_id: v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className={orphan ? "border-destructive" : undefined}>
                      <SelectValue placeholder="Selecciona la empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyIds.map((id) => (
                        <SelectItem key={id} value={id}>{companyNames[id] || "Empresa"}</SelectItem>
                      ))}
                      {orphan && (
                        <SelectItem value={d.company_id} disabled>
                          {(companyNames[d.company_id] || "Empresa") + " (ya no está en el contrato)"}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}
                      aria-label="Eliminar CEBE"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
