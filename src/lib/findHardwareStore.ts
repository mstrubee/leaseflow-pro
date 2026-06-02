// Busca ferreterías / homecenters cercanos usando Nominatim (OpenStreetMap), que
// SÍ permite CORS desde el navegador (a diferencia de Overpass, bloqueado por
// mod_security). Reconoce cadenas comunes en Chile + el término genérico
// "ferretería". Devuelve la lista ordenada por distancia (más cercana primero).

export interface HardwareStore {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const SEARCH_TERMS = ["ferretería", "Sodimac", "Easy", "Construmart", "Homecenter", "Imperial", "MTS"];
const RADIUS_KM = 25;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESULTS = 12;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function fetchJson(url: string): Promise<any[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function findNearbyHardwareStores(
  lat: number,
  lng: number,
): Promise<HardwareStore[]> {
  // Caja de búsqueda (~RADIUS_KM alrededor del punto)
  const dLat = RADIUS_KM / 111;
  const dLng = RADIUS_KM / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const viewbox = `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`;

  const byKey = new Map<string, HardwareStore>();

  for (const term of SEARCH_TERMS) {
    const url =
      `${NOMINATIM}?q=${encodeURIComponent(term)}&format=jsonv2&limit=12` +
      `&viewbox=${encodeURIComponent(viewbox)}&bounded=1&countrycodes=cl&addressdetails=0`;
    const items = await fetchJson(url);
    if (!items) continue;
    for (const it of items) {
      const elat = parseFloat(it.lat);
      const elng = parseFloat(it.lon);
      if (!Number.isFinite(elat) || !Number.isFinite(elng)) continue;
      const distanceKm = haversineKm(lat, lng, elat, elng);
      if (distanceKm > RADIUS_KM * 1.5) continue; // fuera del radio razonable
      const rawName: string = it.name || String(it.display_name || "").split(",")[0] || "Ferretería";
      const name = rawName.trim() || "Ferretería";
      const key = `${name.toLowerCase()}|${elat.toFixed(3)}|${elng.toFixed(3)}`;
      const existing = byKey.get(key);
      if (!existing || distanceKm < existing.distanceKm) {
        byKey.set(key, { name, lat: elat, lng: elng, distanceKm });
      }
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_RESULTS);
}
