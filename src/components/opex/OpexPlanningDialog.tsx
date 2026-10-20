import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarRange, Globe, Merge, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CompanyLogo, getCompanyNames } from "@/components/contracts/CompanyLogo";
import { OpexPlanLines } from "@/components/opex/OpexPlanLines";
import { OpexGeneralAmountCell } from "@/components/opex/OpexGeneralAmountCell";
import { OpexCategoryChangeDialog, type CategoryActionMode } from "@/components/opex/OpexCategoryChangeDialog";
import { OpexCategoryChangesPanel } from "@/components/opex/OpexCategoryChangesPanel";
import { useOpexCategoryChanges } from "@/components/opex/useOpexCategoryChanges";
import { resolveCategoryId } from "@/lib/opexCategories";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  buildCategoryPlan,
  buildPlanLines,
  droppedByRetirement,
  monthsElapsed,
  orderAmountClp,
  rankBy,
  sumByMonth,
  type PlanLine,
  type PlanningItem,
  type PlanningOrder,
} from "@/lib/opexPlanning";

interface OpexPlanningDialogProps {
  // Año con datos reales; se planifica baseYear + 1.
  baseYear: number;
  ufValue: number;
  // Para que la página recargue categorías cuando el ADMIN crea, fusiona, renombra o retira una.
  onCategoriesChange?: () => void;
  // Contratos vigentes (estado "firmado"), ya cargados por la página.
  contracts: Array<{ id: string; name: string; company_names?: string[] }>;
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DEFAULT_INDEXATION_PCT = 3.2;

const formatClp = (value: number) => `$ ${Math.round(value).toLocaleString("es-CL")}`;

const GLOBAL_KEY = "__global__";
const NEW_CATEGORY_VALUE = "__new__";

export const OpexPlanningDialog = ({ baseYear, ufValue, onCategoriesChange, contracts }: OpexPlanningDialogProps) => {
  const { isAdmin, user } = useAuth();
  const planYear = baseYear + 1;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [items, setItems] = useState<PlanningItem[]>([]);
  // OC OPEX excluidas (tachadas) de la propuesta del año planificado.
  const [excludedOrderIds, setExcludedOrderIds] = useState<Set<string>>(new Set());
  const [busyLineKey, setBusyLineKey] = useState<string | null>(null);
  // Edición directa del OPEX general en "Por categoría".
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [pendingGeneral, setPendingGeneral] = useState<{ categoryId: string; amount: number } | null>(null);
  const [indexationPct, setIndexationPct] = useState(DEFAULT_INDEXATION_PCT);

  // Formulario "Agregar OPEX": GLOBAL_KEY (sin contrato) o el id de un contrato vigente.
  const [contractSearch, setContractSearch] = useState("");
  const [activeFormKey, setActiveFormKey] = useState<string | null>(null);
  // Fusionar, renombrar y retirar categorías (rigen desde el año planificado).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [changeDialog, setChangeDialog] = useState<{ mode: CategoryActionMode; sourceIds: string[]; batchId?: string } | null>(null);
  const [retireConfirmId, setRetireConfirmId] = useState<string | null>(null);

  const months = useMemo(() => monthsElapsed(baseYear), [baseYear]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, itemsRes, exclusionsRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select(
            "id, order_number, description, amount_clp, amount_uf, order_date, opex_category_id, supplier_name, contracts(name, contract_companies(companies(name))), suppliers(name)",
          )
          .eq("year", baseYear)
          .is("deleted_at", null)
          .or("budget_classification.eq.OPEX,opex_category_id.not.is.null"),
        supabase
          .from("opex_budget_plan_items")
          .select("id, category_id, amount_clp, source_contract_id, notes, excluded_at")
          .eq("year", planYear)
          .order("created_at", { ascending: false }),
        supabase.from("opex_budget_plan_exclusions").select("purchase_order_id").eq("year", planYear),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (exclusionsRes.error) throw exclusionsRes.error;
      setOrders(
        (ordersRes.data || []).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          description: o.description,
          company_names: getCompanyNames(o.contracts?.contract_companies),
          amount_clp: o.amount_clp,
          amount_uf: o.amount_uf,
          order_date: o.order_date,
          opex_category_id: o.opex_category_id,
          contract_name: o.contracts?.name || "Sin local",
          supplier_name: o.suppliers?.name || o.supplier_name || "Sin proveedor",
        })),
      );
      setItems(itemsRes.data || []);
      setExcludedOrderIds(new Set((exclusionsRes.data || []).map((e) => e.purchase_order_id)));
    } catch (error) {
      console.error("Error loading OPEX planning data:", error);
      toast.error("Error al cargar el análisis de OPEX");
    } finally {
      setLoading(false);
    }
  }, [baseYear, planYear]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const planItemCategoryIds = useMemo(() => new Set(items.map((i) => i.category_id)), [items]);
  const categoryChanges = useOpexCategoryChanges({
    baseYear,
    planYear,
    enabled: open,
    planItemCategoryIds,
    onChanged: () => {
      setSelectedIds(new Set());
      loadData();
      onCategoriesChange?.();
    },
  });
  const categories = categoryChanges.planCategories;

  // Solo lo no excluido alimenta la propuesta y los análisis.
  const activeOrders = useMemo(() => orders.filter((o) => !excludedOrderIds.has(o.id)), [orders, excludedOrderIds]);
  const activeItems = useMemo(() => items.filter((i) => i.excluded_at === null), [items]);

  const plan = useMemo(
    () =>
      buildCategoryPlan({
        orders: activeOrders,
        categories,
        items: activeItems,
        months,
        indexationPct,
        ufValue,
        categoryIndex: categoryChanges.mappingIndex,
      }),
    [activeOrders, categories, activeItems, months, indexationPct, ufValue, categoryChanges.mappingIndex],
  );
  const dropped = useMemo(
    () => droppedByRetirement(activeOrders, categoryChanges.mappingIndex, ufValue),
    [activeOrders, categoryChanges.mappingIndex, ufValue],
  );
  const monthlyReal = useMemo(() => sumByMonth(activeOrders, ufValue), [activeOrders, ufValue]);
  const topLocals = useMemo(() => rankBy(activeOrders, (o) => o.contract_name, ufValue), [activeOrders, ufValue]);
  const topSuppliers = useMemo(() => rankBy(activeOrders, (o) => o.supplier_name, ufValue), [activeOrders, ufValue]);

  const totals = useMemo(
    () =>
      plan.reduce(
        (acc, r) => ({
          real: acc.real + r.realClp,
          avgMonthly: acc.avgMonthly + r.avgMonthlyClp,
          base: acc.base + r.baseProposalClp,
          admin: acc.admin + r.adminClp,
          total: acc.total + r.totalProposalClp,
        }),
        { real: 0, avgMonthly: 0, base: 0, admin: 0, total: 0 },
      ),
    [plan],
  );

  // Nombre de cualquier categoría (también las retiradas, que siguen existiendo para el histórico).
  const categoryName = useCallback(
    (id: string | null) => (id ? categoryChanges.allCategories.find((c) => c.id === id)?.name || "Sin categoría" : "Sin categoría"),
    [categoryChanges.allCategories],
  );
  // Gasto del año base (sin excluidas) de una categoría, según su categoría original en las OC.
  const baseSpendOf = (categoryId: string) =>
    activeOrders.filter((o) => o.opex_category_id === categoryId).reduce((sum, o) => sum + orderAmountClp(o, ufValue), 0);

  // En "Líneas": la categoría final de 2027, con la original entre paréntesis si cambió.
  const lineCategoryName = useCallback(
    (id: string | null) => {
      if (!id) return "Sin categoría";
      const final = resolveCategoryId(id, categoryChanges.mappingIndex);
      if (final === null) return `${categoryName(id)} (retirada)`;
      return final === id ? categoryName(id) : `${categoryName(final)} (antes: ${categoryName(id)})`;
    },
    [categoryChanges.mappingIndex, categoryName],
  );
  const contractInfo = useCallback(
    (id: string | null) => {
      const contract = id ? contracts.find((c) => c.id === id) : undefined;
      return { name: id ? contract?.name || "Contrato" : null, companyNames: contract?.company_names ?? [] };
    },
    [contracts],
  );

  const lines = useMemo(
    () => buildPlanLines({ orders, items, excludedOrderIds, contractCompanyNames: contractInfo, ufValue }),
    [orders, items, excludedOrderIds, contractInfo, ufValue],
  );

  const filteredContracts = useMemo(() => {
    const term = contractSearch.trim().toLowerCase();
    return term ? contracts.filter((c) => c.name.toLowerCase().includes(term)) : contracts;
  }, [contracts, contractSearch]);

  const handleCreateCategory = async (rawName: string): Promise<string | null> => {
    const name = rawName.trim();
    if (!name) {
      toast.error("Ingresa un nombre para la categoría");
      return null;
    }
    const existing = categoryChanges.allCategories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      toast.info("Esa categoría ya existe; quedó seleccionada");
      return existing.id;
    }
    // Mismo criterio de orden que OpexCategoryManager: al final de la lista.
    const { data: last } = await supabase
      .from("opex_categories")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("opex_categories")
      .insert({ name, display_order: (last?.display_order ?? 0) + 1 })
      .select("id, name")
      .single();
    if (error || !data) {
      console.error("Error creating OPEX category:", error);
      toast.error(error?.code === "23505" ? "Ya existe una categoría con ese nombre" : "No se pudo crear la categoría");
      return null;
    }
    toast.success("Categoría creada");
    await categoryChanges.reload();
    onCategoriesChange?.();
    return data.id;
  };

  // Siempre exige categoría: el contrato (si hay) es solo referencia, el monto es global.
  const handleSaveItem = async (
    sourceContractId: string | null,
    input: { categoryId: string; amount: number; notes: string },
  ): Promise<boolean> => {
    const { error } = await supabase.from("opex_budget_plan_items").insert({
      year: planYear,
      category_id: input.categoryId,
      amount_clp: input.amount,
      source_contract_id: sourceContractId,
      notes: input.notes.trim() || null,
      created_by: user?.id ?? null,
    });
    if (error) {
      console.error("Error saving OPEX plan item:", error);
      toast.error("No se pudo guardar el OPEX");
      return false;
    }
    toast.success("OPEX agregado a la categoría");
    setActiveFormKey(null);
    loadData();
    return true;
  };

  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase.from("opex_budget_plan_items").delete().eq("id", id);
    if (error) {
      console.error("Error deleting OPEX plan item:", error);
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("OPEX eliminado");
    loadData();
  };

  // Fija el OPEX general (sin contrato) de una categoría: 0 lo borra, y los totales se
  // recalculan al guardar porque salen de `items`. Las líneas excluidas no se tocan.
  const applyGeneralAmount = async (categoryId: string, amount: number) => {
    const general = items.filter((i) => i.category_id === categoryId && !i.source_contract_id && i.excluded_at === null);
    setSavingCategoryId(categoryId);
    try {
      if (amount <= 0) {
        if (general.length > 0) {
          const ids = general.map((i) => i.id);
          const { error } = await supabase.from("opex_budget_plan_items").delete().in("id", ids);
          if (error) throw error;
          setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
        }
      } else if (general.length === 0) {
        const { data, error } = await supabase
          .from("opex_budget_plan_items")
          .insert({ year: planYear, category_id: categoryId, amount_clp: amount, source_contract_id: null, created_by: user?.id ?? null })
          .select("id, category_id, amount_clp, source_contract_id, notes, excluded_at")
          .single();
        if (error) throw error;
        setItems((prev) => [data, ...prev]);
      } else {
        const [keep, ...rest] = general;
        const { error } = await supabase.from("opex_budget_plan_items").update({ amount_clp: amount }).eq("id", keep.id);
        if (error) throw error;
        const restIds = rest.map((i) => i.id);
        if (restIds.length > 0) {
          const { error: deleteError } = await supabase.from("opex_budget_plan_items").delete().in("id", restIds);
          if (deleteError) throw deleteError;
        }
        setItems((prev) =>
          prev.filter((i) => !restIds.includes(i.id)).map((i) => (i.id === keep.id ? { ...i, amount_clp: amount } : i)),
        );
      }
      toast.success(amount > 0 ? "Monto general guardado" : "Monto general eliminado");
    } catch (error) {
      console.error("Error saving general OPEX amount:", error);
      toast.error("No se pudo guardar el monto general");
      loadData();
    } finally {
      setSavingCategoryId(null);
    }
  };

  // Si la categoría tiene varias líneas generales activas, unificarlas pide confirmación.
  const handleGeneralCommit = (categoryId: string, amount: number) => {
    const count = items.filter((i) => i.category_id === categoryId && !i.source_contract_id && i.excluded_at === null).length;
    if (count > 1 && amount > 0) {
      setPendingGeneral({ categoryId, amount });
      return;
    }
    applyGeneralAmount(categoryId, amount);
  };

  // Excluir tacha la línea (no la borra); reincorporar la devuelve a la propuesta.
  const setLineExcluded = async (line: PlanLine, excluded: boolean) => {
    setBusyLineKey(line.key);
    let error: { message: string } | null;
    if (line.kind === "oc") {
      ({ error } = excluded
        ? await supabase
            .from("opex_budget_plan_exclusions")
            .insert({ year: planYear, purchase_order_id: line.id, created_by: user?.id ?? null })
        : await supabase
            .from("opex_budget_plan_exclusions")
            .delete()
            .eq("year", planYear)
            .eq("purchase_order_id", line.id));
    } else {
      ({ error } = await supabase
        .from("opex_budget_plan_items")
        .update({ excluded_at: excluded ? new Date().toISOString() : null })
        .eq("id", line.id));
    }
    setBusyLineKey(null);
    if (error) {
      console.error("Error updating OPEX line exclusion:", error);
      toast.error(excluded ? "No se pudo excluir la línea" : "No se pudo reincorporar la línea");
      return;
    }
    toast.success(excluded ? "Línea excluida de la propuesta" : "Línea reincorporada");
    loadData();
  };

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarRange className="h-4 w-4 mr-1" />
          Planificar Presupuesto {planYear}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Planificar presupuesto OPEX {planYear}</DialogTitle>
          <DialogDescription>
            Análisis de las OC OPEX {baseYear} (monto de la OC, no lo facturado). Propuesta base = promedio mensual a la
            fecha × 12 + indexación, más el OPEX que agregues abajo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard label={`Con OC ${baseYear} a la fecha`} value={formatClp(totals.real)} hint={`${months.toFixed(1)} meses`} />
          <SummaryCard label="Promedio mensual a la fecha" value={formatClp(totals.avgMonthly)} />
          <SummaryCard label="Propuesta base" value={formatClp(totals.base)} hint={`+${indexationPct}% indexación`} />
          <SummaryCard label="OPEX agregado (ADMIN)" value={formatClp(totals.admin)} />
          <SummaryCard label={`Total propuesto ${planYear}`} value={formatClp(totals.total)} highlight />
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="opex-indexation">Indexación anual (%)</Label>
            <Input
              id="opex-indexation"
              type="number"
              step="0.1"
              min="0"
              className="w-28"
              value={indexationPct}
              onChange={(e) => setIndexationPct(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            Valor por defecto: {DEFAULT_INDEXATION_PCT}% (tasa implícita en el presupuesto {baseYear}).
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <Tabs defaultValue="categoria">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="categoria">Por categoría</TabsTrigger>
              <TabsTrigger value="mes">Por mes</TabsTrigger>
              <TabsTrigger value="local">Por local</TabsTrigger>
              <TabsTrigger value="proveedor">Por proveedor</TabsTrigger>
              <TabsTrigger value="lineas">Líneas ({lines.filter((l) => !l.excluded).length})</TabsTrigger>
              <TabsTrigger value="asignar">Asignar OPEX ({contracts.length} contratos vigentes)</TabsTrigger>
            </TabsList>

            <TabsContent value="categoria">
              <OpexCategoryChangesPanel
                planYear={planYear}
                baseYear={baseYear}
                batches={categoryChanges.batches}
                locked={categoryChanges.locked}
                baseYearClosed={categoryChanges.baseYearClosed}
                busy={categoryChanges.busy}
                applyError={categoryChanges.applyError}
                lastApply={categoryChanges.lastApply}
                blockingRetirements={categoryChanges.blockingRetirements}
                retirementsWithBaseBudget={categoryChanges.retirementsWithBaseBudget}
                droppedClp={dropped.total}
                categoryName={categoryName}
                onUndo={categoryChanges.undo}
                onApply={categoryChanges.apply}
                onReassign={(batchId, categoryId) => setChangeDialog({ mode: "reassign", sourceIds: [categoryId], batchId })}
              />
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-muted-foreground">
                  Marca 2 o más categorías para fusionarlas. Renombrar, fusionar y retirar rigen desde {planYear}; {baseYear} no se toca.
                </p>
                <Button
                  size="sm"
                  disabled={selectedIds.size < 2 || categoryChanges.locked}
                  onClick={() => setChangeDialog({ mode: "merge", sourceIds: Array.from(selectedIds) })}
                >
                  <Merge className="h-4 w-4 mr-1" />
                  Fusionar ({selectedIds.size})
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">OC</TableHead>
                    <TableHead className="text-right">Con OC a la fecha</TableHead>
                    <TableHead className="text-right">Promedio mensual</TableHead>
                    <TableHead className="text-right">Propuesta base</TableHead>
                    <TableHead className="text-right">OPEX agregado</TableHead>
                    <TableHead className="text-right">Total {planYear}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.map((r) => (
                    <TableRow key={r.categoryId ?? "none"}>
                      <TableCell>
                        {r.categoryId && (
                          <Checkbox
                            aria-label={`Seleccionar ${r.name}`}
                            disabled={categoryChanges.locked}
                            checked={selectedIds.has(r.categoryId)}
                            onCheckedChange={(checked) => {
                              const id = r.categoryId as string;
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(id);
                                else next.delete(id);
                                return next;
                              });
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.orderCount}</TableCell>
                      <TableCell className="text-right">{formatClp(r.realClp)}</TableCell>
                      <TableCell className="text-right">{formatClp(r.avgMonthlyClp)}</TableCell>
                      <TableCell className="text-right">{formatClp(r.baseProposalClp)}</TableCell>
                      <TableCell className="text-right">
                        {r.categoryId ? (
                          <OpexGeneralAmountCell
                            value={r.adminGeneralClp}
                            saving={savingCategoryId === r.categoryId}
                            ariaLabel={`OPEX general de ${r.name}`}
                            breakdown={r.contractBreakdown.map((b) => {
                              const info = contractInfo(b.contractId);
                              return { name: info.name ?? "Contrato", companyNames: info.companyNames, amountClp: b.amountClp };
                            })}
                            onCommit={(amount) => handleGeneralCommit(r.categoryId as string, amount)}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatClp(r.totalProposalClp)}</TableCell>
                      <TableCell>
                        {r.categoryId && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Renombrar ${r.name}`}
                              disabled={categoryChanges.locked}
                              onClick={() => setChangeDialog({ mode: "rename", sourceIds: [r.categoryId as string] })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Retirar ${r.name}`}
                              disabled={categoryChanges.locked}
                              onClick={() =>
                                categoryChanges.hasPlanAmounts(r.categoryId as string)
                                  ? setChangeDialog({ mode: "retire", sourceIds: [r.categoryId as string] })
                                  : setRetireConfirmId(r.categoryId as string)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell />
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{activeOrders.length}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.real)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.avgMonthly)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.base)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.admin)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="mes" className="space-y-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyReal.map((value, i) => ({ mes: MONTH_LABELS[i], value }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 1_000_000)} M`} />
                    <Tooltip formatter={(v: number) => formatClp(v)} />
                    <Bar dataKey="value" name={`OC ${baseYear}`} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                Propuesta mensual {planYear}: cada categoría se reparte en 12 cuotas iguales (sin estacionalidad, porque
                un solo año de datos no la respalda).
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      {MONTH_LABELS.map((m) => (
                        <TableHead key={m} className="text-right">{m}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.filter((r) => r.totalProposalClp > 0).map((r) => (
                      <TableRow key={r.categoryId ?? "none"}>
                        <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                        {MONTH_LABELS.map((m) => (
                          <TableCell key={m} className="text-right whitespace-nowrap">{formatClp(r.monthlyProposalClp)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="local">
              <RankTable title="Local" rows={topLocals} showLogos />
            </TabsContent>
            <TabsContent value="proveedor">
              <RankTable title="Proveedor" rows={topSuppliers} />
            </TabsContent>

            <TabsContent value="lineas">
              <OpexPlanLines
                lines={lines}
                categoryName={lineCategoryName}
                busyKey={busyLineKey}
                onExclude={(line) => setLineExcluded(line, true)}
                onRestore={(line) => setLineExcluded(line, false)}
              />
            </TabsContent>

            <TabsContent value="asignar" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Registra OPEX que solo tú conoces, ya sea como OPEX global o partiendo de un contrato vigente. En ambos
                casos debes elegir (o crear) una <strong>categoría</strong>: el monto se suma a esa categoría global de{" "}
                {planYear} y el contrato queda solo como referencia, sin recibir el presupuesto.
              </p>

              {activeItems.length > 0 && (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Monto CLP</TableHead>
                        <TableHead>Origen</TableHead>
                        <TableHead>Nota</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{categoryName(item.category_id)}</TableCell>
                          <TableCell className="text-right">{formatClp(item.amount_clp)}</TableCell>
                          <TableCell>
                            {item.source_contract_id ? (
                              <div className="flex items-center gap-2">
                                <CompanyLogo companyNames={contractInfo(item.source_contract_id).companyNames} size="sm" />
                                <span>{contractInfo(item.source_contract_id).name}</span>
                              </div>
                            ) : (
                              "Global"
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.notes || "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" aria-label="Eliminar OPEX" onClick={() => handleDeleteItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="border rounded-md p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    OPEX global (sin contrato)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveFormKey(activeFormKey === GLOBAL_KEY ? null : GLOBAL_KEY)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar OPEX
                  </Button>
                </div>
                {activeFormKey === GLOBAL_KEY && (
                  <AddItemForm
                    categories={categories}
                    onCreateCategory={handleCreateCategory}
                    onSave={(input) => handleSaveItem(null, input)}
                  />
                )}
              </div>

              <div className="relative max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar contrato vigente..."
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                />
              </div>

              <div className="border rounded-md max-h-80 overflow-y-auto divide-y">
                {filteredContracts.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">No hay contratos vigentes que coincidan.</p>
                )}
                {filteredContracts.map((contract) => (
                  <div key={contract.id} className="p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CompanyLogo companyNames={contract.company_names} size="sm" />
                        <span className="text-sm">{contract.name}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveFormKey(activeFormKey === contract.id ? null : contract.id)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar OPEX
                      </Button>
                    </div>
                    {activeFormKey === contract.id && (
                      <AddItemForm
                        categories={categories}
                        onCreateCategory={handleCreateCategory}
                        onSave={(input) => handleSaveItem(contract.id, input)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
      <AlertDialog open={pendingGeneral !== null} onOpenChange={(o) => !o && setPendingGeneral(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unificar el OPEX general</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingGeneral ? categoryName(pendingGeneral.categoryId) : ""} tiene varias líneas de OPEX general. Se
              reemplazarán por una sola de {pendingGeneral ? formatClp(pendingGeneral.amount) : ""} y se perderán sus notas.
              Las líneas que vienen de contratos y las excluidas no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingGeneral) applyGeneralAmount(pendingGeneral.categoryId, pendingGeneral.amount);
                setPendingGeneral(null);
              }}
            >
              Unificar y guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {changeDialog && (
        <OpexCategoryChangeDialog
          open
          mode={changeDialog.mode}
          planYear={planYear}
          sources={changeDialog.sourceIds.map((id) => ({ id, name: categoryName(id) }))}
          candidates={categories.filter((c) => !changeDialog.sourceIds.includes(c.id))}
          busy={categoryChanges.busy}
          onClose={() => setChangeDialog(null)}
          onSubmit={({ toId, toName }) => {
            const { mode, sourceIds, batchId } = changeDialog;
            if (mode === "reassign" && batchId && toId) return categoryChanges.reassignRetired(batchId, sourceIds[0], toId);
            return categoryChanges.merge(sourceIds, toId, toName);
          }}
        />
      )}
      <AlertDialog open={retireConfirmId !== null} onOpenChange={(o) => !o && setRetireConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar categoría desde {planYear}</AlertDialogTitle>
            <AlertDialogDescription>
              «{retireConfirmId ? categoryName(retireConfirmId) : ""}» deja de estar disponible desde {planYear}; no se
              borra, porque las OC y reportes de {baseYear} la siguen usando.
              {retireConfirmId && ` Su gasto ${baseYear} (${formatClp(baseSpendOf(retireConfirmId))}) dejará de proyectarse en ${planYear}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (retireConfirmId) categoryChanges.retire(retireConfirmId);
                setRetireConfirmId(null);
              }}
            >
              Retirar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

const SummaryCard = ({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) => (
  <Card className={highlight ? "border-primary" : undefined}>
    <CardContent className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <Badge variant="secondary" className="mt-1 text-[10px]">{hint}</Badge>}
    </CardContent>
  </Card>
);

const RankTable = ({
  title,
  rows,
  showLogos,
}: {
  title: string;
  rows: Array<{ name: string; companyNames: string[]; orderCount: number; totalClp: number; percent: number }>;
  // Solo cuando las filas son contratos/locales.
  showLogos?: boolean;
}) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{title}</TableHead>
        <TableHead className="text-right">OC</TableHead>
        <TableHead className="text-right">Con OC a la fecha</TableHead>
        <TableHead className="text-right">% del total</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((r) => (
        <TableRow key={r.name}>
          <TableCell className="font-medium">
            {showLogos ? (
              <div className="flex items-center gap-2">
                <CompanyLogo companyNames={r.companyNames} size="sm" />
                <span>{r.name}</span>
              </div>
            ) : (
              r.name
            )}
          </TableCell>
          <TableCell className="text-right">{r.orderCount}</TableCell>
          <TableCell className="text-right">{formatClp(r.totalClp)}</TableCell>
          <TableCell className="text-right">{r.percent.toFixed(1)}%</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

interface AddItemFormProps {
  categories: Array<{ id: string; name: string }>;
  onCreateCategory: (name: string) => Promise<string | null>;
  onSave: (input: { categoryId: string; amount: number; notes: string }) => Promise<boolean>;
}

// Formulario compartido por el OPEX global y el que parte de un contrato:
// la categoría es obligatoria y puede crearse en el mismo lugar.
const AddItemForm = ({ categories, onCreateCategory, onSave }: AddItemFormProps) => {
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const creatingCategory = categoryId === NEW_CATEGORY_VALUE;

  const handleCreateCategory = async () => {
    setBusy(true);
    const id = await onCreateCategory(newCategoryName);
    setBusy(false);
    if (id) {
      setCategoryId(id);
      setNewCategoryName("");
    }
  };

  const handleSave = async () => {
    const parsed = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!categoryId || creatingCategory) return toast.error("Selecciona o crea una categoría");
    if (!Number.isFinite(parsed) || parsed <= 0) return toast.error("Ingresa un monto en CLP mayor a 0");
    setBusy(true);
    await onSave({ categoryId, amount: parsed, notes });
    setBusy(false);
  };

  return (
    <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
      <div className="space-y-1">
        <Label>Categoría</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
            <SelectItem value={NEW_CATEGORY_VALUE}>+ Nueva categoría...</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {creatingCategory ? (
        <div className="space-y-1 md:col-span-3">
          <Label>Nombre de la nueva categoría</Label>
          <div className="flex gap-2">
            <Input value={newCategoryName} maxLength={100} onChange={(e) => setNewCategoryName(e.target.value)} />
            <Button onClick={handleCreateCategory} disabled={busy}>
              {busy ? "Creando..." : "Crear categoría"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <Label>Monto anual (CLP)</Label>
            <Input inputMode="numeric" placeholder="1500000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nota (opcional)</Label>
            <Input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Guardando..." : "Guardar"}
          </Button>
        </>
      )}
    </div>
  );
};
