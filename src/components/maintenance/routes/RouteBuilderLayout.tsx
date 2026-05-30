import { useState } from "react";
import { useRouteBuilder, type MaintenanceLocation } from "@/hooks/useRouteBuilder";
import { RouteBuilderMap } from "./RouteBuilderMap";
import { LocationScoreList } from "./LocationScoreList";
import { LocationDetailPanel } from "./LocationDetailPanel";
import { RoutePanel } from "./RoutePanel";
import { ListFilters } from "./ListFilters";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Navigation, PanelRightClose, PanelRightOpen, ListOrdered, MapPin, Route as RouteIcon } from "lucide-react";

// Divisor arrastrable: arrastrar a la izquierda agranda la columna (que está a la derecha)
function dragHandler(current: number, setW: (n: number) => void, min = 240, max = 760) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => setW(Math.max(min, Math.min(max, current + (startX - ev.clientX))));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

function Divider({ onDown }: { onDown: (e: React.MouseEvent) => void }) {
  return (
    <div onMouseDown={onDown}
      className="shrink-0 w-1.5 rounded cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors"
      title="Arrastra para redimensionar" />
  );
}

function CollapsedTab({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="shrink-0 w-9 flex flex-col items-center justify-center gap-2 border border-gray-200 rounded-lg shadow-sm bg-white hover:bg-gray-50 transition-colors"
      title={`Mostrar ${label}`}>
      <PanelRightOpen className="w-4 h-4 text-gray-500" />
      <span className="text-[10px] text-gray-500 [writing-mode:vertical-rl] rotate-180">{label}</span>
      {icon}
    </button>
  );
}

