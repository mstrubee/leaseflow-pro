import { supabase } from "@/integrations/supabase/client";
import { listSavedIsochrones, normalizeIsochroneName, type SavedIsochroneSummary } from "./client";

// Trae coordenadas de dos fuentes y las compara contra
// contract_addresses.lat/lng de cada contrato Vigente:
// - maintenance_locations.contract_id -- match EXACTO (el punto del mapa de
//   rutas de mantención ya viene vinculado a un contrato por Id), se usa con
//   prioridad cuando existe.
// - Isócronas guardadas en Geochile Compass -- match por nombre (mismo
//   normalizador que usa AssignIsochroneDialog), como respaldo cuando el
//   contrato no tiene un punto de mantención vinculado.
// Ninguna de las dos es un match por Id 100% infalible (mantención requiere
// que alguien lo haya asociado antes a mano; Geochile es por nombre) -- por
// eso las que ya tienen coordenada y difieren quedan como "conflict" para
// que un admin decida caso a caso, en vez de sobrescribirlas solas.

export interface CoordinateSyncRow {
  contractId: string;
  contractName: string;
  currentLat: number | null;
  currentLng: number | null;
  geoLat: number | null;
  geoLng: number | null;
  geoSource: "mantencion" | "geochile" | null;
  status: "missing" | "conflict" | "match" | "unmatched";
}

// ~50m de tolerancia -- suficiente para no marcar como "conflicto" pequeñas
// diferencias de precisión entre geocodificadores.
const SAME_COORD_TOLERANCE = 0.0005;

export interface CoordinateSyncResult {
  rows: CoordinateSyncRow[];
  /** Todas las isócronas guardadas, para asignar manualmente las que no matchearon por nombre. */
  isochrones: SavedIsochroneSummary[];
}

export async function fetchCoordinateSyncRows(): Promise<CoordinateSyncResult> {
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

  const contractIds = (contracts || []).map((c: any) => c.id);
  const byContractIdFromMantencion = new Map<string, { lat: number; lng: number }>();
  if (contractIds.length > 0) {
    const { data: maintenanceLocations } = await supabase
      .from("maintenance_locations")
      .select("contract_id, lat, lng")
      .in("contract_id", contractIds);
    (maintenanceLocations || []).forEach((l: any) => {
      if (l.contract_id && l.lat != null && l.lng != null && !byContractIdFromMantencion.has(l.contract_id)) {
        byContractIdFromMantencion.set(l.contract_id, { lat: l.lat, lng: l.lng });
      }
    });
  }

  const rows: CoordinateSyncRow[] = (contracts || []).map((c: any) => {
    const fromMantencion = byContractIdFromMantencion.get(c.id);
    const fromGeochile = byNormName.get(normalizeIsochroneName(c.name));
    // El punto de mantención ya viene vinculado por Id -- tiene prioridad
    // sobre el match por nombre de Geochile.
    const geo = fromMantencion || fromGeochile;
    const geoSource: CoordinateSyncRow["geoSource"] = fromMantencion ? "mantencion" : fromGeochile ? "geochile" : null;
    const addr = c.contract_addresses?.[0];
    const currentLat = addr?.lat ?? null;
    const currentLng = addr?.lng ?? null;

    // Sin match en ninguna de las dos fuentes -- antes se descartaba en
    // silencio sin avisar. Ahora queda visible para asignarla a mano.
    if (!geo) {
      return {
        contractId: c.id,
        contractName: c.name,
        currentLat,
        currentLng,
        geoLat: null,
        geoLng: null,
        geoSource: null,
        status: "unmatched" as const,
      };
    }

    let status: CoordinateSyncRow["status"];
    if (currentLat === null || currentLng === null) {
      status = "missing";
    } else {
      const same =
        Math.abs(currentLat - geo.lat) < SAME_COORD_TOLERANCE &&
        Math.abs(currentLng - geo.lng) < SAME_COORD_TOLERANCE;
      status = same ? "match" : "conflict";
    }

    return {
      contractId: c.id,
      contractName: c.name,
      currentLat,
      currentLng,
      geoLat: geo.lat,
      geoLng: geo.lng,
      geoSource,
      status,
    };
  });

  rows.sort((a, b) => a.contractName.localeCompare(b.contractName));
  return { rows, isochrones };
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
  const missing = rows.filter(
    (r): r is CoordinateSyncRow & { geoLat: number; geoLng: number } =>
      r.status === "missing" && r.geoLat !== null && r.geoLng !== null
  );
  for (const r of missing) {
    await applyCoordinate(r.contractId, r.geoLat, r.geoLng);
  }
  return missing.length;
}
