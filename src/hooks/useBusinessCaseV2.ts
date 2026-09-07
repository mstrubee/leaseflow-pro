import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessCaseAdminConfig } from "@/hooks/useBusinessCaseAdminConfig";
import { BCInputs, BCSeed, buildDefaultBCInputs, computeBC, FORMATO_PRESETS, FormatoLocal, ocupPctFromVenta } from "@/lib/businessCase/model";

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
  // Últimos valores de los campos que vienen del contrato, para detectar
  // ediciones reales del usuario (vs. el simple re-render) y no reescribir el
  // contrato con el mismo valor que ya tenía.
  const lastSyncedRef = useRef<{ superficie?: number | null; ufM2?: number | null; gastoComunUf?: number | null; durContratoAnios?: number | null; inicio?: string | null; graciaMeses?: number | null } | null>(null);
  // Últimos montos de escalonamiento sincronizados con rent_escalations, por
  // id de tramo — para no reescribir un tramo cuyo monto no cambió.
  const lastSyncedEscalationAmountsRef = useRef<Record<string, number>>({});
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
        merged.fondoPromocionPct = seed.fondoPromocionPct ?? 0;
        lastSyncedRef.current = {
          superficie: merged.superficie, ufM2: merged.ufM2, gastoComunUf: merged.gastoComunUf,
          durContratoAnios: merged.durContratoAnios, inicio: merged.inicio, graciaMeses: merged.graciaMeses,
        };
        lastSyncedEscalationAmountsRef.current = Object.fromEntries(
          merged.escalations.filter((e) => e.id).map((e) => [e.id as string, e.amount]),
        );
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

  // Editar la venta de un año recalcula los demás años hacia adelante y hacia
  // atrás usando el Crecimiento Ventas % ya ingresado (ventaGrowthPct[i] =
  // variación de ese año respecto al anterior, misma columna que
  // ventaMes[i]). NO usa ufRates — esa es la UF real (inflación), una
  // curva de negocio distinta a la de maduración de ventas del local.
  const updateVentaConCrecimiento = useCallback((idx: number, value: number) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, `ventaMes.${idx}`);
      const ventas = [...p.ventaMes];
      ventas[idx] = value;
      // Los años propagados se redondean hacia arriba (sin decimales); el año
      // editado a mano conserva el valor exacto que se tipeó.
      for (let i = idx + 1; i < ventas.length; i++) {
        const rate = (p.ventaGrowthPct[i] ?? 0) / 100;
        ventas[i] = Math.ceil(ventas[i - 1] * (1 + rate));
      }
      for (let i = idx - 1; i >= 0; i--) {
        const rate = (p.ventaGrowthPct[i + 1] ?? 0) / 100;
        ventas[i] = Math.ceil(ventas[i + 1] / (1 + rate));
      }
      // Ocupación % se calibra sobre la Venta Año 1 (puede haber cambiado
      // directa o indirectamente por la propagación de arriba) para que el
      // costo de ocupación objetivo (ver OCUPACION_TARGET_MM) se mantenga.
      // Sigue siendo editable a mano después.
      return { ...p, ventaMes: ventas, ocupPct: ocupPctFromVenta(p.formato, ventas[0]) };
    });
    setDirty(true);
  }, [pushHistory]);

  // Cambiar de formato precarga dotación, inventario y Ocupación % (calibrado
  // sobre la Venta Año 1 vigente) en una sola operación. Todos quedan
  // editables a mano después (son inputs normales).
  const setFormato = useCallback((formato: FormatoLocal) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, "formato");
      const preset = FORMATO_PRESETS[formato];
      return {
        ...p,
        formato,
        personalY1: preset.personalY1,
        invOverrides: { ...p.invOverrides, inv: preset.inventarioMM },
        ocupPct: ocupPctFromVenta(formato, p.ventaMes[0]),
      };
    });
    setDirty(true);
  }, [pushHistory]);

  // Edita solo el MONTO de un tramo de escalonamiento (nunca el mes/plazo,
  // que sigue siendo de solo lectura acá). Recalcula el modelo al toque
  // (inputs.escalations alimenta resolveCanonTiers) y el monto se
  // sincroniza de vuelta a rent_escalations en el autoguardado, igual que
  // ufM2 sincroniza el tramo base.
  const updateEscalationAmount = useCallback((idx: number, amount: number) => {
    setInputs((p) => {
      if (!p) return p;
      pushHistory(p, `escalation.${idx}`);
      const escalations = p.escalations.map((e, i) => (i === idx ? { ...e, amount } : e));
      return { ...p, escalations };
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

  // Guardado manual — se dispara solo desde el botón "Guardar" (o "Guardar y
  // cerrar" al cerrar con cambios pendientes), nunca automáticamente.
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

      // Montos de escalonamiento editados acá → de vuelta a rent_escalations
      // (solo el monto; mes/plazo no es editable desde el Business Case).
      const lastEsc = lastSyncedEscalationAmountsRef.current;
      const changedEsc = inputs.escalations.filter((e) => e.id && e.amount !== lastEsc[e.id]);
      if (changedEsc.length > 0) {
        await Promise.all(
          changedEsc.map((e) => supabase.from("rent_escalations").update({ amount: e.amount } as never).eq("id", e.id as string)),
        );
        lastSyncedEscalationAmountsRef.current = {
          ...lastEsc,
          ...Object.fromEntries(changedEsc.map((e) => [e.id as string, e.amount])),
        };
      }

      initialInputsRef.current = inputs;
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [inputs, result, contractId, contractVersionId, rentField, rentIsUfM2, gastoComunSyncable]);

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
    updateEscalationAmount,
    setFormato,
    setInvOverride,
    undo,
    save,
  };
}
