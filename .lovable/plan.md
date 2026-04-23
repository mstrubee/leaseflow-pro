

## Plan: hacer visible la selección de líneas

### Problema
La selección funciona internamente (las líneas se mueven correctamente), pero no hay retroalimentación visual: el checkbox no se ve marcado y la fila no cambia de estilo al seleccionarse.

### Causa probable
1. El `<input type="checkbox">` nativo con `accent-primary` y `pointer-events-none` puede no estar pintando el "check" visible sobre el fondo de la fila, o su tamaño es demasiado pequeño para notarse.
2. Las clases `ring-2 ring-primary bg-primary/10` aplicadas a la fila se pierden visualmente porque conviven con clases `bg-muted/XX` de nivel y el `ring` queda dentro de un contenedor con `space-y-1` sin margen suficiente, además de no destacar lo bastante sobre el fondo.
3. El `React.memo` del ítem solo re-renderiza la línea clickeada; eso es correcto, pero si la comparación de `selectedIds` falla por algún motivo de identidad de Set, la fila no se actualiza visualmente. Conviene reforzar para asegurarlo.

### Cambios

**`src/components/budget/BudgetLineTree.tsx`**

1. Reemplazar el `<input type="checkbox">` nativo por un indicador visual propio totalmente controlado:
   - cuadrado con borde marcado
   - fondo `primary` y un ícono `Check` cuando `isSelected`
   - tamaño claramente visible (`h-5 w-5`)
   - `pointer-events-none` para que solo el click de fila controle el toggle
2. Reforzar el resaltado de la fila seleccionada:
   - fondo más sólido tipo `bg-primary/15`
   - borde lateral acentuado tipo `border-l-4 border-primary`
   - texto en `font-medium`
   - mantener `ring` opcional pero usar el borde para destacarse incluso encima de los `bg-muted/XX`
3. Asegurar precedencia de estilos:
   - poner las clases de selección al final del `cn(...)` para que ganen
   - usar utilidades concretas (no `bg-primary/10` que se pierde sobre `bg-muted/60`)
4. Confirmar que la comparación del memo siga forzando re-render cuando cambia el estado seleccionado de la línea actual (ya está, se mantiene).
5. Añadir un pequeño contador “(N seleccionadas)” en la cabecera del árbol cuando `selectionMode` esté activo, para confirmación adicional al usuario (opcional, en `BudgetModule.tsx` junto a los botones de selección si conviene).

**`src/components/budget/BudgetModule.tsx`**

- Mostrar al lado de los botones “Mover” / “Cancelar” un contador “N línea(s) seleccionada(s)” basado en `selectedLineIds.size`, para que el usuario tenga feedback inmediato incluso si no mira la fila.

### Validación esperada
- Al activar “Seleccionar líneas” aparece un cuadrado vacío en cada fila.
- Al hacer click en una fila:
  - el cuadrado se llena con color primario y muestra el check
  - la fila gana borde izquierdo de color, fondo destacado y texto en negrita
  - el contador en la cabecera sube
- Volver a hacer click revierte el estilo.
- El comportamiento de mover líneas no cambia: sigue funcionando como hoy.

### Archivos a editar
- `src/components/budget/BudgetLineTree.tsx`
- `src/components/budget/BudgetModule.tsx`