export function RouteBuilderLayout() {
  const rb = useRouteBuilder();
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<MaintenanceLocation | null>(null);

  const [listCollapsed, setListCollapsed] = useState(false);
  const [listWidth, setListWidth] = useState(360);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailWidth, setDetailWidth] = useState(340);
  const [routeCollapsed, setRouteCollapsed] = useState(false);
  const [routeWidth, setRouteWidth] = useState(300);

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

  // Forms/stop del local seleccionado (para el panel de detalle)
  const detailForms = selectedLocation ? rb.formsByLocation.get(selectedLocation.id) ?? [] : [];
  const detailStop = selectedLocation ? rb.stops.find((s) => s.locationId === selectedLocation.id) : undefined;

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
          <Select
            value={rb.origin?.id ?? "none"}
            onValueChange={(v) => {
              if (v === "none") { rb.setOrigin(null); return; }
              const loc = rb.locations.find((l) => l.id === v);
              if (loc) rb.setOrigin(loc);
            }}
          >
            <SelectTrigger className="h-8 text-xs w-56"><SelectValue placeholder="Punto de partida…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Sin punto de partida</SelectItem>
              {rb.locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.local_name || loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Layout multi-columna */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Mapa */}
        <div className="flex-1 min-w-0 rounded-lg overflow-hidden border border-gray-200 shadow-sm" style={{ minHeight: 500 }}>
          <RouteBuilderMap
            locations={rb.locations}
            scoredLocations={rb.scoredLocations}
            formsByLocation={rb.formsByLocation}
            origin={rb.origin}
            stops={rb.stops}
            schedule={rb.schedule}
            startTime={rb.startTime}
            visibleLocationIds={rb.visibleLocationIds}
            onSetOrigin={rb.setOrigin}
            onSelectLocation={(loc) => { setSelectedLocation(loc); setDetailCollapsed(false); }}
          />
        </div>

        {/* Ordenamiento de Locales */}
        {listCollapsed ? (
          <CollapsedTab label="Ordenamiento de Locales" icon={<ListOrdered className="w-4 h-4 text-gray-400" />} onClick={() => setListCollapsed(false)} />
        ) : (
          <>
            <Divider onDown={dragHandler(listWidth, setListWidth)} />
            <div className="shrink-0 flex flex-col border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden" style={{ width: listWidth }}>
              <div className="px-3 py-2 border-b bg-gray-50 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-gray-600 flex-1">Ordenamiento de Locales</p>
                  <button onClick={() => setListCollapsed(true)} className="text-gray-400 hover:text-gray-600" title="Ocultar"><PanelRightClose className="w-4 h-4" /></button>
                </div>
                {rb.origin && (
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar local…" className="h-7 text-xs mb-1.5" />
                )}
                <ListFilters
                  sortBy={rb.sortBy} onSortBy={rb.setSortBy} criticalities={rb.criticalities}
                  filterTypes={rb.filterTypes}
                  onToggleType={(t) => rb.setFilterTypes((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                  filterCriticalities={rb.filterCriticalities}
                  onToggleCriticality={(c) => rb.setFilterCriticalities((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; })}
                  onClear={() => { rb.setFilterTypes(new Set()); rb.setFilterCriticalities(new Set()); }}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <LocationScoreList
                  scoredLocations={filteredScored}
                  origin={rb.origin}
                  selectedLocationId={selectedLocation?.id ?? null}
                  onSelectLocation={(loc) => { setSelectedLocation(loc); setDetailCollapsed(false); }}
                />
              </div>
            </div>
          </>
        )}

        {/* Detalle del local seleccionado */}
        {selectedLocation && (
          detailCollapsed ? (
            <CollapsedTab label="Detalle del local" icon={<MapPin className="w-4 h-4 text-gray-400" />} onClick={() => setDetailCollapsed(false)} />
          ) : (
            <>
              <Divider onDown={dragHandler(detailWidth, setDetailWidth)} />
              <div className="shrink-0 flex flex-col border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden" style={{ width: detailWidth }}>
                <LocationDetailPanel
                  location={selectedLocation}
                  forms={detailForms}
                  existingStop={detailStop}
                  origin={rb.origin}
                  isMultiDay={rb.totalDays > 1}
                  startTime={rb.startTime}
                  onStartTime={rb.setStartTime}
                  onAddStop={rb.addStop}
                  onToggleForm={rb.toggleFormInStop}
                  onAddAllForms={rb.addAllFormsToStop}
                  onClearForms={rb.clearFormsInStop}
                  onSetFormMinutes={rb.setFormMinutes}
                  onSetOrigin={(l) => rb.setOrigin(l)}
                  onToggleDayBreak={rb.toggleDayBreak}
                  onSetDayStartTime={rb.setDayStartTime}
                  onSetPriorityForm={rb.setPriorityForm}
                  onMergeForms={rb.mergeForms}
                  onUnmergeForms={rb.unmergeForms}
                  onClose={() => setSelectedLocation(null)}
                  onCollapse={() => setDetailCollapsed(true)}
                />
              </div>
            </>
          )
        )}

        {/* Ruta armada */}
        {routeCollapsed ? (
          <CollapsedTab label="Ruta armada" icon={<RouteIcon className="w-4 h-4 text-gray-400" />} onClick={() => setRouteCollapsed(false)} />
        ) : (
          <>
            <Divider onDown={dragHandler(routeWidth, setRouteWidth)} />
            <div className="shrink-0 flex flex-col border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden" style={{ width: routeWidth }}>
              <div className="flex items-center justify-end px-1 pt-1 shrink-0">
                <button onClick={() => setRouteCollapsed(true)} className="text-gray-400 hover:text-gray-600 p-1" title="Ocultar"><PanelRightClose className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 min-h-0 px-3 pb-3">
                <RoutePanel
                  origin={rb.origin}
                  stops={rb.stops}
                  schedule={rb.schedule}
                  totalWorkMinutes={rb.totalWorkMinutes}
                  totalTravelMinutes={rb.totalTravelMinutes}
                  totalDays={rb.totalDays}
                  endDate={rb.endDate}
                  routeName={rb.routeName}
                  supplierId={rb.supplierId}
                  scheduledDate={rb.scheduledDate}
                  startTime={rb.startTime}
                  urbanSpeed={rb.urbanSpeed}
                  highwaySpeed={rb.highwaySpeed}
                  saving={rb.saving}
                  onRouteName={rb.setRouteName}
                  onSupplierId={rb.setSupplierId}
                  onStartTime={rb.setStartTime}
                  onUrbanSpeed={rb.setUrbanSpeed}
                  onHighwaySpeed={rb.setHighwaySpeed}
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
                  onSetDayStartTime={rb.setDayStartTime}
                  onSave={async () => { const id = await rb.saveRoute(); rb.resetRoute(); return id; }}
                  onReset={rb.resetRoute}
                  onSelectLocation={(loc) => { setSelectedLocation(loc); setDetailCollapsed(false); }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
