

## Crear pagina de bienvenida personalizada

### Descripcion

Reemplazar la carga directa del Dashboard por una pagina de bienvenida que:
- Saluda al usuario por su nombre (desde la tabla `profiles`)
- Muestra "Buenos dias" o "Buenas tardes" segun la hora local
- Presenta botones de acceso directo solo a los modulos que el usuario tiene permiso de ver
- Incluye un boton para continuar al Dashboard completo

### Cambios

#### 1. Crear `src/pages/Welcome.tsx`

Nueva pagina con:
- Consulta a `profiles` para obtener `full_name` del usuario autenticado
- Saludo dinamico basado en `new Date().getHours()` (antes de 12: "Buenos dias", 12-19: "Buenas tardes", 20+: "Buenas noches")
- Grid de tarjetas/botones para cada modulo disponible, filtrados por `hasPermission`:
  - Contratos (`contracts`)
  - Ordenes de Compra (`purchase_orders`)
  - OPEX (`opex`)
  - CAPEX (`purchase_orders`)
  - Alertas (`alerts`)
  - Informes (`reports`)
  - KPI (`kpi`)
  - Proveedores (`suppliers`)
  - Mantenciones (`maintenance`)
  - Admin (solo si `isAdmin`)
- Cada tarjeta tendra icono, nombre del modulo y descripcion breve
- Boton "Ir al Dashboard" que navega a `/dashboard`

#### 2. Crear ruta `/dashboard` para el Dashboard actual

Mover el Dashboard actual a la ruta `/dashboard` y hacer que `/` muestre la pagina de bienvenida.

- **`src/App.tsx`**: Agregar ruta `/dashboard` con `Dashboard` y cambiar `/` para usar `Welcome`
- **`src/pages/Index.tsx`**: Cambiar para renderizar `Welcome` en vez de `Dashboard`

#### 3. Ajustar `MainLayout.tsx`

Agregar `/dashboard` a la lista de paginas donde no se muestra el boton Home (o mantenerlo para volver a Welcome).

### Detalles tecnicos

**Archivos a crear:**
- `src/pages/Welcome.tsx`

**Archivos a modificar:**
- `src/App.tsx` - agregar ruta `/dashboard`
- `src/pages/Index.tsx` - renderizar Welcome
- `src/components/layout/MainLayout.tsx` - ajustar logica del boton Home

**Datos del usuario:**
Se obtiene `full_name` de la tabla `profiles` usando el `user.id` de la sesion actual. Si no tiene nombre, se usa el email como fallback.

**Modulos disponibles:**
Se reutiliza `hasPermission` del hook `useAuth` existente para filtrar que botones mostrar.

