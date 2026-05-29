import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MaintenanceLocation, RouteStop, ScoredLocation } from "@/hooks/useRouteBuilder";
import { LocationPopup } from "./LocationPopup";

// Fix Leaflet default icon paths when bundled
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

// Autofit map to all visible markers
function MapFitter({ locations }: { locations: MaintenanceLocation[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map((l) => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
    fitted.current = true;
  }, [map, locations]);
  return null;
}

// Color marker by score rank
function scoreColor(index: number, total: number): string {
  if (total === 0) return "#6b7280";
  const pct = 1 - index / total;
  if (pct > 0.66) return "#ef4444"; // top tercio: rojo
  if (pct > 0.33) return "#f59e0b"; // medio: amarillo
  return "#22c55e";                  // bajo: verde
}

export function RouteBuilderMap({
  locations,
  scoredLocations,
  origin,
  stops,
  onAddStop,
  onToggleForm,
  onAddAllForms,
  onSetOrigin,
}: Props) {
  const stopSet = new Set(stops.map((s) => s.locationId));
  const scoredMap = new Map(scoredLocations.map((s, i) => [s.id, { scored: s, rank: i }]));

  // Route polyline: origin → stops in order
  const routeCoords: [number, number][] = [];
  if (origin) routeCoords.push([origin.lat, origin.lng]);
  for (const stop of stops) {
    routeCoords.push([stop.location.lat, stop.location.lng]);
  }

  return (
    <MapContainer
      center={[-34.0, -71.0]}
      zoom={7}
      className="w-full h-full rounded-lg"
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution="© OpenStreetMap · © CARTO"
      />
      <MapFitter locations={locations} />

      {/* Route line */}
      {routeCoords.length > 1 && (
        <Polyline
          positions={routeCoords}
          pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "6 4", opacity: 0.8 }}
        />
      )}

      {/* All locations */}
      {locations.map((loc) => {
        const isOrigin = origin?.id === loc.id;
        const isStop = stopSet.has(loc.id);
        const scored = scoredMap.get(loc.id);
        const stopIndex = stops.findIndex((s) => s.locationId === loc.id);
        const existingStop = stops.find((s) => s.locationId === loc.id);
        const forms = scored?.scored.forms ?? existingStop?.allForms ?? [];

        let color = "#6b7280";
        let radius = 7;
        let fillOpacity = 0.7;

        if (isOrigin) {
          color = "#7c3aed";
          radius = 11;
          fillOpacity = 1;
        } else if (isStop) {
          color = "#3b82f6";
          radius = 9;
          fillOpacity = 1;
        } else if (scored) {
          color = scoreColor(scored.rank, scoredLocations.length);
          radius = 7 + Math.min(scored.scored.totalForms, 5);
          fillOpacity = 0.75;
        }

        return (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lng]}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity, weight: isOrigin || isStop ? 2 : 1 }}
            eventHandlers={{
              dblclick: () => {
                if (!origin) onSetOrigin(loc);
              },
            }}
          >
            <LocationPopup
              location={loc}
              forms={forms}
              existingStop={existingStop}
              onAddStop={onAddStop}
              onToggleForm={onToggleForm}
              onAddAllForms={onAddAllForms}
            />
          </CircleMarker>
        );
      })}

      {/* Stop order labels */}
      {stops.map((stop, i) => (
        <CircleMarker
          key={`label-${stop.locationId}`}
          center={[stop.location.lat, stop.location.lng]}
          radius={0}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          {/* Number badge rendered as tooltip */}
          <div style={{ display: "none" }}>{i + 1}</div>
        </CircleMarker>
      ))}

      {/* Legend */}
      <div className="leaflet-bottom leaflet-left">
        <div className="leaflet-control bg-white rounded shadow p-2 text-xs space-y-1 m-2">
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-600 inline-block" /> Punto de partida</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> En ruta</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Alta prioridad</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Media prioridad</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Baja prioridad</div>
          {!origin && <div className="text-gray-400 italic pt-1">Doble clic para fijar partida</div>}
        </div>
      </div>
    </MapContainer>
  );
}
