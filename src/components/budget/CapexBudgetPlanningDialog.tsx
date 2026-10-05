import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { formatCLP } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, CalendarClock } from "lucide-react";
import { format, parseISO } from "date-fns";

/** Contrato que aporta al Arrastre: su CAPEX de "en curso"/"programado" cae,
 * según sus fechas reales de Gantt, en el año que se está planificando --
 * mismo shape que arma avanceBreakdownByYear en CapexDashboard.tsx. */
export interface CarryoverContractRow {
  contractName: string;
  company: string;
  clasificacion: string | null;
  uf: number;
  date: string | null;
}

interface BudgetItem {
  id: string;
  name: string;
  date: string;
  superficie_m2: number | null;
  valor_uf_m2: number | null;
}

interface Draft {
  id: string;
  year: number;
  status: "borrador" | "cerrado";
  closed_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetYear: number;
  ufValue: number;
  /** CAPEX ya comprometido en contratos para targetYear (todas las fechas
   *  reales de Gantt/Comité GP), en CLP -- mismo total que yearBreakdownTotal
   *  en /capex. */
  objetivoContratosCLP: number;
  /** Contratos "En Curso"/"Programado" cuyo CAPEX de targetYear ya estaba
   *  contemplado en el presupuesto de este año (arrastre). */
  arrastreRows: CarryoverContractRow[];
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return "-";
  }
};

