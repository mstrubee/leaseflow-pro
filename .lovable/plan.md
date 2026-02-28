

## Reorganizar modulo de Patentes y logo interactivo

### Cambios

#### 1. Restaurar cards de patentes en el Dashboard (`DashboardStats.tsx`)

Reemplazar la card simple actual (lineas 538-558) por cards espejo que muestren los mismos conteos que el modulo de patentes (Total Locales, Definitivas, Provisorias, Sin Patente, Criticos, Docs Pendientes, Vencidos). Se usara el hook `usePatents` con `getCriticalStats()` para obtener los datos. Cada card sera clickeable y navegara a `/patents`.

Las cards se mostraran en un grid de 7 columnas, identico al que ya existe en `PatentsModule.tsx` (lineas 133-233), pero al hacer clic navegaran a `/patents` en vez de filtrar localmente.

#### 2. Logo interactivo en Dashboard (`Dashboard.tsx`)

Convertir la imagen del logo en el header del Dashboard (linea 42) en un elemento clickeable que navega a `/` (Welcome page). Se agregara `cursor-pointer` y un `onClick={() => navigate("/")}`.

#### 3. Patentes en Welcome page

Ya esta implementado: la card de Patentes ya aparece en `Welcome.tsx` (linea 53). No requiere cambios.

### Archivos a modificar

- **`src/components/dashboard/DashboardStats.tsx`**: Importar `usePatents`, reemplazar la card simple de patentes por las 7 cards espejo interactivas con conteos reales
- **`src/pages/Dashboard.tsx`**: Hacer el logo clickeable para volver al Welcome page

### Detalle tecnico

**DashboardStats.tsx - Cards espejo:**
- Importar `usePatents` desde `@/hooks/usePatents`
- Llamar a `getCriticalStats()` para obtener `criticalContracts`, `pendingCount`, `overdueCount`
- Usar `contracts` del hook para contar por `patente_status` (definitiva, provisoria, sin_patente)
- Cada card navega a `/patents` al hacer clic
- Las cards mantienen el mismo estilo visual (colores, iconos) que las del `PatentsModule`

**Dashboard.tsx - Logo interactivo:**
- Agregar `onClick={() => navigate("/")}` y `className="cursor-pointer"` al `<img>` del logo
