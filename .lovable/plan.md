

## Optimizar velocidad de edicion y preservar estado colapsado/expandido

### Problemas identificados

1. **Perdida de estado expandido/colapsado**: Cada `BudgetLineItem` guarda su estado `isExpanded` en un `useState` local (linea 136). Cuando `loadLines` reconstruye el arbol completo, todos los componentes se remontan y el estado vuelve a `true` (valor por defecto).

2. **Recarga innecesaria tras recalculo**: Despues del update optimista + recalculo de porcentajes, `loadLines` vuelve a reemplazar todo el estado `lines`, causando un flash visual y perdida del estado colapsado.

3. **`onRefresh` pesado**: Llama a `setRefreshKey(k => k + 1)` + `refreshData()` en el dashboard padre, lo cual puede remontar secciones completas.

### Solucion

#### 1. Estado de expansion centralizado (no local por componente)
- Mover el estado `isExpanded` fuera de cada `BudgetLineItem` a un `Map<string, boolean>` (o `Set<string>`) gestionado a nivel de `BudgetLineTree` o `BudgetModule`
- Pasar `expandedIds` y `onToggleExpand` como props a cada item
- Asi, cuando `loadLines` reconstruye el arbol, el estado de expansion se preserva porque vive fuera del arbol de componentes

#### 2. Evitar `loadLines` tras recalculo de porcentajes
- En lugar de llamar `loadLines(budget.id)` despues de `recalcPercentageLines`, actualizar solo las lineas porcentuales en el estado local con sus nuevos `amount_uf`
- Esto elimina el round-trip extra y evita remontar componentes

#### 3. Debounce de `onRefresh`
- Envolver `onRefresh` en un `setTimeout` de ~500ms para evitar multiples llamadas consecutivas
- Cancelar el timer previo si llega otro update antes

### Detalle tecnico

**Archivo: `src/components/budget/BudgetLineTree.tsx`**
- Eliminar `const [isExpanded, setIsExpanded] = useState(true)` del `BudgetLineItem`
- Agregar props `expandedIds: Set<string>` y `onToggleExpand: (id: string) => void` al `BudgetLineTreeProps` y `BudgetLineItemProps`
- Calcular `isExpanded` como `expandedIds.has(line.id)` (con default `true` si no esta en el set y no se ha tocado)
- Mantener el useEffect de `globalExpandState` pero operando sobre el set centralizado

**Archivo: `src/components/budget/BudgetModule.tsx`**
- Agregar estado `expandedIds` con `useState<Set<string>>` inicializado como set vacio (todos expandidos por defecto via logica inversa, o set con todos los IDs)
- Pasar `expandedIds` y `onToggleExpand` al `BudgetLineTree`
- En `applyLineUpdate`: reemplazar `loadLines(budget.id)` post-recalculo por actualizacion local de solo las lineas porcentuales
- Envolver `onRefresh` en un ref con debounce de 500ms

### Archivos a modificar
- `src/components/budget/BudgetLineTree.tsx` -- externalizar estado de expansion
- `src/components/budget/BudgetModule.tsx` -- gestionar estado de expansion centralizado, eliminar loadLines post-recalc, debounce onRefresh

