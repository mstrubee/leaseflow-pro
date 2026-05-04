
## Diagnóstico

El delay del botón **"Ir al proyecto"** desde Informes → Gantt no viene del click en sí, sino de tres factores acumulados al cargar `ContractDetail.tsx`:

1. **Code-splitting sin prefetch**: `ContractDetail` se carga con `lazy()`. La primera vez que se entra, el navegador descarga el chunk **después** del click. Mientras tanto se ve el spinner.
2. **Pantalla en blanco con spinner**: la página espera a que terminen `loadContract()`, `loadCustomFields()`, permisos y rol **antes** de pintar nada (`if (loading || !roleLoaded || permissionsLoading) return spinner`). El usuario percibe ~1–3 s de "nada".
3. **Query monolítica**: `loadContract()` trae el contrato + 7 relaciones anidadas en una sola consulta. La sección Gantt no necesita la mayoría.

El mismo patrón se repite en otros clickeables del sistema: botones que disparan `navigate()` a una ruta `lazy` sin pre-carga, y páginas que bloquean el render hasta resolver todas las queries.

## Cambios propuestos

### 1. Prefetch del chunk en hover/mousedown (impacto alto, riesgo bajo)
Pre-cargar el bundle de la ruta destino antes del click final.

- Crear `src/lib/routePrefetch.ts` con un mapa `{ ruta → () => import("./...") }` y un helper `prefetchRoute(name)` idempotente.
- En `ReportsReturnButton.tsx::navigateToContractFromReports`: exponer también `prefetchContractDetail()` y llamarlo en `onMouseEnter` / `onFocus` del botón "Ir al proyecto".
- Aplicar el mismo patrón a los botones de navegación más usados:
  - Cards de contratos en `Contracts.tsx` → `ContractDetail`
  - Tarjetas en `Dashboard.tsx`, `ReportsDashboard.tsx`, `AlertsDashboard.tsx` → sus destinos.
  - Botones "Ver" / "Editar" / enlaces internos en listados (Maintenance, Patents, Suppliers, Opex, Capex).

Resultado: cuando el usuario haga click, el chunk ya estará en cache → navegación casi instantánea.

### 2. Render progresivo en `ContractDetail.tsx` (impacto alto)
Quitar el bloqueo total de render mientras cargan datos.

- Pintar inmediatamente el header (título, "Volver", badge de estado) usando solo `id` y un placeholder de nombre.
- Mover el spinner únicamente al área del contenido.
- `loadContract()` y `loadCustomFields()` ya van en paralelo por estar en el mismo `useEffect`, pero hoy se ejecutan secuencialmente porque `loadCustomFields` también espera al `await` interno. Refactor: lanzarlos con `Promise.all([loadContract(), loadCustomFields()])` y usar `setLoading(false)` en cuanto el **contrato** está listo (los custom fields se renderizan cuando lleguen, sin bloquear).
- Los permisos (`useUserPermissions`) y rol (`useAuth`) hoy bloquean la pantalla; cambiar a:
  - Pintar la página completa.
  - Ocultar/deshabilitar acciones específicas mientras `permissionsLoading` esté en true (granular), en vez de bloquear toda la vista.

### 3. Cache + dedupe de fetches con React Query (impacto alto, ya hay infra)
El proyecto ya usa `@tanstack/react-query` en otros lugares.

- Migrar `loadContract` a un `useQuery(['contract', id], ...)` con `staleTime: 60_000`. Así, volver al mismo contrato es instantáneo.
- Igual con `loadCustomFields` (clave global, `staleTime: 5 min`).
- Esto también permite **prefetchQuery** desde la lista de contratos al hacer hover, similar al punto 1, pero a nivel de datos.

### 4. Selector de relaciones por sección (opcional, segunda iteración)
La query actual trae todas las relaciones aunque el usuario solo entre a la sección "gantt". Plantear `select` reducido + lazy-fetch de secciones pesadas. Lo dejamos como mejora futura para no inflar este cambio.

### 5. Auditoría de clickeables lentos del sistema
Pasada general aplicando el mismo patrón:

- Verificar que **todos** los botones de acción muestren feedback inmediato (estado `loading`/`disabled`) y no esperen a que termine la mutación para responder visualmente.
- Revisar handlers que ejecutan trabajo pesado sincrónico en el click (filtros, export, render de tablas grandes) y diferir con `requestIdleCallback` o `setTimeout(…, 0)` cuando aplique.
- Quitar `e.stopPropagation()` innecesarios (no causan delay, pero a veces ocultan otros bugs de re-render).

Concretamente revisaré:
- `GanttReportsSection` (botón actual + "PDF General" + toggles).
- `Contracts.tsx` (click en fila).
- `Dashboard.tsx` y mapas (click en región/comuna).
- `MaintenanceModule`, `PatentsList`, `SuppliersList`, `OpexDashboard`, `CapexDashboard` (acciones por fila).
- `ReportsDashboard` (cards de informes).

## Detalles técnicos

```text
flujo actual click → ver contrato:
 click ──▶ navigate() ──▶ Suspense fallback (descarga chunk ~300-800ms)
                          ──▶ ContractDetail mount
                              ──▶ loadContract  ┐
                              ──▶ loadCustomFields ├─ await todos
                              ──▶ permisos + rol  ┘
                                  └─▶ render real (~1-3s)

flujo objetivo:
 hover ──▶ prefetch chunk + prefetchQuery(contract)
 click ──▶ navigate() ──▶ ContractDetail mount instantáneo
                          ├─▶ header pintado al toque
                          └─▶ contenido aparece apenas llega contrato
                              (custom fields/permisos rellenan in-place)
```

Archivos a tocar:
- `src/lib/routePrefetch.ts` (nuevo)
- `src/components/reports/ReportsReturnButton.tsx`
- `src/components/gantt/GanttReportsSection.tsx`
- `src/pages/ContractDetail.tsx`
- `src/pages/Contracts.tsx`, `src/pages/Dashboard.tsx`, `src/pages/ReportsDashboard.tsx`, `src/pages/AlertsDashboard.tsx`
- Listados: `MaintenanceModule.tsx`, `PatentsList.tsx`, `SuppliersList.tsx`, `OpexDashboard.tsx`, `CapexDashboard.tsx`

Sin migraciones de DB. Sin cambios de esquema. Compatible con el flujo "Volver a Informes" existente.

## Resultado esperado

- Click "Ir al proyecto" desde Informes: respuesta visual inmediata, contenido pintado en < 300 ms en navegaciones repetidas (cache) y < 800 ms en la primera.
- Mejora generalizada de percepción de velocidad en cards/listas.
