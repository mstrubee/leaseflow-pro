import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import { BCInputs, BCSeed, buildDefaultBCInputs, computeBC } from "@/lib/businessCase/model";

interface Args {
  contractId: string;
  seed: BCSeed;
  enabled: boolean;
}

export function useBusinessCaseV2({ contractId, seed, enabled }: Args) {
  const { config, loading: cfgLoading } = useBusinessCaseAdminConfig();
  const [inputs, setInputs] = useState<BCInputs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loadedRef = useRef(false);
  // Historial de deshacer (Ctrl+Z) — snapshots de `inputs` previos a cada
  // edición. Ediciones consecutivas sobre el mismo campo dentro de una
  // "ráfaga" (ej. tipear dígito a dígito) se colapsan en un solo paso de
  // undo, para no tener que apretar Ctrl+Z una vez por tecla.
  const historyRef = useRef<BCInputs[]>([]);
  const lastEditRef = useRef<{ key: string; time: number } | null>(null);
  const initialInputsRef = useRef<BCInputs | null>(null);
  const UNDO_BURST_MS = 800;
  const UNDO_MAX = 50;
  const pushHistory = useCallback((prev: BCInputs, editKey: string) => {
    const now = Date.now();
    const last = lastEditRef.current;
    if (!last || last.key !== editKey || now - last.time > UNDO_BURST_MS) {
      historyRef.current.push(prev);
      if (historyRef.current.length > UNDO_MAX) historyRef.current.shift();
    }
    lastEditRef.current = { key: editKey, time: now };
  }, []);

  // Cargar una vez (cuando la config global esté lista y el diálogo abierto)
  useEffect(() => {
    if (!enabled || cfgLoading || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("contract_business_cases")
          .select("inputs")
          .eq("contract_id", contractId)
          .maybeSingle();
        const stored = data?.inputs as unknown as Partial<BCInputs> | null;
        // Detectar modelo nuevo (tiene 'categoria' / 'ufRates'); si no, usar defaults+seed
        let merged: BCInputs;
        if (stored && (stored as BCInputs).categoria !== undefined && Array.isArray((stored as BCInputs).ufRates)) {
          merged = { ...buildDefaultBCInputs(seed, config), ...(stored as BCInputs) };
        } else {
          merged = buildDefaultBCInputs(seed, config);
        }
        setInputs(merged);
        initialInputsRef.current = merged;
        historyRef.current = [];
        lastEditRef.current = null;
      } catch {
        const fallback = buildDefaultBCInputs(seed, config);
        setInputs(fallback);
        initialInputsRef.current = fallback;
        historyRef.current = [];
        lastEditRef.current = null;
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cfgLoading, contractId]);

  const result = useMemo(() => (inputs ? computeBC(inputs, config) : null), [inputs, config]);

  const update = useCallback(<K extends keyof BCInputs>(key: K, value: BCInputs[K]) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, String(key));
      return { ...p, [key]: value };
    });
    setDirty(true);
  }, [pushHistory]);

  const updateArr = useCallback((key: keyof BCInputs, idx: number, value: number) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, `${String(key)}.${idx}`);
      const a = [...((p[key] as unknown as number[]) || [])];
      a[idx] = value;
      return { ...p, [key]: a } as BCInputs;
    });
    setDirty(true);
  }, [pushHistory]);

  const setInvOverride = useCallback((lineId: string, value: number | null) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, `inv.${lineId}`);
      const ov = { ...p.invOverrides };
      if (value === null || !Number.isFinite(value)) delete ov[lineId];
      else ov[lineId] = value;
      return { ...p, invOverrides: ov };
    });
    setDirty(true);
  }, [pushHistory]);

  // Ctrl+Z / Cmd+Z — restaura el snapshot anterior más reciente. No hay
  // límite hacia "redo": es deshacer simple, no un historial bidireccional.
  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop() as BCInputs;
    lastEditRef.current = null;
    setInputs(prev);
    setDirty(initialInputsRef.current ? JSON.stringify(prev) !== JSON.stringify(initialInputsRef.current) : true);
  }, []);

  // Guardado manual — se dispara solo desde el botón "Guardar", nunca
  // automáticamente.
  const save = useCallback(async () => {
    if (!inputs || !result) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("contract_business_cases").upsert(
        {
          contract_id: contractId,
          inputs: inputs as unknown as Record<string, unknown>,
          computed: result as unknown as Record<string, unknown>,
          created_by: u?.user?.id ?? null,
        } as never,
        { onConflict: "contract_id" },
      );
      initialInputsRef.current = inputs;
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [inputs, result, contractId]);

  return {
    config,
    inputs,
    result,
    loading: loading || cfgLoading,
    saving,
    dirty,
    update,
    updateArr,
    setInvOverride,
    undo,
    save,
  };
}
