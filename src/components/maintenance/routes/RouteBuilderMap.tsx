import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MaintenanceLocation, RouteStop, ScoredLocation } from "@/hooks/useRouteBuilder";
import { LocationPopup } from "./LocationPopup";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import logoAgroplanet from "@/assets/logo-agroplanet.png";
import { Search, Loader2, MapPin, X, Navigation2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Leaflet icon fix
// ---------------------------------------------------------------------------
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function scoreColor(index: number, total: number): string {
  if (total === 0) return "#6b7280";
  const pct = 1 - index / total;
  if (pct > 0.66) return "#ef4444";
  if (pct > 0.33) return "#f59e0b";
  return "#22c55e";
}

function buildIcon(loc: MaintenanceLocation, isOrigin: boolean, isStop: boolean, stopIndex: number, formCount: number, scored: boolean, rank: number, total: number) {
  const logo = loc.folder === "Autoplanet" ? logoAutoplanet : logoAgroplanet;
  let size = 28, border = "2px solid #fff", shadow = "0 1px 4px rgba(0,0,0,0.25)";
  if (isOrigin) { size = 38; border = "3px solid #7c3aed"; shadow = "0 2px 10px rgba(124,58,237,0.5)"; }
  else if (isStop) { size = 33; border = "3px solid #3b82f6"; shadow = "0 2px 8px rgba(59,130,246,0.5)"; }
  else if (scored) { const col = scoreColor(rank, total); border = `2px solid ${col}`; size = 26 + Math.min(formCount, 6); }

  const stopBadge = isStop
    ? `<span style="position:absolute;top:-6px;right:-6px;background:#3b82f6;color:white;border-radius:50%;
        width:17px;height:17px;font-size:9px;font-weight:bold;display:flex;align-items:center;
        justify-content:center;border:1.5px solid white;line-height:1">${stopIndex + 1}</span>` : "";
  const formBadge = formCount > 0 && !isStop
    ? `<span style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:white;border-radius:50%;
        width:16px;height:16px;font-size:9px;font-weight:bold;display:flex;align-items:center;
        justify-content:center;border:1.5px solid white;line-height:1">${formCount}</span>` : "";
  const originRing = isOrigin
    ? `<span style="position:absolute;top:-6px;left:-6px;background:#7c3aed;color:white;border-radius:50%;
        width:16px;height:16px;font-size:9px;display:flex;align-items:center;justify-content:center;
        border:1.5px solid white">★</span>` : "";

  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      <img src="${logo}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%;
        border:${border};box-shadow:${shadow};background:white;display:block"/>
      ${stopBadge}${formBadge}${originRing}
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

// ---------------------------------------------------------------------------
// Map auto-fit
// ---------------------------------------------------------------------------
function MapFitter({ locations }: { locations: MaintenanceLocation[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || locations.length === 0) return;
    map.fitBounds(L.latLngBounds(locations.map((l) => [l.lat, l.lng])), { padding: [40, 40] });
    fitted.current = true;
  }, [map, locations]);
  return null;
}

// ---------------------------------------------------------------------------
// Map fly-to (used by search + origin selection mode)
// ---------------------------------------------------------------------------
function MapController({ flyTo }: { flyTo: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!flyTo) return;
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 14, { duration: 1 });
  }, [map, flyTo]);
  return null;
}

