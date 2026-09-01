import { useMemo } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface TimelineProject {
  contractId: string;
  contractName: string;
  companyNames: string[];
  endDate: string;
  capexUF: number;
}

interface GanttOverviewTimelineProps {
  projects: TimelineProject[];
  onSelect: (contractId: string) => void;
}

/**
 * Línea de tiempo horizontal con las fechas de término de cada proyecto con
 * carta Gantt cargada. Ventana móvil de 12 meses: desde el 1° del mes
 * anterior al actual hasta el mismo día 11 meses después — se recalcula solo
 * con la fecha de hoy, no depende de filtros de la lista de abajo.
 */
export function GanttOverviewTimeline({ projects, onSelect }: GanttOverviewTimelineProps) {
  const today = startOfDay(new Date());

  const { rangeStart, rangeEnd, months, totalDays, todayPct } = useMemo(() => {
    const start = startOfMonth(addMonths(today, -1));
    const end = endOfMonth(addMonths(start, 11));
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const months = eachMonthOfInterval({ start, end }).map((m) => {
      const monthStart = m < start ? start : startOfMonth(m);
      const monthEnd = endOfMonth(m) > end ? end : endOfMonth(m);
      const days = differenceInCalendarDays(monthEnd, monthStart) + 1;
      return { date: m, widthPct: (days / totalDays) * 100 };
    });
    const todayPct = (differenceInCalendarDays(today, start) / totalDays) * 100;
    return { rangeStart: start, rangeEnd: end, months, totalDays, todayPct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { inRange, before, after } = useMemo(() => {
    const inRange: TimelineProject[] = [];
    let before = 0;
    let after = 0;
    for (const p of projects) {
      if (!p.endDate) continue;
      const d = parseISO(p.endDate);
      if (d < rangeStart) before++;
      else if (d > rangeEnd) after++;
      else inRange.push(p);
    }
    inRange.sort((a, b) => a.endDate.localeCompare(b.endDate));
    return { inRange, before, after };
  }, [projects, rangeStart, rangeEnd]);

  const projectsByMonthKey = useMemo(() => {
    const map = new Map<string, TimelineProject[]>();
    for (const p of inRange) {
      const key = format(parseISO(p.endDate), "yyyy-MM");
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [inRange]);

  if (inRange.length === 0 && before === 0 && after === 0) return null;

  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <CalendarRange className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            Línea de tiempo general — términos {format(rangeStart, "MMM yyyy", { locale: es })} a{" "}
            {format(rangeEnd, "MMM yyyy", { locale: es })}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {inRange.length} proyecto{inRange.length !== 1 ? "s" : ""} en el rango
          </span>
        </div>

        <div className="relative">
          {/* Encabezado de meses */}
          <div className="flex rounded-t-md overflow-hidden border border-b-0">
            {months.map(({ date, widthPct }) => {
              const isCurrent = isSameMonth(date, today);
              return (
                <div
                  key={date.toISOString()}
                  style={{ width: `${widthPct}%` }}
                  className={cn(
                    "text-center text-[11px] font-medium py-1.5 border-r last:border-r-0 capitalize truncate px-1",
                    isCurrent ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
                  )}
                  title={format(date, "MMMM yyyy", { locale: es })}
                >
                  {format(date, "MMM", { locale: es })}
                </div>
              );
            })}
          </div>

          {/* Carriles con las fechas de término */}
          <div className="flex border rounded-b-md relative min-h-[104px] bg-background">
            {months.map(({ date, widthPct }) => {
              const key = format(date, "yyyy-MM");
              const items = (projectsByMonthKey.get(key) ?? []).slice().sort(
                (a, b) => a.endDate.localeCompare(b.endDate)
              );
              const isCurrent = isSameMonth(date, today);
              return (
                <div
                  key={key}
                  style={{ width: `${widthPct}%` }}
                  className={cn(
                    "border-r last:border-r-0 px-1 py-1.5 flex flex-col gap-1",
                    isCurrent && "bg-primary/[0.03]"
                  )}
                >
                  {items.map((p) => {
                    const d = parseISO(p.endDate);
                    const overdue = d < today;
                    return (
                      <button
                        key={p.contractId}
                        type="button"
                        onClick={() => onSelect(p.contractId)}
                        title={`${p.contractName} — término ${format(d, "dd/MM/yyyy")}${
                          p.companyNames.length ? ` · ${p.companyNames.join(", ")}` : ""
                        }`}
                        className={cn(
                          "text-left text-[10px] leading-tight rounded border px-1.5 py-1 truncate transition-shadow hover:shadow-sm hover:border-primary/50",
                          overdue
                            ? "bg-red-50 border-red-200 text-red-700"
                            : "bg-blue-50 border-blue-200 text-blue-700"
                        )}
                      >
                        <div className="font-semibold">{format(d, "dd MMM", { locale: es })}</div>
                        <div className="truncate">{p.contractName}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Línea de hoy */}
            {todayPct >= 0 && todayPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
                style={{ left: `${todayPct}%` }}
              >
                <div className="absolute -top-4 -translate-x-1/2 text-[9px] font-semibold text-red-500 bg-background px-1 rounded whitespace-nowrap">
                  Hoy
                </div>
              </div>
            )}
          </div>
        </div>

        {(before > 0 || after > 0) && (
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {before > 0 && <>{before} proyecto{before !== 1 ? "s" : ""} con término anterior al rango. </>}
            {after > 0 && <>{after} proyecto{after !== 1 ? "s" : ""} con término posterior a {format(rangeEnd, "MMM yyyy", { locale: es })}.</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
