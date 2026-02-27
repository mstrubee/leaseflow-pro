

## Cambio de moneda principal a Pesos ($) y opcion de ingreso UF/CLP

Este cambio establece que **todos los calculos y visualizaciones** del sistema de presupuesto (CAPEX, OPEX, OC, Facturas, Notas de Credito) se muestren **siempre en Pesos ($)**, con UF como dato secundario informativo. Al crear una OC o Solicitud de OC, el sistema pregunta si el monto se ingresa en Pesos o UF; si se ingresa en UF, se convierte instantaneamente a Pesos usando la UF del dia de creacion.

---

### 1. Logica de conversion y almacenamiento (sin cambios de DB)

El sistema ya almacena `amount_clp`, `amount_uf`, `input_currency` y `uf_value_at_entry`. No se requieren cambios de base de datos. La diferencia es en **como se muestra**: CLP pasa a ser la moneda principal y UF la secundaria.

---

### 2. BudgetDashboard - Resumen Cards (ya casi correcto)

El BudgetDashboard ya muestra `formatCLP(convertUFToPesos(...))` como linea principal. Solo asegurar que UF sea siempre la linea secundaria mas pequena. **Archivo: `src/components/budget/BudgetDashboard.tsx`** - Revision menor, ya esta mayormente correcto.

---

### 3. PurchaseOrdersModule - Tabla de OCs

**Archivo: `src/components/budget/PurchaseOrdersModule.tsx`**

- **Tabla**: La columna "Monto" ya muestra CLP como linea principal y UF como secundaria (lineas 1314-1325). Verificar consistencia.
- **Total OC**: Ya muestra `formatCLP(totalOCClp)` como principal (linea 1151). Correcto.
- **Dialogo Nueva OC**: Cambiar la pregunta inicial de moneda. En vez del selector UF/CLP inline con el input, agregar un paso previo o selector prominente que diga: **"Crear OC en Pesos ($) o en UF?"**
  - Si elige CLP: el input acepta pesos directamente, se muestra equivalencia en UF
  - Si elige UF: el input acepta UF, se convierte a CLP instantaneamente usando UF del dia, el monto CLP es el principal
  - `uf_value_at_entry` se guarda siempre con la tasa del dia
- **Validaciones CAPEX/OPEX disponibles**: Cambiar los textos de `formatUF(available)` a `formatCLP(convertUFToPesos(available))` con UF como secundario

---

### 4. OCRequestDialog - Solicitud de OC (vista de contrato)

**Archivo: `src/components/budget/OCRequestDialog.tsx`**

- Cambiar default `currency: "UF"` a `currency: "CLP"` (linea 66)
- Ajustar selector de moneda para que sea mas prominente ("Ingresar en Pesos" / "Ingresar en UF")
- Cuando se elige UF: mostrar conversion instantanea a CLP como monto principal
- Cambiar equivalencia: siempre mostrar CLP como valor principal, UF como dato

---

### 5. OCRequestsList - Tabla de solicitudes

**Archivo: `src/components/budget/OCRequestsList.tsx`**

- **Columna Monto** (lineas 827-835): Cambiar de mostrar `formatUF(request.amount_uf)` a mostrar `formatCLP(request.amount_clp)` como linea principal, con UF debajo como texto secundario
- **Solicitudes convertidas**: Aplicar mismo cambio

---

### 6. CentralizedOrderCreator - Creador centralizado

**Archivo: `src/components/budget/CentralizedOrderCreator.tsx`**

- El selector de moneda ya existe (lineas 118-127). Cambiar default `currency: "CLP"` (ya es "CLP")
- Asegurar que la conversion equivalente muestre siempre CLP como primario
- El input de allocation amounts para multi-contrato: mostrar en CLP

---

### 7. InvoiceList - Facturas y Notas de Credito

**Archivo: `src/components/budget/InvoiceList.tsx`**

- Asegurar que montos de facturas y notas de credito se muestren siempre en CLP como primario
- El selector de moneda en el dialogo de nueva factura debe preguntar CLP o UF
- La tabla de facturas debe mostrar CLP principal

---

### 8. ConvertOCRequestDialog

**Archivo: `src/components/budget/ConvertOCRequestDialog.tsx`**

- Verificar que los montos mostrados sean en CLP como primario

---

### 9. Resumen de cambios por archivo

| Archivo | Cambios |
|---------|---------|
| `BudgetDashboard.tsx` | Revision menor - ya muestra CLP principal |
| `PurchaseOrdersModule.tsx` | Selector de moneda prominente en dialogo nueva/editar OC; validaciones en CLP; disponibles en CLP |
| `OCRequestDialog.tsx` | Default a CLP; selector prominente; conversion instantanea |
| `OCRequestsList.tsx` | Tabla: columna monto muestra CLP principal, UF secundario |
| `CentralizedOrderCreator.tsx` | Asegurar CLP como principal en conversiones y displays |
| `InvoiceList.tsx` | Montos en CLP principal en tabla y dialogos |
| `ConvertOCRequestDialog.tsx` | Montos en CLP principal |

### Principio general

- **CLP es SIEMPRE la moneda principal de visualizacion**
- **UF es un dato informativo secundario** (fuente mas pequena, color muted)
- Al crear en UF, la conversion a CLP se hace con la UF del dia y se guarda en `uf_value_at_entry`
- Los calculos de presupuesto disponible se muestran en CLP