// ---------------------------------------------------------------------------
// Click handler — fires when user clicks map background (not a marker)
// ---------------------------------------------------------------------------
function MapClickHandler({
  pickingOrigin,
  locations,
  onSetOrigin,
  onDonePickingOrigin,
}: {
  pickingOrigin: boolean;
  locations: MaintenanceLocation[];
  onSetOrigin: (loc: MaintenanceLocation) => void;
  onDonePickingOrigin: () => void;
}) {
  useMapEvents({
    click(e) {
      if (!pickingOrigin) return;
      // Snap to nearest location within 20km
      const clicked = e.latlng;
      let closest: MaintenanceLocation | null = null;
      let minDist = Infinity;
      for (const loc of locations) {
        const d = clicked.distanceTo(L.latLng(loc.lat, loc.lng));
        if (d < minDist) { minDist = d; closest = loc; }
      }
      if (closest && minDist < 20_000) {
        onSetOrigin(closest);
      }
      onDonePickingOrigin();
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// Search bar (Nominatim) — rendered inside the map via a portal div
// ---------------------------------------------------------------------------
function MapSearchBar({ onFlyTo }: { onFlyTo: (lat: number, lng: number, zoom?: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string; lat: number; lng: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prevent map click/drag events from propagating through the search bar
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=cl&q=${encodeURIComponent(term)}`;
        const res = await fetch(url, { signal: ctrl.signal, headers: { "Accept-Language": "es" } });
        const data = await res.json();
        setResults(data.map((r: { place_id: number; display_name: string; lat: string; lon: string }) => ({
          id: String(r.place_id),
          label: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
        })));
        setOpen(true);
      } catch { /* abort */ }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  function pick(r: { lat: number; lng: number; label: string }) {
    onFlyTo(r.lat, r.lng, 13);
    setQ(r.label.split(",").slice(0, 2).join(",").trim());
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="leaflet-top leaflet-left"
      style={{ pointerEvents: "auto" }}
    >
      <div className="leaflet-control m-3 w-72 max-w-[80vw]" style={{ marginLeft: "12px", marginTop: "12px" }}>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </div>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Buscar dirección, comuna o ciudad…"
            className="w-full rounded-xl border border-gray-200 bg-white/95 backdrop-blur py-2 pl-9 pr-8 text-sm shadow-md outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400"
          />
          {q && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => { setQ(""); setResults([]); setOpen(false); }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {open && results.length > 0 && (
          <ul className="mt-1 rounded-xl border border-gray-200 bg-white/98 shadow-lg overflow-hidden">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
                  onClick={() => pick(r)}
                >
                  <MapPin className="w-3 h-3 mt-0.5 text-gray-400 shrink-0" />
                  <span className="line-clamp-2 text-gray-700">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  locations: MaintenanceLocation[];
  scoredLocations: ScoredLocation[];
  origin: MaintenanceLocation | null;
  stops: RouteStop[];
  onAddStop: (location: MaintenanceLocation, formIds?: string[]) => void;
  onToggleForm: (locationId: string, formId: string) => void;
  onAddAllForms: (locationId: string) => void;
  onSetOrigin: (location: MaintenanceLocation) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RouteBuilderMap({
  locations, scoredLocations, origin, stops,
  onAddStop, onToggleForm, onAddAllForms, onSetOrigin,
}: Props) {
  const stopSet   = new Set(stops.map((s) => s.locationId));
  const scoredMap = new Map(scoredLocations.map((s, i) => [s.id, { scored: s, rank: i }]));
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  const routeCoords: [number, number][] = [];
  if (origin) routeCoords.push([origin.lat, origin.lng]);
  for (const stop of stops) routeCoords.push([stop.location.lat, stop.location.lng]);

  return (
    <div className="relative w-full h-full">
      {/* Picking origin overlay hint */}
      {pickingOrigin && (
        <div className="absolute top-0 left-0 right-0 z-[600] flex justify-center pointer-events-none">
          <div className="mt-16 bg-purple-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg pointer-events-auto flex items-center gap-2">
            <Navigation2 className="w-3.5 h-3.5" />
            Haz click en el local de partida
            <button className="ml-2 underline opacity-80 hover:opacity-100" onClick={() => setPickingOrigin(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <MapContainer center={[-34.0, -71.0]} zoom={7} className="w-full h-full rounded-lg"
        style={{ cursor: pickingOrigin ? "crosshair" : "grab" }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="© OpenStreetMap · © CARTO"
        />
        <MapFitter locations={locations} />
        <MapController flyTo={flyTo} />
        <MapClickHandler
          pickingOrigin={pickingOrigin}
          locations={locations}
          onSetOrigin={(loc) => { onSetOrigin(loc); setPickingOrigin(false); }}
          onDonePickingOrigin={() => setPickingOrigin(false)}
        />

        {/* Search bar */}
        <MapSearchBar onFlyTo={(lat, lng, zoom) => setFlyTo({ lat, lng, zoom })} />

        {/* Route line */}
        {routeCoords.length > 1 && (
          <Polyline positions={routeCoords}
            pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "6 4", opacity: 0.8 }} />
        )}

        {/* Markers */}
        {locations.map((loc) => {
          const isOrigin = origin?.id === loc.id;
          const isStop   = stopSet.has(loc.id);
          const scored   = scoredMap.get(loc.id);
          const existingStop = stops.find((s) => s.locationId === loc.id);
          const forms = scored?.scored.forms ?? existingStop?.allForms ?? [];

          const icon = buildIcon(
            loc, isOrigin, isStop,
            stops.findIndex((s) => s.locationId === loc.id),
            forms.length,
            !!scored, scored?.rank ?? 0, scoredLocations.length,
          );

          return (
            <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={icon}
              eventHandlers={{
                click: () => {
                  if (pickingOrigin) { onSetOrigin(loc); setPickingOrigin(false); }
                },
              }}
            >
              <LocationPopup
                location={loc} forms={forms} existingStop={existingStop}
                onAddStop={onAddStop} onToggleForm={onToggleForm}
                onAddAllForms={onAddAllForms}
                onSetOrigin={(l) => { onSetOrigin(l); setPickingOrigin(false); }}
              />
            </Marker>
          );
        })}

        {/* Legend + pick-origin button */}
        <div className="leaflet-bottom leaflet-left">
          <div className="leaflet-control bg-white rounded-xl shadow p-2.5 text-xs space-y-1.5 m-2">
            <button
              onClick={() => setPickingOrigin((v) => !v)}
              className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-lg text-xs font-medium transition-colors
                ${pickingOrigin ? "bg-purple-100 text-purple-700" : "hover:bg-gray-100 text-gray-600"}`}
            >
              <Navigation2 className="w-3 h-3" />
              {pickingOrigin ? "Seleccionando partida…" : origin ? "Cambiar punto de partida" : "Fijar punto de partida"}
            </button>
            <div className="border-t pt-1.5 space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> Punto de partida</div>
              <div className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> En ruta</div>
              <div className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Alta prioridad</div>
              <div className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Media prioridad</div>
              <div className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Baja prioridad</div>
            </div>
          </div>
        </div>
      </MapContainer>
    </div>
  );
}
