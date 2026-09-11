import { supabase } from "@/integrations/supabase/client";
import { listSavedIsochrones, normalizeIsochroneName } from "./client";

// Trae coordenadas (centerLat/centerLng) desde las isócronas guardadas en
// Geochile Compass y las compara contra contract_addresses.lat/lng de cada
// contrato Vigente, matcheando por nombre (mismo normalizador que usa
// AssignIsochroneDialog). No es un match por Id -- por eso las que ya tienen
// coordenada y difieren de Geochile quedan como "conflict" para que un
// admin decida caso a caso, en vez de sobrescribirlas solas.

export interface CoordinateSyncRow {
  contractId: string;
  contractName: string;
  currentLat: number | null;
  currentLng: number | null;
  geoLat: number;
  geoLng: number;
  status: "missing" | "conflict" | "match";
}

// ~50m de tolerancia -- suficiente para no marcar como "conflicto" pequeñas
// diferencias de precisión entre geocodificadores.
const SAME_COORD_TOLERANCE = 0.0005;

export async function fetchCoordinateSyncRows(): Promise<CoordinateSyncRow[]> {
  const isochrones = await listSavedIsochrones();
  const byNormName = new Map<string, { lat: number; lng: number }>();
  isochrones.forEach((iso) => {
    const key = normalizeIsochroneName(iso.name);
    if (!byNormName.has(key)) byNormName.set(key, { lat: iso.centerLat, lng: iso.centerLng });
  });

  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("id, name, contract_addresses(lat, lng)")
    .is("deleted_at", null)
    .eq("status", "firmado");
  if (error) throw error;

  const rows: CoordinateSyncRow[] = [];
  (contracts || []).forEach((c: any) => {
    const geo = byNormName.get(normalizeIsochroneName(c.name));
    if (!geo) return;
    const addr = c.contract_addresses?.[0];
    const currentLat = addr?.lat ?? null;
    const currentLng = addr?.lng ?? null;

    let status: CoordinateSyncRow["status"];
    if (currentLat === null || currentLng === null) {
      status = "missing";
    } else {
      const same =
        Math.abs(currentLat - geo.lat) < SAME_COORD_TOLERANCE &&
        Math.abs(currentLng - geo.lng) < SAME_COORD_TOLERANCE;
      status = same ? "match" : "conflict";
    }

    rows.push({
      contractId: c.id,
      contractName: c.name,
      currentLat,
      currentLng,
      geoLat: geo.lat,
      geoLng: geo.lng,
      status,
    });
  });

  return rows.sort((a, b) => a.contractName.localeCompare(b.contractName));
}

export async function applyCoordinate(contractId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase
    .from("contract_addresses")
    .update({ lat, lng, geocode_source: "manual" })
    .eq("contract_id", contractId);
  if (error) throw error;
}

/** Aplica automáticamente solo las filas sin coordenada previa. Devuelve cuántas se completaron. */
export async function applyMissingCoordinates(rows: CoordinateSyncRow[]): Promise<number> {
  const missing = rows.filter((r) => r.status === "missing");
  for (const r of missing) {
    await applyCoordinate(r.contractId, r.geoLat, r.geoLng);
  }
  return missing.length;
}
