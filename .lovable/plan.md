

## Plan: Adicionales/Descuentos en líneas autorizadas

Permitir que cualquier usuario solicite un **adicional** (o **descuento**) sobre una línea hija ya autorizada. El monto adicional ingresa como "no autorizado" y solo el admin puede aprobarlo. Una vez aprobado, se suma al monto de la línea original y se muestra un indicador `+` junto al total.

### Comportamiento UX

1. **Línea hija autorizada**: al hacer clic en la fila (o en un nuevo ícono `+/–` discreto al lado del badge "Autorizado"), se expande **in place** un panel debajo de la línea (mismo estilo de la fila, fondo amarillo claro tenue para diferenciarse).
2. **Panel de adicional/descuento** contiene:
   - Selector "Adicional (+)" / "Descuento (–)"
   - Input de monto + selector de moneda (UF / CLP) — siguiendo estándar CLP-primario
   - Campo opcional "Motivo" (texto corto)
   - Botón "Solicitar" / "Cancelar"
3. **Al guardar** se crea una nueva línea hermana (mismo `parent_id`, mismo `name + " (Adicional)"` o `" (Descuento)"`), con `status = no_autorizado`, `amount_uf` con signo (positivo para adicional, negativo para descuento), heredando proveedor/categoría/unidad de la línea original. La línea original NO se modifica.
4. **Listado de adicionales pendientes**: bajo la línea autorizada se muestran inline los adicionales asociados (en amarillo, con badge "No Autorizado"). Cada uno conserva sus propios botones de eliminar y de autorización (admin).
5. **Al autorizar un adicional** (admin cambia el badge a "Autorizado"):
   - El monto del adicional se **suma al `amount_uf` / `unit_price` de la línea original** (recalculando `unit_price = amount_uf / quantity`).
   - El adicional queda marcado como **fusionado** (`merged_into_line_id` apuntando a la línea original) y se oculta de la vista normal, pero queda registrado en auditoría.
   - La línea original muestra al lado del total un indicador visual: ícono **`+`** verde con tooltip "Incluye N adicional(es) por UF X / $ Y".

### Cambios técnicos

**Base de datos** (migración):
- Agregar columnas a `budget_lines`:
  - `is_surcharge boolean default false` — marca línea como adicional/descuento solicitado
  - `surcharge_parent_line_id uuid references budget_lines(id)` — apunta a la línea original sobre la que se aplica
  - `surcharge_reason text` — motivo opcional
  - `merged_into_line_id uuid references budget_lines(id)` — al autorizar, registra fusión (la fila adicional se mantiene oculta para auditoría)
  - `original_amount_uf numeric` — snapshot del monto original de la línea base antes de aplicar adicionales (para mostrar desglose)
- Índice en `surcharge_parent_line_id`.
- RLS: heredar políticas existentes de `budget_lines` (cualquier usuario con permiso de edición puede insertar adicionales; solo admin puede cambiar `status` a autorizado, vía `has_role`).

**Frontend**:
- `src/components/budget/BudgetLineTree.tsx`:
  - Nuevo estado `showSurchargePanel` por línea autorizada.
  - Componente inline `SurchargeRequestPanel` (input monto, moneda, tipo +/–, motivo, botones).
  - Filtrar de la lista visible las líneas con `merged_into_line_id != null`.
  - Renderizar adicionales pendientes (`is_surcharge && status==='no_autorizado'`) como sub-filas inmediatamente debajo de la línea original.
  - En el badge de total de la línea original, si existen adicionales fusionados (suma > 0), añadir ícono verde `+` con tooltip que liste los adicionales aplicados (consultando líneas con `merged_into_line_id = line.id`).
- Lógica de autorización (admin):
  - Al hacer clic en "Autorizar" sobre una línea `is_surcharge`, ejecutar transacción:
    1. Sumar `amount_uf` del adicional al `amount_uf` de la línea original.
    2. Recalcular `unit_price` de la línea original (`amount_uf / quantity`).
    3. Setear `merged_into_line_id` y `status='autorizado'` en el adicional.
- `src/components/budget/BudgetContext.tsx` y los cálculos `calculateAuthorizedTotal` / `calculateUnauthorizedTotal`: tratar adicionales no fusionados como líneas normales (ya quedan cubiertos por el flujo actual gracias al `status`). Excluir líneas con `merged_into_line_id != null` de los totales para evitar doble conteo.
- Tipos en `BudgetLine`: agregar campos opcionales nuevos.

### Archivos afectados
- `supabase/migrations/<new>` (nueva migración)
- `src/components/budget/BudgetLineTree.tsx`
- `src/components/budget/BudgetContext.tsx` (si los cálculos lo requieren)
- `src/components/budget/BudgetModule.tsx` (carga de líneas: incluir nuevos campos en select)

### Notas
- Los adicionales no autorizados se arrastran al siguiente año igual que cualquier línea `no_autorizado` (comportamiento existente).
- Eliminar un adicional pendiente solo afecta a esa fila; la línea original queda intacta.
- Los descuentos siguen el mismo flujo con monto negativo.

