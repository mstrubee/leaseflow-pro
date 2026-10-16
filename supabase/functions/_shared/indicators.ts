// Lógica pura (sin APIs de Deno ni de Supabase) de la lectura de indicadores
// económicos desde la caché `economic_indicators_cache` -- separada de
// economic-indicators/index.ts para poder probarla fuera de Deno.

export interface CacheRow {
  value: number;
  date: string; // YYYY-MM-DD
  last_updated?: string | null;
  is_stale?: boolean | null;
}

export interface DatedValue {
  date: string;
  value: number;
}

const SANTIAGO_TZ = "America/Santiago";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha de hoy (YYYY-MM-DD) en hora de Chile -- la UF cambia por día calendario chileno. */
export function todayInSantiago(now: Date = new Date()): string {
  // "en-CA" formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: SANTIAGO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Resta `days` a una fecha YYYY-MM-DD. */
export function subtractDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - days * DAY_MS).toISOString().split("T")[0];
}

/**
 * UF vigente hoy y últimos 10 valores hasta hoy. mindicador.cl publica la UF
 * por adelantado (hasta el día 9 del mes siguiente), así que la caché puede
 * traer fechas FUTURAS: "la más reciente" no es la de hoy. Se usa el último
 * valor con fecha <= hoy. `rows` puede venir en cualquier orden.
 */
export function selectUF(rows: CacheRow[], today: string): { current: number; last10: DatedValue[]; latestDate: string | null; lastUpdated: string | null; isStale: boolean } {
  const upToToday = rows.filter((r) => r.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const newest = upToToday[0];
  return {
    current: newest?.value || 0,
    last10: upToToday
      .slice(0, 10)
      .map((r) => ({ date: r.date, value: r.value }))
      .reverse(),
    latestDate: newest?.date ?? null,
    lastUpdated: newest?.last_updated ?? null,
    isStale: !!newest?.is_stale,
  };
}

/** Dólar vigente: último valor con fecha <= hoy (el dólar no se publica fines de semana ni feriados). */
export function selectUSD(rows: CacheRow[], today: string): { series: DatedValue[]; current: number; isStale: boolean } {
  const upToToday = rows.filter((r) => r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const newest = upToToday[upToToday.length - 1];
  return {
    series: upToToday.map((r) => ({ date: r.date, value: r.value })),
    current: newest?.value || 0,
    isStale: !!newest?.is_stale,
  };
}

/**
 * ¿Hay que pedir datos frescos a mindicador.cl? UF: si la caché no tiene el
 * valor de HOY. Dólar: si no hay datos o el último tiene más de 7 días
 * (cubre fines de semana largos y feriados).
 */
export function staleness(ufRows: CacheRow[], usdRows: CacheRow[], today: string): { uf: boolean; usd: boolean } {
  const ufLatest = selectUF(ufRows, today).latestDate;
  const usdDates = usdRows.filter((r) => r.date <= today).map((r) => r.date).sort();
  const usdLatest = usdDates.length > 0 ? usdDates[usdDates.length - 1] : null;
  return {
    uf: ufLatest !== today,
    usd: usdLatest === null || usdLatest < subtractDays(today, 7),
  };
}

/** Evita reintentar contra mindicador en cada request cuando está caído. */
export function canAttemptRefresh(lastAttemptAtMs: number, nowMs: number, minIntervalMs: number): boolean {
  return nowMs - lastAttemptAtMs >= minIntervalMs;
}
