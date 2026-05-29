import { useCallback, useEffect, useState } from "react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, startOfWeek, endOfWeek,
  format, isSameMonth, isToday, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Clock, CheckCircle2, AlertCircle, Download, FileDown, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { exportRoutesPDF } from "./exportRoutesPDF";
import { toast } from "sonner";

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
  const { isAdmin, isOperador, user } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [routes, setRoutes] = useState<CalendarRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CalendarRoute | null>(null);

  // Export-to-PDF mode
  const [exportMode, setExportMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Supplier filtering
  // - operatorSupplierIds: null = admin (ve todo); array = operador (solo esos)
  const [operatorSupplierIds, setOperatorSupplierIds] = useState<string[] | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>([]);
  const [filterSupplierId, setFilterSupplierId] = useState<string>("all");

  // Load operator's suppliers (or all suppliers for admin) for the filter dropdown
  useEffect(() => {
    if (!user) return;
    if (isOperador) {
      supabase
        .from("operator_suppliers")
        .select("supplier_id, suppliers ( id, name )")
        .eq("user_id", user.id)
        .then(({ data }) => {
          const ids = (data ?? []).map((r: Record<string, unknown>) => r.supplier_id as string);
          const opts = (data ?? [])
            .map((r: Record<string, unknown>) => r.suppliers as { id: string; name: string } | null)
            .filter(Boolean) as { id: string; name: string }[];
          setOperatorSupplierIds(ids);
          setSupplierOptions(opts);
        });
    } else {
      setOperatorSupplierIds(null); // admin: sin restricción
      supabase.from("suppliers").select("id,name").order("name")
        .then(({ data }) => setSupplierOptions(data ?? []));
    }
  }, [user, isOperador]);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const to   = format(endOfMonth(currentMonth),   "yyyy-MM-dd");

    let query = supabase
      .from("maintenance_routes")
      .select(`
        id, name, scheduled_date, status, supplier_id,
        suppliers ( name ),
        maintenance_route_stops ( id, status )
      `)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date");

    // Operador: limitar a sus proveedores
    if (operatorSupplierIds !== null) {
      if (operatorSupplierIds.length === 0) {
        setRoutes([]); setLoading(false); return; // sin proveedores → sin rutas
      }
      query = query.in("supplier_id", operatorSupplierIds);
    }
    // Filtro manual por proveedor individual
    if (filterSupplierId !== "all") {
      query = query.eq("supplier_id", filterSupplierId);
    }

    const { data } = await query;

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
  }, [currentMonth, operatorSupplierIds, filterSupplierId]);

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

  // Days that actually have routes (only these are selectable for export)
  const daysWithRoutes = new Set(routes.map((r) => r.scheduled_date));

  const toggleDay = (key: string) => {
    if (!daysWithRoutes.has(key)) return;
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectWeek = (weekStart: Date) => {
    const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })
      .map((d) => format(d, "yyyy-MM-dd"))
      .filter((k) => daysWithRoutes.has(k));
    setSelectedDays((prev) => {
      const next = new Set(prev);
      const allSelected = weekDays.every((k) => next.has(k));
      weekDays.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedDays.size === 0) return;
    setExporting(true);
    try {
      await exportRoutesPDF([...selectedDays]);
      toast.success("PDF generado");
      setExportMode(false);
      setSelectedDays(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <CalendarDays className="w-5 h-5 text-blue-500" />
        <h2 className="text-base font-semibold text-gray-800 capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </h2>

        {/* Filtro por proveedor (operador: solo los suyos; admin: todos) */}
        {supplierOptions.length > 0 && (
          <select
            value={filterSupplierId}
            onChange={(e) => setFilterSupplierId(e.target.value)}
            className="h-8 text-xs rounded-md border border-gray-200 px-2 bg-white focus:outline-none focus:border-blue-400 max-w-[180px]"
          >
            <option value="all">
              {isOperador ? "Todos mis proveedores" : "Todos los proveedores"}
            </option>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {!exportMode ? (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-3"
            onClick={() => setExportMode(true)}>
            <FileDown className="w-3.5 h-3.5" />
            Exportar PDF
          </Button>
        ) : (
          <div className="flex items-center gap-2 ml-3">
            <span className="text-xs text-blue-600 font-medium">
              {selectedDays.size > 0 ? `${selectedDays.size} día(s) seleccionado(s)` : "Selecciona días o semanas"}
            </span>
            <Button size="sm" className="h-8 text-xs gap-1.5" disabled={selectedDays.size === 0 || exporting}
              onClick={handleExport}>
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Generar ({selectedDays.size})
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"
              onClick={() => { setExportMode(false); setSelectedDays(new Set()); }}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          </div>
        )}

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
          const key       = format(day, "yyyy-MM-dd");
          const dayRoutes = routesByDay.get(key) ?? [];
          const inMonth   = isSameMonth(day, currentMonth);
          const today     = isToday(day);
          const hasRoutes = dayRoutes.length > 0;
          const isSelectedDay = selectedDays.has(key);
          const isMonday  = day.getDay() === 1;

          return (
            <div
              key={key}
              onClick={() => exportMode && toggleDay(key)}
              className={`relative min-h-[90px] rounded-lg p-1.5 border transition-colors
                ${inMonth ? "bg-white border-gray-100" : "bg-gray-50/60 border-transparent"}
                ${today && !isSelectedDay ? "ring-2 ring-blue-400 ring-offset-0" : ""}
                ${exportMode && hasRoutes ? "cursor-pointer hover:bg-blue-50/50" : ""}
                ${isSelectedDay ? "ring-2 ring-blue-600 bg-blue-50/60" : ""}
                ${exportMode && !hasRoutes ? "opacity-50" : ""}
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full
                  ${isSelectedDay ? "bg-blue-600 text-white" : today ? "bg-blue-500 text-white" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                  {format(day, "d")}
                </div>
                {/* Week-select button (only on Mondays, in export mode) */}
                {exportMode && isMonday && (
                  <button
                    onClick={(e) => { e.stopPropagation(); selectWeek(day); }}
                    className="text-[9px] px-1 py-0.5 rounded bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-700 font-medium transition-colors"
                    title="Seleccionar/deseleccionar semana"
                  >
                    semana
                  </button>
                )}
                {isSelectedDay && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
              </div>

              {dayRoutes.slice(0, 3).map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left mb-0.5 group"
                  onClick={(e) => { if (exportMode) return; e.stopPropagation(); setSelected(r); }}
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
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={exporting}
                    onClick={async () => {
                      setExporting(true);
                      try {
                        await exportRoutesPDF([selected.scheduled_date], `Ruta: ${selected.name}`);
                        toast.success("PDF generado");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Error al generar PDF");
                      } finally { setExporting(false); }
                    }}
                  >
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                    Exportar este día a PDF
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
