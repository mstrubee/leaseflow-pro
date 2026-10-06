import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { formatCLP } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, CalendarClock, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CapexNewLocationOpexSection } from "./CapexNewLocationOpexSection";

/** Totales por Estado de Avance (Terminado/En Curso/Programado/Caído) de un
 * año -- mismo shape que las cards de Estado de Avance de /capex. */
export interface AvanceTotalRow {
  name: string;
  color: string;
  uf: number;
  count: number;
}

/** Contrato que CONSUME presupuesto en AMBOS años (el actual y el
 * siguiente que se está planificando) -- "cruza" de un año a otro. */
export interface StraddlingContractRow {
  contractName: string;
  company: string;
  clasificacion: string | null;
  avanceStatus: string | null;
  currentYearUf: number;
  targetYearUf: number;
  date: string | null;
  /** true si este contrato no tiene Gantt y entró a Arrastre solo por el
   *  hint manual (capex_no_gantt_year_hint), no porque su CAPEX esté
   *  realmente repartido entre los dos años. */
  isManualNoGanttCarryover: boolean;
}

/** Contrato con CAPEX en el año actual o targetYear pero SIN Estado de
 * Avance cargado y/o SIN cronograma Gantt -- tratado igual que los Ítems
 * informativos: se completa lo que falta acá, sin re-pedir superficie/canon
 * (ya están en los datos del contrato). */
export interface MissingDataContractRow {
  contractId: string;
  contractName: string;
  company: string;
  superficie: number;
  hasGantt: boolean;
  currentYearUf: number;
  targetYearUf: number;
  /** Año asignado manualmente (contracts.capex_no_gantt_year_hint) para
   *  tratar este contrato como arrastre mientras no tenga Gantt -- null si
   *  no se ha definido. Se ignora solo apenas el contrato tenga Gantt. */
  noGanttYearHint: number | null;
  /** Estado de Avance YA cargado del contrato (puede no ser null -- un
   *  contrato puede estar acá solo porque le falta el Gantt, con su Estado
   *  de Avance completo; no asumir que "está en esta lista" == "sin Estado
   *  de Avance"). */
  avanceStatus: string | null;
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
  /** Desglose del presupuesto del AÑO ACTUAL (no targetYear) por Estado de
   *  Avance -- contexto de cómo quedó/se planificó ese año antes de
   *  proyectar el siguiente. */
  currentYearAvanceTotals: AvanceTotalRow[];
  /** Contratos que consumen presupuesto en AMBOS años (actual y targetYear)
   *  -- Arrastre preciso: se identifican por tener CAPEX != 0 en los dos
   *  años (contractYearAmounts), no solo por su Estado de Avance. */
  straddlingRows: StraddlingContractRow[];
  /** Contratos con CAPEX en alguno de los dos años pero sin Estado de
   *  Avance y/o sin cronograma -- se completan acá. */
  missingDataRows: MissingDataContractRow[];
  /** Tipos de Estado de Avance administrables (Admin > Estados y
   *  Categorías), para el selector de cada contrato en missingDataRows. */
  avanceStatusTypes: Array<{ id: string; name: string; color: string }>;
  /** Llamado después de guardar el Estado de Avance de un contrato, para que
   *  el dashboard actualice su estado local SIN recargar todo (evita el
   *  "refresh" completo de la página al elegir una opción acá). */
  onAvanceStatusUpdated?: (contractId: string, statusName: string) => void;
  /** Llamado después de guardar el año de arrastre manual (sin Gantt) de un
   *  contrato, mismo motivo que onAvanceStatusUpdated. */
  onNoGanttYearHintUpdated?: (contractId: string, year: number) => void;
  /** Ids de contratos clasificación "Nuevo" con CAPEX presupuestado en el
   *  año en curso o en targetYear -- base del bloque "Presupuesto Operativo
   *  de Nuevos Locales" (sección aparte, no se mezcla con Objetivo/Arrastre). */
  newLocationContractIds: string[];
  /** Año en curso (el primero de los dos años que cubre el bloque de nuevos
   *  locales; el segundo es targetYear). */
  currentYear: number;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return "-";
  }
};

