import type { ScoredLocation, MaintenanceLocation } from "@/hooks/useRouteBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Plus, AlertTriangle } from "lucide-react";

interface Props {
  scoredLocations: ScoredLocation[];
  origin: MaintenanceLocation | null;
  onAddStop: (location: MaintenanceLocation, formIds?: string[]) => void;
  onSetOrigin: (location: MaintenanceLocation) => void;
}

export function LocationScoreList({ scoredLocations, origin, onAddStop, onSetOrigin }: Props) {
  if (!origin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
        <MapPin className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-500">
          Selecciona un punto de partida haciendo doble clic en un local del mapa, o elige uno abajo.
        </p>
      </div>
    );
  }

  if (scoredLocations.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center mt-8">
        Todos los locales ya están en la ruta.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      {scoredLocations.map((loc, i) => (
        <div
          key={loc.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors group"
        >
          {/* Rank badge */}
          <span className="text-xs font-mono text-gray-400 w-5 shrink-0 text-center">{i + 1}</span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate leading-tight">
              {loc.local_name || loc.name}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">
                {loc.distanceKm < 1
                  ? `${(loc.distanceKm * 1000).toFixed(0)} m`
                  : `${loc.distanceKm.toFixed(1)} km`}
              </span>
              {loc.totalForms > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-orange-600 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  {loc.totalForms} form{loc.totalForms !== 1 ? "s" : ""}
                </span>
              )}
              {loc.zona && <span className="text-xs text-gray-300">{loc.zona}</span>}
            </div>
          </div>

          {/* Criticality badges */}
          {loc.forms.length > 0 && (
            <div className="flex flex-wrap gap-0.5 max-w-[80px] justify-end shrink-0">
              {Array.from(
                loc.forms.reduce((acc, f) => {
                  if (f.criticality_name) {
                    acc.set(f.criticality_name, {
                      color: f.criticality_color,
                      count: (acc.get(f.criticality_name)?.count ?? 0) + 1,
                    });
                  }
                  return acc;
                }, new Map<string, { color: string | null; count: number }>()),
              ).map(([name, { color, count }]) => (
                <Badge
                  key={name}
                  className="text-[9px] px-1 py-0 h-4"
                  style={{ backgroundColor: color ?? "#6b7280", color: "#fff", border: "none" }}
                >
                  {count} {name}
                </Badge>
              ))}
            </div>
          )}

          {/* Add button */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onAddStop(loc)}
            title="Agregar a ruta"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
