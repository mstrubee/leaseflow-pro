import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { formatCLP } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, CalendarClock, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CapexNewLocationOpexSection } from "./CapexNewLocationOpexSection";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

/** Totales por Estado de Avance (Terminado/En Curso/Programado/Caído) de un
 * año -- mismo shape que las cards de Estado de Avance de /capex. */
export interface AvanceTotalRow {
  name: string;
  color: string;
  uf: number;
  count: number;
  /** Nombres de los contratos que componen este total -- para listarlos
   *  debajo de la card (pedido explícito: "debajo de cada card, lista los
   *  proyectos Terminados/En Curso/Programados"), con la empresa asociada
   *  para mostrar su logo (pedido explícito). */
  names: { name: string; company: string }[];
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
  contract_id: string | null;
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
  /** Detalle, contrato por contrato, de todo lo que compone
   *  objetivoContratosCLP -- incluye también contratos con CAPEX 100% en
   *  targetYear (no cruzan de año, por lo que no aparecen en Arrastre, y si
   *  ya tienen Estado de Avance y Gantt tampoco aparecen en "datos
   *  incompletos"): sin esto, quedaban contando en el total sin que se
   *  pudiera ver su nombre en ningún lado. */
  objetivoContratosRows: Array<{ contractName: string; company: string; avanceStatus: string | null; targetYearUf: number }>;
  /** Desglose del presupuesto del AÑO ACTUAL (no targetYear) por Estado de
   *  Avance -- contexto de cómo quedó/se planificó ese año antes de
   *  proyectar el siguiente. */
  currentYearAvanceTotals: AvanceTotalRow[];
  /** Contratos que consumen presupuesto en AMBOS años (actual y targetYear)
   *  -- Arrastre preciso: se identifican por tener CAPEX != 0 en los dos
   *  años (contractYearAmounts), no solo por su Estado de Avance. */
  straddlingRows: StraddlingContractRow[];
  /** Disponible del Presupuesto Aprobado del año actual (aprobado - total
   *  comprometido + Caídos, siempre con Caídos incluidos para este cálculo)
   *  -- la otra mitad de Arrastre junto con straddlingRows: plata YA
   *  aprobada para el año actual que no se va a gastar este año y por lo
   *  tanto sí reduce cuánto hay que pedir de nuevo para targetYear. Puede
   *  ser negativo (presupuesto 2026 sobregirado). */
  disponibleCurrentYearCLP: number;
  /** Ids y nombres (normalizados, minúscula/trim) de TODOS los contratos que
   *  ya cuentan como CAPEX real en el dashboard -- para excluir de los
   *  Ítems de Presupuesto informativos cualquiera que ya represente a uno
   *  de estos contratos (vinculado por id, o por nombre en ítems antiguos
   *  de texto libre), evitando contarlo dos veces. También se pasa a
   *  CapexNewLocationOpexSection para el mismo filtro en Presupuesto
   *  Operativo. */
  realContractIds: Set<string>;
  realContractNames: Set<string>;
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

export function CapexBudgetPlanningDialog({ open, onOpenChange, targetYear, ufValue, objetivoContratosCLP, objetivoContratosRows, currentYearAvanceTotals, straddlingRows, disponibleCurrentYearCLP, realContractIds, realContractNames, missingDataRows, avanceStatusTypes, onAvanceStatusUpdated, onNoGanttYearHintUpdated, newLocationContractIds, currentYear }: Props) {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [savingAvanceFor, setSavingAvanceFor] = useState<string | null>(null);
  const [savingHintFor, setSavingHintFor] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [missingDataOpen, setMissingDataOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"capex" | "operativo">("capex");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  // Superficie Edificada Local + Total CAPEX (Business Case Financiero) de
  // cada ítem VINCULADO a un contrato (contract_id) -- ya no se ingresan a
  // mano acá, se leen directo del contrato. null si el contrato no tiene
  // uno de los dos datos cargado todavía.
  const [contractDataByItem, setContractDataByItem] = useState<Record<string, { superficie: number | null; capexClp: number | null }>>({});

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
          .select("id, name, date, contract_id")
          .gte("date", yearStart)
          .lte("date", yearEnd)
          .order("date", { ascending: true }),
      ]);

