# Estabilidad del sistema ante errores transitorios

## Diagnóstico

Los logs del servidor (Postgres, Edge Functions, Auth) están limpios — no hay errores 4xx/5xx ni fallos de RLS. Sin embargo, la consola del navegador muestra ráfagas de `TypeError: Load failed` en peticiones no relacionadas (logos, alertas, indicadores económicos, campos personalizados). Ese mensaje en Safari indica que la petición HTTP fue abortada antes de obtener respuesta (corte de red, cambio de red, throttling del navegador, o pestaña en background).

El síntoma reportado ("no se pudo cargar contrato" al hacer click) ocurre en `ContractDetail.tsx → loadContract`: ante cualquier error muestra toast y ejecuta `navigate("/")`, expulsando al usuario. Sin reintentos. La query además trae 7 relaciones anidadas, lo que la hace más sensible.

## Cambios propuestos

### 1. `src/pages/ContractDetail.tsx` — carga resiliente del contrato
- Agregar reintento automático con backoff (2 intentos, 600ms y 1500ms) ante errores de red (`TypeError`, `Failed to fetch`, `Load failed`).
- En caso de fallo definitivo: **no navegar fuera**. Mostrar estado de error inline con botón "Reintentar" y "Volver".
- Distinguir entre "contrato no existe" (usar `.maybeSingle()`) y "error de red" — solo el primero debe redirigir.

### 2. Helper compartido `src/lib/supabaseRetry.ts` (nuevo)
- Función `withRetry(fn, { attempts, delays })` que reintenta solo ante errores de red transitorios (no ante errores SQL/RLS reales).
- Reutilizable por hooks críticos.

### 3. Hooks con fallos visibles en consola — envolver en `withRetry`
- `src/hooks/useAppLogos.ts` — carga de logos
- `src/hooks/useEconomicIndicators.ts` — invocación de edge function `economic-indicators`
- `src/components/alerts/AlertsList.tsx` (y similares) — carga de alertas
- Carga de custom fields en `ContractDetail.tsx`

Los fallos transitorios se silencian (no toast), solo se loguean. Los fallos persistentes mantienen el comportamiento actual.

### 4. `loadContract` — query más liviana
Separar la query monolítica en 2 llamadas paralelas:
- Contrato + companies + addresses + contacts + documents + termination_notices
- Versions con sus relaciones (rent_escalations, notice_ranges, version_notices)

Esto reduce el tamaño del payload por request y la probabilidad de timeout, manteniendo la misma latencia (paralelo).

## Detalles técnicos

```ts
// supabaseRetry.ts
const isTransient = (e: any) =>
  e?.name === "TypeError" ||
  /load failed|failed to fetch|networkerror/i.test(e?.message ?? "");

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delays = [0, 600, 1500]): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
    try { return await fn(); }
    catch (e) { last = e; if (!isTransient(e)) throw e; }
  }
  throw last;
}
```

```tsx
// ContractDetail estado de error
if (loadError) {
  return (
    <div className="...">
      <p>No se pudo cargar el contrato.</p>
      <Button onClick={retry}>Reintentar</Button>
      <Button variant="outline" onClick={() => navigate("/")}>Volver</Button>
    </div>
  );
}
```

## Fuera de alcance
- No se tocan edge functions (`recent-logins`, `force-logout-all`) — ya están estabilizadas en el turno anterior.
- No se modifica el esquema de DB ni RLS.
- No se cambia UI/diseño general.
