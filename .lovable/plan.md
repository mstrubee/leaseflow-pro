

## Mejoras al Dashboard CAPEX: Desglose Autorizado/No Autorizado + Cards por Clasificacion

### 1. Lineas colapsadas: mostrar Autorizado y No Autorizado

Actualmente cada linea colapsada solo muestra el total en UF. Se modificara para mostrar dos valores diferenciados:

- **Autorizado** (verde): monto total de lineas con status "autorizado"
- **No Autorizado** (amarillo): monto total de lineas con status "no_autorizado"

Ejemplo visual en la fila colapsada:
```text
Local Centro Sur          Autorizado: 120,50 UF  |  No Autorizado: 45,30 UF
```

**Cambios tecnicos:**
- Modificar la query `loadBudgets` en `CapexDashboard.tsx` para tambien cargar las `budget_lines` agrupadas por budget, calculando totales autorizados y no autorizados por contrato
- Guardar en estado adicional: `capexAuthorized` y `capexUnauthorized` por contract_id
- Actualizar el area derecha del `CollapsibleTrigger` para mostrar ambos montos con colores diferenciados (verde para autorizado, amarillo para no autorizado)

### 2. Cards de resumen por clasificacion (Nuevo vs Reemplazo)

Se agregaran dos Cards nuevas al area de resumen, basadas en el campo `clasificacion` de la tabla `contracts` (valores: `"nuevo"` y `"reemplazo"`).

```text
+--------------------+--------------------+--------------------+
| Total CAPEX (UF)   | Total CAPEX (CLP)  | Locales con CAPEX  |
+--------------------+--------------------+--------------------+
| CAPEX Nuevos       | CAPEX Reemplazo    |
+--------------------+--------------------+
```

**Cambios tecnicos:**
- Ampliar la query `loadBudgets` para incluir `contracts(name, clasificacion)` en el select
- Agregar `clasificacion` a la interfaz `ContractBudget`
- Calcular totales filtrados por clasificacion:
  - `totalNuevoUF`: suma de amount_uf donde clasificacion === "nuevo"
  - `totalReemplazoUF`: suma donde clasificacion === "reemplazo"
- Renderizar dos Cards nuevas debajo de las existentes mostrando UF y CLP para cada tipo

### Archivo a modificar

**`src/pages/CapexDashboard.tsx`**:
- Ampliar interfaz `ContractBudget` con `clasificacion`
- Modificar `loadBudgets`: traer clasificacion del contrato + budget_lines para calcular autorizados/no autorizados
- Nuevo estado: `authorizedByContract` y `unauthorizedByContract` (Record de contract_id a monto UF)
- Agregar 2 Cards de resumen (Nuevos / Reemplazo) en grid debajo de las actuales
- Modificar la zona derecha del header colapsable: mostrar "Autorizado: X UF" en verde y "No Autorizado: Y UF" en amarillo, en lugar del total unico
