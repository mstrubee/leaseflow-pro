
# Reconfiguración del Sistema de Permisos por Módulo

## Problema Actual
Los recursos de permisos definidos en el panel de administración solo cubren 4 módulos principales (Contratos, Dashboard, Repositorio, Proveedores), pero la aplicación tiene 7 módulos de navegación adicionales que no están controlados por permisos:
- Mantenciones
- Órdenes de Compra
- OPEX
- Alertas
- Informes
- KPI
- Proveedores (ya existe pero no se aplica en la navegación)

Los usuarios no-admin actualmente ven todos los botones de navegación y pueden acceder a todas las rutas sin restricción.

## Solución

### 1. Ampliar los recursos de permisos
Agregar los siguientes recursos al sistema de permisos en `AdminPanel.tsx`:

| ID del Recurso | Etiqueta | Descripción |
|---|---|---|
| `maintenance` | Mantenciones | Módulo de mantenciones |
| `purchase_orders` | Órdenes de Compra | Módulo de órdenes de compra |
| `opex` | OPEX | Módulo presupuesto operacional |
| `alerts` | Alertas | Dashboard de alertas |
| `reports` | Informes | Dashboard de informes |
| `kpi` | KPI | Módulo de indicadores |

(Proveedores ya existe como `suppliers`)

### 2. Filtrar navegación en Dashboard según permisos
En `src/pages/Dashboard.tsx`:
- Importar `useAuth` (ya importado) y usar `hasPermission` para cada botón
- Cada botón de navegación solo se mostrará si el usuario tiene permiso `view` o `edit` para ese recurso
- Admin sigue viendo todo

### 3. Proteger rutas individuales
En `src/components/auth/ProtectedRoute.tsx`:
- Agregar prop opcional `resource` para validar permiso de acceso
- Si el usuario no tiene permiso para el recurso, redirigir al Dashboard (/) en lugar de mostrar el módulo

Actualizar `src/App.tsx` para pasar el recurso correspondiente a cada `ProtectedRoute`:

```text
/maintenance      -> resource="maintenance"
/purchase-orders  -> resource="purchase_orders"
/opex             -> resource="opex"
/alerts           -> resource="alerts"
/reports          -> resource="reports"
/kpi              -> resource="kpi"
/suppliers        -> resource="suppliers"
/contracts        -> resource="contracts"
```

### 4. Actualizar el hook useAuth
El `hasPermission` actual ya funciona correctamente: si el usuario es admin retorna `true`, si no, busca el permiso específico. No requiere cambios.

Sin embargo, hay un detalle importante: actualmente si un usuario no tiene *ningún* permiso asignado para un recurso, `hasPermission` retorna `false`. Esto es el comportamiento correcto -- los usuarios solo ven los módulos que explícitamente se les asignan.

### 5. Actualizar la lista MAIN_RESOURCES en AdminPanel
Agregar los 6 nuevos recursos a `MAIN_RESOURCES` para que aparezcan en el formulario de creación/edición de usuarios.

### 6. Actualizar permisos del usuario existente (Beatriz)
Una vez implementado, será necesario editar los permisos de los usuarios existentes desde el panel de admin para asignarles acceso a los módulos que correspondan.

---

## Detalles Técnicos

### Archivos a modificar:

1. **`src/pages/AdminPanel.tsx`** -- Agregar los 6 nuevos recursos a `MAIN_RESOURCES`

2. **`src/pages/Dashboard.tsx`** -- Envolver cada botón de navegación con verificación de `hasPermission(resource, "view")`

3. **`src/components/auth/ProtectedRoute.tsx`** -- Agregar prop `resource?: string` y validar acceso con `hasPermission`

4. **`src/App.tsx`** -- Pasar prop `resource` a las rutas protegidas que correspondan

### Flujo resultante:

```text
Usuario no-admin inicia sesion
  -> Dashboard muestra SOLO los botones de modulos permitidos
  -> Si intenta acceder por URL directa a un modulo sin permiso -> redirige a /
  -> Admin ve todo sin restriccion
```

### Sin cambios necesarios en:
- Base de datos (la tabla `user_permissions` ya soporta cualquier string como `resource`)
- Edge functions (ya validan admin correctamente)
- `useAuth.tsx` (la logica de `hasPermission` ya es correcta)
