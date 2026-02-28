

## Barra de alertas en Welcome + Drag & Drop de cards

### Resumen

Dos cambios principales en la pagina de bienvenida:

1. **Reemplazar la ventana flotante de alertas por una barra inferior fija** en la pagina Welcome, manteniendo la flotante en el resto de secciones
2. **Permitir reordenar las cards de modulos con drag and drop**, guardando el orden en las preferencias del usuario

---

### Cambio 1: Barra de alertas inferior en Welcome

**Problema actual:** `TodayAlertsFloating` se renderiza globalmente en `App.tsx` (linea 43), apareciendo en todas las paginas incluyendo Welcome.

**Solucion:**

- **`App.tsx`**: Condicionar `TodayAlertsFloating` para que NO se muestre cuando la ruta es `/` (Welcome page)
- **Nuevo componente `src/components/alerts/WelcomeAlertsBar.tsx`**: Barra fija en la parte inferior de la pantalla con:
  - Tres pestanas/tabs: "Hoy", "Semana", "Vencidas" con conteos
  - Al expandir, muestra las alertas en formato horizontal/lista compacta
  - Reutiliza la misma logica de carga de datos que `TodayAlertsFloating` (queries a tabla `alerts`)
  - Acciones rapidas: completar alerta, ir al contrato, ver todas las alertas
  - Diseño tipo barra/dock: fija al fondo, ancho completo, altura reducida, expandible al hacer clic
- **`Welcome.tsx`**: Importar y renderizar `WelcomeAlertsBar` dentro de la pagina

**Diseño de la barra:**
- Estado colapsado: barra delgada con iconos de campana + badges con conteos por categoria (Hoy X | Semana X | Vencidas X)
- Estado expandido: se expande hacia arriba mostrando la lista de alertas del tab seleccionado en formato horizontal con scroll
- Transicion suave con animacion

---

### Cambio 2: Drag and Drop en las cards del Welcome

**Tecnologia:** El proyecto ya tiene instalado `@dnd-kit/core`, `@dnd-kit/sortable` y `@dnd-kit/utilities`.

**Implementacion:**

- **`Welcome.tsx`**: 
  - Envolver el grid de modulos con `DndContext` y `SortableContext` de dnd-kit
  - Crear un componente `SortableModuleCard` que use `useSortable` para cada card
  - Agregar un icono de arrastre (grip) visible en cada card
  - Usar `useUserPreferences` con key `welcome_module_order` para persistir el orden personalizado del usuario
  - Al soltar una card en nueva posicion, guardar el nuevo array de IDs de modulos en preferencias
  - Al cargar, ordenar `visibleModules` segun el orden guardado, colocando modulos nuevos (sin posicion guardada) al final

---

### Archivos a crear
- `src/components/alerts/WelcomeAlertsBar.tsx` - Barra inferior de alertas para Welcome

### Archivos a modificar
- `src/App.tsx` - Condicionar TodayAlertsFloating para excluir ruta `/`
- `src/pages/Welcome.tsx` - Agregar WelcomeAlertsBar + drag and drop con dnd-kit + persistencia de orden con useUserPreferences

### Detalles tecnicos

**WelcomeAlertsBar:**
- Reutiliza las mismas queries de `TodayAlertsFloating` (alerts con joins a contracts, alert_categories, profiles)
- Suscripcion realtime al canal de cambios en tabla `alerts`
- Tres ViewModes: today, week, overdue
- Dialogo de confirmacion para completar alertas y crear seguimiento (mismo flujo que el flotante)

**Drag and Drop:**
- `DndContext` con `closestCenter` como estrategia de colision
- `SortableContext` con `verticalListSortingStrategy` (funciona bien en grids)
- `useSortable` hook en cada card para obtener listeners, attributes, transform, transition
- `arrayMove` de `@dnd-kit/sortable` para reordenar el array al hacer drop
- Preferencia guardada como array de strings (IDs de modulos): `["contracts", "patents", "opex", ...]`
- Card de Admin (si es admin) siempre se muestra al final, fuera del sortable

