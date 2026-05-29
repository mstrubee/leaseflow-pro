import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MaintenanceLocation, RouteStop, ScoredLocation, RouteForm } from "@/hooks/useRouteBuilder";
import { LocationPopup } from "./LocationPopup";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import logoAgroplanet from "@/assets/logo-agroplanet.png";
import { Search, Loader2, MapPin, X, Navigation2 } from "lucide-react";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function scoreColor(index: number, total: number): string {
  if (total === 0) return "#6b7280";
  const pct = 1 - index / total;
  if (pct > 0.66) return "#ef4444";
  if (pct > 0.33) return "#f59e0b";
  return "#22c55e";
}

function buildIcon(
  loc: MaintenanceLocation,
  isOrigin: boolean, isStop: boolean,
  stopIndex: number, formCount: number,
  rank: number, total: number,
  timeLabel?: string,
) {
  const logo = loc.folder === "Autoplanet" ? logoAutoplanet : logoAgroplanet;
  let size = 28, border = "2px solid #fff", shadow = "0 1px 4px rgba(0,0,0,0.25)";
  if (isOrigin)     { size = 38; border = "3px solid #7c3aed"; shadow = "0 2px 10px rgba(124,58,237,0.5)"; }
  else if (isStop)  { size = 33; border = "3px solid #3b82f6"; shadow = "0 2px 8px rgba(59,130,246,0.5)"; }
  else              { const col = scoreColor(rank, total); border = `2px solid ${col}`; size = 26 + Math.min(formCount, 6); }

  const stopBadge = isStop
    ? `<span style="position:absolute;top:-7px;right:-7px;background:#3b82f6;color:white;
        border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:bold;
        display:flex;align-items:center;justify-content:center;border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.3)">${stopIndex + 1}</span>` : "";
  const formBadge = formCount > 0 && !isStop && !isOrigin
    ? `<span style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:white;
        border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:bold;
        display:flex;align-items:center;justify-content:center;border:1.5px solid white">${formCount}</span>` : "";

  // Etiqueta inferior: hora (inicio en partida, llegada en paradas) o INICIO
  const bg = isOrigin ? "#7c3aed" : "#3b82f6";
  const label = timeLabel ?? (isOrigin ? "INICIO" : "");
  const timeChip = (isOrigin || isStop) && label
    ? `<span style="position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);
        background:${bg};color:white;border-radius:4px;padding:0 4px;font-size:9px;line-height:1.4;
        font-weight:bold;border:1px solid white;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.3)">${label}</span>` : "";

  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      <img src="${logo}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%;
        border:${border};box-shadow:${shadow};background:white;display:block"/>
      ${stopBadge}${formBadge}${timeChip}
    </div>`,
    className: "", iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 8)],
  });
}

// Etiqueta de minutos de traslado en el medio de un tramo
function travelLabelIcon(minutes: number) {
  return L.divIcon({
    html: `<span style="background:white;color:#2563eb;border:1.5px solid #3b82f6;border-radius:10px;
      padding:1px 6px;font-size:10px;font-weight:bold;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2)">
      🚗 ${minutes} min</span>`,
    className: "", iconSize: [0, 0], iconAnchor: [24, 9],
  });
}

function midpoint(geom: GeoJSON.LineString | null, a: [number, number], b: [number, number]): [number, number] {
  if (geom && geom.coordinates.length > 1) {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
    return [mid[1], mid[0]]; // GeoJSON es [lng,lat]
  }
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// Región Metropolitana (Santiago) — centro por defecto
const RM_CENTER: [number, number] = [-33.45, -70.66];
const RM_ZOOM = 10;

function MapController({ flyTo }: { flyTo: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!flyTo) return;
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 14, { duration: 1 });
  }, [map, flyTo]);
  return null;
}

// Recalcula el tamaño del mapa cuando su contenedor cambia (evita áreas en blanco
// al colapsar/redimensionar la lista lateral).
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function MapClickHandler({ pickingOrigin, locations, onSetOrigin, onDone }: {
  pickingOrigin: boolean;
  locations: MaintenanceLocation[];
  onSetOrigin: (loc: MaintenanceLocation) => void;
  onDone: () => void;
}) {
  useMapEvents({
    click(e) {
      if (!pickingOrigin) return;
      let closest: MaintenanceLocation | null = null;
      let minDist = Infinity;
      for (const loc of locations) {
        const d = e.latlng.distanceTo(L.latLng(loc.lat, loc.lng));
        if (d < minDist) { minDist = d; closest = loc; }
      }
      if (closest && minDist < 20_000) onSetOrigin(closest);
      onDone();
    },
  });
  return null;
}

function MapSearchBar({ onFlyTo }: { onFlyTo: (lat: number, lng: number, zoom?: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string; lat: number; lng: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
          id: String(r.place_id), label: r.display_name,
          lat: parseFloat(r.lat), lng: parseFloat(r.lon),
        })));
        setOpen(true);
      } catch { /* abort */ }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div ref={containerRef} className="leaflet-top leaflet-left" style={{ pointerEvents: "auto" }}>
      <div className="leaflet-control m-3 w-72 max-w-[80vw]">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </div>
          <input type="text" value={q}
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
                <button className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
                  onClick={() => { onFlyTo(r.lat, r.lng, 13); setQ(r.label.split(",").slice(0,2).join(",").trim()); setOpen(false); }}>
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

interface ScheduleEntryLite {
  arrivalTime: string;
  departureTime: string;
  travelMinutes: number;
}

// Un tramo de la ruta: línea sólida (OSRM o recta) + etiqueta de minutos al medio
function FragmentLeg({ geometry, a, b, mid, minutes }: {
  geometry: GeoJSON.LineString | null;
  a: [number, number]; b: [number, number];
  mid: [number, number]; minutes: number;
}) {
  return (
    <>
      {geometry
        ? <GeoJSON data={geometry} style={{ color: "#3b82f6", weight: 4, opacity: 0.8 }} />
        : <Polyline positions={[a, b]} pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.7 }} />}
      {minutes > 0 && <Marker position={mid} icon={travelLabelIcon(minutes)} interactive={false} />}
    </>
  );
}

interface Props {
  locations: MaintenanceLocation[];
  scoredLocations: ScoredLocation[];
  formsByLocation: Map<string, RouteForm[]>;
  origin: MaintenanceLocation | null;
  stops: RouteStop[];
  schedule?: ScheduleEntryLite[];
  startTime?: string;
  onAddStop: (location: MaintenanceLocation, formIds?: string[]) => void;
  onToggleForm: (locationId: string, formId: string) => void;
  onAddAllForms: (locationId: string) => void;
  onSetFormMinutes: (locationId: string, formId: string, minutes: number) => void;
  onSetOrigin: (location: MaintenanceLocation) => void;
}

export function RouteBuilderMap({
  locations, scoredLocations, formsByLocation,
  origin, stops, schedule = [], startTime = "09:00",
  onAddStop, onToggleForm, onAddAllForms, onSetFormMinutes, onSetOrigin,
}: Props) {
  const stopSet   = new Set(stops.map((s) => s.locationId));
  const scoredMap = new Map(scoredLocations.map((s, i) => [s.id, { rank: i }]));
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [basemap, setBasemap] = useState<"light" | "satellite" | "hybrid">("light");

  return (
    <div className="relative w-full h-full">
      {pickingOrigin && (
        <div className="absolute top-0 left-0 right-0 z-[600] flex justify-center pointer-events-none">
          <div className="mt-16 bg-purple-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg pointer-events-auto flex items-center gap-2">
            <Navigation2 className="w-3.5 h-3.5" />
            Haz click en el local de partida
            <button className="ml-2 underline opacity-80 hover:opacity-100" onClick={() => setPickingOrigin(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Selector de capa: político / satélite / híbrido */}
      <div className="absolute top-3 right-3 z-[600] flex rounded-lg overflow-hidden shadow-md border border-gray-200 text-[11px] font-medium bg-white">
        {([["light", "Mapa"], ["satellite", "Satélite"], ["hybrid", "Híbrido"]] as const).map(([key, label]) => (
          <button key={key}
            onClick={() => setBasemap(key)}
            className={`px-2.5 py-1 transition-colors ${basemap === key ? "bg-blue-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {label}
          </button>
        ))}
      </div>

      <MapContainer center={RM_CENTER} zoom={RM_ZOOM} className="w-full h-full rounded-lg"
        style={{ cursor: pickingOrigin ? "crosshair" : "grab" }}>
        {basemap === "light" && (
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="© OpenStreetMap · © CARTO" />
        )}
        {(basemap === "satellite" || basemap === "hybrid") && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles © Esri — World Imagery" />
        )}
        {basemap === "hybrid" && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            attribution="© Esri" />
        )}
        <MapResizeHandler />
        <MapController flyTo={flyTo} />
        <MapClickHandler pickingOrigin={pickingOrigin} locations={locations}
          onSetOrigin={(loc) => { onSetOrigin(loc); setPickingOrigin(false); }}
          onDone={() => setPickingOrigin(false)} />
        <MapSearchBar onFlyTo={(lat, lng, zoom) => setFlyTo({ lat, lng, zoom })} />

        {/* Trayecto por tramo: línea sólida real (OSRM) o recta, + etiqueta de minutos */}
        {stops.map((stop, i) => {
          const prev = i === 0 ? origin : stops[i - 1].location;
          if (!prev) return null;
          const a: [number, number] = [prev.lat, prev.lng];
          const b: [number, number] = [stop.location.lat, stop.location.lng];
          const mid = midpoint(stop.routeGeometry, a, b);
          return (
            <FragmentLeg key={`leg-${stop.locationId}`}
              geometry={stop.routeGeometry} a={a} b={b}
              mid={mid} minutes={stop.travelMinutes} />
          );
        })}

        {/* Markers */}
        {locations.map((loc) => {
          const isOrigin    = origin?.id === loc.id;
          const isStop      = stopSet.has(loc.id);
          const stopIndex   = stops.findIndex((s) => s.locationId === loc.id);
          const existingStop = stops.find((s) => s.locationId === loc.id);
          // KEY FIX: always use formsByLocation (not dependent on origin/scoring)
          const forms       = formsByLocation.get(loc.id) ?? [];
          const scored      = scoredMap.get(loc.id);

          // Hora: inicio en el punto de partida; hora de llegada en cada parada
          const timeLabel = isOrigin
            ? startTime
            : isStop && schedule[stopIndex]
              ? schedule[stopIndex].arrivalTime
              : undefined;

          const icon = buildIcon(loc, isOrigin, isStop, stopIndex, forms.length, scored?.rank ?? 0, scoredLocations.length, timeLabel);

          return (
            <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={icon}
              eventHandlers={{
                click: () => { if (pickingOrigin) { onSetOrigin(loc); setPickingOrigin(false); } },
              }}
            >
              <LocationPopup
                location={loc} forms={forms} existingStop={existingStop}
                onAddStop={onAddStop} onToggleForm={onToggleForm}
                onAddAllForms={onAddAllForms}
                onSetFormMinutes={onSetFormMinutes}
                onSetOrigin={(l) => { onSetOrigin(l); setPickingOrigin(false); }}
              />
            </Marker>
          );
        })}

        {/* Legend */}
        <div className="leaflet-bottom leaflet-left">
          <div className="leaflet-control bg-white rounded-xl shadow p-2.5 text-xs space-y-1.5 m-2 min-w-[160px]">
            <button onClick={() => setPickingOrigin((v) => !v)}
              className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-lg text-xs font-medium transition-colors
                ${pickingOrigin ? "bg-purple-100 text-purple-700" : "hover:bg-gray-100 text-gray-600"}`}>
              <Navigation2 className="w-3 h-3" />
              {pickingOrigin ? "Seleccionando…" : origin ? "Cambiar partida" : "Fijar punto de partida"}
            </button>
            <div className="border-t pt-1.5 space-y-1">
              {[
                ["bg-purple-600","Punto de partida"],
                ["bg-blue-500","En ruta"],
                ["bg-red-500","Alta prioridad"],
                ["bg-amber-400","Media prioridad"],
                ["bg-green-500","Baja prioridad"],
              ].map(([c, l]) => (
                <div key={l} className="flex items-center gap-1.5 text-gray-500">
                  <span className={`w-2.5 h-2.5 rounded-full ${c} inline-block`} />{l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </MapContainer>
    </div>
  );
}
