

## Separar modulo de Patentes del Dashboard

### Resumen

Mover el modulo completo de Patentes fuera del Dashboard a su propia pagina dedicada (`/patents`), accesible desde la pagina de bienvenida. En el Dashboard, mantener solo unas tarjetas resumen (espejo) con los conteos principales, que al hacer clic naveguen a `/patents`.

### Cambios

#### 1. Crear `src/pages/PatentsDashboard.tsx`

Nueva pagina que renderiza el `PatentsModule` completo, con header y boton de retorno a Welcome.

#### 2. Modificar `src/App.tsx`

Cambiar la ruta `/patents` para que apunte a `PatentsDashboard` en lugar de `Index`.

#### 3. Modificar `src/pages/Welcome.tsx`

Agregar "Patentes" como modulo en la lista de tarjetas de navegacion (con icono `FileText`, ruta `/patents`). No requiere permiso especial por ahora (o usar el mismo recurso generico).

#### 4. Modificar `src/components/dashboard/DashboardStats.tsx`

- Eliminar el import y renderizado de `LazyPatentsModule`
- Reemplazarlo con tarjetas resumen (espejo) que muestren los conteos basicos de patentes (Total Locales, Definitivas, Provisorias, Sin Patente, Criticos, Pendientes, Vencidos)
- Cada tarjeta sera clickeable y navegara a `/patents`
- Los datos para las tarjetas se obtendran con una consulta ligera directa (conteos simples desde la tabla `contracts` filtrando por `patente_status`)
- Se usara `usePatents().getCriticalStats()` de forma lazy o una consulta RPC liviana

#### 5. Detalle de las tarjetas espejo en Dashboard

Las tarjetas mostraran:
- Total Locales, Definitivas, Provisorias, Sin Patente (conteos por `patente_status`)
- Criticos, Docs Pendientes, Vencidos (usando `getCriticalStats` del hook existente)
- Al hacer clic en cualquier tarjeta, navega a `/patents`

### Archivos a crear
- `src/pages/PatentsDashboard.tsx`

### Archivos a modificar
- `src/App.tsx` - actualizar ruta `/patents`
- `src/pages/Welcome.tsx` - agregar tarjeta de Patentes
- `src/components/dashboard/DashboardStats.tsx` - reemplazar modulo completo por tarjetas resumen interactivas

