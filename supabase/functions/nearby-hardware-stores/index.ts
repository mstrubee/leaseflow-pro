import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Busca ferreterías/homecenters cercanos vía Overpass (OpenStreetMap) DESDE EL
// SERVIDOR, evitando CORS / mod_security / rate-limits del navegador.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const REQUEST_TIMEOUT_MS = 15000;
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

async function fetchOverpass(url: string, query: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass exige identificarse; un UA real evita bloqueos de mod_security.
        "User-Agent": "LeaseFlowPro/1.0 (maintenance route planner)",
      },
      body: "data=" + encodeURIComponent(query),
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat/lng requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const radii = [5000, 15000, 40000];
    const dead = new Set<string>();
    for (const radius of radii) {
      const query = buildQuery(lat, lng, radius);
      for (const endpoint of OVERPASS_ENDPOINTS) {
        if (dead.has(endpoint)) continue;
        const res = await fetchOverpass(endpoint, query);
        if (!res || !res.ok) { dead.add(endpoint); continue; }
        let data: any;
        try { data = await res.json(); } catch { dead.add(endpoint); continue; }
        const elements: any[] = data?.elements ?? [];
        const stores = elements
          .map((e) => {
            const elat = e.lat ?? e.center?.lat;
            const elng = e.lon ?? e.center?.lon;
            if (elat == null || elng == null) return null;
            const name = e.tags?.name || e.tags?.brand || "Ferretería";
            return { name, lat: elat, lng: elng, distanceKm: haversineKm(lat, lng, elat, elng) };
          })
          .filter((s) => !!s) as { name: string; lat: number; lng: number; distanceKm: number }[];

        if (stores.length > 0) {
          const seen = new Set<string>();
          const unique: typeof stores = [];
          for (const s of stores.sort((a, b) => a.distanceKm - b.distanceKm)) {
            const key = `${s.name.toLowerCase()}|${s.lat.toFixed(3)}|${s.lng.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(s);
          }
          return new Response(JSON.stringify({ stores: unique.slice(0, MAX_RESULTS) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        break; // OK pero vacío → radio mayor
      }
    }
    return new Response(JSON.stringify({ stores: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error", stores: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
