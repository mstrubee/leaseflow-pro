import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteStop, MaintenanceLocation } from "@/hooks/useRouteBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical, Trash2, Save, RotateCcw, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  origin: MaintenanceLocation | null;
  stops: RouteStop[];
  routeName: string;
  supplierId: string | null;
  scheduledDate: string;
  saving: boolean;
  onRouteName: (v: string) => void;
  onSupplierId: (v: string | null) => void;
  onScheduledDate: (v: string) => void;
  onRemoveStop: (locationId: string) => void;
  onReorder: (stops: RouteStop[]) => void;
  onSave: () => void;
  onReset: () => void;
}

export function RoutePanel({
  origin,
  stops,
  routeName,
  supplierId,
  scheduledDate,
  saving,
  onRouteName,
  onSupplierId,
  onScheduledDate,
  onRemoveStop,
  onReorder,
  onSave,
  onReset,
}: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: boolean) => {
            order: (o: string) => Promise<{ data: Supplier[] | null }>;
          };
        };
      };
    };
    client
      .from("suppliers")
      .select("id,name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setSuppliers(data);
      });
  }, []);

  function handleDragStart(i: number) {
    setDragging(i);
  }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOver(i);
  }
  function handleDrop(i: number) {
    if (dragging === null || dragging === i) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const next = [...stops];
    const [moved] = next.splice(dragging, 1);
    next.splice(i, 0, moved);
    onReorder(next);
    setDragging(null);
    setDragOver(null);
  }

  const totalForms = stops.reduce((acc, s) => acc + s.formIds.length, 0);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-blue-500" />
        Ruta armada
        {stops.length > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {stops.length} parada{stops.length !== 1 ? "s" : ""} · {totalForms} form{totalForms !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Origin */}
      {origin && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-purple-50 border border-purple-200 text-xs">
          <span className="w-4 h-4 rounded-full bg-purple-500 shrink-0" />
          <span className="font-medium text-purple-700 truncate">Inicio: {origin.local_name || origin.name}</span>
        </div>
      )}

      {/* Stops list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {stops.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center mt-4">
            Agrega paradas desde el mapa o la lista
          </p>
        ) : (
          stops.map((stop, i) => (
            <div
              key={stop.locationId}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-grab transition-colors ${
                dragOver === i ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <GripVertical className="w-3 h-3 text-gray-300 shrink-0" />
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center shrink-0 font-bold">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">
                  {stop.location.local_name || stop.location.name}
                </div>
                {stop.formIds.length > 0 && (
                  <div className="text-gray-400">{stop.formIds.length} form{stop.formIds.length !== 1 ? "s" : ""}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-gray-300 hover:text-red-500 shrink-0"
                onClick={() => onRemoveStop(stop.locationId)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Form */}
      <div className="space-y-2 border-t pt-3">
        <div>
          <Label className="text-xs">Nombre de la ruta *</Label>
          <Input
            value={routeName}
            onChange={(e) => onRouteName(e.target.value)}
            placeholder="Ej: Ruta RM Norte — Lunes"
            className="h-8 text-xs mt-1"
          />
        </div>

        <div>
          <Label className="text-xs">Proveedor asignado</Label>
          <Select
            value={supplierId ?? "none"}
            onValueChange={(v) => onSupplierId(v === "none" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Sin asignar</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Fecha programada</Label>
          <Input
            type="date"
            value={scheduledDate}
            onChange={(e) => onScheduledDate(e.target.value)}
            className="h-8 text-xs mt-1"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={onReset}
            disabled={saving}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Limpiar
          </Button>
          <Button
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={async () => {
              try {
                await onSave();
                toast.success("Ruta guardada correctamente");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Error al guardar");
              }
            }}
            disabled={saving || stops.length === 0 || !routeName.trim()}
          >
            <Save className="w-3 h-3 mr-1" />
            {saving ? "Guardando…" : "Guardar ruta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
