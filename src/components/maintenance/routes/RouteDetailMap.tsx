import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ExportStop } from "./routesExportData";

function stopIcon(order: number) {
  return L.divIcon({
    html: `<div style="background:#3b82f6;color:white;border-radius:50%;width:24px;height:24px;
      display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;
      border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${order}</div>`,
    className: "", iconSize: [24, 24], iconAnchor: [12, 12],
  });
}

function travelIcon(min: number) {
  return L.divIcon({
    html: `<span style="background:white;color:#2563eb;border:1.5px solid #3b82f6;border-radius:10px;
      padding:0 5px;font-size:10px;font-weight:bold;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.2)">🚗 ${min} min</span>`,
    className: "", iconSize: [0, 0], iconAnchor: [20, 8],
  });
}

function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length === 0) return;
    if (pts.length === 1) { map.setView(pts[0], 14); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    setTimeout(() => map.invalidateSize(), 100);
  }, [map, pts]);
  return null;
}

interface Props {
  stops: ExportStop[];
}

/** Mapa de una ruta diaria: paradas numeradas, líneas y minutos de traslado. */
export function RouteDetailMap({ stops }: Props) {
  const placed = stops.filter((s) => s.lat != null && s.lng != null);
  const pts = placed.map((s) => [s.lat as number, s.lng as number] as [number, number]);

  if (placed.length === 0) {
    return (
      <div className="h-56 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
        Las paradas no tienen coordenadas para mostrar en el mapa
      </div>
    );
  }

  return (
    <div className="h-56 rounded-lg overflow-hidden border border-gray-200">
      <MapContainer center={pts[0]} zoom={12} className="w-full h-full" scrollWheelZoom={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="© OpenStreetMap · © CARTO" />
        <FitBounds pts={pts} />

        {/* Línea del recorrido */}
        {pts.length > 1 && (
          <Polyline positions={pts} pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.7 }} />
        )}

        {/* Etiquetas de minutos de traslado en el medio de cada tramo */}
        {placed.map((s, i) => {
          if (i === 0 || !s.travel_min) return null;
          const a = pts[i - 1], b = pts[i];
          const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          return <Marker key={`t-${i}`} position={mid} icon={travelIcon(s.travel_min)} interactive={false} />;
        })}

        {/* Paradas numeradas */}
        {placed.map((s) => (
          <Marker key={`s-${s.stop_order}`} position={[s.lat as number, s.lng as number]} icon={stopIcon(s.stop_order)} />
        ))}
      </MapContainer>
    </div>
  );
}
