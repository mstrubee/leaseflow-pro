import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteStop, MaintenanceLocation, ScheduleEntry } from "@/hooks/useRouteBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Trash2, Save, RotateCcw, MapPin, Clock, ChevronDown, ChevronUp, Car } from "lucide-react";
import { toast } from "sonner";

interface Supplier { id: string; name: string; }

interface Props {
  origin: MaintenanceLocation | null;
  stops: RouteStop[];
  schedule: ScheduleEntry[];
  totalWorkMinutes: number;
  totalTravelMinutes: number;
  routeName: string;
  supplierId: string | null;
  scheduledDate: string;
  saving: boolean;
  onRouteName: (v: string) => void;
  onSupplierId: (v: string | null) => void;
  onScheduledDate: (v: string) => void;
  onRemoveStop: (locationId: string) => void;
  onReorder: (stops: RouteStop[]) => void;
  onSetFormMinutes: (locationId: string, formId: string, minutes: number) => void;
  onSave: () => void;
  onReset: () => void;
}

function fmt(m: number) {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

function StopRow({ stop, index, schedule, dragging, dragOver, onDragStart, onDragOver, onDrop, onRemove, onSetFormMinutes }: {
  stop: RouteStop; index: number; schedule: ScheduleEntry | undefined;
  dragging: number | null; dragOver: number | null;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
  onRemove: (id: string) => void;
  onSetFormMinutes: (locId: string, formId: string, min: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = stop.allForms.filter((f) => stop.formIds.includes(f.id));

  return (
    <div draggable onDragStart={() => onDragStart(index)} onDragOver={(e) => onDragOver(e, index)} onDrop={() => onDrop(index)}
      className={`rounded-lg border text-xs transition-colors ${dragOver === index ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>

      {/* Travel time */}
      {index > 0 && stop.travelMinutes > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 border-b border-gray-100 rounded-t-lg text-gray-400">
          <Car className="w-2.5 h-2.5" /><span>{fmt(stop.travelMinutes)}</span>
          {schedule && <span className="ml-auto">Llega {schedule.arrivalTime}</span>}
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <GripVertical className="w-3 h-3 text-gray-300 shrink-0 cursor-grab" />
        <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center shrink-0 font-bold">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium">{stop.location.local_name || stop.location.name}</div>
          <div className="text-gray-400 flex gap-2 flex-wrap">
            {schedule && <span>{schedule.arrivalTime} – {schedule.departureTime}</span>}
            {selected.length > 0 && <span>{selected.length} form{selected.length !== 1 ? "s" : ""} · {fmt(schedule?.workMinutes ?? 0)}</span>}
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
              <span className="font-mono text-[10px] text-gray-500 flex-1 truncate">{f.form_number}</span>
              {f.criticality_name && (
                <span className="text-[9px] px-1 rounded shrink-0" style={{ background: f.criticality_color ?? "#6b7280", color: "#fff" }}>
                  {f.criticality_name}
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <input type="number" min="5" max="480" step="5"
                  value={stop.formMinutes[f.id] ?? 30}
                  onChange={(e) => onSetFormMinutes(stop.locationId, f.id, parseInt(e.target.value) || 30)}
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

export function RoutePanel({
  origin, stops, schedule, totalWorkMinutes, totalTravelMinutes,
  routeName, supplierId, scheduledDate, saving,
  onRouteName, onSupplierId, onScheduledDate,
  onRemoveStop, onReorder, onSetFormMinutes, onSave, onReset,
}: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dragging, setDragging]   = useState<number | null>(null);
  const [dragOver, setDragOver]   = useState<number | null>(null);

  useEffect(() => {
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name")
      .then(({ data }) => { if (data) setSuppliers(data); });
  }, []);

  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) { setDragging(null); setDragOver(null); return; }
    const next = [...stops];
    const [moved] = next.splice(dragging, 1);
    next.splice(i, 0, moved);
    onReorder(next); setDragging(null); setDragOver(null);
  };

  const totalForms = stops.reduce((acc, s) => acc + s.formIds.length, 0);
  const endTime    = schedule[schedule.length - 1]?.departureTime ?? "--:--";
  const dayFits    = (totalWorkMinutes + totalTravelMinutes) <= 7.5 * 60;

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-2 shrink-0">
        <MapPin className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-700">Ruta armada</span>
        {stops.length > 0 && (
          <Badge variant="secondary" className="ml-auto text-[10px]">{stops.length} paradas · {totalForms} forms</Badge>
        )}
      </div>

      {origin && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-purple-50 border border-purple-200 text-xs shrink-0">
          <span className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
          <span className="font-medium text-purple-700 truncate">Inicio: {origin.local_name || origin.name}</span>
          <span className="ml-auto text-purple-400">09:00</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {stops.length === 0
          ? <p className="text-xs text-gray-400 italic text-center mt-4">Agrega paradas desde el mapa</p>
          : stops.map((stop, i) => (
            <StopRow key={stop.locationId} stop={stop} index={i} schedule={schedule[i]}
              dragging={dragging} dragOver={dragOver}
              onDragStart={setDragging}
              onDragOver={(e, idx) => { e.preventDefault(); setDragOver(idx); }}
              onDrop={handleDrop}
              onRemove={onRemoveStop}
              onSetFormMinutes={onSetFormMinutes}
            />
          ))
        }
      </div>

      {stops.length > 0 && (
        <div className={`rounded-lg border px-3 py-2 text-xs shrink-0 space-y-1 ${dayFits ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex justify-between font-medium text-gray-700">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Jornada estimada</span>
            <span>09:00 – {endTime}</span>
          </div>
          <div className="flex gap-3 text-gray-500 flex-wrap">
            <span><Car className="w-3 h-3 inline mr-0.5" />{fmt(totalTravelMinutes)} traslado</span>
            <span><Clock className="w-3 h-3 inline mr-0.5" />{fmt(totalWorkMinutes)} trabajo</span>
          </div>
          {!dayFits && <div className="text-amber-600 font-medium text-[11px]">⚠ Supera la jornada (7h 30min disponibles)</div>}
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
          <Select value={supplierId ?? "none"} onValueChange={(v) => onSupplierId(v === "none" ? null : v)}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Sin asignar</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Fecha programada</Label>
          <Input type="date" value={scheduledDate} onChange={(e) => onScheduledDate(e.target.value)} className="h-8 text-xs mt-1" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={onReset} disabled={saving}>
            <RotateCcw className="w-3 h-3 mr-1" />Limpiar
          </Button>
          <Button size="sm" className="flex-1 text-xs h-8"
            onClick={async () => { try { await onSave(); toast.success("Ruta guardada"); } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); } }}
            disabled={saving || stops.length === 0 || !routeName.trim()}>
            <Save className="w-3 h-3 mr-1" />{saving ? "Guardando…" : "Guardar ruta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
