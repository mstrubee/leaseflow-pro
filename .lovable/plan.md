

## Columna "Actividad" con umbrales personalizables por usuario

### Resumen
Agregar una columna "Actividad" a la tabla de usuarios en el Admin Panel con indicadores de color (Verde, Amarillo, Rojo) basados en umbrales de tiempo configurables por usuario. El admin podra definir para cada usuario cuantos minutos de inactividad disparan cada estado.

### 1. Nueva tabla en base de datos: `user_activity_thresholds`

Almacena los umbrales personalizados por usuario:

```text
user_activity_thresholds
+------------------+------+-------------------------------------------+
| user_id (uuid)   | FK   | references profiles(id) ON DELETE CASCADE |
| idle_minutes     | int  | default 5  -- umbral para Amarillo        |
| inactive_minutes | int  | default 15 -- umbral para Rojo            |
+------------------+------+-------------------------------------------+
PRIMARY KEY: user_id (one row per user)
```

- RLS: solo admins pueden leer/escribir (usando `has_role`)
- Si un usuario no tiene fila, se usan los defaults (5 y 15 minutos)

### 2. Logica de colores en la columna "Actividad"

Para cada usuario, se calcula el tiempo desde `last_seen_at`:

```text
| Condicion                                          | Color    | Texto                              |
|----------------------------------------------------|----------|-------------------------------------|
| last_seen_at < N min AND activity_status = active   | Verde    | Trabajando en [seccion]            |
| last_seen_at < Y min AND (idle OR active > N min)   | Amarillo | Detenido hace X min                |
| last_seen_at >= Y min OR null                       | Rojo     | Inactivo - Visto: dd/MM/yyyy HH:mm |
```

Donde N = `idle_minutes` del usuario y Y = `inactive_minutes` del usuario.

### 3. Configuracion por usuario en el Admin Panel

En la fila de cada usuario, dentro de la columna "Actividad", agregar un pequeno boton de configuracion (icono engranaje) que abre un popover con dos campos:

- **Minutos para "Detenido" (Amarillo)**: input numerico, default 5
- **Minutos para "Inactivo" (Rojo)**: input numerico, default 15

Al guardar, se hace upsert en `user_activity_thresholds`.

### 4. Cambios en la columna "Estado" existente

La columna "Estado" actual se renombra visualmente a "Actividad" y se reemplaza la logica de colores:

- **Verde** (pulsante): `last_seen_at` dentro de N minutos Y `activity_status = active`
- **Amarillo**: `last_seen_at` dentro de Y minutos pero fuera de N minutos, o `activity_status = idle` dentro de N minutos
- **Rojo**: `last_seen_at` fuera de Y minutos o null

### Archivos afectados

- **Migracion SQL**: Crear tabla `user_activity_thresholds` con RLS
- **`src/pages/AdminPanel.tsx`**:
  - Cargar umbrales desde `user_activity_thresholds` en `loadData`
  - Reemplazar logica de la columna "Estado" con la nueva logica de 3 colores
  - Renombrar encabezado de "Estado" a "Actividad"
  - Agregar popover con icono de configuracion para editar umbrales por usuario
  - Agregar estado local para manejar edicion de umbrales
- **`src/components/FloatingUserStatus.tsx`**: Actualizar logica de colores para usar los mismos umbrales (cargandolos desde la tabla), alineando el boton flotante con la tabla del admin

