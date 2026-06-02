// Busca la ferretería / homecenter más cercana a un punto usando OpenStreetMap
// (Overpass API). Reconoce cadenas comunes en Chile (Sodimac, Easy, Construmart,
// Imperial, MTS, Homecenter…) y cualquier shop=doityourself/hardware/trade.

import { supabase } from "@/integrations/supabase/client";

export interface HardwareStore {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const REQUEST_TIMEOUT_MS = 12000;

// fetch con timeout para que la petición nunca quede colgada (deja el spinner girando).
async function fetchWithTimeout(url: string, body: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(body),
      signal: ctrl.signal,
    });
  } catch {
    return null; // timeout / red / CORS
  } finally {
    clearTimeout(timer);
  }
}

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
    `);out center;`
  );
}

const MAX_RESULTS = 12;

// Devuelve TODAS las ferreterías cercanas ordenadas por distancia (la más cercana
// primero). Amplía el radio si no encuentra nada. Lista vacía si no hay resultados.
export async function findNearbyHardwareStores(
  lat: number,
  lng: number,
): Promise<HardwareStore[]> {
  // 1) Preferir la edge function (servidor): evita CORS / mod_security / rate-limits
  //    del navegador. Si no está disponible o falla, se usa el fetch directo abajo.
  try {
    const { data, error } = await supabase.functions.invoke("nearby-hardware-stores", {
      body: { lat, lng },
    });
    if (!error && data && Array.isArray((data as any).stores)) {
      const stores = (data as any).stores as HardwareStore[];
      if (stores.length > 0) return stores.slice(0, MAX_RESULTS);
      // La función respondió OK pero vacío: aún así intentamos el fetch directo
      // (por si el navegador sí tiene acceso) antes de rendirnos.
    }
  } catch { /* edge function no disponible → fetch directo */ }

  return await findNearbyHardwareStoresDirect(lat, lng);
}

// Búsqueda directa desde el navegador (fallback).
async function findNearbyHardwareStoresDirect(
  lat: number,
  lng: number,
): Promise<HardwareStore[]> {
  const radii = [5000, 15000, 40000]; // metros: ampliar si no hay nada cerca
  const dead = new Set<string>(); // endpoints que ya fallaron/timeout → no reintentar
  for (const radius of radii) {
    const query = buildQuery(lat, lng, radius);
    for (const endpoint of OVERPASS_ENDPOINTS) {
      if (dead.has(endpoint)) continue;
      try {
        const res = await fetchWithTimeout(endpoint, query);
        if (!res || !res.ok) { dead.add(endpoint); continue; } // sin respuesta → no reintentar este
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
          // Dedupe (un mismo local puede venir como node + way) por nombre + coords aprox.
          const seen = new Set<string>();
          const unique: HardwareStore[] = [];
          for (const s of stores.sort((a, b) => a.distanceKm - b.distanceKm)) {
            const key = `${s.name.toLowerCase()}|${s.lat.toFixed(3)}|${s.lng.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(s);
          }
          return unique.slice(0, MAX_RESULTS);
        }
        // endpoint respondió OK pero sin resultados → probar radio mayor con el mismo endpoint
        break;
      } catch {
        dead.add(endpoint); // error de parseo/red → no reintentar este endpoint
      }
    }
  }
  return [];
}
