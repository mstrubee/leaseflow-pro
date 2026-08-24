import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getReportBlockers } from "@/components/expenseReports/expenseItemCompleteness";
import type { ExpenseItem, ExpenseItemFields, ExpenseReport } from "@/components/expenseReports/expenseReportsTypes";

const RECEIPTS_BUCKET = "expense-receipts";

/** Lista de informes del usuario actual (o de todos, si es admin — RLS decide). */
export function useExpenseReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("expense_reports" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setReports((data as unknown as ExpenseReport[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const createReport = useCallback(
    async (title: string): Promise<ExpenseReport | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("expense_reports" as any)
        .insert({ created_by: user.id, title } as never)
        .select()
        .single();
      if (error || !data) return null;
      await loadReports();
      return data as unknown as ExpenseReport;
    },
    [user?.id, loadReports],
  );

  const deleteReport = useCallback(
    async (reportId: string) => {
      await supabase.from("expense_reports" as any).delete().eq("id", reportId);
      await loadReports();
    },
    [loadReports],
  );

  return { reports, loading, loadReports, createReport, deleteReport };
}

/** Gastos de un informe puntual, con subida/borrado de foto y envío. */
export function useExpenseItems(reportId: string | null) {
  const { user } = useAuth();
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    if (!reportId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("expense_items" as any)
      .select("*")
      .eq("expense_report_id", reportId)
      .order("created_at", { ascending: true });
    setItems((data as unknown as ExpenseItem[]) || []);
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  /** Crea un gasto vacío de entrada — así tiene id desde el principio (la
   *  foto se sube a expense-receipts/<item.id>/...) y ya se puede "guardar
   *  incompleto y completar después". */
  const createItem = useCallback(async (): Promise<ExpenseItem | null> => {
    if (!reportId || !user?.id) return null;
    setSaving(true);
    const { data, error } = await supabase
      .from("expense_items" as any)
      .insert({ expense_report_id: reportId, created_by: user.id } as never)
      .select()
      .single();
    setSaving(false);
    if (error || !data) return null;
    await loadItems();
    return data as unknown as ExpenseItem;
  }, [reportId, user?.id, loadItems]);

  const updateItem = useCallback(
    async (itemId: string, fields: Partial<ExpenseItemFields>): Promise<boolean> => {
      setSaving(true);
      const { error } = await supabase
        .from("expense_items" as any)
        .update(fields as never)
        .eq("id", itemId);
      setSaving(false);
      if (error) return false;
      await loadItems();
      return true;
    },
    [loadItems],
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (item?.photo_path) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([item.photo_path]).catch(() => {});
      }
      await supabase.from("expense_items" as any).delete().eq("id", itemId);
      await loadItems();
    },
    [items, loadItems],
  );

  const uploadReceiptPhoto = useCallback(
    async (itemId: string, file: File): Promise<boolean> => {
      setSaving(true);
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${itemId}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, file, { upsert: true });
      if (upErr) {
        setSaving(false);
        return false;
      }
      const ok = await updateItem(itemId, { photo_path: `storage://${RECEIPTS_BUCKET}/${path}` });
      setSaving(false);
      return ok;
    },
    [updateItem],
  );

  const deleteReceiptPhoto = useCallback(
    async (itemId: string, photoPath: string) => {
      const bare = photoPath.replace(`storage://${RECEIPTS_BUCKET}/`, "");
      await supabase.storage.from(RECEIPTS_BUCKET).remove([bare]).catch(() => {});
      await updateItem(itemId, { photo_path: null });
    },
    [updateItem],
  );

  /** Revalida completitud (mismo criterio que la UI) y, si está todo OK,
   *  marca el informe como enviado. Devuelve el motivo si bloquea. */
  const sendReport = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const blockers = getReportBlockers(items);
    if (blockers.length > 0) return { ok: false, error: blockers[0] };
    if (!reportId) return { ok: false, error: "Informe no encontrado" };
    const { error } = await supabase
      .from("expense_reports" as any)
      .update({ status: "enviado", sent_at: new Date().toISOString() } as never)
      .eq("id", reportId);
    if (error) return { ok: false, error: "No se pudo enviar el informe" };
    return { ok: true };
  }, [items, reportId]);

  return { items, loading, saving, loadItems, createItem, updateItem, deleteItem, uploadReceiptPhoto, deleteReceiptPhoto, sendReport };
}
