

## Agregar modos de ingreso de monto: $, % del total, y "Saldo" en pagos

Implementar tres formas de ingresar montos en los planes de pago de OC y Solicitudes de OC: monto directo en Pesos ($), porcentaje del total, o "Saldo" (total menos pagos ya ingresados). Los calculos de UF se derivan automaticamente.

---

### Cambios en ambos archivos

Los cambios son identicos en concepto para los dos lugares donde se agregan pagos:

1. **`src/components/budget/OCRequestViewDialog.tsx`** - Formulario "Agregar Pago" (lineas 1349-1398)
2. **`src/components/budget/OCRequestDialog.tsx`** - Plan de Pagos en creacion (lineas 436-474)

---

### 1. Nuevo campo: Tipo de monto (input_mode)

Agregar un selector con 3 opciones:

| Opcion | Etiqueta | Comportamiento |
|--------|----------|----------------|
| `clp` | `$ Monto` | El usuario ingresa pesos directamente (comportamiento actual) |
| `percent` | `% del Total` | El usuario ingresa un porcentaje (0-100), el sistema calcula automaticamente `monto_clp = total_clp * porcentaje / 100` y muestra el resultado |
| `balance` | `Saldo` | Solo disponible a partir del 2do pago. El sistema calcula automaticamente `total - suma_pagos_anteriores`. No hay input de monto, se muestra el resultado calculado |

---

### 2. OCRequestViewDialog.tsx - Formulario "Agregar Pago"

**Estado nuevo en `newPayment`:**
```text
newPayment: { description, amount, due_date, input_mode: "clp" | "percent" | "balance" }
```

**Layout del formulario (grid 12 cols):**
- Col 3: Descripcion (Input texto)
- Col 2: Tipo (Select: "$", "%", "Saldo")
- Col 3: Monto/Porcentaje (Input numerico, deshabilitado si "Saldo")
- Col 2: Vencimiento (Input date)
- Col 2: Boton Agregar

**Calculo automatico:**
- Si `input_mode === "percent"`: mostrar debajo `= $ {totalRequestClp * percent / 100}` y `UF {calculado}`
- Si `input_mode === "balance"`: calcular `remainingClp` (ya existe), mostrar `= $ {remainingClp}` y `UF {remainingClp / effectiveUf}`
- Si `input_mode === "clp"`: comportamiento actual, mostrar UF equivalente

**En `handleAddPayment`:**
- Si `percent`: `amountClp = totalRequestClp * parseFloat(amount) / 100`
- Si `balance`: `amountClp = remainingClp` (total - pagos existentes)
- Si `clp`: `amountClp = parseFloat(amount)` (actual)
- Luego convertir a UF: `amountUf = amountClp / effectiveUf`

**Condicion "Saldo":**
- Solo visible/seleccionable cuando `paymentPlans.length >= 1` (ya existe al menos un pago)

---

### 3. OCRequestDialog.tsx - Plan de Pagos en creacion

**Cambio en `PaymentPlanItem` interface:**
```text
interface PaymentPlanItem {
  description: string;
  amount: string;
  due_date: string;
  input_mode: "clp" | "percent" | "balance";
}
```

**Misma logica de 3 modos** en cada fila de pago:
- Agregar Select de tipo al lado del input de monto
- Si `percent`: calcular monto CLP desde el total del formulario (`parseFloat(form.amount)`)
- Si `balance`: calcular total - suma de pagos anteriores (solo idx > 0)
- El resumen de totales ya muestra `totalPlanned` vs `currentTotal` - mantener eso pero en CLP

**En `addPaymentItem`:**
```text
setPaymentPlan(prev => [...prev, { 
  description: `Pago ${prev.length + 1}`, 
  amount: "", 
  due_date: "", 
  input_mode: "clp" 
}]);
```

**En `handleCreate` (al guardar):**
- Para cada item del plan, resolver el monto real CLP segun su `input_mode`
- Convertir a UF para almacenar en `amount_uf`

---

### 4. Visualizacion de equivalencia UF

En ambos formularios, debajo del input de monto (o del calculo automatico), mostrar en texto pequeno muted:
- `= UF {monto_clp / uf_valor}` para que el usuario vea la equivalencia

---

### Archivos afectados

| Archivo | Cambios |
|---------|--------|
| `src/components/budget/OCRequestViewDialog.tsx` | Agregar `input_mode` al form, Select de tipo, logica de calculo %, saldo, y UF equivalente |
| `src/components/budget/OCRequestDialog.tsx` | Agregar `input_mode` a `PaymentPlanItem`, Select de tipo en cada fila, logica de calculo %, saldo |

