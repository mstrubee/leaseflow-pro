

## Eliminar re-render completo del arbol al editar valores

### Causa raiz

`React.memo` ya esta aplicado en `BudgetLineItem`, pero NO funciona porque:

1. **`allLines` prop cambia en cada edicion**: `BudgetLineTree` pasa `allLines={lines}` a cada item (linea 83). Cuando `setLines` crea un nuevo arbol (update optimista), TODOS los items reciben una nueva referencia de `allLines`, y `React.memo` los re-renderiza a todos.

2. **Propagacion en cascada**: El `BudgetLineTree` recursivo (linea 857) pasa `lines={line.children!}`. Al actualizar el estado, cada `line` se recrea con un nuevo objeto, y sus `children` tambien son nuevas referencias.

### Solucion

#### 1. Eliminar `allLines` como prop directa
`allLines` solo se usa para dos cosas:
- Buscar el nombre de una linea fuente (percentage calc source name) -- lineas 190-203
- Buscar una linea fuente para recalcular porcentajes al editar -- lineas 388-398

Ambos usos son para lineas de tipo `calc_type === "percentage"`, que son pocas. La solucion es pasar un mapa precalculado en vez del arbol completo.

#### 2. Crear un `linesMap` estable con `useMemo` en `BudgetLineTree` (nivel 0)
- En el componente `BudgetLineTree` raiz (level === 0), calcular un `Map<string, BudgetLine>` con `useMemo` dependiendo de `lines`
- Pasar este mapa como prop `linesMap` a cada `BudgetLineItem`
- Aunque `linesMap` cambia cuando `lines` cambia, combinado con un comparador custom en `React.memo`, los items no-porcentuales se saltaran el re-render

#### 3. Mejorar el comparador de `React.memo`
Actualmente `React.memo(BudgetLineItemInner)` usa comparacion shallow por defecto. Agregar un comparador custom que:
- Compare `line` por referencia (ya funciona con shallow)
- Ignore `allLines`/`linesMap` para items que NO son de tipo porcentaje
- Compare `collapsedIds.has(line.id)` en vez de comparar el Set completo

### Detalle tecnico

**BudgetLineTree.tsx**:

1. Eliminar `allLines` de `BudgetLineItemProps` y `BudgetLineTreeProps`
2. Agregar prop opcional `linesMap?: Map<string, BudgetLine>` a ambas interfaces
3. En `BudgetLineTree` (nivel 0): crear el mapa con `useMemo`:
```typescript
const linesMap = useMemo(() => {
  const map = new Map<string, BudgetLine>();
  const addToMap = (items: BudgetLine[]) => {
    items.forEach(item => {
      map.set(item.id, item);
      if (item.children?.length) addToMap(item.children);
    });
  };
  addToMap(lines);
  return map;
}, [lines]);
```
4. Pasar `linesMap` en vez de `allLines` a cada `BudgetLineItem`
5. Dentro de `BudgetLineItemInner`: reemplazar `findName(allLines)` y `findSource(allLines)` por lookups directos `linesMap.get(id)`
6. Actualizar `React.memo` con comparador custom:
```typescript
const BudgetLineItem = React.memo(BudgetLineItemInner, (prev, next) => {
  if (prev.line !== next.line) return false;
  if (prev.level !== next.level) return false;
  if (prev.readOnly !== next.readOnly) return false;
  if (prev.globalExpandState !== next.globalExpandState) return false;
  // Compare only this item's collapsed state, not the full Set
  const prevCollapsed = prev.collapsedIds?.has(prev.line.id) ?? false;
  const nextCollapsed = next.collapsedIds?.has(next.line.id) ?? false;
  if (prevCollapsed !== nextCollapsed) return false;
  // For percentage lines, also check if linesMap changed
  if (prev.line.calc_type === "percentage" && prev.linesMap !== next.linesMap) return false;
  // Skip comparing linesMap for non-percentage lines
  if (prev.parentCategoryId !== next.parentCategoryId) return false;
  if (prev.templatePricesMap !== next.templatePricesMap) return false;
  // Callbacks are stable (useCallback), skip comparing
  return true;
});
```

**BudgetModule.tsx**:
- Eliminar `allLines` de las props pasadas al `BudgetLineTree` (si existiera; actualmente se pasa como `lines` que es diferente)
- No requiere cambios ya que `allLines` se generaba dentro de `BudgetLineTree`

### Archivos a modificar
- `src/components/budget/BudgetLineTree.tsx` -- eliminar allLines, agregar linesMap, comparador custom en React.memo
