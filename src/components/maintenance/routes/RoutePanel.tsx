import { useState } from "react";
import type { RouteStop, MaintenanceLocation, ScheduleEntry } from "@/hooks/useRouteBuilder";
import { addBusinessDays } from "@/hooks/useRouteBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Trash2, Save, RotateCcw, MapPin, Clock, ChevronDown, ChevronUp, Car, Link2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { MinutesInput } from "./MinutesInput";
import { SupplierCombobox } from "./SupplierCombobox";

interface Props {
  origin: MaintenanceLocation | null;
  stops: RouteStop[];
  schedule: ScheduleEntry[];
  totalWorkMinutes: number;
  totalTravelMinutes: number;
  totalDays: number;
  endDate: string;
  routeName: string;
  supplierId: string | null;
  scheduledDate: string;
  startTime: string;
  urbanSpeed: number;
  highwaySpeed: number;
  saving: boolean;
  onRouteName: (v: string) => void;
  onSupplierId: (v: string | null) => void;
  onScheduledDate: (v: string) => void;
  onStartTime: (v: string) => void;
  onUrbanSpeed: (v: number) => void;
  onHighwaySpeed: (v: number) => void;
  dayStartTimes: Record<number, string>;
  onRemoveStop: (locationId: string) => void;
  onReorder: (stops: RouteStop[]) => void;
  onSetFormMinutes: (locationId: string, formId: string, minutes: number) => void;
  onSetStopMinutes: (stopId: string, minutes: number) => void;
  onAddErrand: (label: string, minutes: number) => void;
  onSetDayStartTimeForDay: (dayIndex: number, time: string) => void;
  onSave: () => void;
  onReset: () => void;
  isEditing?: boolean;
  onSelectLocation?: (loc: MaintenanceLocation) => void;
}

