import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CebeDistributionEditor } from "./CebeDistributionEditor";
import { useCebeDistribution, type CebeOption } from "@/hooks/useCebeDistribution";
import { withPercents } from "@/lib/cebeDistribution";
import { allocationsToRows, saveDistribution, syncPaymentSublines, type StoredAllocation } from "@/lib/cebeDistributionStore";

interface RequestCebeDistributionSectionProps {
  contractId: string;
  requestId: string;
  /** Total de la solicitud, en pesos. */
  totalClp: number;
  ufValue: number;
  cebes: CebeOption[];
  /** Distribución guardada (vacía si la solicitud no tiene). */
  distribution: StoredAllocation[];
  /** Solo se edita mientras la solicitud está pendiente. */
  editable: boolean;
  onChanged: () => void;
  /**
   * Distribución en edición (solo cuando está COMPLETA y válida), o null. Permite al padre mostrar el
   * desglose por CEBE de cada pago en vivo, antes de guardar.
   */
  onDraftChange?: (draft: { cebeId: string; amount: number }[] | null) => void;
}

const clp = (n: number) => `$ ${Math.round(n).toLocaleString("es-CL")}`;

/**
 * Distribución por CEBE de una solicitud existente (local mixto): la muestra y, si está pendiente,
 * permite editarla. Si la solicitud no tiene distribución (es anterior a esta función, o no se
 * pudo guardar al crearla) se pide aquí, con el mismo editor del resto de los flujos.
 */
export const RequestCebeDistributionSection = ({
  contractId,
  requestId,
  totalClp,
  ufValue,
  cebes,
  distribution,
  editable,
  onChanged,
  onDraftChange,
}: RequestCebeDistributionSectionProps) => {
  const { toast } = useToast();
  const dist = useCebeDistribution(cebes.map((c) => c.id), totalClp);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasStored = distribution.length >= 2;
  const showEditor = editing || (!hasStored && editable);

  // Borrador en edición -> el padre lo usa para previsualizar los pagos.
  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange(showEditor && dist.check.valid ? dist.rows.map((r) => ({ cebeId: r.cebeId, amount: r.amount })) : null);
    return () => onDraftChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditor, dist.check.valid, dist.rows]);
  const labelOf = (id: string) => cebes.find((c) => c.id === id)?.label ?? "CEBE";

  const startEdit = () => {
    dist.reset(hasStored ? allocationsToRows(distribution) : undefined);
    setEditing(true);
  };

  const save = async () => {
    if (!dist.check.valid) {
      toast({ variant: "destructive", title: "Distribución por CEBE inválida", description: dist.check.errors[0] });
      return;
    }
    setSaving(true);
    try {
      const ref = { kind: "request" as const, contractId, id: requestId };
      await saveDistribution(ref, dist.rows, totalClp);
      await syncPaymentSublines(ref, { ufValue });
      toast({ title: "Distribución por CEBE guardada" });
      setEditing(false);
      onChanged();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "No se pudo guardar la distribución" });
    } finally {
      setSaving(false);
    }
  };

  if (showEditor) {
    return (
      <div className="space-y-2">
        {!hasStored && !editing && (
          <p className="text-xs text-amber-700">Esta solicitud aún no tiene distribución por CEBE. Ingrésala para continuar.</p>
        )}
        <CebeDistributionEditor cebes={cebes} rows={dist.rows} totalClp={totalClp} onEdit={dist.edit} check={dist.check} disabled={saving} />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving || !dist.check.valid} className="gap-1">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar distribución
          </Button>
          {editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!hasStored) {
    return <p className="text-xs text-muted-foreground">Sin distribución por CEBE.</p>;
  }

  const rows = withPercents(allocationsToRows(distribution), totalClp, 2);
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm" data-testid="request-cebe-distribution">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Distribución del gasto por CEBE</p>
        {editable && (
          <Button size="sm" variant="outline" onClick={startEdit}>
            Editar distribución
          </Button>
        )}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium">CEBE</th>
            <th className="text-right font-medium">%</th>
            <th className="text-right font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cebeId}>
              <td>{labelOf(r.cebeId)}</td>
              <td className="text-right">{r.percent.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%</td>
              <td className="text-right">{clp(r.amount)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td>Total</td>
            <td className="text-right">100%</td>
            <td className="text-right">{clp(rows.reduce((a, r) => a + r.amount, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
