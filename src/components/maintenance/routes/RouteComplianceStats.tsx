import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart2, CheckCircle2, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StatRow {
  event_type: string;
  count: number;
  location_name?: string;
}

interface MonthStats {
  completed: number;
  postponed: number;
  total: number;
  pct: number;
  byLocation: { name: string; completed: number; postponed: number }[];
}

export function RouteComplianceStats() {
  const [period, setPeriod] = useState("0"); // months back (0 = current)
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const monthsBack = parseInt(period, 10);
    const ref  = subMonths(new Date(), monthsBack);
    const from = format(startOfMonth(ref), "yyyy-MM-dd'T'00:00:00'Z'");
    const to   = format(endOfMonth(ref),   "yyyy-MM-dd'T'23:59:59'Z'");

    setLoading(true);

    Promise.all([
      // Global event counts
      supabase
        .from("route_compliance_log")
        .select("event_type")
        .gte("performed_at", from)
        .lte("performed_at", to),

      // Events joined with stops → location name via route_stops → maintenance_locations
      supabase
        .from("route_compliance_log")
        .select(`
          event_type,
          maintenance_route_stops ( maintenance_locations ( name, local_name ) )
        `)
        .gte("performed_at", from)
        .lte("performed_at", to)
        .not("stop_id", "is", null),
    ]).then(([globalRes, locRes]) => {
      const events = globalRes.data ?? [];
      const completed = events.filter((e: { event_type: string }) => e.event_type === "completed").length;
      const postponed = events.filter((e: { event_type: string }) => e.event_type === "postponed").length;
      const total     = completed + postponed;
      const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

      // By location
      const locMap = new Map<string, { completed: number; postponed: number }>();
      for (const row of (locRes.data ?? []) as Record<string, unknown>[]) {
        const stop = row.maintenance_route_stops as Record<string, unknown> | null;
        const loc  = stop?.maintenance_locations as Record<string, unknown> | null;
        if (!loc) continue;
        const name = (loc.local_name as string) || (loc.name as string) || "Desconocido";
        if (!locMap.has(name)) locMap.set(name, { completed: 0, postponed: 0 });
        const entry = locMap.get(name)!;
        if ((row.event_type as string) === "completed") entry.completed++;
        if ((row.event_type as string) === "postponed") entry.postponed++;
      }

      const byLocation = Array.from(locMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.postponed - a.postponed);

      setStats({ completed, postponed, total, pct, byLocation });
      setLoading(false);
    });
  }, [period]);

  const periodLabel = (p: string) => {
    const n = parseInt(p, 10);
    if (n === 0) return format(new Date(), "MMMM yyyy", { locale: es });
    return format(subMonths(new Date(), n), "MMMM yyyy", { locale: es });
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <BarChart2 className="w-5 h-5 text-blue-500" />
        <h2 className="text-base font-semibold text-gray-800">Estadísticas de Cumplimiento</h2>
        <div className="ml-auto">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 text-xs w-40 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0,1,2,3,5].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs capitalize">
                  {periodLabel(String(n))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Cargando estadísticas…
        </div>
      )}

      {!loading && stats && (
        <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
              label="Cumplimiento"
              value={`${stats.pct}%`}
              color="blue"
            />
            <KpiCard
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
              label="Completadas"
              value={String(stats.completed)}
              color="green"
            />
            <KpiCard
              icon={<Clock className="w-5 h-5 text-amber-500" />}
              label="Pospuestas"
              value={String(stats.postponed)}
              color="amber"
            />
            <KpiCard
              icon={<BarChart2 className="w-5 h-5 text-gray-400" />}
              label="Total eventos"
              value={String(stats.total)}
              color="gray"
            />
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-xl border p-4 space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Tasa de cumplimiento</span>
              <span className={stats.pct >= 80 ? "text-green-600" : stats.pct >= 50 ? "text-amber-600" : "text-red-600"}>
                {stats.pct}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  stats.pct >= 80 ? "bg-green-500" : stats.pct >= 50 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" />Completadas</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />Pospuestas</span>
            </div>
          </div>

          {/* Top locations with most postponements */}
          {stats.byLocation.length > 0 && (
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Locales con más postergaciones
              </div>
              <div className="space-y-2">
                {stats.byLocation.slice(0, 8).map((loc) => {
                  const locTotal = loc.completed + loc.postponed;
                  const locPct   = locTotal > 0 ? Math.round((loc.completed / locTotal) * 100) : 0;
                  return (
                    <div key={loc.name} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-gray-700 truncate max-w-[60%]">{loc.name}</span>
                        <span className="text-gray-400">
                          {loc.completed}✓ {loc.postponed > 0 && <span className="text-amber-500">{loc.postponed}↷</span>}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${locPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.total === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
              <BarChart2 className="w-8 h-8" />
              <p className="text-sm">Sin datos de ejecución para este período</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  const bg: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100",
    green: "bg-green-50 border-green-100",
    amber: "bg-amber-50 border-amber-100",
    gray: "bg-gray-50 border-gray-100",
  };
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1 ${bg[color] ?? bg.gray}`}>
      {icon}
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
