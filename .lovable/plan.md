

## Card de filtro "Resuelto con Observaciones" y columna "Comentarios / Observaciones"

### 1. Nueva Card de estadisticas: "Resuelto con Observaciones"

Agregar una quinta Card en la grilla de estadisticas (cambiar de `grid-cols-4` a `grid-cols-5`):
- Titulo: "Con Observaciones"
- Icono: `MessageSquare` (lucide)
- Color: azul (`text-blue-600`)
- Cuenta: forms con `sub_status === "resuelto"` y `resolution_observations` no vacio
- Click: agrega un nuevo filtro `observationsFilter` (boolean) al `FilterState` que filtra solo forms resueltos con observaciones
- Click de nuevo: desactiva el filtro
- Borde activo con `ring-2 ring-blue-500`

Cambios en `FilterState`:
- Agregar `observationsFilter: boolean` (default `false`)
- En el `filtered` useMemo, si `observationsFilter === true`, filtrar solo forms donde `sub_status === "resuelto"` y `resolution_observations?.trim()` no este vacio

### 2. Columna "Comentarios / Observaciones"

Renombrar el `TableHead` de "Comentarios" a "Comentarios / Observaciones".

Modificar el componente `InlineCommentsCell`:
- En el popover de lectura (cuando no esta editando), si el form tiene `resolution_observations` con contenido (y `sub_status === "resuelto"`), mostrar una seccion adicional debajo de los comentarios:
  - Separador visual
  - Titulo "Observaciones - Control de Gestion" en texto muted
  - Texto de las observaciones (solo lectura, sin boton editar para esta seccion)
- El trigger del popover (la celda clickeable) debe mostrar un indicador visual cuando hay observaciones: por ejemplo un pequeno icono o texto truncado que combine ambos

### Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/components/maintenance/MaintenanceModule.tsx` | Agregar Card, filtro, renombrar columna, modificar InlineCommentsCell |

### Detalles tecnicos

**FilterState**:
```text
observationsFilter: boolean  // nuevo campo, default false
```

**Conteo**:
```text
const withObservationsCount = forms.filter(f => 
  f.sub_status === "resuelto" && f.resolution_observations?.trim()
).length;
```

**Filtro en `filtered` useMemo**:
```text
if (observationsFilter && !(f.sub_status === "resuelto" && f.resolution_observations?.trim())) return false;
```

**InlineCommentsCell popover (modo lectura)**:
- Mostrar comentarios como antes
- Si `form.resolution_observations?.trim()` y `form.sub_status === "resuelto"`:
  - Separador
  - Label "Observaciones - Control de Gestion" (muted, bold)
  - Texto de observaciones (solo lectura)
- Boton "Editar" solo aplica a comentarios, no a observaciones