      setDraft(draftData || null);
      // Excluye ítems que ya representan un contrato que cuenta como CAPEX
      // real en el dashboard (vinculado por id, o por nombre en ítems
      // antiguos de texto libre) -- evita el doble conteo (ej. un contrato
      // que ya aparece en Arrastre, y además como "informativo"). Ver
      // realContractIds/realContractNames en CapexDashboard.tsx.
      const loadedItems: BudgetItem[] = (itemsData || []).filter((it: BudgetItem) => {
        if (it.contract_id) return !realContractIds.has(it.contract_id);
        return !realContractNames.has(it.name.trim().toLowerCase());
      });
      setItems(loadedItems);

      // Superficie Edificada Local (contracts) + Total CAPEX del Business
      // Case Financiero (contract_business_cases.computed) de cada ítem
      // vinculado a un contrato -- ya no se piden a mano, se leen de ahí.
      const linkedContractIds = Array.from(new Set(loadedItems.map((it) => it.contract_id).filter(Boolean))) as string[];
      if (linkedContractIds.length > 0) {
        const [{ data: contractRows }, { data: businessCaseRows }] = await Promise.all([
          supabase.from("contracts").select("id, superficie_edificada_local").in("id", linkedContractIds),
          supabase.from("contract_business_cases").select("contract_id, computed").in("contract_id", linkedContractIds),
        ]);
        const byContract: Record<string, { superficie: number | null; capexClp: number | null }> = {};
        (contractRows || []).forEach((c: any) => {
          byContract[c.id] = { superficie: c.superficie_edificada_local ?? null, capexClp: null };
        });
        (businessCaseRows || []).forEach((row: any) => {
          const computed = row.computed as { inv?: { total?: number; rows?: { id: string; monto: number }[] } } | null;
          const total = computed?.inv?.total;
          if (total == null) return;
          const inventario = computed?.inv?.rows?.find((r) => r.id === "inv")?.monto || 0;
          const capexClp = (total - inventario) * 1_000_000;
          byContract[row.contract_id] = { ...(byContract[row.contract_id] || { superficie: null }), capexClp };
        });
        setContractDataByItem(byContract);
      } else {
        setContractDataByItem({});
      }
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

  // Superficie Edificada Local + Total CAPEX (Business Case Financiero) del
  // contrato vinculado al ítem -- ya no se ingresan a mano (ver
  // contractDataByItem). Un ítem sin contrato vinculado, o cuyo contrato no
  // tiene ambos datos cargados, no aporta monto (debe completarse en la
  // ficha del contrato, no acá).
  const itemClp = (it: BudgetItem): number => {
    if (!it.contract_id) return 0;
    const d = contractDataByItem[it.contract_id];
    if (!d || !d.superficie || !d.capexClp) return 0;
    return d.capexClp;
  };

  const objetivoInformativosCLP = items.reduce((sum, it) => sum + itemClp(it), 0);
  const objetivoCLP = objetivoContratosCLP + objetivoInformativosCLP;
  // Arrastre = (a) contratos que YA tienen comprometido gasto en targetYear
  // porque cruzan de año (straddlingRows) + (b) plata YA aprobada para el
  // año actual que no se va a gastar este año (disponibleCurrentYearCLP,
  // incluye Caídos). Ninguno de los dos está restando el mismo peso del
  // Objetivo dos veces: (a) es sobre contratos específicos, (b) es sobre el
  // presupuesto aprobado global del año actual.
  const arrastreContratosCLP = straddlingRows.reduce((sum, r) => sum + r.targetYearUf, 0) * (ufValue || 0);
  const arrastreCLP = arrastreContratosCLP + disponibleCurrentYearCLP;
  const aPedirCLP = objetivoCLP - arrastreCLP;
  const currentYearAvanceTotalCLP = currentYearAvanceTotals.reduce((sum, t) => sum + t.uf, 0) * (ufValue || 0);
  // Las líneas marcadas "Terminado" ya tienen su año definido (no les falta
  // nada que completar acá) -- pedido explícito de no listarlas en "datos
  // incompletos".
  const missingDataRowsFiltered = missingDataRows.filter((r) => r.avanceStatus !== "Terminado");

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
        items: items.map((it) => ({ name: it.name, date: it.date, superficie: it.contract_id ? contractDataByItem[it.contract_id]?.superficie ?? null : null, clp: itemClp(it) })),
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
      <DialogContent
        className="max-w-7xl max-h-[85vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
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

