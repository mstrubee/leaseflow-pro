import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";

interface CapexCompanySplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  companyNames: string[];
  /** Monto total de referencia (CLP) para calcular % <-> monto en modo "Monto". */
  totalAmountClp?: number;
}

interface ExistingSplitRow {
  id: string;
  company_name: string;
  percentage: number;
}

/**
 * Reparte el complemento (100% - X, o total - X) entre las demás empresas
 * cuando el usuario edita el % de una de ellas.
 * - 2 empresas: la otra recibe exactamente el complemento.
 * - 3+ empresas: el complemento se reparte proporcionalmente al peso previo
 *   de las demás (o parejo si todas estaban en 0).
 */
function redistribute(
  percentages: Record<string, number>,
  changedCompany: string,
  newValue: number
): Record<string, number> {
  const clamped = Math.max(0, Math.min(100, newValue));
  const others = Object.keys(percentages).filter((c) => c !== changedCompany);
  const remaining = 100 - clamped;

  if (others.length === 0) {
    return { ...percentages, [changedCompany]: clamped };
  }

  const othersOldSum = others.reduce((acc, c) => acc + (percentages[c] || 0), 0);
  const result: Record<string, number> = { ...percentages, [changedCompany]: clamped };

  if (othersOldSum > 0) {
    others.forEach((c) => {
      result[c] = (remaining * (percentages[c] || 0)) / othersOldSum;
    });
  } else {
    others.forEach((c) => {
      result[c] = remaining / others.length;
    });
  }

  return result;
}

export const CapexCompanySplitDialog = ({
  open,
  onOpenChange,
  contractId,
  companyNames,
  totalAmountClp,
}: CapexCompanySplitDialogProps) => {
  const [mode, setMode] = useState<"percentage" | "amount">("percentage");
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [existingRows, setExistingRows] = useState<ExistingSplitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("capex_company_splits")
        .select("id, company_name, percentage")
        .eq("contract_id", contractId);

      if (error) {
        toast.error("Error al cargar los % de CAPEX por empresa");
        setLoading(false);
        return;
      }

      const rows: ExistingSplitRow[] = data || [];
      setExistingRows(rows);

      const initial: Record<string, number> = {};
      if (rows.length > 0) {
        companyNames.forEach((name) => {
          const row = rows.find((r) => r.company_name === name);
          initial[name] = row ? Number(row.percentage) : 0;
        });
      } else {
        // Sin splits cargados: default parejo entre las empresas del contrato.
        const even = companyNames.length > 0 ? 100 / companyNames.length : 0;
        companyNames.forEach((name) => {
          initial[name] = even;
        });
      }
      setPercentages(initial);
      setMode("percentage");
      setLoading(false);
    })();
  }, [open, contractId, companyNames]);

  const handlePercentageChange = (company: string, rawValue: string) => {
    const value = rawValue === "" ? 0 : parseFloat(rawValue);
    if (!Number.isFinite(value)) return;
    setPercentages((prev) => redistribute(prev, company, value));
  };

  const handleAmountChange = (company: string, rawValue: string) => {
    const total = totalAmountClp || 0;
    if (total <= 0) return;
    const amount = rawValue === "" ? 0 : parseFloat(rawValue);
    if (!Number.isFinite(amount)) return;
    const pct = (amount / total) * 100;
    setPercentages((prev) => redistribute(prev, company, pct));
  };

  const getAmountForCompany = (company: string): number => {
    const total = totalAmountClp || 0;
    if (total <= 0) return 0;
    return (total * (percentages[company] || 0)) / 100;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const company of companyNames) {
        const pct = percentages[company] || 0;
        const existing = existingRows.find((r) => r.company_name === company);

        if (pct <= 0) {
          if (existing) {
            const { error } = await (supabase as any)
              .from("capex_company_splits")
              .delete()
              .eq("id", existing.id);
            if (error) throw error;
          }
          continue;
        }

        if (existing) {
          const { error } = await (supabase as any)
            .from("capex_company_splits")
            .update({ percentage: pct })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any)
            .from("capex_company_splits")
            .insert({
              contract_id: contractId,
              company_name: company,
              percentage: pct,
            });
          if (error) throw error;
        }
      }

      toast.success("Distribución de CAPEX por empresa guardada");
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving capex_company_splits:", error);
      toast.error("Error al guardar la distribución de CAPEX por empresa");
    } finally {
      setSaving(false);
    }
  };

  const totalPct = Object.values(percentages).reduce((acc, v) => acc + v, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>CAPEX por Empresa</DialogTitle>
          <DialogDescription>
            Distribuya el CAPEX de este contrato entre las empresas asociadas. Al
            editar el % (o el monto) de una empresa, el de las demás se ajusta
            automáticamente para sumar el total.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "percentage" | "amount")}>
              <TabsList>
                <TabsTrigger value="percentage">%</TabsTrigger>
                <TabsTrigger value="amount" disabled={!totalAmountClp || totalAmountClp <= 0}>
                  Monto
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-2 gap-4">
              {companyNames.map((company) => (
                <div key={company} className="space-y-2 border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <CompanyLogo companyName={company} size="md" />
                    <span className="text-sm font-medium truncate">{company}</span>
                  </div>
                  {mode === "percentage" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={Number.isFinite(percentages[company]) ? Math.round((percentages[company] || 0) * 100) / 100 : 0}
                        onChange={(e) => handlePercentageChange(company, e.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={Math.round(getAmountForCompany(company))}
                      onChange={(e) => handleAmountChange(company, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Total: {Math.round(totalPct * 100) / 100}%
              {Math.abs(totalPct - 100) > 0.01 && (
                <span className="text-amber-600"> (debería sumar 100%)</span>
              )}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
