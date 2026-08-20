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
  // Últimos valores de los campos que vienen del contrato, para detectar
  // ediciones reales del usuario (vs. el simple re-render) y no reescribir el
  // contrato con el mismo valor que ya tenía.
  const lastSyncedRef = useRef<{ superficie?: number | null; ufM2?: number | null; gastoComunUf?: number | null; durContratoAnios?: number | null; inicio?: string | null; graciaMeses?: number | null } | null>(null);
  const { contractVersionId, rentField, rentIsUfM2, gastoComunSyncable } = seed;

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
        // Los campos que vienen del contrato SIEMPRE reflejan su valor más
        // reciente al abrir el diálogo (no lo que haya quedado guardado antes
        // en el Business Case) — sincronización contrato → BC.
        if (seed.superficie != null) merged.superficie = seed.superficie;
        if (seed.ufM2 != null) merged.ufM2 = seed.ufM2;
        if (seed.gastoComunUf != null && gastoComunSyncable) merged.gastoComunUf = seed.gastoComunUf;
        if (seed.durContratoAnios != null) merged.durContratoAnios = seed.durContratoAnios;
        if (seed.inicio) merged.inicio = seed.inicio;
        if (seed.graciaMeses != null) merged.graciaMeses = seed.graciaMeses;
        merged.escalations = seed.escalations ?? [];
        merged.regimeRentIsUfM2 = seed.regimeRentIsUfM2 ?? false;
        lastSyncedRef.current = {
          superficie: merged.superficie, ufM2: merged.ufM2, gastoComunUf: merged.gastoComunUf,
          durContratoAnios: merged.durContratoAnios, inicio: merged.inicio, graciaMeses: merged.graciaMeses,
        };
        setInputs(merged);
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

        // "Venta Est." del listado de contratos = rango (min/max) de las ventas
        // mensuales ingresadas. contracts.venta_estimada[_max] se guarda en
        // pesos crudos (ver ContractsTable.tsx: ventaMin/ufValue sin dividir
        // por 1e6 antes), mientras que inputs.ventaMes está en MM CLP/mes.
        if (inputs.ventaMes.length > 0) {
          await supabase.from("contracts").update({
            venta_estimada: Math.min(...inputs.ventaMes) * 1_000_000,
            venta_estimada_max: Math.max(...inputs.ventaMes) * 1_000_000,
          } as never).eq("id", contractId);
        }

        // Sincronización bidireccional BC → Contrato: superficie, canon
        // (respetando si el contrato usa UF/m² o monto total), gasto común
        // (solo si la metodología del contrato es "uf_m2"), gracia y duración/inicio.
        const last = lastSyncedRef.current;
        if (last) {
          const contractPatch: Record<string, unknown> = {};
          if (inputs.superficie !== last.superficie) contractPatch.superficie_edificada_local = inputs.superficie;
          if (Object.keys(contractPatch).length) {
            await supabase.from("contracts").update(contractPatch as never).eq("id", contractId);
          }

          if (contractVersionId) {
            const versionPatch: Record<string, unknown> = {};
            if (inputs.durContratoAnios !== last.durContratoAnios) versionPatch.duration_months = Math.round((inputs.durContratoAnios || 0) * 12);
            if (inputs.inicio && inputs.inicio !== last.inicio) versionPatch.effective_date = inputs.inicio;
            if (inputs.graciaMeses !== last.graciaMeses) versionPatch.grace_months = inputs.graciaMeses;
            // gastos_comunes_uf_m2 es el campo real del contrato ("Gasto Común
            // UF/m²" del formulario) — no gastos_comunes_fixed_admin_uf, que es
            // un monto fijo adicional de administración, un concepto distinto.
            if (gastoComunSyncable && inputs.gastoComunUf !== last.gastoComunUf) versionPatch.gastos_comunes_uf_m2 = inputs.gastoComunUf;
            if (rentField && inputs.ufM2 !== last.ufM2) {
              versionPatch[rentField] = rentIsUfM2 ? inputs.ufM2 : +((inputs.ufM2 || 0) * (inputs.superficie || 0)).toFixed(2);
            }
            if (Object.keys(versionPatch).length) {
              await supabase.from("contract_versions").update(versionPatch as never).eq("id", contractVersionId);
            }
          }

          lastSyncedRef.current = {
            superficie: inputs.superficie, ufM2: inputs.ufM2, gastoComunUf: inputs.gastoComunUf,
            durContratoAnios: inputs.durContratoAnios, inicio: inputs.inicio, graciaMeses: inputs.graciaMeses,
          };
        }

        setDirty(false);
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, inputs, result, contractId, contractVersionId, rentField, rentIsUfM2, gastoComunSyncable]);

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
