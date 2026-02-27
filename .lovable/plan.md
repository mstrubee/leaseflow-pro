

## Correccion de montos: CLP como moneda principal en todo el sistema de presupuesto

### Problema detectado

`BudgetModule.tsx` y `OpexConsumptionPieChart.tsx` muestran todos los montos con **UF como dato principal** y CLP como secundario. Esto contradice el estandar del sistema donde **Pesos ($) es siempre el dato principal** y UF es solo informativo.

Ademas, `BudgetDashboard.tsx` pasa `ocTotal` en UF a `BudgetModule`, lo que causa que las comparaciones internas (semaforo, disponible) se hagan en UF en vez de CLP.

### Lugares afectados y cambios

---

**1. `src/components/budget/BudgetModule.tsx` - Cards de resumen (lineas 925-958)**

Cambiar las 4 celdas del resumen:

- **Autorizado**: `formatUF(authorizedTotal)` → `formatCLP(convertUFToPesos(authorizedTotal))` como principal, `formatUF(authorizedTotal)` como `text-xs text-muted-foreground`
- **Consumido (OC)**: `formatUF(ocTotal)` → `formatCLP(ocTotalClp)` como principal (nuevo prop), `formatUF(ocTotal)` como secundario
- **Disponible**: `formatUF(disponible)` → `formatCLP(disponibleClp)` como principal, UF secundario
- **No Autorizado**: `formatUF(unauthorizedTotal)` → `formatCLP(convertUFToPesos(unauthorizedTotal))` como principal, UF secundario

**2. `src/components/budget/BudgetModule.tsx` - Props del componente**

Agregar `ocTotalClp` como prop adicional para recibir el monto real en CLP almacenado:

```text
interface BudgetModuleProps {
  ...
  ocTotal?: number;       // UF (mantener para calculos internos)
  ocTotalClp?: number;    // CLP real almacenado (nuevo)
}
```

**3. `src/components/budget/BudgetModule.tsx` - BudgetSemaphore (linea 929)**

Cambiar a CLP: `budget={convertUFToPesos(authorizedTotal)} consumed={ocTotalClp}`

**4. `src/components/budget/BudgetModule.tsx` - Disponible (lineas 938-952)**

Calcular en CLP: `disponibleClp = convertUFToPesos(authorizedTotal) - ocTotalClp`

**5. `src/components/budget/BudgetModule.tsx` - Alerta de items no autorizados (linea 966)**

`formatUF(unauthorizedTotal)` → `formatCLP(convertUFToPesos(unauthorizedTotal))`

**6. `src/components/budget/BudgetModule.tsx` - Dialog OC: presupuesto y disponible de linea (lineas 1182-1189)**

`formatUF(ocLineBudget)` y `formatUF(ocLineAvailable)` → `formatCLP(convertUFToPesos(...))` como principal, UF secundario

**7. `src/components/budget/BudgetModule.tsx` - Validacion monto OC (linea 687)**

Mensaje de error: cambiar `formatUF(amountUf)` por `formatCLP(convertUFToPesos(amountUf))` y similar para disponible

**8. `src/components/budget/BudgetModule.tsx` - Listas de OC, solicitudes y facturas (lineas 1297, 1406, 1428, 1456, 1459)**

Todos los `formatUF(oc.amount_uf)` → `formatCLP(resolveClp(oc))` con UF secundario donde aplique

**9. `src/components/budget/BudgetModule.tsx` - Total UF/m2 (linea 1023)**

Mantener ambas expresiones pero invertir orden: CLP primero, UF segundo

**10. `src/components/budget/BudgetDashboard.tsx` - Pasar ocTotalClp a BudgetModule (lineas 986, 1000)**

Agregar `ocTotalClp={capexTotals.ocClp}` y `ocTotalClp={opexTotals.ocClp}` a las llamadas de BudgetModule

**11. `src/components/budget/OpexConsumptionPieChart.tsx` - Todo el componente**

- Total principal (linea 114): `formatUF(totalAmount)` → `formatCLP(totalAmount * ufValue)` con UF secundario
- Tooltip y leyenda: mostrar CLP como principal
- Necesita recibir `ufValue` o usar `useBudgetContext`

---

### Archivos afectados

| Archivo | Cambios |
|---------|--------|
| `src/components/budget/BudgetModule.tsx` | Invertir CLP/UF en ~15 lugares; agregar prop `ocTotalClp`; semaforo en CLP |
| `src/components/budget/BudgetDashboard.tsx` | Pasar `ocTotalClp` a BudgetModule |
| `src/components/budget/OpexConsumptionPieChart.tsx` | Mostrar CLP como principal usando `useBudgetContext` |

### Principio aplicado

Todos los montos se expresan en Pesos ($) como dato principal. La UF se muestra como dato informativo secundario en texto mas pequeno y color muted.

