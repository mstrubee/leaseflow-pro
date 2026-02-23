

## Optimizar velocidad de edición de presupuesto en contratos

### Problema
Al editar un valor unitario o cantidad en una linea del presupuesto (CAPEX/OPEX) dentro de un contrato, el flujo actual ejecuta demasiadas consultas secuenciales a la base de datos, causando lentitud extrema y a veces recarga de pagina:

1. `update` de la linea editada (1 query)
2. `recalcPercentageLines`: fetch de TODAS las lineas + N updates individuales (1 + N queries)
3. `loadLines`: fetch de todas las lineas de nuevo (1 query)
4. `onRefresh()`: recarga el dashboard padre (mas queries)
5. Cada `BudgetLineItem` tiene un `useEffect` que hace fetch de template prices al recibir nuevas props -- esto se dispara para CADA linea cuando se re-renderiza el arbol

Total: minimo 4+ round-trips secuenciales, mas N updates de porcentaje, mas M fetches de template prices desde cada componente hijo.

### Solucion

#### 1. Optimistic UI + update local inmediato (`BudgetModule.tsx`)
- Actualizar el estado local `lines` inmediatamente al editar, sin esperar la respuesta de la BD
- Ejecutar el `update` en la BD en background
- Solo hacer `loadLines` si hay error (para revertir)

#### 2. Batch update de lineas porcentuales (`BudgetModule.tsx`)
- En `recalcPercentageLines`, en lugar de hacer N updates individuales con `await` secuencial, recopilar todos los cambios y ejecutarlos en paralelo con `Promise.all`
- Eliminar el `await` en la llamada a `recalcPercentageLines` desde `applyLineUpdate` para que no bloquee la UI

#### 3. Eliminar fetch de template prices por componente (`BudgetLineTree.tsx`)
- El `useEffect` en cada `BudgetLineItem` (lineas 161-198) hace un fetch individual a `budget_template_lines` por cada linea del arbol. Cuando se re-renderiza el arbol tras un cambio, esto dispara decenas de queries simultaneas
- Ya existe `templatePricesMap` cargado a nivel de `BudgetModule.loadLines`. Pasar este map como prop al `BudgetLineTree` y eliminar el fetch individual

#### 4. Debounce del onRefresh (`BudgetModule.tsx`)
- `onRefresh()` recarga todo el dashboard. Diferirlo con un debounce o ejecutarlo sin `await`

### Detalle tecnico

```text
BudgetModule.tsx - applyLineUpdate:
  ANTES:
    1. await supabase.update(line)
    2. await recalcPercentageLines(budget.id) -- fetch all + N sequential updates
    3. loadLines(budget.id) -- fetch all again
    4. onRefresh()

  DESPUES:
    1. Actualizar estado local lines inmediatamente (optimistic)
    2. supabase.update(line) -- sin await bloqueante en UI
    3. recalcPercentageLines en background con Promise.all para batch
    4. loadLines solo al final (1 sola recarga)
    5. onRefresh diferido

BudgetModule.tsx - recalcPercentageLines:
  ANTES: for loop con await individual por cada linea porcentual
  DESPUES: Promise.all([...updates])

BudgetLineTree.tsx - BudgetLineItem:
  ANTES: useEffect individual fetch template prices por componente
  DESPUES: Recibir templatePricesMap como prop desde BudgetModule
           Eliminar el useEffect de fetch de templates (lineas 161-198)
```

### Archivos a modificar
- `src/components/budget/BudgetModule.tsx` -- optimistic update, batch percentage recalc, pasar templatePricesMap como prop
- `src/components/budget/BudgetLineTree.tsx` -- recibir templatePricesMap como prop, eliminar fetch individual de templates por componente
