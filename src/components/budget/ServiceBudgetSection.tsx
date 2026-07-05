import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BudgetProvider } from "./BudgetContext";
import { BudgetModule } from "./BudgetModule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface ServiceBudgetSectionProps {
  serviceContractId: string;
  serviceContractName?: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 2 + i);

function formatUF(n: number) { return "UF " + n.toFixed(2); }

function ServiceBudgetContent({ serviceContractId, serviceContractName = "" }: ServiceBudgetSectionProps) {
  const { isAdmin, hasPermission } = useAuth();
  const canEdit = isAdmin || hasPermission("capex", "edit");
  const { ufValue } = useEconomicIndicators();

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [loadingYears, setLoadingYears] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newYear, setNewYear] = useState(String(CURRENT_YEAR));
  const [capexAmount, setCapexAmount] = useState("");
  const [opexAmount, setOpexAmount] = useState("");
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");

  const loadAvailableYears = async () => {
    setLoadingYears(true);
    const { data } = await supabase
      .from("contract_budgets")
      .select("year")
      .eq("service_contract_id", serviceContractId)
      .order("year", { ascending: false });

    const years = [...new Set((data ?? []).map((r: any) => r.year as number))].sort((a, b) => b - a);
    setAvailableYears(years);
    if (years.length > 0 && !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
    setLoadingYears(false);
  };

  useEffect(() => {
    loadAvailableYears();
  }, [serviceContractId]);

  const toUF = (raw: string) => {
    const n = parseFloat(raw);
    if (!n || !isFinite(n) || n < 0) return 0;
    return currency === "CLP" && ufValue > 0 ? n / ufValue : n;
  };

  const handleCreate = async () => {
    const year = parseInt(newYear);
    if (!year || year < 2000 || year > 2100) {
      toast.error("Año inválido");
      return;
    }
    if (availableYears.includes(year)) {
      toast.error(`Ya existe un presupuesto para el año ${year}`);
      return;
    }

    setCreating(true);
    try {
      const capexUF = toUF(capexAmount);
      const opexUF  = toUF(opexAmount);

      const inserts: any[] = [];
      inserts.push({ service_contract_id: serviceContractId, year, budget_type: "capex", amount_uf: capexUF });
      inserts.push({ service_contract_id: serviceContractId, year, budget_type: "opex",  amount_uf: opexUF  });

      const { error } = await supabase.from("contract_budgets").insert(inserts);
      if (error) throw error;

      toast.success(`Presupuesto ${year} creado`);
      setDialogOpen(false);
      setCapexAmount("");
      setOpexAmount("");
      setNewYear(String(CURRENT_YEAR));
      await loadAvailableYears();
      setSelectedYear(year);
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear presupuesto");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Year selector + new year button */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Año:</Label>
          {loadingYears ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : availableYears.length === 0 ? (
            <span className="text-sm text-muted-foreground">Sin presupuestos aún</span>
          ) : (
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nuevo año
          </Button>
        )}
      </div>

      {/* Budget modules */}
      {availableYears.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          <p className="font-medium mb-1">Sin control presupuestario</p>
          <p className="text-sm">Crea el primer año con el botón "Nuevo año".</p>
        </div>
      ) : (
        <Tabs defaultValue="capex">
          <TabsList>
            <TabsTrigger value="capex">CAPEX</TabsTrigger>
            <TabsTrigger value="opex">OPEX</TabsTrigger>
          </TabsList>
          <TabsContent value="capex" className="mt-4">
            <BudgetModule
              serviceContractId={serviceContractId}
              contractName={serviceContractName}
              budgetType="capex"
              title="CAPEX"
              selectedYear={selectedYear}
            />
          </TabsContent>
          <TabsContent value="opex" className="mt-4">
            <BudgetModule
              serviceContractId={serviceContractId}
              contractName={serviceContractName}
              budgetType="opex"
              title="OPEX"
              selectedYear={selectedYear}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* New year dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo año presupuestario</DialogTitle>
            <DialogDescription>
              Se crearán presupuestos CAPEX y OPEX para el año seleccionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Año</Label>
              <Select value={newYear} onValueChange={setNewYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEAR_RANGE.map(y => (
                    <SelectItem key={y} value={String(y)} disabled={availableYears.includes(y)}>
                      {y}{availableYears.includes(y) ? " (ya existe)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <div className="flex rounded-md border overflow-hidden w-fit">
                <button
                  type="button"
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${currency === "UF" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setCurrency("UF")}
                >UF</button>
                <button
                  type="button"
                  className={`px-4 py-1.5 text-sm font-medium border-l transition-colors ${currency === "CLP" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setCurrency("CLP")}
                >$ CLP</button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Monto CAPEX</Label>
              <Input
                type="number"
                min="0"
                step={currency === "UF" ? "0.01" : "1"}
                value={capexAmount}
                onChange={e => setCapexAmount(e.target.value)}
                placeholder="0"
              />
              {capexAmount && ufValue > 0 && currency === "CLP" && (
                <p className="text-xs text-muted-foreground">≈ {formatUF(parseFloat(capexAmount) / ufValue)}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Monto OPEX</Label>
              <Input
                type="number"
                min="0"
                step={currency === "UF" ? "0.01" : "1"}
                value={opexAmount}
                onChange={e => setOpexAmount(e.target.value)}
                placeholder="0"
              />
              {opexAmount && ufValue > 0 && currency === "CLP" && (
                <p className="text-xs text-muted-foreground">≈ {formatUF(parseFloat(opexAmount) / ufValue)}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear presupuesto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ServiceBudgetSection(props: ServiceBudgetSectionProps) {
  return (
    <BudgetProvider>
      <ServiceBudgetContent {...props} />
    </BudgetProvider>
  );
}
