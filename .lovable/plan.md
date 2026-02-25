
## Plan: Columna "Criticidad" en Mantenciones + Mejoras de visualizacion

### 1. Crear tabla `maintenance_criticality_categories` en la base de datos

Nueva tabla para que el Admin defina las categorias de criticidad:

```text
maintenance_criticality_categories
- id (uuid, PK)
- name (text, NOT NULL) -- ej: "Alta", "Media", "Baja"
- code (text, UNIQUE, NOT NULL)
- description (text, nullable)
- color (text, nullable) -- color hex para el badge, ej: "#ef4444"
- display_order (integer, default 0)
- is_active (boolean, default true)
- created_at / updated_at (timestamps)
```

Agregar columna `criticality_category_id` (uuid, nullable, FK) a la tabla `maintenance_forms`.

Politicas RLS: lectura para usuarios autenticados, escritura para admins.

### 2. Panel de Administracion - Gestor de Criticidades

Crear componente `MaintenanceCriticalityManager` similar al patron existente de `AlertCategoryManager`:
- CRUD de categorias (nombre, codigo, descripcion, color)
- Tabla con nombre, codigo, descripcion, color badge preview, acciones (editar/eliminar)
- Agregar como `CollapsibleCard` en `AdminPanel.tsx` despues de "Estados Comite GP"

### 3. Columna "Criticidad" en la tabla de Mantenciones

En `MaintenanceModule.tsx`:
- Cargar las categorias de criticidad desde la nueva tabla
- Agregar columna "Criticidad" en el header de la tabla (despues de "Sub Estado")
- Cada celda muestra un `Select` inline que permite al usuario elegir la criticidad
- Al cambiar, se actualiza `maintenance_forms.criticality_category_id` directamente
- Se muestra como Badge con el color definido por el admin

### 4. Ampliar el ancho del modulo en 25%

En `MaintenanceDashboard.tsx`:
- Cambiar `max-w-[1536px]` a `max-w-[1920px]` (1536 * 1.25 = 1920) en el header y main

### Detalle tecnico

**Archivos a crear:**
- `src/components/admin/MaintenanceCriticalityManager.tsx`

**Archivos a modificar:**
- `src/pages/MaintenanceDashboard.tsx` - ampliar max-width
- `src/components/maintenance/MaintenanceModule.tsx` - agregar columna criticidad con select inline
- `src/components/maintenance/types.ts` - agregar `criticality_category_id` al tipo
- `src/pages/AdminPanel.tsx` - agregar seccion de criticidades

**Migracion SQL:**
- Crear tabla `maintenance_criticality_categories`
- Agregar columna `criticality_category_id` a `maintenance_forms`
- RLS policies
