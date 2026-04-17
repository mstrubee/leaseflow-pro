

## Fix: 0% en Gastos Generales / Utilidades no actualiza la línea madre

### Causa raíz
En `src/components/budget/BudgetLineTree.tsx` (líneas 321-335), el cálculo de recargos para la línea madre tiene una lógica de fallback incorrecta:

```ts
const pct = l.calc_percentage || 0;
if (pct > 0) {
  surcharges += (calculatedAmount * pct) / 100;   // calcula en vivo
} else {
  surcharges += l.amount_uf || 0;                 // ← BUG: usa valor viejo guardado
}
```

Cuando el usuario pone **0%**, `pct === 0`, entonces se cae al `else` y suma el `amount_uf` antiguo guardado en BD. Por eso la línea madre no cambia: sigue sumando el monto histórico de Gastos Generales como si nada.

El mismo patrón problemático existe en `livePercentageAmount` (línea 303): `if (!line.calc_source_line_id || pct <= 0) return line.amount_uf || 0;` — con 0% retorna el valor guardado en lugar de 0.

### Cambios

**`src/components/budget/BudgetLineTree.tsx`**

1. **`calculatedAmountWithSurcharges`** (línea 321-335): tratar líneas porcentuales como "siempre live". Si la línea recargo tiene `calc_source_line_id` definido, calcular `(calculatedAmount * pct) / 100` (incluyendo cuando `pct === 0`, que dará 0). Sólo usar `l.amount_uf` como fallback cuando no exista `calc_source_line_id` (recargo de monto fijo legacy).

2. **`livePercentageAmount`** (línea 300-315): cambiar la guarda `pct <= 0` para que sólo retorne `amount_uf` cuando NO haya `calc_source_line_id`. Si hay source y `pct === 0`, devolver 0 (no el stored).

### Resultado
- Poner 0% en Gastos Generales → recargo = 0 → línea madre "Obras Civiles" muestra exactamente la suma de hijas.
- Cambiar a 5%, 10%, etc. → recalcula en vivo como ya funciona.
- Líneas porcentuales legacy sin source siguen mostrando su monto guardado.

