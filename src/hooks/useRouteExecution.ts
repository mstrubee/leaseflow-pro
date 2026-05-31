import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { migrateStorageEvidenceToDrive } from "@/lib/driveEvidencia";

// Subestados que fija el PROVEEDOR al completar una tarea en terreno.
// (NO usar "resuelto"/"resuelto_obs", que son de Control de Gestión.)
// names reales en maintenance_sub_statuses: "Ejecutado"=en_ejecucion, "Ejecutado C/Obs"=ejecutado_c/obs
const SUBSTATUS_EJECUTADO = "en_ejecucion";
const SUBSTATUS_EJECUTADO_OBS = "ejecutado_c/obs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionForm {
  id: string;                       // maintenance_route_forms.id
  maintenance_form_id: string;
  form_number: string;
  general_description: string | null;
  electrical_description: string | null;
  civil_description: string | null;
  hvac_description: string | null;
  fixed_assets_description: string | null;
  criticality_name: string | null;
  criticality_color: string | null;
  contract_id: string | null;
  contract_name: string | null;
  // execution state
  completed: boolean;
  completed_at: string | null;
  operator_notes: string | null;
  visit_evidence_urls: string[];
  postponed_to: string | null;   // tarea pospuesta a esta fecha
  postpone_note: string | null;
  // fusión
  merge_group_id: string | null;
  mergedCount: number;          // 1 si no está fusionado
}

export interface ExecutionStop {
  id: string;                       // maintenance_route_stops.id
  stop_order: number;
  status: "pending" | "completed" | "postponed";
  completed_at: string | null;
  postponed_to: string | null;
  postpone_note: string | null;
  location_id: string;
  location_name: string;
  location_local_name: string | null;
  location_lat: number;
  location_lng: number;
  forms: ExecutionForm[];
}

