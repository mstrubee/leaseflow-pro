import { addDays, isWeekend, format, parseISO, differenceInDays, addMonths, startOfMonth } from "date-fns";

export interface Holiday {
  date: string;
  name: string;
}

/**
 * Check if a date is a holiday
 */
export function isHoliday(date: Date, holidays: Holiday[]): boolean {
  const dateStr = format(date, "yyyy-MM-dd");
  return holidays.some(h => h.date === dateStr);
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date, holidays: Holiday[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Add business days to a date (skipping weekends and holidays)
 */
export function addBusinessDays(
  startDate: Date,
  days: number,
  holidays: Holiday[]
): Date {
  let result = new Date(startDate);
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;

  while (remaining > 0) {
    result = addDays(result, direction);
    if (isBusinessDay(result, holidays)) {
      remaining--;
    }
  }

  return result;
}

/**
 * Calculate end date based on start date and duration
 */
export function calculateEndDate(
  startDate: Date | string,
  durationDays: number,
  durationType: "calendar" | "business",
  holidays: Holiday[]
): Date {
  const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
  // Plazo 0 = la línea no consume tiempo: término = inicio (mismo día).
  // Sin este resguardo, durationDays-1 quedaría negativo y movería la
  // fecha hacia atrás en vez de dejarla fija.
  const offset = durationDays > 0 ? durationDays - 1 : 0;

  if (durationType === "business") {
    return addBusinessDays(start, offset, holidays);
  } else {
    return addDays(start, offset);
  }
}

/**
 * Calculate start date based on end date and duration
 */
export function calculateStartDate(
  endDate: Date | string,
  durationDays: number,
  durationType: "calendar" | "business",
  holidays: Holiday[]
): Date {
  const end = typeof endDate === "string" ? parseISO(endDate) : endDate;
  // Plazo 0 = la línea no consume tiempo: inicio = término (mismo día).
  const offset = durationDays > 0 ? durationDays - 1 : 0;

  if (durationType === "business") {
    return addBusinessDays(end, -offset, holidays);
  } else {
    return addDays(end, -offset);
  }
}

/**
 * Calculate duration in days between two dates
 */
export function calculateDuration(
  startDate: Date | string,
  endDate: Date | string,
  durationType: "calendar" | "business",
  holidays: Holiday[]
): number {
  const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
  const end = typeof endDate === "string" ? parseISO(endDate) : endDate;
  
  if (durationType === "business") {
    let count = 0;
    let current = new Date(start);
    while (current <= end) {
      if (isBusinessDay(current, holidays)) {
        count++;
      }
      current = addDays(current, 1);
    }
    return count;
  } else {
    return differenceInDays(end, start) + 1;
  }
}

/**
 * Apply lag to a date (after dependency ends)
 */
export function applyLag(
  date: Date | string,
  lagDays: number,
  lagType: "calendar" | "business",
  holidays: Holiday[]
): Date {
  const baseDate = typeof date === "string" ? parseISO(date) : date;
  
  if (lagDays === 0) {
    return addDays(baseDate, 1); // Start next day
  }
  
  if (lagType === "business") {
    return addBusinessDays(addDays(baseDate, 1), lagDays, holidays);
  } else {
    return addDays(baseDate, lagDays + 1);
  }
}

/**
 * Enésimo día hábil de un mes, contando desde el día 1 (n=1 -> primer día hábil).
 */
export function nthBusinessDayOfMonth(monthStart: Date, n: number, holidays: Holiday[]): Date {
  let d = startOfMonth(monthStart);
  let count = 0;
  // Tope defensivo: un mes nunca tiene más de ~31 días hábiles, así que 60
  // iteraciones alcanzan de sobra incluso con un n absurdamente alto.
  for (let i = 0; i < 60; i++) {
    if (isBusinessDay(d, holidays)) {
      count++;
      if (count >= n) return d;
    }
    d = addDays(d, 1);
  }
  return d;
}

/**
 * Regla de "traslado al mes siguiente" para dependencias de Gantt: si la
 * predecesora termina después del día `thresholdDay` de su mes, la
 * dependiente pasa al día hábil `landingBusinessDay` del mes SIGUIENTE al
 * de término. Si no se supera el umbral, retorna null (no aplica -- se usa
 * el cálculo normal de lag).
 */
export function applyCarryOverRule(
  predecessorEndDate: Date,
  thresholdDay: number,
  landingBusinessDay: number,
  holidays: Holiday[]
): Date | null {
  if (predecessorEndDate.getDate() <= thresholdDay) return null;
  const nextMonthStart = startOfMonth(addMonths(predecessorEndDate, 1));
  return nthBusinessDayOfMonth(nextMonthStart, landingBusinessDay, holidays);
}

export interface EffectiveDatesTask {
  id: string;
  parent_id: string | null;
  start_date: string | null;
  end_date: string | null;
}

/**
 * Calcula las fechas EFECTIVAS de cada tarea: una hoja usa sus propias fechas;
 * una tarea madre refleja el mínimo inicio y máximo término de sus
 * descendientes (recursivo). Misma lógica que usa el Gantt editable
 * (getEffectiveDates en GanttChart.tsx) y los reportes (GanttReportsSection),
 * centralizada acá para que cualquier vista que necesite fechas de un
 * cronograma (ej. /capex) use exactamente el mismo cálculo.
 */
export function computeEffectiveDatesMap(
  tasks: EffectiveDatesTask[]
): Map<string, { start: string | null; end: string | null }> {
  const childrenByParent = new Map<string, EffectiveDatesTask[]>();
  tasks.forEach((t) => {
    if (t.parent_id) {
      const arr = childrenByParent.get(t.parent_id) || [];
      arr.push(t);
      childrenByParent.set(t.parent_id, arr);
    }
  });
  const memo = new Map<string, { start: string | null; end: string | null }>();
  const compute = (task: EffectiveDatesTask): { start: string | null; end: string | null } => {
    const cached = memo.get(task.id);
    if (cached) return cached;
    const kids = childrenByParent.get(task.id) || [];
    if (kids.length === 0) {
      const r = { start: task.start_date, end: task.end_date };
      memo.set(task.id, r);
      return r;
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const c of kids) {
      const { start, end } = compute(c);
      if (start && (!minStart || start < minStart)) minStart = start;
      if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
    }
    const r = { start: minStart, end: maxEnd };
    memo.set(task.id, r);
    return r;
  };
  tasks.forEach((t) => compute(t));
  return memo;
}

/**
 * Get date range for Gantt chart display
 */
export function getGanttDateRange(
  tasks: Array<{ start_date: string | null; end_date: string | null }>
): { minDate: Date; maxDate: Date } {
  const dates: Date[] = [];
  
  tasks.forEach(task => {
    if (task.start_date) dates.push(parseISO(task.start_date));
    if (task.end_date) dates.push(parseISO(task.end_date));
  });

  if (dates.length === 0) {
    const today = new Date();
    return {
      minDate: addDays(today, -7),
      maxDate: addDays(today, 90),
    };
  }

  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

  return {
    minDate: addDays(minDate, -7),
    maxDate: addDays(maxDate, 14),
  };
}

/**
 * Get status color based on task status and dates
 */
export function getTaskStatusColor(
  status: string,
  endDate: string | null
): string {
  if (status === "completed") return "bg-green-500";
  if (status === "delayed") return "bg-red-500";
  if (status === "in_progress") {
    if (endDate && parseISO(endDate) < new Date()) {
      return "bg-red-500"; // Overdue
    }
    return "bg-blue-500";
  }
  // pending
  if (endDate && parseISO(endDate) < new Date()) {
    return "bg-red-500"; // Overdue
  }
  return "bg-gray-400";
}

/**
 * Format date for display
 */
export function formatGanttDate(date: string | Date | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd/MM/yyyy");
}
