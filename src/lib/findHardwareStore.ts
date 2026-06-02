// Busca la ferretería / homecenter más cercana a un punto usando OpenStreetMap
// (Overpass API). Reconoce cadenas comunes en Chile (Sodimac, Easy, Construmart,
// Imperial, MTS, Homecenter…) y cualquier shop=doityourself/hardware/trade.

export interface HardwareStore {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function buildQuery(lat: number, lng: number, radius: number): string {
  const f = `(around:${radius},${lat},${lng})`;
  return (
    `[out:json][timeout:25];(` +
    `nwr["shop"="doityourself"]${f};` +
    `nwr["shop"="hardware"]${f};` +
    `nwr["shop"="trade"]${f};` +
    `nwr["name"~"sodimac|easy|construmart|imperial|homecenter|home center|ferreter|mts|chilemat",i]${f};` +
    `);out center tags;`
  );
}

export async function findNearestHardwareStore(
  lat: number,
  lng: number,
): Promise<HardwareStore | null> {
  const radii = [5000, 15000, 40000]; // metros: ampliar si no hay nada cerca
  for (const radius of radii) {
    const query = buildQuery(lat, lng, radius);
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const elements: any[] = data?.elements ?? [];
        const stores = elements
          .map((e) => {
            const elat = e.lat ?? e.center?.lat;
            const elng = e.lon ?? e.center?.lon;
            if (elat == null || elng == null) return null;
            const name = e.tags?.name || e.tags?.brand || "Ferretería";
            return { name, lat: elat, lng: elng, distanceKm: haversineKm(lat, lng, elat, elng) } as HardwareStore;
          })
          .filter((s): s is HardwareStore => !!s);
        if (stores.length > 0) {
          stores.sort((a, b) => a.distanceKm - b.distanceKm);
          return stores[0];
        }
        // endpoint respondió OK pero sin resultados → probar radio mayor
        break;
      } catch {
        // probar el siguiente endpoint
      }
    }
  }
  return null;
}
