/**
 * Reintenta una operación asíncrona solo ante errores de red transitorios
 * (TypeError: Load failed / Failed to fetch / NetworkError), típicos de
 * Safari cuando se pierde temporalmente la conexión o se reanuda una pestaña.
 *
 * Errores de aplicación (SQL, RLS, validación, 4xx/5xx con cuerpo JSON)
 * no se reintentan: se propagan en el primer intento.
 */
export function isTransientNetworkError(e: any): boolean {
  if (!e) return false;
  const name = e.name ?? e?.constructor?.name ?? "";
  const msg = String(e.message ?? e ?? "");
  if (name === "TypeError") return true;
  return /load failed|failed to fetch|network ?error|networkerror|fetch failed|aborted/i.test(msg);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; delays?: number[] } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delays = options.delays ?? [0, 600, 1500];
  let last: any;
  for (let i = 0; i < attempts; i++) {
    const wait = delays[i] ?? 0;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransientNetworkError(e)) throw e;
    }
  }
  throw last;
}
