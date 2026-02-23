

## Porcentaje editable en líneas calculadas del presupuesto

### Objetivo
Permitir que el porcentaje de las líneas calculadas (Gastos Generales, Utilidades) sea editable directamente desde la visualización del presupuesto CAPEX/OPEX en cada contrato, sin necesidad de modificar la plantilla.

### Cambios en `src/components/budget/BudgetLineTree.tsx`

Actualmente las líneas con `calc_type = 'percentage'` muestran un Badge estático con el porcentaje y el nombre de la línea fuente (líneas 478-491). Se modificará para:

1. **Porcentaje editable con doble clic** (igual que cantidad y precio en líneas normales):
   - Al hacer doble clic en el badge del porcentaje, se muestra un Input numérico
   - Al confirmar (blur o Enter), se guarda el nuevo porcentaje y se recalcula `amount_uf`
   - El cálculo es: subtotal de la línea fuente * nuevo porcentaje / 100

2. **Recálculo del monto**:
   - Al cambiar el porcentaje, se busca la línea fuente en `allLines` por `calc_source_line_id`
   - Se calcula el subtotal de sus hijos (reutilizando `calculateChildrenSubtotal`)
   - Se actualiza `calc_percentage` y `amount_uf` via `onUpdateLine`

3. **Respeto al modo readOnly**: Si `readOnly = true`, el porcentaje no es editable

### Detalle técnico

```text
Estado local nuevo:
  - isEditingPercentage: boolean
  - editPercentage: string (inicializado con line.calc_percentage)

Al guardar:
  1. Parsear el nuevo porcentaje
  2. Buscar línea fuente en allLines por calc_source_line_id
  3. Calcular subtotal de hijos de la fuente
  4. amount_uf = subtotal * porcentaje / 100
  5. onUpdateLine(line.id, { calc_percentage: nuevoValor, amount_uf: nuevoMonto })

UI:
  - Doble clic en badge -> Input numérico con "%" como sufijo
  - Enter o blur -> guardar
  - Escape -> cancelar edición
```

### Archivo modificado
- `src/components/budget/BudgetLineTree.tsx` (solo modificación de la sección de líneas porcentuales, líneas 478-491)
