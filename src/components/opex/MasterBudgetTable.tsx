import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronRight, ChevronDown, ChevronsUpDown, Eye, List } from "lucide-react";

interface MasterBudgetData {
  id: string;
  category_id: string;
  category_name: string;
  amount_clp: number;
  amount_uf: number;
  months: number[]; // 12 months budget in CLP
  consumed_clp: number;
  consumed_uf: number;
}

interface MasterBudgetTableProps {
  data: MasterBudgetData[];
  ufValue: number;
  year?: number;
}

interface MonthlyConsumption {
  month: number;
  amount_uf: number;
  amount_clp: number;
}

interface ContractConsumptionDetail {
  contract_id: string;
  contract_name: string;
  order_number: string;
  order_date: string;
  amount_uf: number;
  amount_clp: number;
  description: string | null;
  supplier_name: string | null;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const MasterBudgetTable = ({ data, ufValue, year }: MasterBudgetTableProps) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showMonths, setShowMonths] = useState(false);
  const [monthlyConsumption, setMonthlyConsumption] = useState<Record<string, MonthlyConsumption[]>>({});
  const [loadingConsumption, setLoadingConsumption] = useState(false);

  // Dialog state for drill-down
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownTitle, setDrillDownTitle] = useState("");
  const [drillDownContracts, setDrillDownContracts] = useState<ContractConsumptionDetail[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  // Dialog for full category contracts list
  const [categoryContractsOpen, setCategoryContractsOpen] = useState(false);
  const [categoryContractsTitle, setCategoryContractsTitle] = useState("");
  const [categoryContracts, setCategoryContracts] = useState<ContractConsumptionDetail[]>([]);
  const [categoryContractsLoading, setCategoryContractsLoading] = useState(false);

  const selectedYear = year || new Date().getFullYear();

  // Load monthly consumption when months are expanded
  useEffect(() => {
    if (expandedCategories.size === 0) return;

    const categoryIds = Array.from(expandedCategories).filter(
      (id) => !monthlyConsumption[id]
    );
    if (categoryIds.length === 0) return;

    const loadMonthlyConsumption = async () => {
      setLoadingConsumption(true);
      try {
        const { data: orders } = await supabase
          .from("purchase_orders")
          .select("opex_category_id, order_date, amount_uf, amount_clp")
          .eq("year", selectedYear)
          .is("deleted_at", null)
          .in("opex_category_id", categoryIds);

        const result: Record<string, MonthlyConsumption[]> = {};

        categoryIds.forEach((catId) => {
          const months: MonthlyConsumption[] = Array.from({ length: 12 }, (_, i) => ({
            month: i,
            amount_uf: 0,
            amount_clp: 0,
          }));
          result[catId] = months;
        });

        (orders || []).forEach((o: any) => {
          const catId = o.opex_category_id;
          if (!catId || !result[catId]) return;
          const d = new Date(o.order_date);
          const monthIdx = d.getMonth();
          result[catId][monthIdx].amount_uf += Math.abs(o.amount_uf || 0);
          result[catId][monthIdx].amount_clp += Math.abs(
            o.amount_clp || (o.amount_uf || 0) * ufValue
          );
        });

        setMonthlyConsumption((prev) => ({ ...prev, ...result }));
      } catch (err) {
        console.error("Error loading monthly consumption:", err);
      } finally {
        setLoadingConsumption(false);
      }
    };

    loadMonthlyConsumption();
  }, [expandedCategories, selectedYear, ufValue]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleAllMonths = () => {
    if (showMonths) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(data.map((d) => d.category_id)));
    }
    setShowMonths(!showMonths);
  };

  const formatCLP = (value: number) =>
    `$ ${Math.round(Math.abs(value)).toLocaleString("es-CL")}`;

  const formatUF = (value: number) =>
    `${Math.abs(value).toLocaleString("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} UF`;

  const convertToUF = (clp: number) => (ufValue <= 0 ? 0 : clp / ufValue);

  // Drill-down: load contracts for a specific category + month
  const handleMonthClick = async (categoryId: string, categoryName: string, monthIdx: number) => {
    setDrillDownTitle(`${categoryName} — ${MONTH_NAMES[monthIdx]} ${selectedYear}`);
    setDrillDownOpen(true);
    setDrillDownLoading(true);
    setDrillDownContracts([]);

    try {
      const startDate = `${selectedYear}-${String(monthIdx + 1).padStart(2, "0")}-01`;
      const endMonth = monthIdx + 2 > 12 ? 1 : monthIdx + 2;
      const endYear = monthIdx + 2 > 12 ? selectedYear + 1 : selectedYear;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const { data: orders } = await supabase
        .from("purchase_orders")
        .select(
          "id, contract_id, order_number, order_date, amount_uf, amount_clp, description, supplier_name, contracts!inner(name)"
        )
        .eq("year", selectedYear)
        .eq("opex_category_id", categoryId)
        .is("deleted_at", null)
        .gte("order_date", startDate)
        .lt("order_date", endDate)
        .order("order_date", { ascending: false });

      const details: ContractConsumptionDetail[] = (orders || []).map((o: any) => ({
        contract_id: o.contract_id,
        contract_name: o.contracts?.name || "Sin contrato",
        order_number: o.order_number,
        order_date: o.order_date,
        amount_uf: Math.abs(o.amount_uf || 0),
        amount_clp: Math.abs(o.amount_clp || (o.amount_uf || 0) * ufValue),
        description: o.description,
        supplier_name: o.supplier_name,
      }));

      setDrillDownContracts(details);
    } catch (err) {
      console.error("Error loading month drill-down:", err);
    } finally {
      setDrillDownLoading(false);
    }
  };

  // Load all contracts for a category (full year)
  const handleShowCategoryContracts = async (categoryId: string, categoryName: string) => {
    setCategoryContractsTitle(`Contratos con consumo — ${categoryName} (${selectedYear})`);
    setCategoryContractsOpen(true);
    setCategoryContractsLoading(true);
    setCategoryContracts([]);

    try {
      const { data: orders } = await supabase
        .from("purchase_orders")
        .select(
          "id, contract_id, order_number, order_date, amount_uf, amount_clp, description, supplier_name, contracts!inner(name)"
        )
        .eq("year", selectedYear)
        .eq("opex_category_id", categoryId)
        .is("deleted_at", null)
        .order("order_date", { ascending: false });

      const details: ContractConsumptionDetail[] = (orders || []).map((o: any) => ({
        contract_id: o.contract_id,
        contract_name: o.contracts?.name || "Sin contrato",
        order_number: o.order_number,
        order_date: o.order_date,
        amount_uf: Math.abs(o.amount_uf || 0),
        amount_clp: Math.abs(o.amount_clp || (o.amount_uf || 0) * ufValue),
        description: o.description,
        supplier_name: o.supplier_name,
      }));

      setCategoryContracts(details);
    } catch (err) {
      console.error("Error loading category contracts:", err);
    } finally {
      setCategoryContractsLoading(false);
    }
  };

  // Calculate totals
  const totals = data.reduce(
    (acc, row) => ({
      budget_clp: acc.budget_clp + row.amount_clp,
      consumed_clp: acc.consumed_clp + row.consumed_clp,
      months: acc.months.map((m, i) => m + (row.months[i] || 0)),
    }),
    { budget_clp: 0, consumed_clp: 0, months: Array(12).fill(0) }
  );

  // Aggregate contracts by contract_id for summary
  const aggregateByContract = (details: ContractConsumptionDetail[]) => {
    const map = new Map<string, { contract_name: string; total_uf: number; total_clp: number; count: number }>();
    details.forEach((d) => {
      const existing = map.get(d.contract_id);
      if (existing) {
        existing.total_uf += d.amount_uf;
        existing.total_clp += d.amount_clp;
        existing.count += 1;
      } else {
        map.set(d.contract_id, {
          contract_name: d.contract_name,
          total_uf: d.amount_uf,
          total_clp: d.amount_clp,
          count: 1,
        });
      }
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ contract_id: id, ...v }))
      .sort((a, b) => b.total_clp - a.total_clp);
  };

  const renderContractsDrillTable = (
    details: ContractConsumptionDetail[],
    loading: boolean,
    showAggregated = false
  ) => {
    if (loading) {
      return <p className="text-sm text-muted-foreground py-4 text-center">Cargando...</p>;
    }
    if (details.length === 0) {
      return <p className="text-sm text-muted-foreground py-4 text-center">Sin órdenes de compra en este período</p>;
    }

    if (showAggregated) {
      const aggregated = aggregateByContract(details);
      const total = aggregated.reduce((s, a) => s + a.total_clp, 0);

      return (
        <div className="space-y-4">
          {/* Aggregated by contract */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Resumen por Contrato</h4>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-right">OCs</TableHead>
                  <TableHead className="text-right">Total (CLP)</TableHead>
                  <TableHead className="text-right">Total (UF)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.map((a) => (
                  <TableRow key={a.contract_id}>
                    <TableCell className="font-medium">{a.contract_name}</TableCell>
                    <TableCell className="text-right">{a.count}</TableCell>
                    <TableCell className="text-right">{formatCLP(a.total_clp)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatUF(a.total_uf)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{details.length}</TableCell>
                  <TableCell className="text-right">{formatCLP(total)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {formatUF(ufValue > 0 ? total / ufValue : 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Detail list */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Detalle de Órdenes</h4>
            {renderOrdersTable(details)}
          </div>
        </div>
      );
    }

    return renderOrdersTable(details);
  };

  const renderOrdersTable = (details: ContractConsumptionDetail[]) => (
    <div className="max-h-[400px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Contrato</TableHead>
            <TableHead>OC #</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-right">Monto (CLP)</TableHead>
            <TableHead className="text-right">Monto (UF)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {details.map((d, i) => (
            <TableRow key={`${d.contract_id}-${d.order_number}-${i}`}>
              <TableCell className="font-medium text-sm">{d.contract_name}</TableCell>
              <TableCell className="text-sm">{d.order_number}</TableCell>
              <TableCell className="text-sm">
                {new Date(d.order_date).toLocaleDateString("es-CL")}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {d.supplier_name || "—"}
              </TableCell>
              <TableCell className="text-right text-sm">{formatCLP(d.amount_clp)}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatUF(d.amount_uf)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={toggleAllMonths}>
          <ChevronsUpDown className="h-4 w-4 mr-1" />
          {showMonths ? "Ocultar Meses" : "Mostrar Meses"}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Presupuesto (CLP)</TableHead>
              <TableHead className="text-right text-muted-foreground">≈ UF</TableHead>
              <TableHead className="text-right">Consumido (CLP)</TableHead>
              <TableHead className="text-right">Disponible (CLP)</TableHead>
              <TableHead className="w-[150px]">Uso</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const available = row.amount_clp - row.consumed_clp;
              const usagePercent =
                row.amount_clp > 0 ? (row.consumed_clp / row.amount_clp) * 100 : 0;
              const isExpanded = expandedCategories.has(row.category_id);
              const catMonthly = monthlyConsumption[row.category_id];

              return (
                <Collapsible key={row.category_id} asChild open={isExpanded}>
                  <>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell className="p-0">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleCategory(row.category_id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell className="font-medium">{row.category_name}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCLP(row.amount_clp)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {formatUF(convertToUF(row.amount_clp))}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatCLP(row.consumed_clp)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${available < 0 ? "text-destructive" : "text-green-600"}`}
                      >
                        {formatCLP(available)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min(usagePercent, 100)}
                            className="h-2 flex-1"
                          />
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {usagePercent.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Ver contratos que han consumido"
                          onClick={() =>
                            handleShowCategoryContracts(row.category_id, row.category_name)
                          }
                        >
                          <List className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={8} className="p-0">
                          <div className="px-6 py-3">
                            <div className="grid grid-cols-6 gap-2 text-sm">
                              {MONTH_NAMES.map((month, i) => {
                                const budgetMonth = row.months[i] || 0;
                                const consumedMonth = catMonthly?.[i]?.amount_clp || 0;
                                const hasConsumption = consumedMonth > 0;

                                return (
                                  <div
                                    key={i}
                                    className={`flex flex-col p-2 rounded border transition-colors ${
                                      hasConsumption
                                        ? "bg-card cursor-pointer hover:border-primary/50 hover:shadow-sm"
                                        : "bg-card"
                                    }`}
                                    onClick={
                                      hasConsumption
                                        ? () =>
                                            handleMonthClick(
                                              row.category_id,
                                              row.category_name,
                                              i
                                            )
                                        : undefined
                                    }
                                  >
                                    <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                      {month}
                                      {hasConsumption && (
                                        <Eye className="h-3 w-3 text-primary" />
                                      )}
                                    </span>
                                    <span className="font-medium text-xs">
                                      Ppto: {formatCLP(budgetMonth)}
                                    </span>
                                    <span
                                      className={`text-xs ${
                                        hasConsumption ? "text-orange-600 font-semibold" : "text-muted-foreground"
                                      }`}
                                    >
                                      Cons: {formatCLP(consumedMonth)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatUF(convertToUF(budgetMonth))}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              );
            })}

            {/* Totals Row */}
            <TableRow className="bg-muted/50 font-bold border-t-2">
              <TableCell></TableCell>
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{formatCLP(totals.budget_clp)}</TableCell>
              <TableCell className="text-right text-muted-foreground text-sm">
                {formatUF(convertToUF(totals.budget_clp))}
              </TableCell>
              <TableCell className="text-right text-orange-600">
                {formatCLP(totals.consumed_clp)}
              </TableCell>
              <TableCell
                className={`text-right ${
                  totals.budget_clp - totals.consumed_clp < 0
                    ? "text-destructive"
                    : "text-green-600"
                }`}
              >
                {formatCLP(totals.budget_clp - totals.consumed_clp)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress
                    value={
                      totals.budget_clp > 0
                        ? Math.min((totals.consumed_clp / totals.budget_clp) * 100, 100)
                        : 0
                    }
                    className="h-2 flex-1"
                  />
                  <span className="text-xs w-10 text-right">
                    {totals.budget_clp > 0
                      ? ((totals.consumed_clp / totals.budget_clp) * 100).toFixed(0)
                      : 0}
                    %
                  </span>
                </div>
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Month drill-down dialog */}
      <Dialog open={drillDownOpen} onOpenChange={setDrillDownOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{drillDownTitle}</DialogTitle>
          </DialogHeader>
          {renderContractsDrillTable(drillDownContracts, drillDownLoading, true)}
        </DialogContent>
      </Dialog>

      {/* Category contracts dialog */}
      <Dialog open={categoryContractsOpen} onOpenChange={setCategoryContractsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{categoryContractsTitle}</DialogTitle>
          </DialogHeader>
          {renderContractsDrillTable(categoryContracts, categoryContractsLoading, true)}
        </DialogContent>
      </Dialog>
    </div>
  );
};
