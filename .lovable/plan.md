

## Corrección de acceso a Órdenes de Compra para usuarios no-admin

### Problema identificado
Las políticas de seguridad (RLS) en las tablas `purchase_orders`, `invoices` y `credit_notes` verifican el permiso con recurso **`'budget'`**, pero a los usuarios se les asigna el permiso **`'purchase_orders'`**. Como no coinciden, los usuarios no-admin no pueden ver ninguna OC ni las facturas/notas de crédito asociadas.

Las solicitudes de OC (`oc_requests`) sí funcionan parcialmente porque su política SELECT permite acceso a todos los autenticados (`qual: true`).

### Solución
Actualizar las políticas RLS de las 3 tablas para que acepten **tanto** `'budget'` como `'purchase_orders'` como recurso válido. Esto mantiene compatibilidad con permisos existentes.

### Cambios en base de datos (migración SQL)

**Tabla `purchase_orders`** - 3 políticas a actualizar:
- SELECT: agregar `OR has_permission(uid, 'purchase_orders', 'view/edit/all')`
- INSERT: agregar `OR has_permission(uid, 'purchase_orders', 'edit/all')`
- UPDATE: agregar `OR has_permission(uid, 'purchase_orders', 'edit/all')`
- DELETE: agregar `OR has_permission(uid, 'purchase_orders', 'edit/all')`

**Tabla `invoices`** - mismas 4 políticas a actualizar con las mismas condiciones.

**Tabla `credit_notes`** - mismas 4 políticas a actualizar con las mismas condiciones.

### Detalle técnico

Se ejecutará un `DROP POLICY` + `CREATE POLICY` para cada política afectada, agregando condiciones como:

```text
-- Ejemplo para SELECT en purchase_orders (actual):
USING (has_permission(uid, 'budget', 'view') OR ... 'edit' OR ... 'all')

-- Corregido:
USING (
  has_permission(uid, 'budget', 'view') OR ... 'edit' OR ... 'all'
  OR has_permission(uid, 'purchase_orders', 'view') OR ... 'edit' OR ... 'all'
)
```

### Archivos modificados
- Solo migración SQL (sin cambios en código frontend)

