

## Corregir recarga completa del arbol y ampliar columna de cantidad

### Problemas identificados

1. **Recarga completa del arbol**: `computedExpandedIds` (linea 134-139 de BudgetModule) es una IIFE que crea un nuevo objeto `Set` en cada render. Esto causa que React considere que la prop `expandedIds` cambio, y re-renderiza TODOS los `BudgetLineItem` aunque sus datos no hayan cambiado. Este es el principal causante de la recarga visual completa.

2. **Fetch innecesario en recalculo**: `recalcPercentageLinesLocally` (linea 366) hace un `SELECT *` de todas las lineas desde la BD despues de cada edicion, lo cual agrega latencia y puede leer datos desactualizados (la escritura optimista aun no se refleja en la BD).

3. **Columna de cantidad cortada**: El input de cantidad usa `w-14` (56px) y el display usa `min-w-[40px]`, insuficiente para numeros de 5 digitos. El contenedor tiene `w-[120px]` que tambien limita el espacio.

### Solucion

#### 1. Memoizar `computedExpandedIds` (BudgetModule.tsx)
- Reemplazar la IIFE por un `useMemo` que dependa de `lines` y `collapsedIds`
- Esto evita crear un nuevo Set en cada render y React no re-renderizara los hijos innecesariamente

#### 2. Recalcular porcentajes desde el estado local (BudgetModule.tsx)
- En `recalcPercentageLinesLocally`, en vez de hacer `supabase.from("budget_lines").select("*")`, aplanar el arbol `lines` del estado local (que ya tiene el update optimista)
- Esto elimina el round-trip a la BD y usa datos actualizados

#### 3. Ampliar ancho de columna de cantidad (BudgetLineTree.tsx)
- Cambiar el contenedor de cantidad de `w-[120px]` a `w-[140px]`
- Cambiar el input de edicion de `w-14` a `w-20` (80px)
- Cambiar el display de `min-w-[40px]` a `min-w-[50px]`

### Detalle tecnico

**BudgetModule.tsx**:
```
// Linea 134-139: reemplazar IIFE por useMemo
const computedExpandedIds = useMemo(() => {
  const allIds = getAllLineIds(lines);
  const set = new Set<string>();
  allIds.forEach(id => { if (!collapsedIds.has(id)) set.add(id); });
  return set;
}, [lines, collapsedIds, getAllLineIds]);
```

```
// Linea 364-435: recalcPercentageLinesLocally sin fetch a BD
// Aplanar el arbol local en vez de consultar la BD
const flattenTree = (items: BudgetLine[]): BudgetLine[] => {
  const result: BudgetLine[] = [];
  items.forEach(item => {
    result.push(item);
    if (item.children?.length) result.push(...flattenTree(item.children));
  });
  return result;
};
const allFlatLines = flattenTree(lines); // usar estado local
```

**BudgetLineTree.tsx**:
```
// Linea 559: w-[120px] -> w-[140px]
// Linea 568: w-14 -> w-20
// Linea 574: min-w-[40px] -> min-w-[50px]
```

### Archivos a modificar
- `src/components/budget/BudgetModule.tsx` -- memoizar expandedIds, recalcular desde estado local
- `src/components/budget/BudgetLineTree.tsx` -- ampliar ancho de columna de cantidad