function fmt(m: number) {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

// Traslado mostrado ENTRE dos locales (no dentro del destino)
function TravelDivider({ minutes, arrival }: { minutes: number; arrival?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-0.5 text-[10px] text-gray-400">
      <div className="h-px flex-1 bg-gray-200" />
      <Car className="w-2.5 h-2.5 shrink-0" />
      <span className="shrink-0">{fmt(minutes)} de traslado{arrival ? ` · llega ${arrival}` : ""}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function StopRow({ stop, index, order, schedule, formIds, partial, dragging, dragOver, onDragStart, onDragOver, onDrop, onRemove, onSetFormMinutes, onSetStopMinutes, onSelectLocation }: {
  stop: RouteStop; index: number; order: number; schedule: ScheduleEntry | undefined;
  formIds: string[]; // forms de este tramo (día)
  partial: boolean;
  dragging: number | null; dragOver: number | null;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  onRemove: (id: string) => void;
  onSetFormMinutes: (locId: string, formId: string, min: number) => void;
  onSetStopMinutes: (stopId: string, min: number) => void;
  onSelectLocation?: (loc: MaintenanceLocation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = stop.allForms.filter((f) => formIds.includes(f.id));
  const isShopping = stop.kind === "shopping";
  const noForms = stop.formIds.length === 0; // compras o "solo parada"

  return (
    <div draggable onDragStart={() => onDragStart(index)} onDragOver={(e) => onDragOver(e, index)} onDrop={() => onDrop(index)}
      className={`rounded-lg border text-xs transition-colors ${dragOver === index ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>

      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <GripVertical className="w-3 h-3 text-gray-300 shrink-0 cursor-grab" />
        <span className={`w-5 h-5 rounded-full text-white text-[9px] flex items-center justify-center shrink-0 font-bold ${isShopping ? "bg-fuchsia-500" : "bg-blue-500"}`}>
          {isShopping ? <ShoppingCart className="w-3 h-3" /> : order}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`truncate font-medium ${(!noForms && onSelectLocation) ? "cursor-pointer hover:text-blue-600 transition-colors" : ""}`}
            onClick={() => { if (!noForms) onSelectLocation?.(stop.location); }}
            title={(!noForms && onSelectLocation) ? "Ver detalle del local" : undefined}
          >
            {isShopping ? (stop.label || "Compras") : (stop.location.local_name || stop.location.name)}
            {!isShopping && noForms && <span className="ml-1 text-[9px] text-gray-400 font-normal">(solo parada)</span>}
            {partial && <span className="ml-1 text-[9px] text-amber-600 font-normal">(continúa)</span>}
          </div>
          <div className="text-gray-400 flex items-center gap-2 flex-wrap">
            {schedule && <span>{schedule.arrivalTime} – {schedule.departureTime}</span>}
            {selected.length > 0 && <span>{selected.length} form{selected.length !== 1 ? "s" : ""} · {fmt(schedule?.workMinutes ?? 0)}</span>}
            {noForms && (
              <span className="inline-flex items-center gap-1">
                <MinutesInput
                  value={stop.stopMinutes ?? 30}
                  onChange={(m) => onSetStopMinutes(stop.locationId, m)}
                  className="w-12 border border-gray-200 rounded px-1 py-0 text-[10px] text-center focus:outline-none focus:border-blue-400"
                />
                <span className="text-[9px]">min</span>
              </span>
            )}
          </div>
        </div>
        {selected.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600 p-0.5">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-300 hover:text-red-500 shrink-0" onClick={() => onRemove(stop.locationId)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {expanded && selected.length > 0 && (
        <div className="px-2 pb-2 space-y-1 border-t border-gray-100 pt-1.5">
          {selected.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5">
              {f.mergedFormNumbers.length > 1 ? (
                <span className="flex-1 truncate inline-flex items-center gap-1" title={`Fusionados: ${f.mergedFormNumbers.join(" + ")}`}>
                  <span className="inline-flex items-center gap-0.5 rounded bg-purple-100 text-purple-700 text-[8px] font-bold px-1 leading-none py-0.5"><Link2 className="w-2 h-2" />F</span>
                  <span className="font-mono text-[10px] text-purple-700">{f.form_number}</span>
                  <span className="text-[9px] text-gray-400">+{f.mergedFormNumbers.length - 1}</span>
                </span>
              ) : (
                <span className="font-mono text-[10px] text-gray-500 flex-1 truncate">{f.form_number}</span>
              )}
              {f.criticality_name && (
                <span className="text-[9px] px-1 rounded shrink-0" style={{ background: f.criticality_color ?? "#6b7280", color: "#fff" }}>
                  {f.criticality_name}
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <MinutesInput
                  value={stop.formMinutes[f.id] ?? 30}
                  onChange={(m) => onSetFormMinutes(stop.locationId, f.id, m)}
                  className="w-12 border border-gray-200 rounded px-1 py-0 text-[10px] text-center focus:outline-none focus:border-blue-400"
                />
                <span className="text-gray-400 text-[9px]">min</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function dayDateLabel(scheduledDate: string, dayIndex: number): string {
  if (!scheduledDate) return `Día ${dayIndex + 1}`;
  const d = addBusinessDays(scheduledDate, dayIndex);
  const [y, m, dd] = d.split("-").map(Number);
  const date = new Date(y, m - 1, dd);
  const label = date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function RoutePanel({
  origin, stops, schedule, totalWorkMinutes, totalTravelMinutes, totalDays, endDate,
  routeName, supplierId, scheduledDate, startTime, urbanSpeed, highwaySpeed, saving,
  onRouteName, onSupplierId, onScheduledDate, onStartTime, onUrbanSpeed, onHighwaySpeed,
  dayStartTimes, onRemoveStop, onReorder, onSetFormMinutes, onSetStopMinutes, onAddErrand, onSetDayStartTimeForDay, onSave, onReset, isEditing, onSelectLocation,
}: Props) {
  const [dragging, setDragging]   = useState<number | null>(null);
  const [dragOver, setDragOver]   = useState<number | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

  const toggleDayCollapse = (day: number) =>
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });

  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) { setDragging(null); setDragOver(null); return; }
    const next = [...stops];
    const [moved] = next.splice(dragging, 1);
    next.splice(i, 0, moved);
    onReorder(next); setDragging(null); setDragOver(null);
  };

  const totalForms = stops.reduce((acc, s) => acc + s.formIds.length, 0);

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-2 shrink-0">
        <MapPin className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-700">Ruta armada</span>
        <button
          onClick={() => onAddErrand("Compras", 30)}
          title="Agregar una parada de compras (bloque de tiempo, sin local)"
          className="ml-auto flex items-center gap-1 px-2 h-6 rounded text-[11px] font-medium border bg-white border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-colors"
        >
          <ShoppingCart className="w-3.5 h-3.5" /> Compras
        </button>
        {stops.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">{stops.length} paradas · {totalForms} forms</Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {stops.length === 0 || schedule.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center mt-4">Agrega paradas desde el mapa</p>
        ) : (
          // Agrupar las ENTRIES del cronograma por día (una parada puede partirse)
          Array.from(
            schedule.reduce((acc, e) => {
              if (!acc.has(e.dayIndex)) acc.set(e.dayIndex, []);
              acc.get(e.dayIndex)!.push(e);
              return acc;
            }, new Map<number, ScheduleEntry[]>()),
          )
            .sort((a, b) => a[0] - b[0])
            .map(([day, dayEntries]) => {
              const collapsed = collapsedDays.has(day);
              const dayForms = dayEntries.reduce((s, e) => s + e.formIds.length, 0);
              const firstArr = dayEntries[0]?.arrivalTime;
              const lastDep = dayEntries[dayEntries.length - 1]?.departureTime;
              const firstStop = stops[dayEntries[0]?.stopIndex];
              const isForcedDayStart = !!firstStop?.dayBreak;
              const isFirstDay = day === 0;
              const startLoc = isFirstDay ? (origin ?? firstStop?.location) : firstStop?.location;
              return (
                <div key={`day-${day}`} className="border border-purple-200 rounded-lg overflow-hidden">
                  {/* Cabecera del día (2-3 filas): fecha · inicio · resumen */}
                  <div className="bg-purple-50">
                    {/* Fila 1: día + fecha (calendario en el día 1) */}
                    <div onClick={() => toggleDayCollapse(day)}
                      className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-purple-100/60 transition-colors">
                      {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-purple-600 shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                      <span className="text-[11px] font-bold text-purple-700 flex-1 min-w-0 truncate">📅 Día {day + 1}</span>
                      {isFirstDay ? (
                        <input type="date" value={scheduledDate} onChange={(e) => onScheduledDate(e.target.value)}
                          onClick={(e) => e.stopPropagation()} title="Fecha de inicio de la gira"
                          className="h-7 shrink-0 min-w-[8rem] border border-purple-300 rounded px-1.5 text-[11px] text-purple-700 focus:outline-none focus:border-purple-500" />
                      ) : (
                        <span className="text-[10px] font-medium text-purple-600 capitalize shrink-0">{dayDateLabel(scheduledDate, day)}</span>
                      )}
                    </div>
                    {/* Fila 2: local de inicio + hora (editable en todos los días, default 09:00) */}
                    <div className="flex items-center gap-2 px-2 py-1 border-t border-purple-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                      <span className="text-[11px] text-purple-700 truncate flex-1 min-w-0">
                        Inicio: {startLoc?.local_name || startLoc?.name || "—"}
                        {isForcedDayStart && <span className="ml-1 text-[9px] text-blue-600">(forzado)</span>}
                      </span>
                      <input type="time"
                        value={isFirstDay ? startTime : (dayStartTimes[day] ?? "09:00")}
                        onChange={(e) => onSetDayStartTimeForDay(day, e.target.value)}
                        title="Hora de inicio de este día"
                        className="h-7 shrink-0 min-w-[5.5rem] border border-purple-300 rounded px-1.5 text-[11px] text-purple-700 focus:outline-none focus:border-purple-500" />
                    </div>
                    {/* Fila 3: resumen */}
                    <div className="px-2 py-0.5 border-t border-purple-100 text-[10px] text-purple-400">
                      {dayEntries.length} parada{dayEntries.length !== 1 ? "s" : ""} · {dayForms} forms · {firstArr}–{lastDep}
                    </div>
                  </div>
                  {!collapsed && (
                    <div className="p-1 space-y-1">
                      {dayEntries.map((e, idxInDay) => (
                        <div key={`${e.stopIndex}-${e.dayIndex}`}>
                          {e.travelMinutes > 0 && <TravelDivider minutes={e.travelMinutes} arrival={e.arrivalTime} />}
                          <StopRow
                            stop={stops[e.stopIndex]} index={e.stopIndex} order={idxInDay + 1}
                            schedule={e} formIds={e.formIds} partial={e.partial}
                            dragging={dragging} dragOver={dragOver}
                            onDragStart={setDragging}
                            onDragOver={(ev, idx) => { ev.preventDefault(); setDragOver(idx); }}
                            onDrop={handleDrop}
                            onRemove={onRemoveStop}
                            onSetFormMinutes={onSetFormMinutes}
                            onSetStopMinutes={onSetStopMinutes}
                            onSelectLocation={onSelectLocation}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {stops.length > 0 && (
        <div className={`rounded-lg border px-3 py-2 text-xs shrink-0 space-y-1 ${totalDays === 1 ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex justify-between font-medium text-gray-700">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />
              {totalDays === 1 ? "Jornada estimada" : `${totalDays} días de trabajo`}
            </span>
            {scheduledDate && (
              <span>{totalDays === 1 ? scheduledDate : `${scheduledDate} → ${endDate}`}</span>
            )}
          </div>
          <div className="flex gap-3 text-gray-500 flex-wrap">
            <span><Car className="w-3 h-3 inline mr-0.5" />{fmt(totalTravelMinutes)} traslado</span>
            <span><Clock className="w-3 h-3 inline mr-0.5" />{fmt(totalWorkMinutes)} trabajo</span>
          </div>
          {totalDays > 1 && (
            <div className="text-blue-600 font-medium text-[11px]">
              ℹ Supera la jornada diaria → se reparte en {totalDays} días hábiles (una ruta por día)
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 border-t pt-2 shrink-0">
        <div>
          <Label className="text-xs">Nombre de la ruta *</Label>
          <Input value={routeName} onChange={(e) => onRouteName(e.target.value)}
            placeholder="Ej: Ruta 2026.01.15" className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-xs">Proveedor asignado</Label>
          <SupplierCombobox value={supplierId} onChange={onSupplierId} />
        </div>
        {/* Sin paradas aún: la fecha/hora se fijan en la cabecera de cada día (arriba).
            Fallback para fijar la fecha antes de agregar paradas. */}
        {stops.length === 0 && (
          <div>
            <Label className="text-xs">Fecha programada</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => onScheduledDate(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
        )}
        {/* Velocidades de traslado editables */}
        <div className="flex gap-2 items-end">
          <Car className="w-3.5 h-3.5 text-gray-400 mb-2 shrink-0" />
          <div className="flex-1">
            <Label className="text-[10px] text-gray-500">Vel. ciudad (km/h)</Label>
            <Input type="number" min={5} max={120} value={urbanSpeed}
              onChange={(e) => onUrbanSpeed(parseInt(e.target.value) || 20)}
              className="h-8 text-xs mt-0.5" />
          </div>
          <div className="flex-1">
            <Label className="text-[10px] text-gray-500">Vel. carretera (km/h)</Label>
            <Input type="number" min={20} max={140} value={highwaySpeed}
              onChange={(e) => onHighwaySpeed(parseInt(e.target.value) || 100)}
              className="h-8 text-xs mt-0.5" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={onReset} disabled={saving}>
            <RotateCcw className="w-3 h-3 mr-1" />Limpiar
          </Button>
          <Button size="sm" className="flex-1 text-xs h-8"
            onClick={async () => { try { await onSave(); toast.success(isEditing ? "Cambios guardados" : "Ruta guardada"); } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); } }}
            disabled={saving || stops.length === 0 || !routeName.trim()}>
            <Save className="w-3 h-3 mr-1" />{saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Guardar ruta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
