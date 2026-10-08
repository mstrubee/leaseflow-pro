import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AutoplanetInputs, AutoplanetResult, buildDefaultAutoplanetInputs, computeAutoplanet, mergeAutoplanetInputs,
} from "@/lib/autoplanet/model";

// La tabla autoplanet_business_cases es nueva y aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("autoplanet_business_cases");

export interface AutoplanetCaseSummary {
  id: string;
  name: string;
  updated_at: string;
  computed: Partial<Pick<AutoplanetResult, "tir" | "van" | "totalCapex">> | null;
}

// ───────── Listado ─────────
export function useAutoplanetCases() {
  const [cases, setCases] = useState<AutoplanetCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await table()
      .select("id, name, updated_at, computed")
      .order("updated_at", { ascending: false });
    if (err) setError(err.message);
    else setCases((data ?? []) as AutoplanetCaseSummary[]);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (name: string): Promise<string | null> => {
    const { data: u } = await supabase.auth.getUser();
    const inputs = buildDefaultAutoplanetInputs({ nombre: name });
    const { data, error: err } = await table()
      .insert({ name, inputs, computed: computeAutoplanet(inputs), created_by: u?.user?.id ?? null })
      .select("id")
      .single();
    if (err) throw err;
    return data?.id ?? null;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error: err } = await table().delete().eq("id", id);
    if (err) throw err;
    setCases((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { cases, loading, error, reload, create, remove };
}

// ───────── Editor de un caso ─────────
export function useAutoplanetCase(caseId: string) {
  const [name, setName] = useState("");
  const [inputs, setInputs] = useState<AutoplanetInputs | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Deshacer (Ctrl+Z): mismo criterio que el Business Case de contratos — ediciones
  // consecutivas del mismo campo en una ráfaga se colapsan en un solo paso.
  const historyRef = useRef<AutoplanetInputs[]>([]);
  const lastEditRef = useRef<{ key: string; time: number } | null>(null);
  const initialRef = useRef<AutoplanetInputs | null>(null);
  const UNDO_BURST_MS = 800;
  const UNDO_MAX = 50;

  const pushHistory = useCallback((prev: AutoplanetInputs, editKey: string) => {
    const now = Date.now();
    const last = lastEditRef.current;
    if (!last || last.key !== editKey || now - last.time > UNDO_BURST_MS) {
      historyRef.current.push(prev);
      if (historyRef.current.length > UNDO_MAX) historyRef.current.shift();
    }
    lastEditRef.current = { key: editKey, time: now };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await table().select("name, inputs").eq("id", caseId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        const merged = mergeAutoplanetInputs(data.inputs as Partial<AutoplanetInputs>, { nombre: data.name });
        setName(data.name);
        setInputs(merged);
        initialRef.current = merged;
        historyRef.current = [];
        lastEditRef.current = null;
        setDirty(false);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  const result = useMemo(() => (inputs ? computeAutoplanet(inputs) : null), [inputs]);

  /** Edición genérica: `key` agrupa ediciones consecutivas para el deshacer. */
  const mutate = useCallback((key: string, fn: (p: AutoplanetInputs) => AutoplanetInputs) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, key);
      return fn(p);
    });
    setDirty(true);
  }, [pushHistory]);

  const update = useCallback(<K extends keyof AutoplanetInputs>(key: K, value: AutoplanetInputs[K]) => {
    mutate(String(key), (p) => ({ ...p, [key]: value }));
  }, [mutate]);

  const updateArr = useCallback((key: "ventaMes" | "ufRates", idx: number, value: number) => {
    mutate(`${key}.${idx}`, (p) => {
      const a = [...(p[key] || [])];
      a[idx] = value;
      return { ...p, [key]: a };
    });
  }, [mutate]);

  const rename = useCallback((value: string) => { setName(value); setDirty(true); }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop() as AutoplanetInputs;
    lastEditRef.current = null;
    setInputs(prev);
    setDirty(initialRef.current ? JSON.stringify(prev) !== JSON.stringify(initialRef.current) : true);
  }, []);

  // Guardado manual — solo desde el botón "Guardar" (igual que Business Case de contratos).
  const save = useCallback(async (): Promise<boolean> => {
    if (!inputs || !result) return false;
    setSaving(true);
    try {
      const { error } = await table()
        .update({ name: name.trim() || "Sin nombre", inputs, computed: result })
        .eq("id", caseId);
      if (error) throw error;
      initialRef.current = inputs;
      setDirty(false);
      return true;
    } finally {
      setSaving(false);
    }
  }, [inputs, result, name, caseId]);

  return { name, rename, inputs, result, loading, notFound, saving, dirty, mutate, update, updateArr, undo, save };
}
