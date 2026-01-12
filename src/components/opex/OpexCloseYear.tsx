import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OpexCloseYearProps {
  year: number;
  ufValue: number;
  onSuccess: () => void;
}

interface CarryoverData {
  contract_id: string;
  contract_name: string;
  category_id: string;
  category_name: string;
  not_invoiced_uf: number;
}

export const OpexCloseYear = ({ year, ufValue, onSuccess }: OpexCloseYearProps) => {
  const [step, setStep] = useState<"initial" | "confirm" | "processing">("initial");
  const [isOpen, setIsOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [carryoverData, setCarryoverData] = useState<CarryoverData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadCarryoverData = async () => {
    setIsLoading(true);
    try {
      // Get all OPEX purchase orders for this year with invoice data
      const { data: orders } = await supabase
        .from("purchase_orders")
        .select(`
          id,
          contract_id,
          amount_uf,
          opex_category_id,
          created_at,
          contracts!inner(name),
          opex_categories(name),
          invoices(amount_uf, deleted_at)
        `)
        .eq("budget_classification", "OPEX")
        .is("deleted_at", null);

      // Filter by year
      const yearOrders = (orders || []).filter((o: any) => {
        const orderYear = new Date(o.created_at).getFullYear();
        return orderYear === year;
      });

      // Calculate not invoiced amounts per contract/category
      const carryoverMap = new Map<string, CarryoverData>();

      yearOrders.forEach((order: any) => {
        const key = `${order.contract_id}-${order.opex_category_id}`;
        const orderAmount = order.amount_uf || 0;
        const invoicedAmount = (order.invoices || [])
          .filter((inv: any) => !inv.deleted_at)
          .reduce((sum: number, inv: any) => sum + (inv.amount_uf || 0), 0);
        const notInvoiced = orderAmount - invoicedAmount;

        if (notInvoiced > 0) {
          const existing = carryoverMap.get(key);
          if (existing) {
            existing.not_invoiced_uf += notInvoiced;
          } else {
            carryoverMap.set(key, {
              contract_id: order.contract_id,
              contract_name: order.contracts?.name || "Sin contrato",
              category_id: order.opex_category_id,
              category_name: order.opex_categories?.name || "Sin categoría",
              not_invoiced_uf: notInvoiced,
            });
          }
        }
      });

      setCarryoverData(Array.from(carryoverMap.values()));
    } catch (error) {
      console.error("Error loading carryover data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = async () => {
    setIsOpen(true);
    setStep("initial");
    setConfirmText("");
    await loadCarryoverData();
  };

  const handleFirstConfirm = () => {
    setStep("confirm");
    setConfirmText("");
  };

  const handleCloseYear = async () => {
    if (confirmText !== `CERRAR ${year}`) {
      toast.error("El texto de confirmación no coincide");
      return;
    }

    setStep("processing");
    setIsLoading(true);

    try {
      const nextYear = year + 1;

      // 1. Close all master budgets for this year
      await supabase
        .from("opex_master_budget")
        .update({ is_closed: true, closed_at: new Date().toISOString() })
        .eq("year", year);

      // 2. Get master budgets from current year to copy to next year
      const { data: currentBudgets } = await supabase
        .from("opex_master_budget")
        .select("*")
        .eq("year", year);

      // 3. Check if next year already has budgets
      const { data: existingNextYear } = await supabase
        .from("opex_master_budget")
        .select("id")
        .eq("year", nextYear)
        .limit(1);

      // 4. If next year doesn't have budgets, create them from current year
      if (!existingNextYear || existingNextYear.length === 0) {
        if (currentBudgets && currentBudgets.length > 0) {
          const newBudgets = currentBudgets.map((budget) => ({
            year: nextYear,
            category_id: budget.category_id,
            amount_uf: budget.amount_uf,
            amount_clp: budget.amount_clp,
            month_01_clp: budget.month_01_clp,
            month_02_clp: budget.month_02_clp,
            month_03_clp: budget.month_03_clp,
            month_04_clp: budget.month_04_clp,
            month_05_clp: budget.month_05_clp,
            month_06_clp: budget.month_06_clp,
            month_07_clp: budget.month_07_clp,
            month_08_clp: budget.month_08_clp,
            month_09_clp: budget.month_09_clp,
            month_10_clp: budget.month_10_clp,
            month_11_clp: budget.month_11_clp,
            month_12_clp: budget.month_12_clp,
            uf_value_at_entry: ufValue,
          }));

          await supabase.from("opex_master_budget").insert(newBudgets);
        }
      }

      // 5. Create local additionals in next year for not invoiced amounts
      if (carryoverData.length > 0) {
        for (const item of carryoverData) {
          // Check if additional already exists
          const { data: existing } = await supabase
            .from("opex_local_additional")
            .select("id, amount_uf")
            .eq("contract_id", item.contract_id)
            .eq("category_id", item.category_id)
            .eq("year", nextYear)
            .single();

          if (existing) {
            // Add to existing
            await supabase
              .from("opex_local_additional")
              .update({
                amount_uf: existing.amount_uf + item.not_invoiced_uf,
                notes: `Incluye arrastre de ${year}: ${item.not_invoiced_uf.toFixed(2)} UF`,
              })
              .eq("id", existing.id);
          } else {
            // Create new
            await supabase.from("opex_local_additional").insert({
              contract_id: item.contract_id,
              category_id: item.category_id,
              year: nextYear,
              amount_uf: item.not_invoiced_uf,
              notes: `Arrastre de ${year}`,
            });
          }
        }
      }

      toast.success(`OPEX ${year} cerrado. OPEX ${nextYear} creado con arrastres.`);
      setIsOpen(false);
      setStep("initial");
      onSuccess();
    } catch (error) {
      console.error("Error closing year:", error);
      toast.error("Error al cerrar el año OPEX");
      setStep("confirm");
    } finally {
      setIsLoading(false);
    }
  };

  const totalCarryover = carryoverData.reduce((sum, item) => sum + item.not_invoiced_uf, 0);

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpenDialog}>
        <Lock className="h-4 w-4 mr-2" />
        Cerrar {year}
      </Button>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="max-w-lg">
          {step === "initial" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Cerrar OPEX {year}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4">
                    <p>
                      Al cerrar el OPEX {year}, se realizarán las siguientes acciones:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Se bloquearán todas las modificaciones del año {year}</li>
                      <li>Se creará el OPEX {year + 1} con la misma estructura</li>
                      <li>Los saldos no facturados se arrastrarán como adicionales</li>
                    </ul>

                    {isLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    ) : carryoverData.length > 0 ? (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Saldos a arrastrar:</span>
                          <Badge variant="secondary">
                            {totalCarryover.toFixed(2)} UF
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
                          {carryoverData.map((item, idx) => (
                            <div key={idx} className="flex justify-between py-0.5">
                              <span>{item.contract_name} - {item.category_name}</span>
                              <span>{item.not_invoiced_uf.toFixed(2)} UF</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 text-sm text-green-700 dark:text-green-400">
                        ✓ Todo el consumo está facturado. No hay saldos pendientes.
                      </div>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleFirstConfirm} className="bg-amber-600 hover:bg-amber-700">
                  Continuar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {step === "confirm" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Confirmar cierre OPEX {year}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4">
                    <p className="text-destructive font-medium">
                      Esta acción no se puede deshacer.
                    </p>
                    <div className="space-y-2">
                      <Label>Escriba "CERRAR {year}" para confirmar:</Label>
                      <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                        placeholder={`CERRAR ${year}`}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setStep("initial")}>Atrás</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCloseYear}
                  disabled={confirmText !== `CERRAR ${year}` || isLoading}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isLoading ? "Procesando..." : "Cerrar OPEX definitivamente"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">Cerrando OPEX {year}...</p>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
