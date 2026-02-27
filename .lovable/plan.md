

## Boton Flotante de Estado de Usuarios (solo Admin)

### Objetivo
Crear un boton flotante posicionado justo encima de la calculadora que solo sea visible para administradores. Al hacer clic, despliega un panel con la lista de usuarios mostrando nombre, estado de conexion y actividad en tiempo real.

### Logica de estados

| Condicion | Indicador | Texto |
|-----------|-----------|-------|
| `last_seen_at` > 5 min o null | Gris | Desconectado + "Visto: dd/MM/yyyy HH:mm" |
| `last_seen_at` < 5 min AND `activity_status` = `idle` | Amarillo | Detenido |
| `last_seen_at` < 5 min AND `activity_status` = `active` | Verde pulsante | Trabajando en [seccion] |

### Cambios

**1. Nuevo componente: `src/components/FloatingUserStatus.tsx`**

- Boton flotante con icono `Users` en `fixed bottom-[52px] left-4` (encima de la calculadora)
- Solo se renderiza si el usuario es admin (usa `useAuth`)
- Al hacer clic, despliega un panel con scroll mostrando todos los usuarios
- Consulta `profiles` al abrir y se suscribe a Realtime para actualizaciones automaticas
- Cada fila muestra:
  - Nombre (o email si no tiene nombre)
  - Indicador de color (verde pulsante / amarillo / gris)
  - Texto de estado: "Trabajando en [seccion]", "Detenido", o "Desconectado" con fecha/hora del ultimo acceso
- Usa `format` de `date-fns` para formatear la fecha de ultimo acceso

**2. Modificar `src/components/layout/MainLayout.tsx`**

- Importar y renderizar `FloatingUserStatus` junto a `FloatingCalculator`, en las mismas condiciones (fuera de home/auth)

### Archivos afectados
- **Nuevo**: `src/components/FloatingUserStatus.tsx`
- **Modificado**: `src/components/layout/MainLayout.tsx`

