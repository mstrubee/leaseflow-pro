

## Correccion de calculos: usar montos CLP almacenados en vez de convertir UF con tasa del dia

### Problema actual

El dashboard de presupuesto calcula los totales sumando `amount_uf` de las OC, facturas y notas de credito, y luego convierte a Pesos usando la UF **de hoy** (`convertUFToPesos(totalUf)`). Esto causa que los montos en Pesos **fluctuen diariamente** segun la variacion de la UF, en vez de reflejar el valor real en Pesos que se registro al momento de crear cada documento.

**Ejemplo**: Una OC creada por $1.000.000 cuando la UF era 38.000, guarda `amount_uf = 26.32` y `amount_clp = 1.000.000`. Hoy si la UF es 39.776, el dashboard muestra `26.32 * 39.776 = $1.046.906` en vez de los $1.000.000 reales.

### Solucion

Usar los campos `amount_clp` ya almacenados en la base de datos (que estan bloqueados al dia de creacion) en vez de recalcular desde UF. La UF se muestra solo como dato informativo derivado del CLP guardado.

---

### 1. Cambiar `loadBudgetTypeTotals` para sumar `amount_clp`

**Archivo: `src/components/budget/BudgetDashboard.tsx`**

Actualmente la funcion consulta `amount_uf` de purchase_orders, invoices y credit_notes. Cambiar para:

- Consultar `amount_clp` ademas de `amount_uf` de purchase_orders
- Consultar `amount_clp` de invoices y credit_notes
- Sumar directamente los `amount_clp` para obtener los totales en Pesos
- Mantener la suma de `amount_uf` solo para mostrar el dato informativo en UF

**Cambio en la interfaz `BudgetTypeTotals`:**
```text
interface BudgetTypeTotals {
  ocClp: number;       // Suma de amount_clp de OCs
  ocUf: number;        // Suma de amount_uf de OCs (informativo)
  invoicesClp: number;  // Suma de amount_clp de facturas - notas de credito
  invoicesUf: number;   // Suma de amount_uf de facturas - notas de credito (informativo)
}
```

**Cambio en la consulta**: Agregar `amount_clp` a los selects de purchase_orders, invoices y credit_notes, y sumar ambos campos por separado.

Para registros antiguos que no tengan `amount_clp` (null), usar fallback: `amount_clp || Math.round(amount_uf * uf_value_at_entry)` o `amount_uf * ufValue` si no hay `uf_value_at_entry`.

### 2. Actualizar las cards de resumen para usar CLP directo

**Archivo: `src/components/budget/BudgetDashboard.tsx`**

Cambiar todas las referencias de `convertUFToPesos(capexTotals.oc)` a `capexTotals.ocClp` (el valor real en Pesos). Igualmente para invoices y opex.

**Card TOTAL GENERAL:**
- Total OC: `formatCLP(capexTotals.ocClp + opexTotals.ocClp)` (antes: `formatCLP(convertUFToPesos(...))`)
- UF informativo: `formatUF(capexTotals.ocUf + opexTotals.ocUf)`
- Total Facturacion: `formatCLP(capexTotals.invoicesClp + opexTotals.invoicesClp)`
- No Facturado: `formatCLP((capexTotals.ocClp - capexTotals.invoicesClp) + (opexTotals.ocClp - opexTotals.invoicesClp))`

**Card CAPEX:**
- OC: `formatCLP(capexTotals.ocClp)`
- Facturacion: `formatCLP(capexTotals.invoicesClp)`
- No Facturado: `formatCLP(capexTotals.ocClp - capexTotals.invoicesClp)`
- Disponible: Presupuesto CAPEX (convertido) menos OCs en CLP

**Card OPEX:**
- Mismos cambios que CAPEX pero con `opexTotals`

### 3. Presupuesto CAPEX (budget amount) - mantener conversion actual

El monto del presupuesto CAPEX (`capexSummary.budget`) se almacena en UF y es un monto planificado, no transaccional. Para este caso, convertir con la UF del dia es correcto ya que representa el valor actual del presupuesto. No requiere cambio.

### 4. Disponible CAPEX - calcular correctamente

El "Disponible" se calcula como `Presupuesto - OC emitidas`. Dado que el presupuesto esta en UF (planificado) y las OC en CLP (bloqueadas), necesitamos convertir el presupuesto a CLP con la UF del dia y restar el total de OC en CLP:

```text
Disponible = convertUFToPesos(capexBudget) - capexTotals.ocClp
```

### 5. Semaforo presupuestario

El `BudgetSemaphore` actualmente recibe `consumed` en UF. Cambiar para pasar los valores en CLP directamente (ambos presupuesto y consumo convertidos a la misma base).

### 6. Dialog "Editar CAPEX" - mostrar consumo en CLP

En el dialogo de edicion de CAPEX (lineas 1244-1253), los valores de consumo actual se muestran con `formatUF`. Cambiar a:
- OC emitidas: `formatCLP(capexTotals.ocClp)` con UF informativo
- Facturado: `formatCLP(capexTotals.invoicesClp)` con UF informativo

---

### Archivos afectados

| Archivo | Cambios |
|---------|--------|
| `src/components/budget/BudgetDashboard.tsx` | Refactorizar `loadBudgetTypeTotals` para sumar `amount_clp`; actualizar todas las cards de resumen; actualizar dialog editar CAPEX |

### Principio aplicado

- **Montos transaccionales** (OC, facturas, notas de credito): usar `amount_clp` almacenado, que esta bloqueado al dia de creacion. Nunca reconvertir desde UF.
- **Montos de planificacion** (presupuesto CAPEX): usar conversion con UF del dia, ya que representan el valor actual del presupuesto.
- **UF**: siempre como dato informativo secundario, nunca como base de calculo para montos que ya fueron registrados.