export function CapexBudgetPlanningDialog({ open, onOpenChange, targetYear, ufValue, objetivoContratosCLP, arrastreRows }: Props) {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  // Edición local de superficie/UF por ítem (keyed por id) -- se guarda al
  // salir del campo (onBlur), no en cada tecla.
  const [edits, setEdits] = useState<Record<string, { superficie: string; valorUfM2: string }>>({});

  const isClosed = draft?.status === "cerrado";

  const load = async () => {
    setLoading(true);
    try {
      const yearStart = `${targetYear}-01-01`;
      const yearEnd = `${targetYear}-12-31`;

      const [{ data: draftData }, { data: itemsData }] = await Promise.all([
        (supabase as any).from("capex_budget_drafts").select("id, year, status, closed_at").eq("year", targetYear).maybeSingle(),
        (supabase as any)
          .from("gantt_overview_budget_items")
          .select("id, name, date, superficie_m2, valor_uf_m2")
          .gte("date", yearStart)
          .lte("date", yearEnd)
          .order("date", { ascending: true }),
      ]);

      setDraft(draftData || null);
      const loadedItems: BudgetItem[] = itemsData || [];
      setItems(loadedItems);
      setEdits(
        Object.fromEntries(
          loadedItems.map((it) => [it.id, { superficie: it.superficie_m2?.toString() ?? "", valorUfM2: it.valor_uf_m2?.toString() ?? "" }])
        )
      );
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar el borrador de presupuesto");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetYear]);

  const handleSaveItemValuation = async (itemId: string) => {
    const edit = edits[itemId];
    if (!edit) return;
    const superficie = edit.superficie.trim() === "" ? null : parseFloat(edit.superficie);
    const valorUfM2 = edit.valorUfM2.trim() === "" ? null : parseFloat(edit.valorUfM2);
    const { error } = await (supabase as any)
      .from("gantt_overview_budget_items")
      .update({ superficie_m2: superficie, valor_uf_m2: valorUfM2 })
      .eq("id", itemId);
    if (error) {
      toast.error("Error al guardar el valor del ítem");
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, superficie_m2: superficie, valor_uf_m2: valorUfM2 } : it)));
  };

  const itemClp = (it: BudgetItem): number => {
    if (!it.superficie_m2 || !it.valor_uf_m2) return 0;
    return it.superficie_m2 * it.valor_uf_m2 * (ufValue || 0);
  };

  const objetivoInformativosCLP = items.reduce((sum, it) => sum + itemClp(it), 0);
  const objetivoCLP = objetivoContratosCLP + objetivoInformativosCLP;
  const arrastreCLP = arrastreRows.reduce((sum, r) => sum + r.uf, 0) * (ufValue || 0);
  const aPedirCLP = objetivoCLP - arrastreCLP;

  const handleClose = async () => {
    if (!isAdmin) return;
    setClosing(true);
    try {
      const snapshot = {
        objetivoContratosCLP,
        objetivoInformativosCLP,
        objetivoCLP,
        arrastreCLP,
        aPedirCLP,
        arrastreRows,
        items: items.map((it) => ({ name: it.name, date: it.date, superficie_m2: it.superficie_m2, valor_uf_m2: it.valor_uf_m2, clp: itemClp(it) })),
      };
      const { data: userData } = await supabase.auth.getUser();
      if (draft) {
        const { error } = await (supabase as any)
          .from("capex_budget_drafts")
          .update({ status: "cerrado", snapshot, closed_at: new Date().toISOString(), closed_by: userData.user?.id })
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("capex_budget_drafts")
          .insert({ year: targetYear, status: "cerrado", snapshot, closed_at: new Date().toISOString(), closed_by: userData.user?.id });
        if (error) throw error;
      }
      toast.success(`Presupuesto ${targetYear} cerrado`);
      load();
    } catch (err) {
      console.error(err);
      toast.error("Error al cerrar el presupuesto");
    } finally {
      setClosing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Planificar Presupuesto {targetYear}
          </DialogTitle>
          <DialogDescription>
            Borrador de planificación, previo a que el presupuesto sea oficial/aprobado. Se recalcula en vivo hasta que se cierre.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            {isClosed && (
              <div className="flex items-center gap-2 text-sm bg-muted rounded-lg p-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Presupuesto {targetYear} cerrado el {draft?.closed_at ? fmtDate(draft.closed_at) : ""}. Ya no es editable.
              </div>
            )}

            {/* Contratos -- solo lectura */}
            <div className="space-y-1">
              <p className="text-sm font-medium">Contratos (comprometido real en {targetYear})</p>
              <p className="text-2xl font-bold">{formatCLP(objetivoContratosCLP)}</p>
              <p className="text-xs text-muted-foreground">Según fechas reales de Gantt/Comité GP de cada contrato -- mismo total que las cards de /capex para este año.</p>
            </div>

            {/* Ítems informativos -- editables */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Ítems de Presupuesto informativos (sin contrato)</p>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay ítems de la línea de tiempo general (/reports) con fecha en {targetYear}.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 border rounded-lg p-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{it.name}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Informativo, sin contrato</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{fmtDate(it.date)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          placeholder="m²"
                          className="w-20 h-8 text-xs"
                          disabled={isClosed}
                          value={edits[it.id]?.superficie ?? ""}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], superficie: e.target.value } }))}
                          onBlur={() => handleSaveItemValuation(it.id)}
                        />
                        <span className="text-xs text-muted-foreground">m² ×</span>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="UF/m²"
                          className="w-20 h-8 text-xs"
                          disabled={isClosed}
                          value={edits[it.id]?.valorUfM2 ?? ""}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], valorUfM2: e.target.value } }))}
                          onBlur={() => handleSaveItemValuation(it.id)}
                        />
                        <span className="text-xs text-muted-foreground">UF/m²</span>
                      </div>
                      <span className="text-sm font-semibold w-28 text-right shrink-0">{formatCLP(itemClp(it))}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-right text-sm font-medium">Subtotal informativos: {formatCLP(objetivoInformativosCLP)}</p>
            </div>

            {/* Arrastre -- solo lectura, con detalle */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Arrastre (contratos En Curso/Programado que ya pagan en {targetYear})</p>
              {arrastreRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay contratos en curso/programados con pago en {targetYear}.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {arrastreRows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b py-1">
                      <span className="truncate">{r.company} · {r.contractName}</span>
                      <span className="shrink-0 ml-2">{formatCLP(r.uf * (ufValue || 0))}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-right text-sm font-medium">Total arrastre: {formatCLP(arrastreCLP)}</p>
            </div>

            {/* Totales */}
            <div className="rounded-lg bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Objetivo (Contratos + Informativos)</span>
                <span className="font-semibold">{formatCLP(objetivoCLP)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Arrastre</span>
                <span className="font-semibold">− {formatCLP(arrastreCLP)}</span>
              </div>
              <div className="flex items-center justify-between text-base border-t pt-2">
                <span className="font-bold">A pedir</span>
                <span className={`font-bold ${aPedirCLP < 0 ? "text-destructive" : "text-green-600"}`}>{formatCLP(aPedirCLP)}</span>
              </div>
            </div>

            {!isClosed && (
              <div className="flex justify-end">
                <Button onClick={handleClose} disabled={!isAdmin || closing} title={!isAdmin ? "Solo un administrador puede cerrar el presupuesto" : undefined}>
                  {closing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                  Cerrar Presupuesto {targetYear}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
