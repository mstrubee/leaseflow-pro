import { useCallback, useEffect, useState } from "react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, startOfWeek, endOfWeek,
  format, isSameMonth, isSameDay, isToday, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CalendarRoute {
  id: string;
  name: string;
  scheduled_date: string;
  status: string;
  supplier_name: string | null;
  stop_count: number;
  completed_stops: number;
  postponed_stops: number;
}

const STATUS_COLOR: Record<string, string> = {
  draft:       "bg-gray-400",
  assigned:    "bg-blue-500",
  in_progress: "bg-amber-500",
  completed:   "bg-green-500",
};

const STATUS_LABEL: Record<string, string> = {
  draft:       "Borrador",
  assigned:    "Asignada",
  in_progress: "En ejecución",
  completed:   "Completada",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RouteCalendar() {
  const { isAdmin, isOperador } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [routes, setRoutes] = useState<CalendarRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CalendarRoute | null>(null);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const to   = format(endOfMonth(currentMonth),   "yyyy-MM-dd");

    const { data } = await supabase
      .from("maintenance_routes")
      .select(`
        id, name, scheduled_date, status,
        suppliers ( name ),
        maintenance_route_stops ( id, status )
      `)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date");

    if (data) {
      setRoutes(
        data.map((r: Record<string, unknown>) => {
          const stops = (r.maintenance_route_stops as { status: string }[]) ?? [];
          const suppliers = r.suppliers as { name: string } | null;
          return {
            id:               r.id as string,
            name:             r.name as string,
            scheduled_date:   r.scheduled_date as string,
            status:           r.status as string,
            supplier_name:    suppliers?.name ?? null,
            stop_count:       stops.length,
            completed_stops:  stops.filter((s) => s.status === "completed").length,
            postponed_stops:  stops.filter((s) => s.status === "postponed").length,
          };
        }),
      );
    }
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  // Build calendar grid (Mon–Sun)
  const monthStart  = startOfMonth(currentMonth);
  const monthEnd    = endOfMonth(currentMonth);
  const gridStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd     = endOfWeek(monthEnd,     { weekStartsOn: 1 });
  const days        = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const routesByDay = new Map<string, CalendarRoute[]>();
  for (const r of routes) {
    const key = r.scheduled_date;
    if (!routesByDay.has(key)) routesByDay.set(key, []);
    routesByDay.get(key)!.push(r);
  }

  const completionPct = (r: CalendarRoute) =>
    r.stop_count > 0 ? Math.round((r.completed_stops / r.stop_count) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <CalendarDays className="w-5 h-5 text-blue-500" />
        <h2 className="text-base font-semibold text-gray-800 capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </h2>
        <div className="flex gap-1 ml-auto">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs"
            onClick={() => setCurrentMonth(new Date())}>
            Hoy
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-gray-400 shrink-0">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid grid-cols-7 gap-px flex-1 overflow-auto ${loading ? "opacity-50" : ""}`}>
        {days.map((day) => {
          const key     = format(day, "yyyy-MM-dd");
          const dayRoutes = routesByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const today   = isToday(day);

          return (
            <div
              key={key}
              className={`min-h-[90px] rounded-lg p-1.5 border transition-colors
                ${inMonth ? "bg-white border-gray-100" : "bg-gray-50/60 border-transparent"}
                ${today ? "ring-2 ring-blue-400 ring-offset-0" : ""}
              `}
            >
              <div className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full
                ${today ? "bg-blue-500 text-white" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                {format(day, "d")}
              </div>

              {dayRoutes.slice(0, 3).map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left mb-0.5 group"
                  onClick={() => setSelected(r)}
                >
                  <div className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-white
                    ${STATUS_COLOR[r.status] ?? "bg-gray-400"} hover:opacity-90 transition-opacity`}>
                    <span className="truncate flex-1">{r.name}</span>
                    {r.completed_stops > 0 && r.completed_stops === r.stop_count && (
                      <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                    )}
                    {r.postponed_stops > 0 && (
                      <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                    )}
                  </div>
                </button>
              ))}
              {dayRoutes.length > 3 && (
                <div className="text-[10px] text-gray-400 pl-1">+{dayRoutes.length - 3} más</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500 flex-wrap">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-sm ${STATUS_COLOR[k]}`} />
            {v}
          </div>
        ))}
      </div>

      {/* Route detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base">
                  <span className={`w-3 h-3 rounded-sm ${STATUS_COLOR[selected.status]}`} />
                  {selected.name}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>{format(parseISO(selected.scheduled_date), "EEEE d 'de' MMMM yyyy", { locale: es })}</span>
                  </div>
                  {selected.supplier_name && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{selected.supplier_name}</span>
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Progreso</span>
                    <span>{completionPct(selected)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${completionPct(selected)}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {selected.completed_stops} completadas
                    </span>
                    {selected.postponed_stops > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        {selected.postponed_stops} pospuestas
                      </span>
                    )}
                    <span className="ml-auto">{selected.stop_count} paradas total</span>
                  </div>
                </div>

                <Badge
                  className="text-xs"
                  style={{ backgroundColor: (STATUS_COLOR[selected.status] ?? "bg-gray-400").replace("bg-","") }}
                  variant="outline"
                >
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </Badge>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2">
                  {(isAdmin || isOperador) && (
                    <Button
                      className="w-full"
                      onClick={() => {
                        navigate(`/maintenance/routes/${selected.id}/execute`);
                        setSelected(null);
                      }}
                    >
                      {isOperador ? "Ejecutar ruta" : "Ver ejecución"}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
