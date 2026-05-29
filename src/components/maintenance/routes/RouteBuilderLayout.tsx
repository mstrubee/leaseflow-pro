import { useState } from "react";
import { useRouteBuilder } from "@/hooks/useRouteBuilder";
import { RouteBuilderMap } from "./RouteBuilderMap";
import { LocationScoreList } from "./LocationScoreList";
import { RoutePanel } from "./RoutePanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";

export function RouteBuilderLayout() {
  const rb = useRouteBuilder();
  const [search, setSearch] = useState("");

  const filteredScored = rb.scoredLocations.filter((loc) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      loc.name.toLowerCase().includes(q) ||
      (loc.local_name ?? "").toLowerCase().includes(q) ||
      (loc.local_code ?? "").toLowerCase().includes(q) ||
      (loc.zona ?? "").toLowerCase().includes(q)
    );
  });

  if (rb.loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Cargando locales…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top bar */}
      <div className="flex items-center gap-3 shrink-0">
        <Navigation className="w-5 h-5 text-blue-500 shrink-0" />
        <h2 className="text-base font-semibold text-gray-800">Armar Ruta de Mantención</h2>
        <div className="ml-auto flex items-center gap-2">
          {/* Origin selector */}
          <Select
            value={rb.origin?.id ?? "none"}
            onValueChange={(v) => {
              if (v === "none") { rb.setOrigin(null); return; }
              const loc = rb.locations.find((l) => l.id === v);
              if (loc) rb.setOrigin(loc);
            }}
          >
            <SelectTrigger className="h-8 text-xs w-56">
              <SelectValue placeholder="Punto de partida…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Sin punto de partida</SelectItem>
              {rb.locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id} className="text-xs">
                  {loc.local_name || loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Map — 50% */}
        <div className="flex-1 min-w-0 rounded-lg overflow-hidden border border-gray-200 shadow-sm" style={{ minHeight: 500 }}>
          <RouteBuilderMap
            locations={rb.locations}
            scoredLocations={rb.scoredLocations}
            formsByLocation={rb.formsByLocation}
            origin={rb.origin}
            stops={rb.stops}
            onAddStop={rb.addStop}
            onToggleForm={rb.toggleFormInStop}
            onAddAllForms={rb.addAllFormsToStop}
            onSetFormMinutes={rb.setFormMinutes}
            onSetOrigin={rb.setOrigin}
          />
        </div>

        {/* Score list — 25% */}
        <div className="w-64 shrink-0 flex flex-col border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 shrink-0">
            <p className="text-xs font-semibold text-gray-600 mb-1">Locales ordenados por prioridad</p>
            {rb.origin && (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar local…"
                className="h-7 text-xs"
              />
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <LocationScoreList
              scoredLocations={filteredScored}
              origin={rb.origin}
              onAddStop={rb.addStop}
              onSetOrigin={rb.setOrigin}
            />
          </div>
        </div>

        {/* Route panel — 25% */}
        <div className="w-64 shrink-0 flex flex-col border border-gray-200 rounded-lg shadow-sm bg-white p-3 overflow-hidden">
          <RoutePanel
            origin={rb.origin}
            stops={rb.stops}
            schedule={rb.schedule}
            totalWorkMinutes={rb.totalWorkMinutes}
            totalTravelMinutes={rb.totalTravelMinutes}
            routeName={rb.routeName}
            supplierId={rb.supplierId}
            scheduledDate={rb.scheduledDate}
            startTime={rb.startTime}
            saving={rb.saving}
            onRouteName={rb.setRouteName}
            onSupplierId={rb.setSupplierId}
            onStartTime={rb.setStartTime}
            onScheduledDate={(v) => {
              rb.setScheduledDate(v);
              if (v && (!rb.routeName || rb.routeName.startsWith("Ruta "))) {
                const [y, m, d] = v.split("-");
                rb.setRouteName(`Ruta ${y}.${m}.${d}`);
              }
            }}
            onRemoveStop={rb.removeStop}
            onReorder={rb.reorderStops}
            onSetFormMinutes={rb.setFormMinutes}
            onSave={async () => { const id = await rb.saveRoute(); rb.resetRoute(); return id; }}
            onReset={rb.resetRoute}
          />
        </div>
      </div>
    </div>
  );
}
