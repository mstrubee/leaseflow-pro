import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  OPEX_CATEGORY_COLUMNS,
  buildMappingIndex,
  isCategoryValidForYear,
  type CategoryMapping,
  type OpexCategoryRecord,
} from "@/lib/opexCategories";

export type CategoryChangeKind = "merge" | "rename" | "retire";

// Un fusionar, renombrar o retirar = un lote (batch_id) en opex_category_mappings.
export interface CategoryChangeBatch {
  batchId: string;
  kind: CategoryChangeKind;
  fromIds: string[];
  toId: string | null;
  applied: boolean;
}

// Una fusión (o renombre) = la categoría final con todas las categorías que apuntan a ella en el año planificado.
// Puede estar formada por varios lotes si después se le agregaron categorías.
export interface CategoryFusion {
  toId: string;
  fromIds: string[];
  batches: Array<{ batchId: string; targetCreated: boolean }>;
  applied: boolean;
  // La categoría final la creó una fusión de este año: solo entonces puede renombrarse (no cambia años anteriores).
  createdByChange: boolean;
  kind: "merge" | "rename";
}

export interface ApplyCategoriesResult {
  mappings_applied: number;
  budget_rows_merged: number;
  additional_rows_merged: number;
  plan_items_moved: number;
  supplier_links_added: number;
  purchase_orders_with_old_category: number;
}

// Lo que informa la base al deshacer una fusión: registros que volvieron a una categoría original.
export interface UndoCategoryResult {
  final_category_deleted: boolean;
  moved_to_category_id?: string;
  plan_items_moved?: number;
  purchase_orders_moved?: number;
  budget_rows_merged?: number;
  additional_rows_merged?: number;
  supplier_links_added?: number;
}

export const summarizeUndo = (result: UndoCategoryResult | null) => {
  if (!result?.final_category_deleted) return "";
  const parts = [
    [result.plan_items_moved, "OPEX agregado"],
    [result.purchase_orders_moved, "OC"],
    [result.budget_rows_merged, "filas de presupuesto"],
    [result.additional_rows_merged, "adicionales por local"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, label]) => `${n} ${label}`);
  return parts.length > 0 ? ` Volvieron a la categoría original: ${parts.join(", ")}.` : "";
};

interface Params {
  baseYear: number;
  planYear: number;
  enabled: boolean;
  // Categorías del año planificado que ya tienen OPEX agregado (cualquier línea, también excluida).
  planItemCategoryIds: Set<string>;
  // Se llama después de cada cambio para que la ventana recargue sus datos.
  onChanged?: () => void;
}

const errorText = (error: { message?: string } | null, fallback: string) => error?.message || fallback;

