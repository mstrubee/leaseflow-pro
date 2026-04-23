## Reparentar una línea hija bajo otra línea hija (nueva madre)

### Estado actual

La operación que pides **ya existe técnicamente**, pero está poco visible:

1. La función `handleConfirmMove` en `BudgetModule.tsx` actualiza `parent_id` en `budget_lines`. Cualquier línea (incluida una hija) puede pasar a depender de cualquier otra línea, siempre que no sea sí misma ni una de sus descendientes (evita ciclos).
2. El total de cualquier línea madre se calcula recursivamente sumando sus hijos (`calculateChildrenSubtotal` y `calculateStoredSubtotal` en `BudgetLineTree.tsx`). Por lo tanto, al reparentar, **la nueva madre suma automáticamente la nueva hija** sin necesidad de tocar la BD adicionalmente.
3. La línea madre original mantiene un "ghost" (placeholder no contabilizable) en la posición original como rastro auditable.

El problema es de **descubrimiento**: hoy hay que entrar en "modo selección" (botón global), marcar la línea, abrir "Mover" y buscar la madre destino. No hay un atajo directo desde la línea.

### Propuesta

Agregar un atajo directo "Mover bajo otra línea" en cada fila del árbol, usando el flujo ya existente.

**1. Botón/acción "Mover" por línea** (`BudgetLineTree.tsx`)
- Agregar un ítem en el menú contextual de cada línea (junto a Editar / Eliminar / Agregar adicional autorizado): **"Mover bajo otra línea…"**.
- Al pulsarlo, abre el `MoveLinesDialog` ya existente con `selectedIds = [line.id]`.
- Solo visible cuando no es ghost, no es surcharge fusionado y el usuario tiene permisos de edición.

**2. Pequeñas mejoras al `MoveLinesDialog`**
- Cambiar el copy del header cuando es 1 sola línea: en vez de "Mover 1 línea", mostrar "Mover '{nombre}' bajo otra línea madre".
- Aclarar en la descripción que también puede pasar a depender de un **hermano** o de **cualquier otra línea del presupuesto**.
- Añadir una pista visual junto a la línea madre actual del elemento que se está moviendo (etiqueta "actual") para que el usuario evite seleccionarla.

**3. Sin cambios de BD ni en la lógica de totales**
- El recálculo del total de la nueva madre (incluyendo la nueva hija) y de la madre original (que ya no la cuenta) ocurre automáticamente al recargar el árbol, gracias a la suma recursiva existente.
- Se mantiene el "ghost" en la posición original (trazabilidad).

### Comportamiento esperado tras la acción

- La hija desaparece de la madre original (queda solo el "ghost" gris).
- La hija aparece como hija de la nueva madre, en el último orden.
- El total de la nueva madre **incluye** el `amount_uf` (y CLP) de la hija reparentada.
- El total de la madre original **deja de incluirla** (el ghost vale 0).
- Si la nueva madre era una "hoja" (sin hijos), pasa a comportarse como madre y muestra el desglose de hijos.

### Archivos a modificar

- `src/components/budget/BudgetLineTree.tsx` — añadir acción "Mover bajo otra línea…" por fila + estado para abrir el diálogo con la línea pre-seleccionada.
- `src/components/budget/MoveLinesDialog.tsx` — copy más claro para single-line + marcar "actual" la madre vigente.
- `src/components/budget/BudgetModule.tsx` — exponer/propagar el handler para abrir el diálogo desde una línea individual reutilizando `handleConfirmMove`.

### Detalles técnicos

- La validación anti-ciclo ya está en `MoveLinesDialog` (excluye la línea y todo su subárbol).
- No se requiere migración: `parent_id` ya es nullable y editable.
- No se afectan OCs/facturas: siguen vinculadas a la línea por su `id`, que no cambia.
- Sin cambios en RLS ni edge functions.