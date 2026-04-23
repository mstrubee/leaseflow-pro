
## Plan: corregir selección errática de líneas en presupuesto

### Objetivo
Hacer que la selección de líneas para mover sea inmediata, estable y predecible: un clic selecciona, otro deselecciona, sin dobles toggles ni activaciones accidentales.

### Causa probable detectada
La implementación actual mezcla dos mecanismos de selección al mismo tiempo:
1. La fila completa selecciona en `onMouseDown`
2. El `Checkbox` también cambia estado con `onCheckedChange`

Eso puede producir:
- doble toggle en un mismo clic
- selección que “entra y sale”
- activaciones por botones internos de la fila
- comportamiento inconsistente por usar `Checkbox` de Radix (su root no es un `input` nativo)

## Cambios a implementar

### 1) Unificar la fuente de verdad del toggle
En `src/components/budget/BudgetLineTree.tsx`:
- eliminar la lógica de selección basada en `onMouseDown` sobre toda la fila
- usar un único handler de selección por interacción
- preferir una de estas dos rutas consistentes:
  - selección solo desde la fila con `onClick`, y checkbox visual read-only
  - o selección desde fila + checkbox, pero ambos llamando al mismo handler y evitando cualquier segundo toggle

La opción más robusta aquí es:
- fila con `onClick`
- checkbox controlado visualmente
- sin `onCheckedChange` independiente que vuelva a invertir el estado

### 2) Endurecer el bloqueo de eventos internos
En la misma fila del árbol:
- excluir explícitamente elementos interactivos del click de selección:
  - `button`
  - `input`
  - `textarea`
  - `select`
  - `[role="button"]`
  - `[role="checkbox"]`
  - `[role="combobox"]`
  - links y elementos marcados con `data-no-select`
- agregar `stopPropagation` también en botones/controles que hoy solo frenan `onClick`, pero no el evento previo que dispara la selección
- asegurar que expandir/colapsar, editar nombre, cambiar proveedor, cambiar estado, abrir OC/Factura, etc. no alteren la selección

### 3) Reemplazar el checkbox problemático si sigue interfiriendo
Si la estabilidad no queda garantizada con el ajuste anterior:
- reemplazar el `Checkbox` de UI en modo selección por un `input type="checkbox"` nativo controlado
- mantener el estilo visual actual para no cambiar la apariencia
- usar `readOnly` + `pointer-events-none` si la fila será la única que togglee

Esto reduce fricción con eventos sintéticos y evita el comportamiento errático del componente actual en una fila altamente interactiva.

### 4) Mejorar la actualización visual para árboles grandes
En `src/components/budget/BudgetLineTree.tsx` y `src/components/budget/BudgetModule.tsx`:
- mantener la memoización, pero asegurar que cada ítem re-renderice solo si cambia:
  - `selectionMode`
  - su propio estado seleccionado
  - su propio estado expandido
- revisar que no se creen callbacks o props innecesariamente inestables durante la selección
- evitar cualquier lógica adicional de fila que fuerce renders pesados al marcar una sola línea

## Validación esperada
Después del cambio:
- al entrar en “Seleccionar líneas”, los checkboxes aparecen de inmediato
- clic en la fila: selecciona una vez
- clic en el checkbox: selecciona una vez
- clic en expandir, editar, proveedor, badges o acciones: no selecciona accidentalmente
- selección/deselección rápida de múltiples líneas funciona sin lag visible

## Archivos a tocar
- `src/components/budget/BudgetLineTree.tsx`
- `src/components/budget/BudgetModule.tsx`
- opcionalmente `src/components/ui/checkbox.tsx` solo si se decide aislar o reemplazar el comportamiento del checkbox en este flujo

## Detalle técnico
Flujo recomendado:

```text
Click usuario
  -> si el target es interactivo: no seleccionar
  -> si no es interactivo: toggleSelection(line.id)
  -> checkbox refleja estado, pero no dispara un segundo toggle
```

Eso elimina la carrera actual entre:
```text
row onMouseDown
+ checkbox onCheckedChange
+ botones internos con propagación parcial
```