// Lee y administra los cambios de categorías (renombrar, fusionar, retirar) del año planificado.
// Las reglas viven en funciones de la base (todo o nada); aquí solo se llaman y se muestran sus mensajes.
export const useOpexCategoryChanges = ({ baseYear, planYear, enabled, planItemCategoryIds, onChanged }: Params) => {
  const [allCategories, setAllCategories] = useState<OpexCategoryRecord[]>([]);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [baseYearClosed, setBaseYearClosed] = useState(false);
  // Categorías con presupuesto o adicionales del año planificado (los crea el cierre del año base).
  const [planBudgetCategoryIds, setPlanBudgetCategoryIds] = useState<Set<string>>(new Set());
  // Presupuesto maestro del año base por categoría (CLP, valor absoluto): lo que el cierre copiará al año planificado.
  const [baseBudgetClp, setBaseBudgetClp] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [lastApply, setLastApply] = useState<ApplyCategoriesResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [categoriesRes, mappingsRes, masterRes, additionalRes] = await Promise.all([
      supabase.from("opex_categories").select(OPEX_CATEGORY_COLUMNS).order("display_order"),
      supabase
        .from("opex_category_mappings")
        .select("id, batch_id, year, from_category_id, to_category_id, target_created, applied_at")
        .eq("year", planYear),
      supabase
        .from("opex_master_budget")
        .select("year, category_id, amount_uf, amount_clp, is_closed")
        .in("year", [baseYear, planYear]),
      supabase.from("opex_local_additional").select("category_id, amount_uf").eq("year", planYear),
    ]);
    const failed = categoriesRes.error || mappingsRes.error || masterRes.error || additionalRes.error;
    if (failed) {
      console.error("Error loading OPEX category changes:", failed);
      toast.error("Error al cargar los cambios de categorías");
      return;
    }
    setAllCategories(categoriesRes.data || []);
    setMappings(mappingsRes.data || []);
    const master = masterRes.data || [];
    setBaseYearClosed(master.some((r) => r.year === baseYear && r.is_closed));
    setBaseBudgetClp(
      new Map(master.filter((r) => r.year === baseYear).map((r) => [r.category_id, Math.abs(r.amount_clp ?? 0)])),
    );
    const withAmounts = new Set<string>();
    master
      .filter((r) => r.year === planYear && ((r.amount_uf ?? 0) !== 0 || (r.amount_clp ?? 0) !== 0))
      .forEach((r) => withAmounts.add(r.category_id));
    (additionalRes.data || []).filter((r) => (r.amount_uf ?? 0) !== 0).forEach((r) => withAmounts.add(r.category_id));
    setPlanBudgetCategoryIds(withAmounts);
  }, [baseYear, planYear]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const mappingIndex = useMemo(() => buildMappingIndex(mappings), [mappings]);
  const planCategories = useMemo(
    () => allCategories.filter((c) => isCategoryValidForYear(c, planYear)),
    [allCategories, planYear],
  );

  const batches = useMemo<CategoryChangeBatch[]>(() => {
    const byBatch = new Map<string, CategoryMapping[]>();
    mappings.forEach((m) => byBatch.set(m.batch_id, [...(byBatch.get(m.batch_id) ?? []), m]));
    return Array.from(byBatch, ([batchId, rows]) => ({
      batchId,
      fromIds: rows.map((r) => r.from_category_id),
      toId: rows[0].to_category_id,
      applied: rows.some((r) => r.applied_at !== null),
      kind: rows[0].to_category_id === null ? "retire" : rows.length === 1 && rows[0].target_created ? "rename" : "merge",
    }));
  }, [mappings]);

  const fusions = useMemo<CategoryFusion[]>(() => {
    const byTarget = new Map<string, CategoryMapping[]>();
    mappings.forEach((m) => {
      if (m.to_category_id) byTarget.set(m.to_category_id, [...(byTarget.get(m.to_category_id) ?? []), m]);
    });
    return Array.from(byTarget, ([toId, rows]) => {
      const batchFlags = new Map<string, boolean>();
      rows.forEach((r) => batchFlags.set(r.batch_id, (batchFlags.get(r.batch_id) ?? false) || r.target_created));
      const createdByChange = rows.some((r) => r.target_created);
      return {
        toId,
        fromIds: rows.map((r) => r.from_category_id),
        batches: Array.from(batchFlags, ([batchId, targetCreated]) => ({ batchId, targetCreated })),
        applied: rows.some((r) => r.applied_at !== null),
        createdByChange,
        kind: rows.length === 1 && createdByChange ? ("rename" as const) : ("merge" as const),
      };
    });
  }, [mappings]);
  const retirements = useMemo(() => batches.filter((b) => b.kind === "retire"), [batches]);

  const pendingBatches = useMemo(() => batches.filter((b) => !b.applied), [batches]);
  // Con algún cambio ya aplicado, fusionar, retirar y deshacer quedan bloqueados para ese año.
  const locked = useMemo(() => mappings.some((m) => m.applied_at !== null), [mappings]);

  const hasPlanAmounts = useCallback(
    (categoryId: string) => planItemCategoryIds.has(categoryId) || planBudgetCategoryIds.has(categoryId),
    [planItemCategoryIds, planBudgetCategoryIds],
  );

  // Retiradas sin destino que ya tienen montos para el año planificado: "Aplicar" se negaría.
  const blockingRetirements = useMemo(
    () =>
      mappings
        .filter((m) => m.applied_at === null && m.to_category_id === null && hasPlanAmounts(m.from_category_id))
        .map((m) => ({ batchId: m.batch_id, categoryId: m.from_category_id })),
    [mappings, hasPlanAmounts],
  );

  // Retiradas sin destino con presupuesto del año base: el cierre lo copiará al año planificado y "Aplicar" fallará.
  const retirementsWithBaseBudget = useMemo(
    () =>
      baseYearClosed
        ? []
        : mappings
            .filter((m) => m.applied_at === null && m.to_category_id === null && (baseBudgetClp.get(m.from_category_id) ?? 0) > 0)
            .map((m) => ({ batchId: m.batch_id, categoryId: m.from_category_id, amountClp: baseBudgetClp.get(m.from_category_id) ?? 0 })),
    [mappings, baseBudgetClp, baseYearClosed],
  );

  const run = async (action: () => PromiseLike<{ error: { message?: string } | null }>, failure: string) => {
    setBusy(true);
    try {
      const { error } = await action();
      if (error) {
        toast.error(errorText(error, failure));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const merge = async (fromIds: string[], toId: string | null, toName: string | null) => {
    const ok = await run(
      () => supabase.rpc("merge_opex_categories", { p_year: planYear, p_from: fromIds, p_to_id: toId, p_to_name: toName }),
      "No se pudo fusionar las categorías",
    );
    if (ok) {
      toast.success(`Cambio guardado: rige desde ${planYear}`);
      await refresh();
    }
    return ok;
  };

  const retire = async (categoryId: string) => {
    const ok = await run(
      () => supabase.rpc("retire_opex_category", { p_year: planYear, p_category_id: categoryId }),
      "No se pudo retirar la categoría",
    );
    if (ok) {
      toast.success(`Categoría retirada desde ${planYear}`);
      await refresh();
    }
    return ok;
  };

  const undo = async (batchId: string) => {
    const ok = await run(() => supabase.rpc("undo_opex_category_change", { p_batch: batchId }), "No se pudo deshacer");
    if (ok) {
      toast.success("Cambio deshecho");
      await refresh();
    }
    return ok;
  };

  // Edita una fusión: nombre de la categoría final, categorías que se agregan y categorías que se quitan (todo o nada).
  const updateFusion = async (input: { toId: string; newName: string | null; add: string[]; remove: string[] }) => {
    const ok = await run(
      () =>
        supabase.rpc("update_opex_category_merge", {
          p_year: planYear,
          p_to_id: input.toId,
          p_new_name: input.newName,
          p_add: input.add,
          p_remove: input.remove,
        }),
      "No se pudo editar la fusión",
    );
    if (ok) {
      toast.success("Fusión actualizada");
      await refresh();
    }
    return ok;
  };

  // Deshace una fusión completa. Siempre se permite mientras no se apliquen las categorías: si la categoría final ya
  // tiene montos, la base los devuelve a una categoría original (moveToId, o la primera de la fusión) y la elimina.
  // Deshacer el lote que la creó desarma toda la fusión (también lo agregado con Editar). Si la fusión es hacia una
  // categoría que ya existía, se desarma lote por lote y no se mueve nada.
  const undoFusion = async (fusion: CategoryFusion, moveToId?: string) => {
    const creator = fusion.batches.find((b) => b.targetCreated);
    const targets = creator ? [creator] : fusion.batches;
    setBusy(true);
    try {
      let summary = "";
      for (const batch of targets) {
        const { data, error } = await supabase.rpc("undo_opex_category_change", {
          p_batch: batch.batchId,
          p_move_to: moveToId ?? null,
        });
        if (error) {
          toast.error(errorText(error, "No se pudo deshacer la fusión"));
          await refresh();
          return false;
        }
        summary += summarizeUndo(data as unknown as UndoCategoryResult);
      }
      toast.success(`Fusión deshecha.${summary}`);
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  // Una retirada sin destino que tiene montos pasa a ser una fusión: se deshace el retiro y se fusiona con el destino.
  // Son dos llamadas; si la segunda falla, la categoría queda vigente de nuevo (sin pérdida de datos).
  const reassignRetired = async (batchId: string, categoryId: string, toId: string) => {
    const undone = await run(() => supabase.rpc("undo_opex_category_change", { p_batch: batchId }), "No se pudo deshacer el retiro");
    if (!undone) return false;
    const merged = await run(
      () => supabase.rpc("merge_opex_categories", { p_year: planYear, p_from: [categoryId], p_to_id: toId, p_to_name: null }),
      "No se pudo fusionar",
    );
    if (!merged) toast.info("El retiro se deshizo: la categoría volvió a estar vigente. Intenta la fusión de nuevo.");
    else toast.success(`Categoría fusionada: rige desde ${planYear}`);
    await refresh();
    return merged;
  };

  const apply = async () => {
    setBusy(true);
    setApplyError(null);
    try {
      const { data, error } = await supabase.rpc("apply_opex_category_mappings", { p_year: planYear });
      if (error) {
        const message = errorText(error, "No se pudieron aplicar las categorías");
        setApplyError(message);
        toast.error(message);
        // Recarga para detectar qué categorías impiden aplicar (se ofrece "Fusionar con...").
        await load();
        return false;
      }
      setLastApply(data as unknown as ApplyCategoriesResult);
      toast.success(`Categorías ${planYear} aplicadas`);
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  return {
    allCategories,
    planCategories,
    mappings,
    mappingIndex,
    batches,
    fusions,
    retirements,
    pendingBatches,
    locked,
    baseYearClosed,
    blockingRetirements,
    retirementsWithBaseBudget,
    hasPlanAmounts,
    busy,
    lastApply,
    applyError,
    reload: load,
    merge,
    retire,
    undo,
    updateFusion,
    undoFusion,
    reassignRetired,
    apply,
  };
};
