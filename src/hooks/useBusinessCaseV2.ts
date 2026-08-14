import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import { BCInputs, BCSeed, buildDefaultBCInputs, computeBC, FORMATO_PRESETS, FormatoLocal } from "@/lib/businessCase/model";

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
        if (stored && (stored as BCInputs).categoria !== undefined && Array.isArray((stored as BCInputs).ufRates)) {
          setInputs({ ...buildDefaultBCInputs(seed, config), ...(stored as BCInputs) });
        } else {
          setInputs(buildDefaultBCInputs(seed, config));
        }
      } catch {
        setInputs(buildDefaultBCInputs(seed, config));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cfgLoading, contractId]);

  const result = useMemo(() => (inputs ? computeBC(inputs, config) : null), [inputs, config]);

  const update = useCallback(<K extends keyof BCInputs>(key: K, value: BCInputs[K]) => {
    setInputs((p) => (p ? { ...p, [key]: value } : p));
    setDirty(true);
  }, []);

  const updateArr = useCallback((key: keyof BCInputs, idx: number, value: number) => {
    setInputs((p) => {
      if (!p) return p;
      const a = [...((p[key] as unknown as number[]) || [])];
      a[idx] = value;
      return { ...p, [key]: a } as BCInputs;
    });
    setDirty(true);
  }, []);

  // Editar la venta de un año recalcula los demás años hacia adelante y hacia
  // atrás usando el Crecimiento UF anual % ya ingresado (ufRates[i] = variación
  // de ese año respecto al anterior, misma columna que ventaMes[i]).
  const updateVentaConCrecimiento = useCallback((idx: number, value: number) => {
    setInputs((p) => {
      if (!p) return p;
      const ventas = [...p.ventaMes];
      ventas[idx] = value;
      // Los años propagados se redondean hacia arriba (sin decimales); el año
      // editado a mano conserva el valor exacto que se tipeó.
      for (let i = idx + 1; i < ventas.length; i++) {
        const rate = (p.ufRates[i] ?? 0) / 100;
        ventas[i] = Math.ceil(ventas[i - 1] * (1 + rate));
      }
      for (let i = idx - 1; i >= 0; i--) {
        const rate = (p.ufRates[i + 1] ?? 0) / 100;
        ventas[i] = Math.ceil(ventas[i + 1] / (1 + rate));
      }
      return { ...p, ventaMes: ventas };
    });
    setDirty(true);
  }, []);

  // Cambiar de formato precarga dotación e inventario en una sola operación.
  // Ambos quedan editables a mano después (son inputs normales).
  const setFormato = useCallback((formato: FormatoLocal) => {
    setInputs((p) => {
      if (!p) return p;
      const preset = FORMATO_PRESETS[formato];
      return {
        ...p,
        formato,
        personalY1: preset.personalY1,
        invOverrides: { ...p.invOverrides, inv: preset.inventarioMM },
      };
    });
    setDirty(true);
  }, []);

  const setInvOverride = useCallback((lineId: string, value: number | null) => {
    setInputs((p) => {
      if (!p) return p;
      const ov = { ...p.invOverrides };
      if (value === null || !Number.isFinite(value)) delete ov[lineId];
      else ov[lineId] = value;
      return { ...p, invOverrides: ov };
    });
    setDirty(true);
  }, []);

  // Autoguardado (debounce)
  useEffect(() => {
    if (!dirty || !inputs || !result) return;
    const t = setTimeout(async () => {
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
        setDirty(false);
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, inputs, result, contractId]);

  return {
    config,
    inputs,
    result,
    loading: loading || cfgLoading,
    saving,
    dirty,
    update,
    updateArr,
    updateVentaConCrecimiento,
    setFormato,
    setInvOverride,
  };
}
