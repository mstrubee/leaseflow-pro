import { useMemo } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { parseISO, differenceInCalendarDays, startOfWeek, addDays, isAfter, format } from "date-fns";
import { es } from "date-fns/locale";

export interface CurvaSPoint {
  weekStart: Date;
  weekLabel: string; // "15-may"
  scheduledProgress: number; // % acumulado 0-100
  // null en semanas futuras: no se puede predecir avance real, así que la
  // línea roja simplemente no se dibuja ahí.
  actualProgress: number | null;
}

export interface CurvaSData {
  points: CurvaSPoint[];
  isEmpty: boolean;
  todayScheduled: number;
  todayActual: number;
}

/**
 * Calcula los datos de la Curva S (avance programado vs. avance real,
 * acumulado por semana) para un cronograma completo o para una rama
 * específica (tarea padre + sus hojas descendientes).
 *
 * Solo se consideran tareas HOJA (sin hijas) — las tareas madre no tienen
 * peso propio, su avance ya está representado por sus hojas. Las tareas
 * descartadas (discarded_at) se excluyen siempre.
 *
 * Peso de cada hoja = su duración de PLAN ORIGINAL / la suma de duraciones
 * de todas las hojas en el alcance elegido — un peso fijo que no cambia si
 * la tarea se reprograma después.
 *
 * Línea "Programado" (azul): usa baseline_start_date/baseline_end_date — el
 * plan original, fijado una sola vez cuando la tarea nació y nunca tocado
 * después (ni por Reprog., ni por arrastre de barra, ni por cascada de
 * dependencias). Por eso esta línea es completamente estable en el tiempo.
 *
 * Línea "Real" (naranja): usa start_date/end_date — las fechas VIGENTES hoy,
 * que sí cambian con cada reprogramación. Mientras nadie reprograma nada,
 * coincide exactamente con la línea azul; en cuanto se reprograma una tarea
 * (días + o -), esta línea se despega de la azul en esa misma medida.
 * De hoy en adelante no se dibuja (no se puede predecir avance futuro).
 */
export function useCurvaSData(
  tasks: GanttTask[],
  filterByParentTaskId: string | null,
  today: Date = new Date(),
): CurvaSData {
  return useMemo(() => {
    const active = tasks.filter((t) => !t.discarded_at);

    // Mapa parent_id -> hijas, para saber quién es hoja y para recolectar
    // las hojas descendientes de una tarea padre elegida en el filtro.
    const childrenOf = new Map<string, GanttTask[]>();
    active.forEach((t) => {
      if (t.parent_id) {
        const arr = childrenOf.get(t.parent_id) || [];
        arr.push(t);
        childrenOf.set(t.parent_id, arr);
      }
    });
    const isLeaf = (id: string) => !(childrenOf.get(id)?.length);

    let scopeIds: Set<string> | null = null;
    if (filterByParentTaskId) {
      const collectLeaves = (id: string): string[] => {
        const kids = childrenOf.get(id) || [];
        return kids.flatMap((k) => (isLeaf(k.id) ? [k.id] : collectLeaves(k.id)));
      };
      scopeIds = new Set(collectLeaves(filterByParentTaskId));
    }

    const leaves = active.filter(
      (t) => isLeaf(t.id) && (!scopeIds || scopeIds.has(t.id)) && t.start_date && t.end_date,
    );

    if (leaves.length === 0) {
      return { points: [], isEmpty: true, todayScheduled: 0, todayActual: 0 };
    }

    // Fechas de baseline con respaldo: si por alguna razón una tarea no tiene
    // baseline guardado (no debería pasar — se fija al crear o al recibir su
    // primera fecha), se usan sus fechas actuales como plan de facto.
    const baselineStart = (t: GanttTask) => t.baseline_start_date || t.start_date!;
    const baselineEnd = (t: GanttTask) => t.baseline_end_date || t.end_date!;

    const durationOf = (t: GanttTask) => {
      const days = differenceInCalendarDays(parseISO(baselineEnd(t)), parseISO(baselineStart(t))) + 1;
      return Math.max(1, days);
    };

    const totalDuration = leaves.reduce((sum, t) => sum + durationOf(t), 0) || 1;
    const weightOf = (t: GanttTask) => durationOf(t) / totalDuration;

    // El rango del gráfico cubre TANTO el plan original como las fechas
    // actuales, para que se vea completo aunque una tarea se haya
    // reprogramado fuera del rango original.
    let minStart = baselineStart(leaves[0]);
    let maxEnd = baselineEnd(leaves[0]);
    leaves.forEach((t) => {
      const bs = baselineStart(t), be = baselineEnd(t);
      if (bs < minStart) minStart = bs;
      if (be > maxEnd) maxEnd = be;
      if (t.start_date! < minStart) minStart = t.start_date!;
      if (t.end_date! > maxEnd) maxEnd = t.end_date!;
    });

    const rangeStart = startOfWeek(parseISO(minStart), { weekStartsOn: 1 });
    const rangeEnd = parseISO(maxEnd);
    const loopEnd = isAfter(rangeEnd, today) ? rangeEnd : today;

    // % de avance lineal (inicio→término) de una tarea a una fecha de corte dada.
    const pctAt = (start: string, end: string, asOf: Date) => {
      const s = parseISO(start);
      const e = parseISO(end);
      if (asOf < s) return 0;
      if (asOf >= e) return 100;
      const dur = Math.max(1, differenceInCalendarDays(e, s) + 1);
      const elapsed = differenceInCalendarDays(asOf, s) + 1;
      return Math.min(100, Math.max(0, (elapsed / dur) * 100));
    };

    const weightedScheduledAt = (asOf: Date) =>
      leaves.reduce((sum, t) => sum + pctAt(baselineStart(t), baselineEnd(t), asOf) * weightOf(t), 0);

    const weightedActualAt = (asOf: Date) =>
      leaves.reduce((sum, t) => sum + pctAt(t.start_date!, t.end_date!, asOf) * weightOf(t), 0);

    const todayScheduled = weightedScheduledAt(today);
    const todayActual = weightedActualAt(today);

    const points: CurvaSPoint[] = [];
    let weekStart = rangeStart;
    let guard = 0;
    while (!isAfter(weekStart, loopEnd) && guard < 600) {
      const scheduled = weightedScheduledAt(weekStart);
      const actual = isAfter(weekStart, today) ? null : weightedActualAt(weekStart);

      points.push({
        weekStart,
        weekLabel: format(weekStart, "dd-MMM", { locale: es }),
        scheduledProgress: Math.round(scheduled * 10) / 10,
        actualProgress: actual === null ? null : Math.round(actual * 10) / 10,
      });

      weekStart = addDays(weekStart, 7);
      guard++;
    }

    return { points, isEmpty: false, todayScheduled, todayActual };
  }, [tasks, filterByParentTaskId, today]);
}
