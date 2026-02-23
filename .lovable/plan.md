

## Eliminar recarga completa del arbol al editar cantidad/precio

### Causa raiz

Hay dos problemas que se refuerzan mutuamente:

1. **`computedExpandedIds` depende de `lines`**: Cada vez que se llama `setLines` (update optimista), el `useMemo` se recalcula y crea un nuevo objeto `Set`. React ve una nueva referencia en la prop `expandedIds` y re-renderiza TODOS los `BudgetLineItem`.

2. **`BudgetLineItem` no usa `React.memo`**: Sin memoizacion, React re-renderiza cada item del arbol aunque sus props individuales no hayan cambiado.

### Solucion

#### 1. Reemplazar `expandedIds` por `collapsedIds` como prop directa
En vez de calcular `expandedIds` (que depende de `lines`), pasar `collapsedIds` directamente al arbol. Cada item calcula su estado como `!collapsedIds.has(id)`. Como `collapsedIds` solo cambia cuando el usuario expande/colapsa algo (no cuando edita valores), el arbol no se re-renderiza al editar.

#### 2. Envolver `BudgetLineItem` en `React.memo`
Esto evita que React re-renderice items cuyas props no cambiaron. Solo se re-renderizara el item editado (cuya `line` prop cambio).

### Detalle tecnico

**BudgetModule.tsx**:
- Eliminar `computedExpandedIds` (el `useMemo` en linea 134-139)
- Pasar `collapsedIds` directamente como prop al `BudgetLineTree`
- Eliminar `getAllLineIds` ya que no se necesita mas

**BudgetLineTree.tsx**:
- Cambiar prop `expandedIds: Set<string>` por `collapsedIds: Set<string>` en `BudgetLineTreeProps` y `BudgetLineItemProps`
- Cambiar la logica de expansion: `const isExpanded = collapsedIds ? !collapsedIds.has(line.id) : localExpanded`
- Envolver `BudgetLineItem` en `React.memo` para evitar re-renders innecesarios

### Archivos a modificar
- `src/components/budget/BudgetModule.tsx` -- eliminar computedExpandedIds, pasar collapsedIds directamente
- `src/components/budget/BudgetLineTree.tsx` -- usar collapsedIds, envolver en React.memo