            {/* Dos secciones -- CAPEX (Objetivo/Arrastre/A pedir, todo lo de
                siempre) y Operativo (Presupuesto Operativo de Nuevos
                Locales, aparte, no integra con los totales de CAPEX). */}
            <div className="flex gap-2">
              <Button
                variant={activeTab === "capex" ? "default" : "outline"}
                className="flex-1 basis-1/2"
                onClick={() => setActiveTab("capex")}
              >
                CAPEX
              </Button>
              <Button
                variant={activeTab === "operativo" ? "default" : "outline"}
                className="flex-1 basis-1/2"
                onClick={() => setActiveTab("operativo")}
              >
                Operativo
              </Button>
            </div>

            {activeTab === "capex" && (
            <>
            {/* 1. Presupuesto del año actual -- contexto, desglosado por
                Estado de Avance. Solo lectura. */}
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
                      {t.names.length > 0 && (
                        <ul className="text-[10px] text-muted-foreground leading-tight pt-1 space-y-1">
                          {t.names.map((n) => (
                            <li key={`${n.name}::${n.company}`} className="flex items-center gap-1">
                              <CompanyLogo companyName={n.company} size="sm" className="h-3.5 w-3.5 shrink-0" />
                              <span className="break-words">{n.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-right text-sm font-medium">Total {currentYear}: {formatCLP(currentYearAvanceTotalCLP)}</p>
            </div>

            {/* 2. Arrastre -- contratos que consumen presupuesto en AMBOS
                años (el actual y targetYear), con el monto de cada año por
                separado, para ser precisos en cuáles cruzan. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Arrastre de Presupuesto {currentYear} a {targetYear}</p>
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
              <p className="text-right text-xs text-muted-foreground">Subtotal contratos que cruzan: {formatCLP(arrastreContratosCLP)}</p>
              <p className="text-right text-xs text-muted-foreground">
                + Disponible Presupuesto Aprobado {currentYear} (incl. Caídos): {formatCLP(disponibleCurrentYearCLP)}
              </p>
              <p className="text-right text-sm font-medium">Total arrastre a {targetYear}: {formatCLP(arrastreCLP)}</p>
            </div>

            {/* 3. Contratos -- solo lectura. Sin scroll (pedido explícito) y
                el total al final, igual que el resto de las secciones. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Contratos (comprometido real en {targetYear})</p>
              <p className="text-xs text-muted-foreground">Según fechas reales de Gantt/Comité GP de cada contrato -- mismo total que las cards de /capex para este año.</p>
              {objetivoContratosRows.length > 0 && (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-1.5 font-medium">Contrato</th>
                        <th className="text-left p-1.5 font-medium">Empresa</th>
                        <th className="text-left p-1.5 font-medium">Avance</th>
                        <th className="text-right p-1.5 font-medium">{targetYear}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {objetivoContratosRows.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-1.5 break-words">{r.contractName}</td>
                          <td className="p-1.5 whitespace-nowrap">{r.company}</td>
                          <td className="p-1.5 whitespace-nowrap">{r.avanceStatus || "-"}</td>
                          <td className="text-right p-1.5 whitespace-nowrap">{formatCLP(r.targetYearUf * (ufValue || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-right text-sm font-medium">Total comprometido {targetYear}: {formatCLP(objetivoContratosCLP)}</p>
            </div>

            {/* 4. Ítems informativos -- Superficie Edificada Local y Total
                CAPEX (Business Case Financiero) se leen del contrato
                vinculado; ya no se pueden ingresar a mano acá. */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Ítems de Presupuesto informativos (sin contrato)</p>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay ítems de la línea de tiempo general (/reports) con fecha en {targetYear}.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => {
                    const d = it.contract_id ? contractDataByItem[it.contract_id] : null;
                    const hasData = !!d && !!d.superficie && !!d.capexClp;
                    return (
                      <div key={it.id} className="flex items-center gap-3 border rounded-lg p-2">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium break-words">{it.name}</span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">Informativo, sin contrato</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{fmtDate(it.date)}</span>
                          {hasData ? (
                            <p className="text-xs text-muted-foreground">
                              Superficie Edificada Local: {d!.superficie} m² · Total CAPEX (Business Case): {formatCLP(d!.capexClp!)}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600">
                              Gestionar Superficie y CAPEX en los datos del contrato
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-semibold w-28 text-right shrink-0">{formatCLP(itemClp(it))}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-right text-sm font-medium">Subtotal informativos: {formatCLP(objetivoInformativosCLP)}</p>
            </div>

            {/* 5. Contratos con datos incompletos (sin Estado de Avance y/o
                sin cronograma) -- tratados como los Ítems informativos: se
                completa lo que falta acá, sin re-pedir superficie/canon.
                Colapsada por defecto (pedido explícito) y sin las líneas
                "Terminado" (ya tienen su año definido, no les falta nada). */}
            {missingDataRowsFiltered.length > 0 && (
              <Collapsible open={missingDataOpen} onOpenChange={setMissingDataOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors">
                      {missingDataOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="text-sm font-medium flex-1">Contratos con datos incompletos para Objetivo/Arrastre ({missingDataRowsFiltered.length})</span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 pt-0 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Tienen CAPEX en {currentYear} o {targetYear} pero no se pudieron incluir arriba (Presupuesto por Estado de Avance / Arrastre) porque les falta el Estado de Avance y/o el cronograma Gantt -- muchos de estos SÍ tienen Estado de Avance cargado (se ve abajo), solo les falta el cronograma. Superficie y canon no se piden de nuevo -- ya están cargados en el contrato.
                      </p>
                      <div className="space-y-2">
                        {missingDataRowsFiltered.map((r) => (
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
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* 6. Total -- al final de la pestaña CAPEX (pedido explícito:
                antes de la sección Operativo). Arrastre se RESTA de
                Objetivo (no se suma aparte): los contratos de Arrastre ya
                están incluidos dentro de "Contratos (comprometido real
                {targetYear})" de la sección 3 (arrastreContratosCLP es un
                subconjunto de objetivoContratosCLP, no un monto adicional),
                así que no hay doble conteo acá. */}
            <div className="rounded-lg bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between text-base">
                <span className="font-bold">TOTAL PRESUPUESTO {targetYear}</span>
                <span className="font-bold">{formatCLP(objetivoCLP)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Arrastre (ya incluido arriba, no se suma de nuevo)</span>
                <span className="font-semibold">− {formatCLP(arrastreCLP)}</span>
              </div>
              <div className="flex items-center justify-between text-base border-t pt-2">
                <span className="font-bold">A pedir</span>
                <span className={`font-bold ${aPedirCLP < 0 ? "text-destructive" : "text-green-600"}`}>{formatCLP(aPedirCLP)}</span>
              </div>
            </div>
            </>
            )}

            {/* Presupuesto Operativo de Nuevos Locales -- bloque informativo
                paralelo, no integra con Objetivo/Arrastre/A pedir de CAPEX. */}
            {activeTab === "operativo" && (
              <CapexNewLocationOpexSection
                contractIds={newLocationContractIds}
                currentYear={currentYear}
                targetYear={targetYear}
                ufValue={ufValue}
                realContractIds={realContractIds}
                realContractNames={realContractNames}
              />
            )}

            {!isClosed && !previewMode && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Salir
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