export function CapexBudgetPlanningDialog({ open, onOpenChange, targetYear, ufValue, objetivoContratosCLP, currentYearAvanceTotals, straddlingRows, missingDataRows, avanceStatusTypes, onAvanceStatusUpdated, onNoGanttYearHintUpdated, newLocationContractIds, currentYear }: Props) {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAvanceFor, setSavingAvanceFor] = useState<string | null>(null);
  const [savingHintFor, setSavingHintFor] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  // Edición local de superficie/UF por ítem (keyed por id) -- se guarda al
  // salir del campo (onBlur) o al presionar "Guardar", no en cada tecla.
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

  // "Guardar": persiste de una vez todos los ítems editados (por si el
  // usuario usó las flechitas del input numérico sin pasar por un blur, o
  // simplemente quiere confirmar que todo quedó guardado antes de cerrar).
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(items.map((it) => handleSaveItemValuation(it.id)));
      toast.success("Borrador guardado");
    } finally {
      setSaving(false);
    }
  };

  // Completa el Estado de Avance de un contrato que hoy no lo tiene -- igual
  // que editarlo desde la ficha del contrato, pero sin salir de esta
  // herramienta. Superficie/canon no se piden de nuevo: ya están en los
  // datos del contrato.
  const handleSetAvanceStatus = async (contractId: string, statusName: string) => {
    setSavingAvanceFor(contractId);
    try {
      const { error } = await (supabase as any).from("contracts").update({ capex_avance_status: statusName }).eq("id", contractId);
      if (error) throw error;
      toast.success("Estado de Avance guardado");
      onAvanceStatusUpdated?.(contractId, statusName);
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar el Estado de Avance");
    } finally {
      setSavingAvanceFor(null);
    }
  };

  // Marca manualmente a qué año atribuir el CAPEX completo de un contrato
  // SIN Gantt, para que cuente como arrastre (ver contractYearAmounts en
  // CapexDashboard.tsx: solo se usa mientras el contrato no tenga Gantt --
  // apenas se cargue uno, se ignora solo y se reemplaza por la
  // programación real de desembolsos).
  const handleSetNoGanttYearHint = async (contractId: string, year: number) => {
    setSavingHintFor(contractId);
    try {
      const { error } = await (supabase as any).from("contracts").update({ capex_no_gantt_year_hint: year }).eq("id", contractId);
      if (error) throw error;
      toast.success("Año de arrastre guardado");
      onNoGanttYearHintUpdated?.(contractId, year);
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar el año de arrastre");
    } finally {
      setSavingHintFor(null);
    }
  };

  const itemClp = (it: BudgetItem): number => {
    if (!it.superficie_m2 || !it.valor_uf_m2) return 0;
    return it.superficie_m2 * it.valor_uf_m2 * (ufValue || 0);
  };

  const objetivoInformativosCLP = items.reduce((sum, it) => sum + itemClp(it), 0);
  const objetivoCLP = objetivoContratosCLP + objetivoInformativosCLP;
  const arrastreCLP = straddlingRows.reduce((sum, r) => sum + r.targetYearUf, 0) * (ufValue || 0);
  const aPedirCLP = objetivoCLP - arrastreCLP;
  const currentYearAvanceTotalCLP = currentYearAvanceTotals.reduce((sum, t) => sum + t.uf, 0) * (ufValue || 0);

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
        straddlingRows,
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
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
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

            {previewMode && !isClosed && (
              <div className="flex items-center justify-between gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                <span>Vista previa -- así se vería el presupuesto si lo cierras ahora. Nada se guarda al salir de acá.</span>
                <Button size="sm" variant="outline" onClick={() => setPreviewMode(false)}>Volver a editar</Button>
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
                    <div key={it.id} className="flex items-center gap-3 border rounded-lg p-2">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium break-words">{it.name}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Informativo, sin contrato</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{fmtDate(it.date)}</span>
                      </div>
                      {previewMode || isClosed ? (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {it.superficie_m2 ?? "-"} m² × {it.valor_uf_m2 ?? "-"} UF/m²
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <Input
                            type="number"
                            placeholder="m²"
                            className="w-20 h-8 text-xs"
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
                            value={edits[it.id]?.valorUfM2 ?? ""}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], valorUfM2: e.target.value } }))}
                            onBlur={() => handleSaveItemValuation(it.id)}
                          />
                          <span className="text-xs text-muted-foreground">UF/m²</span>
                        </div>
                      )}
                      <span className="text-sm font-semibold w-28 text-right shrink-0">{formatCLP(itemClp(it))}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-right text-sm font-medium">Subtotal informativos: {formatCLP(objetivoInformativosCLP)}</p>
            </div>

            {/* Presupuesto del año actual -- contexto, desglosado por Estado
                de Avance. Solo lectura. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Presupuesto {currentYear} por Estado de Avance</p>
              {currentYearAvanceTotals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay CAPEX con Estado de Avance cargado en {currentYear}.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {currentYearAvanceTotals.map((t) => (
                    <div key={t.name} className="border rounded-lg p-2 space-y-0.5">
                      <p className="text-xs text-muted-foreground">{t.name} ({t.count})</p>
                      <p className="text-sm font-semibold">{formatCLP(t.uf * (ufValue || 0))}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-right text-sm font-medium">Total {currentYear}: {formatCLP(currentYearAvanceTotalCLP)}</p>
            </div>

            {/* Arrastre -- contratos que consumen presupuesto en AMBOS años
                (el actual y targetYear), con el monto de cada año por
                separado, para ser precisos en cuáles cruzan. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Arrastre -- contratos que consumen presupuesto en {currentYear} Y {targetYear}</p>
              {straddlingRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ningún contrato tiene CAPEX distinto de cero en ambos años.</p>
              ) : (
                <div className="overflow-x-auto max-h-56 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left p-1.5 font-medium">Contrato</th>
                        <th className="text-left p-1.5 font-medium">Empresa</th>
                        <th className="text-left p-1.5 font-medium">Avance</th>
                        <th className="text-right p-1.5 font-medium">{currentYear}</th>
                        <th className="text-right p-1.5 font-medium">{targetYear}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {straddlingRows.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-1.5 break-words">
                            {r.contractName}
                            {r.isManualNoGanttCarryover && (
                              <Badge variant="outline" className="text-[9px] ml-1">manual, sin Gantt</Badge>
                            )}
                          </td>
                          <td className="p-1.5 whitespace-nowrap">{r.company}</td>
                          <td className="p-1.5 whitespace-nowrap">{r.avanceStatus || "-"}</td>
                          <td className="text-right p-1.5 whitespace-nowrap">{formatCLP(r.currentYearUf * (ufValue || 0))}</td>
                          <td className="text-right p-1.5 whitespace-nowrap font-medium">{formatCLP(r.targetYearUf * (ufValue || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-right text-sm font-medium">Total arrastre a {targetYear}: {formatCLP(arrastreCLP)}</p>
            </div>

            {/* Contratos con datos incompletos (sin Estado de Avance y/o sin
                cronograma) -- tratados como los Ítems informativos: se
                completa lo que falta acá, sin re-pedir superficie/canon. */}
            {missingDataRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Contratos con datos incompletos para Objetivo/Arrastre</p>
                <p className="text-xs text-muted-foreground">
                  Tienen CAPEX en {currentYear} o {targetYear} pero no se pudieron incluir arriba (Presupuesto por Estado de Avance / Arrastre) porque les falta el Estado de Avance y/o el cronograma Gantt -- muchos de estos SÍ tienen Estado de Avance cargado (se ve abajo), solo les falta el cronograma. Superficie y canon no se piden de nuevo -- ya están cargados en el contrato.
                </p>
                <div className="space-y-2">
                  {missingDataRows.map((r) => (
                    <div key={r.contractId} className="flex items-center gap-3 border rounded-lg p-2">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium break-words">{r.contractName}</span>
                          <span className="text-xs text-muted-foreground">{r.company}</span>
                          {r.avanceStatus ? (
                            <Badge variant="outline" className="text-[10px]">Avance: {r.avanceStatus}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Sin Estado de Avance</Badge>
                          )}
                          {!r.hasGantt && <Badge variant="outline" className="text-[10px]">Sin cronograma Gantt</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {r.superficie > 0 ? `${r.superficie} m² · ` : ""}
                          {currentYear}: {formatCLP(r.currentYearUf * (ufValue || 0))} · {targetYear}: {formatCLP(r.targetYearUf * (ufValue || 0))}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!r.avanceStatus && (
                          <Select
                            disabled={savingAvanceFor === r.contractId}
                            onValueChange={(v) => handleSetAvanceStatus(r.contractId, v)}
                          >
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue placeholder="Estado de Avance" />
                            </SelectTrigger>
                            <SelectContent>
                              {avanceStatusTypes.map((t) => (
                                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {!r.hasGantt && (
                          <Select
                            disabled={savingHintFor === r.contractId}
                            value={r.noGanttYearHint ? String(r.noGanttYearHint) : undefined}
                            onValueChange={(v) => handleSetNoGanttYearHint(r.contractId, Number(v))}
                          >
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue placeholder="Año de arrastre" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={String(currentYear)}>Se gasta en {currentYear}</SelectItem>
                              <SelectItem value={String(targetYear)}>Arrastra a {targetYear}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sin cronograma Gantt, el monto de un contrato cae entero en un solo año -- "Año de arrastre" permite definir manualmente en cuál. Se reemplaza automáticamente apenas se cargue un cronograma Gantt.
                </p>
              </div>
            )}

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

            {/* Presupuesto Operativo de Nuevos Locales -- bloque informativo
                paralelo, no integra con Objetivo/Arrastre/A pedir de arriba
                (esos siguen siendo CAPEX puro). */}
            <CapexNewLocationOpexSection
              contractIds={newLocationContractIds}
              currentYear={currentYear}
              targetYear={targetYear}
              ufValue={ufValue}
            />

            {!isClosed && !previewMode && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleSaveAll} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setPreviewMode(true)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Vista Previa
                </Button>
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
