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
  hasSlides: boolean;
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

// Láminas del "Informe directorio" de una isócrona (2 PNG 1920×1080), para
// insertar como slides propias en el PPT del Informe Directorio de leaseflow
// (pptxgenjs no puede importar slides de un .pptx ajeno, solo imágenes).
export interface ReportSlidesExport {
  savedIsochroneId: string;
  locationName: string | null;
  slide1: string;
  slide2: string | null;
  generatedAt: string;
  alreadyConsumed: boolean;
  consumedAt: string;
}

// Compara nombres ignorando mayúsculas, tildes y sufijos entre paréntesis
// (ej. "Fontova (express)" ~ "Fontova"), para matchear un contrato de
// leaseflow contra la isócrona de Geochile Compass del mismo local sin exigir
// nombres idénticos. Compartido por "Sincronizar con GeoPlanet" y "Extraer
// Informe Isócrona".
export function normalizeIsochroneName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
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

export function fetchReportSlides(savedIsochroneId: string, settings?: GeochileSettings): Promise<ReportSlidesExport> {
  return callGeochileFunction<ReportSlidesExport>("export-report-slides", { body: { savedIsochroneId }, settings });
}

// Bucket privado donde se stagean las láminas del informe (ver
// AssignIsochroneDialog.tsx e InformeDirectorioReport.tsx) — son efímeras del
// lado de Geochile (~48h), así que se persisten acá hasta usarse en el PPT.
export const ISOCHRONE_SLIDES_BUCKET = "isochrone-report-slides";

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
