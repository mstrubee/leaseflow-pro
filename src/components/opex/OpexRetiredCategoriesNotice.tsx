import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface RetiredWithBudget {
  name: string;
  amountClp: number;
}

// Aviso solo visual para el cierre del año: categorías retiradas sin destino que tienen presupuesto del año que se cierra.
// El cierre lo copiará al año siguiente y "Aplicar categorías" no podrá ejecutarse hasta fusionarlas con otra.
// No cambia la lógica del cierre ni escribe nada.
export const OpexRetiredCategoriesNotice = ({ year }: { year: number }) => {
  const [retired, setRetired] = useState<RetiredWithBudget[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: mappings } = await supabase
        .from("opex_category_mappings")
        .select("from_category_id")
        .eq("year", year + 1)
        .is("to_category_id", null)
        .is("applied_at", null);
      const ids = (mappings || []).map((m) => m.from_category_id);
      if (ids.length === 0) return;
      const [budgetRes, categoriesRes] = await Promise.all([
        supabase.from("opex_master_budget").select("category_id, amount_clp").eq("year", year).in("category_id", ids),
        supabase.from("opex_categories").select("id, name").in("id", ids),
      ]);
      const names = new Map((categoriesRes.data || []).map((c) => [c.id, c.name]));
      const withBudget = (budgetRes.data || [])
        .filter((b) => Math.abs(b.amount_clp ?? 0) > 0)
        .map((b) => ({ name: names.get(b.category_id) ?? "Categoría", amountClp: Math.abs(b.amount_clp ?? 0) }));
      if (!cancelled) setRetired(withBudget);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  if (retired.length === 0) return null;

  return (
    <Alert className="border-amber-500 text-left">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Categorías retiradas con presupuesto {year}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>
          Este cierre copiará su presupuesto a {year + 1} y "Aplicar categorías {year + 1}" no podrá ejecutarse hasta
          fusionarlas con otra categoría (Planificar Presupuesto {year + 1}, pestaña "Por categoría").
        </p>
        <ul className="list-disc list-inside text-xs">
          {retired.map((r) => (
            <li key={r.name}>
              {r.name}: $ {Math.round(r.amountClp).toLocaleString("es-CL")}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};
