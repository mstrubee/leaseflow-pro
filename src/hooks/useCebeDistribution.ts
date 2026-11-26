import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchContractCebes } from "@/hooks/useContractCebes";
import { cebeLabel } from "@/lib/contractCebes";
import {
  DistRow,
  applyAmountEdit,
  applyPercentEdit,
  emptyRows,
  isMixedLocal,
  rescaleRows,
  syncRowsWithCebes,
  validateDistribution,
} from "@/lib/cebeDistribution";

export interface CebeOption {
  id: string;
  cebe: string;
  companyId: string;
  companyName: string | null;
  /** "H04C8P1290 · Empresa X" */
  label: string;
}

/**
 * CEBE de un local (contract_cebes). Un local es MIXTO si tiene 2 o más — se detecta solo,
 * sin listas fijas de locales. `loading` es true hasta que se sepa (hasta entonces no se
 * debe asumir que el local NO es mixto).
 */
export function useContractCebeSet(contractId: string | null | undefined) {
  const [cebes, setCebes] = useState<CebeOption[]>([]);
  const [loading, setLoading] = useState(!!contractId);

  useEffect(() => {
    if (!contractId) {
      setCebes([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await fetchContractCebes(contractId);
        const companyIds = [...new Set(rows.map((r) => r.company_id))];
        let names: Record<string, string> = {};
        if (companyIds.length > 0) {
          const { data } = await supabase.from("companies").select("id, name").in("id", companyIds);
          names = Object.fromEntries((data || []).map((c) => [c.id, c.name]));
        }
        if (cancelled) return;
        setCebes(
          rows.map((r) => ({
            id: r.id,
            cebe: r.cebe,
            companyId: r.company_id,
            companyName: names[r.company_id] ?? null,
            label: cebeLabel(r.cebe, names[r.company_id]),
          })),
        );
      } catch (error) {
        // Sin la tabla (migración pendiente) el local se trata como de un solo CEBE.
        console.error("Error loading contract CEBEs:", error);
        if (!cancelled) setCebes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  return { cebes, isMixed: isMixedLocal(cebes.length), loading };
}

/**
 * Estado de la distribución de un documento entre `cebeIds` para un total en pesos.
 * Se re-ajusta solo si cambia el total (conserva proporciones) o la lista de CEBE.
 */
export function useCebeDistribution(cebeIds: string[], totalClp: number) {
  const key = cebeIds.join("|");
  const [rows, setRows] = useState<DistRow[]>(() => emptyRows(cebeIds));
  const total = Math.max(0, Math.round(totalClp || 0));

  useEffect(() => {
    setRows((prev) => rescaleRows(syncRowsWithCebes(prev, cebeIds), total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, total]);

  const edit = useCallback(
    (idx: number, field: "amount" | "percent", value: number) =>
      setRows((prev) => (field === "amount" ? applyAmountEdit(prev, idx, value, total) : applyPercentEdit(prev, idx, value, total))),
    [total],
  );

  /** Reemplaza las filas (p. ej. al heredar la distribución de un documento previo). */
  const reset = useCallback(
    (next?: DistRow[]) => setRows(next ? rescaleRows(syncRowsWithCebes(next, cebeIds), total) : emptyRows(cebeIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, total],
  );

  const check = useMemo(() => validateDistribution(rows, total, cebeIds), [rows, total, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rows, edit, reset, check, total };
}
