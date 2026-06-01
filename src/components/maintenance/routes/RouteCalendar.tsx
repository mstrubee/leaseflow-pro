import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, startOfWeek, endOfWeek,
  format, isSameMonth, isToday, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Clock, CheckCircle2, AlertCircle, Download, FileDown, X, Loader2, Trash2, RotateCcw, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { exportRoutesPDF } from "./exportRoutesPDF";
import { exportRoutesExcel } from "./exportRoutesExcel";
import { fetchRoutesForExport, type ExportRoute } from "./routesExportData";
import { RouteDetailMap } from "./RouteDetailMap";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CalendarRoute {
  id: string;
  name: string;
  scheduled_date: string;
  status: string;
  supplier_id: string | null;
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

// Paleta para colorear las rutas por proveedor en el calendario.
const SUPPLIER_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#be123c",
];
const supplierColorOf = (map: Map<string, string>, id: string | null) =>
  (id && map.get(id)) || "#9ca3af";

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
  // Cambiar de mes con la rueda del mouse/trackpad (desktop) o con swipe (móvil).
  const gridRef = useRef<HTMLDivElement>(null);
  const lastWheelRef = useRef(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const step = (forward: boolean) => {
      const now = Date.now();
      if (now - lastWheelRef.current < 250) return; // throttle: 1 mes por gesto
      lastWheelRef.current = now;
      setCurrentMonth((m) => (forward ? addMonths(m, 1) : subMonths(m, 1)));
    };

    // Desktop: rueda del mouse / trackpad
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 6) return;
      e.preventDefault();
      step(e.deltaY > 0);
    };

    // Móvil: swipe (vertical u horizontal). Arriba/izquierda = mes siguiente.
    let startX = 0, startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 45 && Math.abs(dy) < 45) return; // tap, no swipe
      const forward = Math.abs(dy) >= Math.abs(dx) ? dy < 0 : dx < 0;
      step(forward);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
  const [routes, setRoutes] = useState<CalendarRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CalendarRoute | null>(null);
  const [detailRoute, setDetailRoute] = useState<ExportRoute | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cargar las paradas (con coordenadas) de la ruta seleccionada
  useEffect(() => {
    if (!selected) { setDetailRoute(null); return; }
    setDetailLoading(true);
    fetchRoutesForExport([selected.scheduled_date])
      .then((rs) => setDetailRoute(rs.find((r) => r.id === selected.id) ?? null))
      .catch(() => setDetailRoute(null))
      .finally(() => setDetailLoading(false));
  }, [selected]);

  // Export-to-PDF mode
  const [exportMode, setExportMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Papelera de rutas
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; route: CalendarRoute } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashed, setTrashed] = useState<CalendarRoute[]>([]);

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

    if (operatorSupplierIds !== null && operatorSupplierIds.length === 0) {
      setRoutes([]); setLoading(false); return; // operador sin proveedores → sin rutas
    }

    const runQuery = (excludeDeleted: boolean) => {
      let q = supabase
        .from("maintenance_routes")
        .select(`
          id, name, scheduled_date, status, supplier_id,
          suppliers ( name ),
          maintenance_route_stops ( id, status )
        `)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_date");
      if (excludeDeleted) q = q.is("deleted_at", null);
      if (operatorSupplierIds !== null) q = q.in("supplier_id", operatorSupplierIds);
      if (filterSupplierId !== "all") q = q.eq("supplier_id", filterSupplierId);
      return q;
    };

    let { data, error } = await runQuery(true);
    if (error && /deleted_at|column|schema cache/i.test(error.message)) {
      ({ data, error } = await runQuery(false)); // columna aún no existe
    }

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
            supplier_id:      (r.supplier_id as string) ?? null,
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

  // Color estable por proveedor (orden alfabético → paleta).
  const supplierColor = useMemo(() => {
    const m = new Map<string, string>();
    [...supplierOptions]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s, i) => m.set(s.id, SUPPLIER_PALETTE[i % SUPPLIER_PALETTE.length]));
    return m;
  }, [supplierOptions]);

  // Proveedores presentes en el mes (para la leyenda).
  const suppliersInView = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of routes) if (r.supplier_id) seen.set(r.supplier_id, r.supplier_name ?? "—");
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [routes]);

  const routesByDay = new Map<string, CalendarRoute[]>();
  for (const r of routes) {
    const key = r.scheduled_date;
    if (!routesByDay.has(key)) routesByDay.set(key, []);
    routesByDay.get(key)!.push(r);
  }
  // Ordenar las rutas de cada día por proveedor (visual ordenado y consistente).
  for (const list of routesByDay.values()) {
    list.sort((a, b) => (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "") || a.name.localeCompare(b.name));
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

  const handleExport = async (formato: "pdf" | "excel") => {
    if (selectedDays.size === 0) return;
    setExporting(true);
    try {
      if (formato === "pdf") await exportRoutesPDF([...selectedDays]);
      else await exportRoutesExcel([...selectedDays]);
      toast.success(formato === "pdf" ? "PDF generado" : "Excel generado");
      setExportMode(false);
      setSelectedDays(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  };

  // ── Papelera ──────────────────────────────────────────────────────────────
  const softDeleteRoute = async (route: CalendarRoute) => {
    setCtxMenu(null);
    if (!window.confirm(`¿Eliminar la ruta "${route.name}"?\nIrá a la papelera (se conserva 1 semana).`)) return;
    // .select() confirma cuántas filas se marcaron realmente
    const { data, error } = await supabase.from("maintenance_routes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", route.id)
      .select("id");
    if (error) {
      // La papelera requiere la columna deleted_at. Si la migración no se aplicó,
      // ofrecer borrado definitivo (con confirmación clara) en vez de fallar.
      if (/deleted_at|column|schema cache/i.test(error.message)) {
        const ok = window.confirm(
          `La papelera no está disponible (falta aplicar una migración en la base de datos).\n\n` +
          `¿Eliminar la ruta "${route.name}" de forma DEFINITIVA? Esta acción no se puede deshacer.`,
        );
        if (!ok) return;
        const { error: delErr } = await supabase.from("maintenance_routes").delete().eq("id", route.id);
        if (delErr) { toast.error(delErr.message); return; }
        setRoutes((prev) => prev.filter((r) => r.id !== route.id));
        await loadRoutes();
        toast.success("Ruta eliminada definitivamente");
        return;
      }
      toast.error(error.message); return;
    }
    if (!data || data.length === 0) {
      toast.error("No se pudo eliminar (sin permisos o ruta no encontrada)");
      return;
    }
    setRoutes((prev) => prev.filter((r) => r.id !== route.id));
    await loadRoutes(); // refrescar desde la BD para reflejar el estado real
    toast.success("Ruta enviada a la papelera", {
      action: {
        label: "Deshacer",
        onClick: async () => {
          await supabase.from("maintenance_routes").update({ deleted_at: null }).eq("id", route.id);
          loadRoutes();
        },
      },
    });
  };

  const loadTrash = async () => {
    const { data } = await supabase.from("maintenance_routes")
      .select("id, name, scheduled_date, status, supplier_id, deleted_at, suppliers ( name ), maintenance_route_stops ( id, status )")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setTrashed((data ?? []).map((r: Record<string, unknown>) => {
      const stops = (r.maintenance_route_stops as { status: string }[]) ?? [];
      return {
        id: r.id as string, name: r.name as string, scheduled_date: r.scheduled_date as string,
        status: r.status as string, supplier_id: (r.supplier_id as string) ?? null,
        supplier_name: (r.suppliers as { name: string } | null)?.name ?? null,
        stop_count: stops.length, completed_stops: 0, postponed_stops: 0,
      };
    }));
  };

  const openTrash = async () => { await loadTrash(); setTrashOpen(true); };

  const restoreFromTrash = async (id: string) => {
    await supabase.from("maintenance_routes").update({ deleted_at: null }).eq("id", id);
    setTrashed((prev) => prev.filter((r) => r.id !== id));
    loadRoutes();
    toast.success("Ruta restaurada");
  };

  const purgeRoute = async (route: CalendarRoute) => {
    if (!window.confirm(`¿Eliminar DEFINITIVAMENTE la ruta "${route.name}"?\nEsta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("maintenance_routes").delete().eq("id", route.id);
    if (error) { toast.error(error.message); return; }
    setTrashed((prev) => prev.filter((r) => r.id !== route.id));
    toast.success("Ruta eliminada definitivamente");
  };

  return (
    <div className="flex flex-col gap-3 h-full" onClick={() => ctxMenu && setCtxMenu(null)}>
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
            Exportar
          </Button>
        ) : (
          <div className="flex items-center gap-2 ml-3">
            <span className="text-xs text-blue-600 font-medium">
              {selectedDays.size > 0 ? `${selectedDays.size} día(s)` : "Selecciona días o semanas"}
            </span>
            <Button size="sm" className="h-8 text-xs gap-1.5" disabled={selectedDays.size === 0 || exporting}
              onClick={() => handleExport("pdf")}>
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-green-300 text-green-700"
              disabled={selectedDays.size === 0 || exporting}
              onClick={() => handleExport("excel")}>
              <Download className="w-3.5 h-3.5" /> Excel
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"
              onClick={() => { setExportMode(false); setSelectedDays(new Set()); }}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
          </div>
        )}

        {!isOperador && !exportMode && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-gray-500" onClick={openTrash}>
            <Trash2 className="w-3.5 h-3.5" /> Papelera
          </Button>
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
      <div ref={gridRef} title="Rueda del mouse o desliza para cambiar de mes"
        className={`grid grid-cols-7 gap-px flex-1 overflow-auto overscroll-contain ${loading ? "opacity-50" : ""}`}>
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
                  onContextMenu={(e) => {
                    if (exportMode || isOperador) return;
                    e.preventDefault(); e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, route: r });
                  }}
                >
                  <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: supplierColorOf(supplierColor, r.supplier_id) }}
                    title={r.supplier_name ?? undefined}>
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

      {/* Legend: color por proveedor + íconos de estado */}
      <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500 flex-wrap">
        {suppliersInView.length > 0 ? (
          suppliersInView.map(([id, name]) => (
            <div key={id} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: supplierColorOf(supplierColor, id) }} />
              <span className="truncate max-w-[120px]">{name}</span>
            </div>
          ))
        ) : (
          <span className="italic text-gray-400">Sin rutas este mes</span>
        )}
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-gray-500" /> Completada</div>
        <div className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-gray-500" /> Pospuesta</div>
      </div>

      {/* Route detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
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

                {/* Mapa del recorrido */}
                {detailLoading ? (
                  <div className="h-56 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                    Cargando mapa…
                  </div>
                ) : detailRoute && detailRoute.stops.length > 0 ? (
                  <RouteDetailMap stops={detailRoute.stops} />
                ) : null}

                {/* Lista de paradas: orden, local, traslado, forms */}
                {detailRoute && detailRoute.stops.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-600">Recorrido</p>
                    {detailRoute.stops.map((s) => (
                      <div key={s.stop_order} className="rounded-lg border border-gray-100 p-2 text-xs">
                        {s.travel_min > 0 && (
                          <div className="text-[10px] text-gray-400 mb-1">🚗 {s.travel_min} min de traslado</div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {s.stop_order}
                          </span>
                          <span className="font-medium flex-1 truncate">{s.name}</span>
                          <span className="text-gray-400">{s.forms.length} form{s.forms.length !== 1 ? "s" : ""}</span>
                        </div>
                        {s.forms.length > 0 && (
                          <div className="mt-1 pl-7 space-y-0.5">
                            {s.forms.map((f, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                <span className="font-mono">{f.form_number}</span>
                                <span className="text-gray-300">·</span>
                                <span>{f.type}</span>
                                {f.criticality !== "—" && (
                                  <span className="px-1 rounded text-[9px] text-white"
                                    style={{ background: f.criticality_color ?? "#6b7280" }}>{f.criticality}</span>
                                )}
                                <span className="ml-auto text-gray-400">{f.minutes} min</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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

      {/* Menú contextual (click derecho en una ruta) */}
      {ctxMenu && (
        <div
          className="fixed z-[1000] bg-white rounded-lg shadow-xl border border-gray-200 py-1 text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 w-full text-left"
            onClick={() => softDeleteRoute(ctxMenu.route)}
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar ruta
          </button>
        </div>
      )}

      {/* Papelera */}
      <Sheet open={trashOpen} onOpenChange={setTrashOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <Trash2 className="w-4 h-4 text-gray-500" /> Papelera de rutas
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-gray-400 mt-2">Las rutas eliminadas se conservan 1 semana antes de borrarse definitivamente.</p>
          <div className="mt-4 space-y-2">
            {trashed.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">La papelera está vacía</p>
            ) : trashed.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 p-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-gray-400">{r.scheduled_date}{r.supplier_name ? ` · ${r.supplier_name}` : ""}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-blue-600"
                  onClick={() => restoreFromTrash(r.id)}>
                  <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                  onClick={() => purgeRoute(r)} title="Eliminar definitivamente">
                  <Trash className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