export interface ExecutionRoute {
  id: string;
  name: string;
  scheduled_date: string | null;
  status: string;
  supplier_name: string | null;
  stops: ExecutionStop[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useRouteExecution(routeId: string) {
  const { user } = useAuth();
  const [route, setRoute] = useState<ExecutionRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // id of the item being saved

  const load = useCallback(async () => {
    if (!routeId) return;
    setLoading(true);

    const buildSelect = (withFormPostpone: boolean) => `
        id, name, scheduled_date, status,
        suppliers ( name ),
        maintenance_route_stops (
          id, stop_order, status, completed_at, postponed_to, postpone_note,
          maintenance_locations ( id, name, local_name, lat, lng ),
          maintenance_route_forms (
            id, maintenance_form_id, completed, completed_at, operator_notes, visit_evidence_urls${withFormPostpone ? ", postponed_to, postpone_note" : ""},
            maintenance_forms (
              form_number, general_description, electrical_description,
              civil_description, hvac_description, fixed_assets_description,
              contract_id, contract_name,
              maintenance_criticality_categories ( name, color )
            )
          )
        )
      `;

    // Intento con las columnas de aplazamiento por form; si la migración no se
    // aplicó, reintenta sin ellas para no bloquear la vista.
    // (select con string dinámico → tipamos data como any, como el resto del map.)
    const res1 = await supabase.from("maintenance_routes").select(buildSelect(true)).eq("id", routeId).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = res1.data;
    let error = res1.error;
    if (error && /postponed_to|postpone_note|column|schema cache/i.test(error.message)) {
      const res2 = await supabase.from("maintenance_routes").select(buildSelect(false)).eq("id", routeId).single();
      data = res2.data; error = res2.error;
    }

    if (error || !data) { setLoading(false); return; }

    const stops: ExecutionStop[] = (data.maintenance_route_stops ?? [])
      .sort((a: { stop_order: number }, b: { stop_order: number }) => a.stop_order - b.stop_order)
      .map((s: Record<string, unknown>) => {
        const loc = s.maintenance_locations as Record<string, unknown>;
        const forms: ExecutionForm[] = ((s.maintenance_route_forms as Record<string, unknown>[]) ?? []).map(
          (rf: Record<string, unknown>) => {
            const mf = rf.maintenance_forms as Record<string, unknown>;
            const cat = mf?.maintenance_criticality_categories as Record<string, unknown> | null;
            return {
              id: rf.id as string,
              maintenance_form_id: rf.maintenance_form_id as string,
              form_number: mf?.form_number as string ?? "",
              general_description: mf?.general_description as string ?? null,
              electrical_description: mf?.electrical_description as string ?? null,
              civil_description: mf?.civil_description as string ?? null,
              hvac_description: mf?.hvac_description as string ?? null,
              fixed_assets_description: mf?.fixed_assets_description as string ?? null,
              criticality_name: cat?.name as string ?? null,
              criticality_color: cat?.color as string ?? null,
              contract_id: mf?.contract_id as string ?? null,
              contract_name: mf?.contract_name as string ?? null,
              completed: rf.completed as boolean ?? false,
              completed_at: rf.completed_at as string ?? null,
              operator_notes: rf.operator_notes as string ?? null,
              visit_evidence_urls: (rf.visit_evidence_urls as string[]) ?? [],
              postponed_to: rf.postponed_to as string ?? null,
              postpone_note: rf.postpone_note as string ?? null,
              merge_group_id: null,
              mergedCount: 1,
            };
          },
        );

        return {
          id: s.id as string,
          stop_order: s.stop_order as number,
          status: (s.status as ExecutionStop["status"]) ?? "pending",
          completed_at: s.completed_at as string ?? null,
          postponed_to: s.postponed_to as string ?? null,
          postpone_note: s.postpone_note as string ?? null,
          location_id: loc?.id as string ?? "",
          location_name: loc?.name as string ?? "",
          location_local_name: loc?.local_name as string ?? null,
          location_lat: loc?.lat as number ?? 0,
          location_lng: loc?.lng as number ?? 0,
          forms,
        };
      });

    const suppliers = data.suppliers as Record<string, unknown> | null;

    // Enriquecer con info de fusión (query liviano y robusto)
    const allFormIds = stops.flatMap((s) => s.forms.map((f) => f.maintenance_form_id));
    if (allFormIds.length > 0) {
      const { data: mergeData } = await supabase
        .from("maintenance_forms")
        .select("id, merge_group_id")
        .in("id", allFormIds);
      if (mergeData) {
        const groupOf = new Map<string, string | null>();
        const countByGroup = new Map<string, number>();
        for (const m of mergeData as unknown as { id: string; merge_group_id: string | null }[]) {
          groupOf.set(m.id, m.merge_group_id);
          if (m.merge_group_id) countByGroup.set(m.merge_group_id, (countByGroup.get(m.merge_group_id) ?? 0) + 1);
        }
        for (const s of stops) {
          for (const f of s.forms) {
            const g = groupOf.get(f.maintenance_form_id) ?? null;
            f.merge_group_id = g;
            f.mergedCount = g ? (countByGroup.get(g) ?? 1) : 1;
          }
        }
      }
    }

    setRoute({
      id: data.id,
      name: data.name,
      scheduled_date: data.scheduled_date,
      status: data.status,
      supplier_name: suppliers?.name as string ?? null,
      stops,
    });
    setLoading(false);
  }, [routeId]);

  useEffect(() => { load(); }, [load]);

  // ---------------------------------------------------------------------------
  // Mark form completed
  // ---------------------------------------------------------------------------
  const completeForm = useCallback(async (routeFormId: string, maintenanceFormId?: string) => {
    if (!user) return;
    setSaving(routeFormId);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("maintenance_route_forms")
      .update({ completed: true, completed_at: now, completed_by: user.id })
      .eq("id", routeFormId);
    // Reflejar en el form de mantención: subestado "Ejecutado" (terreno)
    if (maintenanceFormId) {
      await supabase.from("maintenance_forms").update({ sub_status: SUBSTATUS_EJECUTADO }).eq("id", maintenanceFormId);
    }
    if (!error) {
      await logEvent(routeFormId, null, "completed");
      await load();
    }
    setSaving(null);
  }, [user, load]);

  // Completar con observaciones: marca el form, guarda la nota y deja el
  // maintenance_form como "Ejecutado C/Obs" (best-effort, robusto a columnas).
  const completeFormWithObs = useCallback(async (routeFormId: string, maintenanceFormId: string, obs: string) => {
    if (!user) return;
    setSaving(routeFormId);
    const now = new Date().toISOString();
    await supabase
      .from("maintenance_route_forms")
      .update({ completed: true, completed_at: now, completed_by: user.id, operator_notes: obs })
      .eq("id", routeFormId);
    // Reflejar en el form de mantención: subestado "Ejecutado C/Obs"
    const { error: subErr } = await supabase
      .from("maintenance_forms")
      .update({ sub_status: SUBSTATUS_EJECUTADO_OBS, resolution_observations: obs })
      .eq("id", maintenanceFormId);
    if (subErr) {
      // si falta resolution_observations u otra columna, al menos intentar el subestado
      await supabase.from("maintenance_forms").update({ sub_status: SUBSTATUS_EJECUTADO_OBS }).eq("id", maintenanceFormId);
    }
    await logEvent(routeFormId, null, "completed", obs);
    await load();
    setSaving(null);
  }, [user, load]);

  // Posponer una tarea (form) individual
  const postponeForm = useCallback(async (routeFormId: string, postponedTo: string, note?: string) => {
    if (!user) return;
    setSaving(routeFormId);
    const { error } = await supabase
      .from("maintenance_route_forms")
      .update({ postponed_to: postponedTo, postpone_note: note ?? null } as never)
      .eq("id", routeFormId);
    if (!error) {
      await logEvent(routeFormId, null, "postponed", note, postponedTo);
      await load();
    } else {
      console.error(error);
    }
    setSaving(null);
  }, [user, load]);

  // Reactivar una tarea pospuesta
  const unpostponeForm = useCallback(async (routeFormId: string) => {
    setSaving(routeFormId);
    await supabase
      .from("maintenance_route_forms")
      .update({ postponed_to: null, postpone_note: null } as never)
      .eq("id", routeFormId);
    await load();
    setSaving(null);
  }, [load]);

  // Desmarcar un form completado
  const uncompleteForm = useCallback(async (routeFormId: string) => {
    setSaving(routeFormId);
    const { error } = await supabase
      .from("maintenance_route_forms")
      .update({ completed: false, completed_at: null, completed_by: null })
      .eq("id", routeFormId);
    if (!error) {
      await logEvent(routeFormId, null, "reopened");
      await load();
    }
    setSaving(null);
  }, [load]);

  // ---------------------------------------------------------------------------
  // Mark stop completed (all its forms done)
  // ---------------------------------------------------------------------------
  const completeStop = useCallback(async (stopId: string) => {
    if (!user) return;
    setSaving(stopId);
    const now = new Date().toISOString();
    await supabase
      .from("maintenance_route_stops")
      .update({ status: "completed", completed_at: now, completed_by: user.id })
      .eq("id", stopId);
    await logEvent(null, stopId, "completed");
    await load();
    setSaving(null);
  }, [user, load]);

  // Reabrir una parada completada (vuelve a pendiente)
  const reopenStop = useCallback(async (stopId: string) => {
    setSaving(stopId);
    await supabase
      .from("maintenance_route_stops")
      .update({ status: "pending", completed_at: null, completed_by: null })
      .eq("id", stopId);
    await logEvent(null, stopId, "reopened");
    await load();
    setSaving(null);
  }, [load]);

  // ---------------------------------------------------------------------------
  // Postpone stop
  // ---------------------------------------------------------------------------
  const postponeStop = useCallback(async (stopId: string, postponedTo: string, note?: string) => {
    if (!user) return;
    setSaving(stopId);
    await supabase
      .from("maintenance_route_stops")
      .update({ status: "postponed", postponed_to: postponedTo, postpone_note: note ?? null })
      .eq("id", stopId);
    await logEvent(null, stopId, "postponed", note, postponedTo);
    await load();
    setSaving(null);
  }, [user, load]);

  // ---------------------------------------------------------------------------
  // Save operator notes (writes to route_form AND to maintenance_forms.additional_comments)
  // ---------------------------------------------------------------------------
  const saveNotes = useCallback(async (routeFormId: string, maintenanceFormId: string, notes: string) => {
    setSaving(routeFormId);
    await Promise.all([
      supabase
        .from("maintenance_route_forms")
        .update({ operator_notes: notes })
        .eq("id", routeFormId),
      // Append to maintenance_forms.additional_comments tagged as "Comentario Proveedor"
      supabase.rpc("append_maintenance_comment", {
        p_form_id: maintenanceFormId,
        p_comment: `[Comentario Proveedor] ${notes}`,
      }).then(() => {}), // best-effort — we define this function below via migration
    ]);
    await load();
    setSaving(null);
  }, [load]);

  // ---------------------------------------------------------------------------
  // Upload photo evidence
  // ---------------------------------------------------------------------------
  const uploadEvidence = useCallback(
    async (routeFormId: string, maintenanceFormId: string, _contractId: string | null, _formNumber: string, file: File) => {
      setSaving(routeFormId);

      // Subir a Supabase Storage (público, visible para el proveedor). La copia
      // se migra a Drive y se libera de Storage solo al "Finalizar/Enviar".
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `maintenance-evidencia/${maintenanceFormId}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from("repository-files")
        .upload(path, file, { upsert: true });

      let publicUrl: string | null = null;
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("repository-files").getPublicUrl(path);
        publicUrl = urlData?.publicUrl ?? null;
      }

      if (publicUrl) {
        // 1. Append a route_form.visit_evidence_urls
        const { data: current } = await supabase
          .from("maintenance_route_forms")
          .select("visit_evidence_urls")
          .eq("id", routeFormId)
          .single();
        const existing: string[] = (current?.visit_evidence_urls as string[]) ?? [];
        await supabase
          .from("maintenance_route_forms")
          .update({ visit_evidence_urls: [...existing, publicUrl] })
          .eq("id", routeFormId);

        // 2. Append a maintenance_forms.evidence_links con tag "Evidencia Visita"
        const { data: mf } = await supabase
          .from("maintenance_forms")
          .select("evidence_links")
          .eq("id", maintenanceFormId)
          .single();
        const existingLinks: string[] = (mf?.evidence_links as string[]) ?? [];
        await supabase
          .from("maintenance_forms")
          .update({ evidence_links: [...existingLinks, `[Evidencia Visita] ${publicUrl}`] })
          .eq("id", maintenanceFormId);

        await load();
      }

      setSaving(null);
      return publicUrl;
    },
    [load],
  );

  // ---------------------------------------------------------------------------
  // Eliminar una foto (solo mientras siga en Storage, es decir, no enviada)
  // ---------------------------------------------------------------------------
  const deleteEvidence = useCallback(async (routeFormId: string, maintenanceFormId: string, url: string) => {
    setSaving(routeFormId);
    // 1. Quitar de route_form.visit_evidence_urls
    const { data: rf } = await supabase.from("maintenance_route_forms").select("visit_evidence_urls").eq("id", routeFormId).single();
    const urls = ((rf?.visit_evidence_urls as string[]) ?? []).filter((u) => u !== url);
    await supabase.from("maintenance_route_forms").update({ visit_evidence_urls: urls }).eq("id", routeFormId);
    // 2. Quitar de maintenance_form.evidence_links (entrada con tag o cruda)
    const { data: mf } = await supabase.from("maintenance_forms").select("evidence_links").eq("id", maintenanceFormId).single();
    const links = ((mf?.evidence_links as string[]) ?? []).filter((l) => l !== `[Evidencia Visita] ${url}` && l !== url);
    await supabase.from("maintenance_forms").update({ evidence_links: links }).eq("id", maintenanceFormId);
    // 3. Borrar el archivo de Storage si la URL es de Storage
    const marker = "/public/repository-files/";
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
      await supabase.storage.from("repository-files").remove([path]).catch(() => {});
    }
    await load();
    setSaving(null);
  }, [load]);

  // ---------------------------------------------------------------------------
  // Finalizar/Enviar: exige foto en cada form, migra las fotos de Storage a
  // Drive, libera Storage y cierra la parada. Devuelve { ok, error }.
  // ---------------------------------------------------------------------------
  const finalizeAndSendStop = useCallback(async (stopId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: "No autenticado" };
    const stop = route?.stops.find((s) => s.id === stopId);
    if (!stop) return { ok: false, error: "Parada no encontrada" };

    const sinFoto = stop.forms.filter((f) => f.visit_evidence_urls.length === 0);
    if (sinFoto.length > 0) {
      return { ok: false, error: `Faltan fotos: ${sinFoto.map((f) => f.form_number).join(", ")}` };
    }

    setSaving(stopId);
    try {
      for (const f of stop.forms) {
        // Migrar a Drive solo las que siguen en Storage
        const newUrls: string[] = [];
        for (const url of f.visit_evidence_urls) {
          if (url.includes("/storage/v1/object/public/")) {
            const driveUrl = await migrateStorageEvidenceToDrive(url, f.contract_id ?? "", f.form_number);
            newUrls.push(driveUrl ?? url); // si falla, conservar Storage (no perder evidencia)
          } else {
            newUrls.push(url); // ya en Drive
          }
        }
        await supabase.from("maintenance_route_forms").update({ visit_evidence_urls: newUrls }).eq("id", f.id);

        // Reescribir los tags en maintenance_forms.evidence_links
        const { data: mf } = await supabase.from("maintenance_forms").select("evidence_links").eq("id", f.maintenance_form_id).single();
        const links: string[] = (mf?.evidence_links as string[]) ?? [];
        const updated = links.map((l) => {
          if (!l.startsWith("[Evidencia Visita] ")) return l;
          const oldUrl = l.slice("[Evidencia Visita] ".length);
          const i = f.visit_evidence_urls.indexOf(oldUrl);
          return i >= 0 && newUrls[i] ? `[Evidencia Visita] ${newUrls[i]}` : l;
        });
        await supabase.from("maintenance_forms").update({ evidence_links: updated }).eq("id", f.maintenance_form_id);
      }

      // Cerrar la parada
      await supabase
        .from("maintenance_route_stops")
        .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user.id })
        .eq("id", stopId);
      await logEvent(null, stopId, "completed", "Informe finalizado y enviado");
      await load();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error al finalizar" };
    } finally {
      setSaving(null);
    }
  }, [user, route, load]);

  // ---------------------------------------------------------------------------
  // Auto-complete stop when all its forms are done
  // ---------------------------------------------------------------------------
  const autoCompleteStopIfDone = useCallback(async (stopId: string) => {
    const stop = route?.stops.find((s) => s.id === stopId);
    if (!stop || stop.status === "completed") return;
    if (stop.forms.length > 0 && stop.forms.every((f) => f.completed)) {
      await completeStop(stopId);
    }
  }, [route, completeStop]);

  // ---------------------------------------------------------------------------
  // Private: log compliance event
  // ---------------------------------------------------------------------------
  async function logEvent(
    formId: string | null,
    stopId: string | null,
    eventType: "completed" | "postponed" | "reopened",
    notes?: string,
    postponedTo?: string,
  ) {
    if (!user) return;
    await supabase.from("route_compliance_log").insert({
      route_id: routeId,
      stop_id: stopId ?? null,
      form_id: formId ?? null,
      event_type: eventType,
      performed_by: user.id,
      notes: notes ?? null,
      postponed_to: postponedTo ?? null,
    });
  }

  return {
    route,
    loading,
    saving,
    completeForm,
    completeFormWithObs,
    uncompleteForm,
    completeStop,
    reopenStop,
    postponeStop,
    postponeForm,
    unpostponeForm,
    saveNotes,
    uploadEvidence,
    deleteEvidence,
    finalizeAndSendStop,
    autoCompleteStopIfDone,
    refresh: load,
  };
}
