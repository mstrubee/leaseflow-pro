import { useMemo } from "react";
import { GanttTask } from "@/hooks/useGantt";
import { parseISO, differenceInCalendarDays, startOfWeek, addDays, isAfter, format } from "date-fns";
import { es } from "date-fns/locale";

export interface CurvaSPoint {
  weekStart: Date;
  weekLabel: string; // "15-may"
  scheduledProgress: number; // % acumulado 0-100
  // null en semanas futuras: no se puede predecir avance real, así que la
  // línea roja simplemente no se dibuja ahí (a diferencia de antes, que la
  // congelaba en el valor de hoy hacia adelante).
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
 * Solo se consideran tareas HOJA (sin hijas) con fecha de inicio y término —
 * las tareas madre no tienen peso propio, su avance ya está representado
 * por sus hojas. Las tareas descartadas (discarded_at) se excluyen siempre.
 *
 * Peso de cada hoja = su duración / la suma de duraciones de todas las
 * hojas en el alcance elegido (proyecto completo o una rama).
 *
 * Línea "Programado" (azul): para cada semana, el % de cada tarea que
 * "debería" estar completo según sus fechas (inicio→término lineal),
 * ponderado y sumado.
 *
 * Línea "Real" (naranja): en LeaseFlow-Pro no existe un historial de
 * "cuánto había avanzado cada tarea la semana pasada" — el campo
 * `progress` es solo una fotografía de HOY. Por eso la línea real para
 * semanas pasadas se dibuja con la MISMA forma que la línea programada,
 * pero reescalada para que coincida exactamente con el % real medido hoy
 * (decisión confirmada explícitamente: no inventamos historial que no
 * existe, pero tampoco mostramos una línea "escalonada" poco legible).
 * De hoy en adelante, la línea real se congela en el valor de hoy (no
 * podemos predecir avance futuro).
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

    const durationOf = (t: GanttTask) => {
      if (t.duration_days && t.duration_days > 0) return t.duration_days;
      const days = differenceInCalendarDays(parseISO(t.end_date!), parseISO(t.start_date!)) + 1;
      return Math.max(1, days);
    };

    const totalDuration = leaves.reduce((sum, t) => sum + durationOf(t), 0) || 1;
    const weightOf = (t: GanttTask) => durationOf(t) / totalDuration;

    let minStart = leaves[0].start_date!;
    let maxEnd = leaves[0].end_date!;
    leaves.forEach((t) => {
      if (t.start_date! < minStart) minStart = t.start_date!;
      if (t.end_date! > maxEnd) maxEnd = t.end_date!;
    });

    const rangeStart = startOfWeek(parseISO(minStart), { weekStartsOn: 1 });
    const rangeEnd = parseISO(maxEnd);
    const loopEnd = isAfter(rangeEnd, today) ? rangeEnd : today;

    // % programado de una tarea "a la fecha" asOf (avance lineal inicio→término).
    const scheduledPctAt = (t: GanttTask, asOf: Date) => {
      const s = parseISO(t.start_date!);
      const e = parseISO(t.end_date!);
      if (asOf < s) return 0;
      if (asOf >= e) return 100;
      const dur = durationOf(t);
      const elapsed = differenceInCalendarDays(asOf, s) + 1;
      return Math.min(100, Math.max(0, (elapsed / dur) * 100));
    };

    // % real de una tarea — única fotografía disponible (hoy).
    const actualPctSnapshot = (t: GanttTask) => {
      if (t.status === "completed" || (t.progress ?? 0) >= 100) return 100;
      return Math.min(100, Math.max(0, t.progress ?? 0));
    };

    const weightedScheduledAt = (asOf: Date) =>
      leaves.reduce((sum, t) => sum + scheduledPctAt(t, asOf) * weightOf(t), 0);

    const todayActual = leaves.reduce((sum, t) => sum + actualPctSnapshot(t) * weightOf(t), 0);
    const todayScheduled = weightedScheduledAt(today);

    // Si nada debería haber empezado aún (todayScheduled=0) no se puede
    // reescalar por proporción (división por cero) — se usa una rampa lineal
    // simple de 0 a todayActual entre el inicio del rango y hoy.
    const scaleFactor = todayScheduled > 0 ? todayActual / todayScheduled : null;
    const daysRangeStartToToday = Math.max(1, differenceInCalendarDays(today, rangeStart));

    const points: CurvaSPoint[] = [];
    let weekStart = rangeStart;
    let guard = 0;
    while (!isAfter(weekStart, loopEnd) && guard < 600) {
      const scheduled = weightedScheduledAt(weekStart);
      let actual: number | null;
      if (isAfter(weekStart, today)) {
        actual = null; // futuro: la línea real no se dibuja más allá de hoy
      } else if (scaleFactor !== null) {
        actual = Math.min(100, scheduled * scaleFactor);
      } else {
        const elapsed = Math.max(0, differenceInCalendarDays(weekStart, rangeStart));
        actual = todayActual * Math.min(1, elapsed / daysRangeStartToToday);
      }

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
