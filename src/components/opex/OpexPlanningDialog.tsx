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
import { CalendarRange, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  buildCategoryPlan,
  monthsElapsed,
  rankBy,
  sumByMonth,
  type PlanningOrder,
} from "@/lib/opexPlanning";

interface OpexPlanningDialogProps {
  // Año con datos reales; se planifica baseYear + 1.
  baseYear: number;
  ufValue: number;
  categories: Array<{ id: string; name: string }>;
  // Contratos vigentes (estado "firmado"), ya cargados por la página.
  contracts: Array<{ id: string; name: string }>;
}

interface PlanItem {
  id: string;
  category_id: string;
  amount_clp: number;
  source_contract_id: string | null;
  notes: string | null;
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DEFAULT_INDEXATION_PCT = 3.2;

const formatClp = (value: number) => `$ ${Math.round(value).toLocaleString("es-CL")}`;

export const OpexPlanningDialog = ({ baseYear, ufValue, categories, contracts }: OpexPlanningDialogProps) => {
  const { isAdmin, user } = useAuth();
  const planYear = baseYear + 1;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [indexationPct, setIndexationPct] = useState(DEFAULT_INDEXATION_PCT);

  // Formulario "Agregar OPEX desde un contrato"
  const [contractSearch, setContractSearch] = useState("");
  const [activeContractId, setActiveContractId] = useState<string | null>(null);
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const months = useMemo(() => monthsElapsed(baseYear), [baseYear]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, itemsRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("amount_clp, amount_uf, order_date, opex_category_id, supplier_name, contracts(name), suppliers(name)")
          .eq("year", baseYear)
          .is("deleted_at", null)
          .or("budget_classification.eq.OPEX,opex_category_id.not.is.null"),
        supabase
          .from("opex_budget_plan_items")
          .select("id, category_id, amount_clp, source_contract_id, notes")
          .eq("year", planYear)
          .order("created_at", { ascending: false }),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (itemsRes.error) throw itemsRes.error;
      setOrders(
        (ordersRes.data || []).map((o) => ({
          amount_clp: o.amount_clp,
          amount_uf: o.amount_uf,
          order_date: o.order_date,
          opex_category_id: o.opex_category_id,
          contract_name: o.contracts?.name || "Sin local",
          supplier_name: o.suppliers?.name || o.supplier_name || "Sin proveedor",
        })),
      );
      setItems(itemsRes.data || []);
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

  const plan = useMemo(
    () => buildCategoryPlan({ orders, categories, items, months, indexationPct, ufValue }),
    [orders, categories, items, months, indexationPct, ufValue],
  );
  const monthlyReal = useMemo(() => sumByMonth(orders, ufValue), [orders, ufValue]);
  const topLocals = useMemo(() => rankBy(orders, (o) => o.contract_name, ufValue), [orders, ufValue]);
  const topSuppliers = useMemo(() => rankBy(orders, (o) => o.supplier_name, ufValue), [orders, ufValue]);

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

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name || "Sin categoría";
  const contractName = (id: string | null) => (id ? contracts.find((c) => c.id === id)?.name || "Contrato" : "—");

  const filteredContracts = useMemo(() => {
    const term = contractSearch.trim().toLowerCase();
    return term ? contracts.filter((c) => c.name.toLowerCase().includes(term)) : contracts;
  }, [contracts, contractSearch]);

  const resetForm = () => {
    setActiveContractId(null);
    setFormCategoryId("");
    setFormAmount("");
    setFormNotes("");
  };

  const handleAddItem = async () => {
    const amount = Number(formAmount.replace(/\./g, "").replace(",", "."));
    if (!formCategoryId) return toast.error("Selecciona una categoría");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Ingresa un monto en CLP mayor a 0");
    setSaving(true);
    const { error } = await supabase.from("opex_budget_plan_items").insert({
      year: planYear,
      category_id: formCategoryId,
      amount_clp: amount,
      source_contract_id: activeContractId,
      notes: formNotes.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      console.error("Error saving OPEX plan item:", error);
      toast.error("No se pudo guardar el OPEX");
      return;
    }
    toast.success("OPEX agregado a la categoría");
    resetForm();
    loadData();
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

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarRange className="h-4 w-4 mr-1" />
          Planificar Presupuesto (año siguiente)
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
              <TabsTrigger value="asignar">Asignar OPEX ({contracts.length} contratos vigentes)</TabsTrigger>
            </TabsList>

            <TabsContent value="categoria">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">OC</TableHead>
                    <TableHead className="text-right">Con OC a la fecha</TableHead>
                    <TableHead className="text-right">Promedio mensual</TableHead>
                    <TableHead className="text-right">Propuesta base</TableHead>
                    <TableHead className="text-right">OPEX agregado</TableHead>
                    <TableHead className="text-right">Total {planYear}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.map((r) => (
                    <TableRow key={r.categoryId ?? "none"}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{r.orderCount}</TableCell>
                      <TableCell className="text-right">{formatClp(r.realClp)}</TableCell>
                      <TableCell className="text-right">{formatClp(r.avgMonthlyClp)}</TableCell>
                      <TableCell className="text-right">{formatClp(r.baseProposalClp)}</TableCell>
                      <TableCell className="text-right">{r.adminClp > 0 ? formatClp(r.adminClp) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatClp(r.totalProposalClp)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{orders.length}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.real)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.avgMonthly)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.base)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.admin)}</TableCell>
                    <TableCell className="text-right">{formatClp(totals.total)}</TableCell>
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
                    {plan.map((r) => (
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
              <RankTable title="Local" rows={topLocals} />
            </TabsContent>
            <TabsContent value="proveedor">
              <RankTable title="Proveedor" rows={topSuppliers} />
            </TabsContent>

            <TabsContent value="asignar" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Elige un contrato vigente para registrar OPEX que solo tú conoces. El monto se suma a la{" "}
                <strong>categoría global</strong> de {planYear}; el contrato queda solo como referencia y no recibe el
                presupuesto.
              </p>

              {items.length > 0 && (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Monto CLP</TableHead>
                        <TableHead>Contrato (referencia)</TableHead>
                        <TableHead>Nota</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{categoryName(item.category_id)}</TableCell>
                          <TableCell className="text-right">{formatClp(item.amount_clp)}</TableCell>
                          <TableCell>{contractName(item.source_contract_id)}</TableCell>
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
                      <span className="text-sm">{contract.name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => (activeContractId === contract.id ? resetForm() : (resetForm(), setActiveContractId(contract.id)))}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar OPEX
                      </Button>
                    </div>
                    {activeContractId === contract.id && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                        <div className="space-y-1">
                          <Label>Categoría</Label>
                          <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Categoría" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Monto anual (CLP)</Label>
                          <Input inputMode="numeric" placeholder="1500000" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Nota (opcional)</Label>
                          <Input value={formNotes} maxLength={200} onChange={(e) => setFormNotes(e.target.value)} />
                        </div>
                        <Button onClick={handleAddItem} disabled={saving}>
                          {saving ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
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

const RankTable = ({ title, rows }: { title: string; rows: Array<{ name: string; orderCount: number; totalClp: number; percent: number }> }) => (
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
          <TableCell className="font-medium">{r.name}</TableCell>
          <TableCell className="text-right">{r.orderCount}</TableCell>
          <TableCell className="text-right">{formatClp(r.totalClp)}</TableCell>
          <TableCell className="text-right">{r.percent.toFixed(1)}%</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
