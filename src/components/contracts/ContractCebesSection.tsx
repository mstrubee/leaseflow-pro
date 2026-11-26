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
 * CEBE por empresa: ÚNICA fuente del CEBE del contrato para todo el sistema. Cada CEBE pertenece a
 * UNA empresa. Con una sola empresa el CEBE se asigna solo a ella (un local normal tiene un CEBE);
 * con varias empresas, o varios CEBE, cada uno elige su empresa (local mixto).
 */
export const ContractCebesSection = ({ companyIds, companyNames, drafts, onChange, canEdit }: ContractCebesSectionProps) => {
  const noCompany = companyIds.length === 0;
  const singleCompany = companyIds.length === 1;

  const update = (key: string, patch: Partial<CebeDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-base">CEBE por empresa</Label>
          <p className="text-xs text-muted-foreground">
            {noCompany
              ? "Asigna primero una empresa al contrato para poder cargar su CEBE."
              : singleCompany
                ? "Código CEBE del local; se asigna solo a la empresa del contrato. Si el local es mixto, agrega un CEBE por cada uno."
                : "Este contrato tiene más de una empresa: asigna cada CEBE a la empresa que corresponda."}
            {" "}Cada Orden CO puede asignarse luego a uno de estos CEBE.
          </p>
        </div>
        {canEdit && !noCompany && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 shrink-0"
            onClick={() => onChange([...drafts, newCebeDraft(singleCompany ? companyIds[0] : "")])}
          >
            <Plus className="h-3 w-3" /> Agregar CEBE
          </Button>
        )}
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{noCompany ? "Sin empresa asignada." : "Sin CEBE por empresa."}</p>
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
                    disabled={!canEdit || singleCompany}
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
