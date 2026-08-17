import { supabase } from "@/integrations/supabase/client";

// Cliente para la integración con geochile-compass (proyecto Supabase
// separado). La URL base y la API key se administran desde Admin >
// Integraciones (tabla geochile_integration_settings) y se leen en
// runtime — no son secretos de build.

export interface GeochileSettings {
  id: string;
  baseUrl: string;
  apiKey: string;
}

export interface SavedIsochroneSummary {
  id: string;
  name: string;
  folderName: string | null;
  mode: string;
  minutes: number[];
  centerLat: number;
  centerLng: number;
  hasProjection: boolean;
  computedAt: string | null;
}

export interface ProjectionComparable {
  name: string;
  distanceScore: number;
  weight: number;
}

// Shape lista para consumir como ventaMes del Business Case: 5 valores
// en MM CLP/mes (año 1..5), ya con la rampa de maduración aplicada.
export interface SalesProjectionExport {
  locationName: string;
  ventaMes: number[];
  estimatedUf: number;
  baseYear: number;
  growthRate: number;
  comparables: ProjectionComparable[];
  diagnosticMsg: string | null;
}

export async function getGeochileSettings(): Promise<GeochileSettings | null> {
  const { data, error } = await supabase
    .from("geochile_integration_settings" as any)
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as any;
  return { id: row.id, baseUrl: row.base_url, apiKey: row.api_key };
}

export async function saveGeochileSettings(params: {
  id?: string;
  baseUrl: string;
  apiKey: string;
  userId: string;
}): Promise<void> {
  const { id, baseUrl, apiKey, userId } = params;
  const payload = {
    base_url: baseUrl.trim().replace(/\/$/, ""),
    api_key: apiKey.trim(),
    is_active: true,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from("geochile_integration_settings" as any).update(payload).eq("id", id)
    : await supabase.from("geochile_integration_settings" as any).insert(payload);
  if (error) throw error;
}

async function callGeochileFunction<T>(path: string, opts?: { body?: unknown; settings?: GeochileSettings }): Promise<T> {
  const settings = opts?.settings ?? (await getGeochileSettings());
  if (!settings) {
    throw new Error("La integración con Geochile Compass no está configurada. Configúrala en Admin > Integraciones.");
  }
  const res = await fetch(`${settings.baseUrl}/functions/v1/${path}`, {
    method: opts?.body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Geochile Compass respondió ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export function listSavedIsochrones(settings?: GeochileSettings): Promise<SavedIsochroneSummary[]> {
  return callGeochileFunction<SavedIsochroneSummary[]>("list-saved-isochrones", { settings });
}

export function fetchSalesProjection(savedIsochroneId: string, settings?: GeochileSettings): Promise<SalesProjectionExport> {
  return callGeochileFunction<SalesProjectionExport>("export-sales-projection", { body: { savedIsochroneId }, settings });
}
