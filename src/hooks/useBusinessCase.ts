import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import {
  BusinessCaseInputs,
  buildDefaultInputs,
  computeBusinessCase,
  applyOverrides,
  ContractSeed,
} from "@/lib/businessCase/calc";

export interface UseBusinessCaseArgs {
  contractId: string;
  seed: ContractSeed;
  enabled: boolean;
}

export function useBusinessCase({ contractId, seed, enabled }: UseBusinessCaseArgs) {
  const { ufValue } = useEconomicIndicators();
  const [inputs, setInputs] = useState<BusinessCaseInputs | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("contract_business_cases")
        .select("id, inputs, overrides")
        .eq("contract_id", contractId)
        .maybeSingle();

      if (data) {
        setRecordId(data.id);
        const stored = (data.inputs as unknown as BusinessCaseInputs) || null;
        const merged = stored
          ? { ...buildDefaultInputs(seed), ...stored }
          : buildDefaultInputs({ ...seed, ufActual: ufValue || seed.ufActual });
        setInputs(merged);
        setOverrides((data.overrides as Record<string, number>) || {});
      } else {
        setRecordId(null);
        setInputs(buildDefaultInputs({ ...seed, ufActual: ufValue || seed.ufActual }));
        setOverrides({});
      }
      setDirty(false);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, enabled, ufValue]);

  useEffect(() => {
    load();
  }, [load]);

  const updateInput = useCallback(<K extends keyof BusinessCaseInputs>(key: K, value: BusinessCaseInputs[K]) => {
    setInputs((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }, []);

  const updateArrayInput = useCallback(
    (key: keyof BusinessCaseInputs, index: number, value: number) => {
      setInputs((prev) => {
        if (!prev) return prev;
        const arrVal = [...((prev[key] as unknown as number[]) || [])];
        arrVal[index] = value;
        return { ...prev, [key]: arrVal } as BusinessCaseInputs;
      });
      setDirty(true);
    },
    [],
  );

  const setOverride = useCallback((key: string, value: number | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === null || !Number.isFinite(value)) delete next[key];
      else next[key] = value;
      return next;
    });
    setDirty(true);
  }, []);

  const resetToDefaults = useCallback(() => {
    setInputs(buildDefaultInputs({ ...seed, ufActual: ufValue || seed.ufActual }));
    setOverrides({});
    setDirty(true);
  }, [seed, ufValue]);

  const baseResult = inputs ? computeBusinessCase(inputs) : null;
  const result = baseResult ? applyOverrides(baseResult, overrides) : null;

  const save = useCallback(async () => {
    if (!inputs || !result) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        contract_id: contractId,
        inputs: inputs as unknown as Record<string, unknown>,
        overrides: overrides as unknown as Record<string, unknown>,
        computed: result as unknown as Record<string, unknown>,
        created_by: userData?.user?.id ?? null,
      };
      const { data, error } = await supabase
        .from("contract_business_cases")
        .upsert(payload, { onConflict: "contract_id" })
        .select("id")
        .single();
      if (error) throw error;
      setRecordId(data.id);
      setDirty(false);
      return true;
    } finally {
      setSaving(false);
    }
  }, [contractId, inputs, overrides, result]);

  return {
    inputs,
    overrides,
    result,
    loading,
    saving,
    dirty,
    recordId,
    updateInput,
    updateArrayInput,
    setOverride,
    resetToDefaults,
    save,
    reload: load,
  };
}
