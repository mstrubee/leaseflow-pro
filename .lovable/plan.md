

## Cambios en "Ver/Editar Solicitud de OC" - Montos en Pesos y edicion inline

### 1. Todos los montos en Pesos ($) como principal

Cambiar todas las visualizaciones de montos en el dialogo para mostrar CLP como linea principal y UF como dato secundario (texto pequeno muted).

**Lugares afectados en `OCRequestViewDialog.tsx`:**

- **Resumen (lineas 646-652)**: "Monto Total" mostrara `$ amount_clp` como principal, `UF amount_uf` como secundario
- **Tabla de contratos (lineas 787-791)**: CLP principal, UF secundario en cada fila
- **Total asignado contratos (lineas 820-825)**: CLP principal
- **Lineas de presupuesto (linea 956)**: Convertir UF a CLP para mostrar
- **Resumen de pagos (lineas 1104-1123)**: Todos los totales en CLP, UF secundario
- **Tabla de pagos (linea 1150)**: Monto en CLP principal, UF secundario
- **Sugerencia "quedan sin planificar" (linea 1234)**: En CLP
- **Formulario agregar pago (linea 1203)**: Label "Monto ($)" en vez de "Monto (UF)"
- **Totales de FORMs (linea 1078)**: En CLP
- **Edicion de asignaciones (lineas 839, 929-939)**: Montos en CLP

### 2. Eliminar boton "Marcar como pagada"

Eliminar completamente el boton con icono `Check` que llama a `handleMarkPaid` (lineas 1158-1167). Se mantiene solo el boton de eliminar pago. La funcion `handleMarkPaid` (lineas 534-549) se puede dejar o eliminar.

### 3. Edicion inline con doble click en pagos

Reemplazar las celdas de texto estatico de la tabla de pagos (descripcion y monto) por celdas editables al hacer doble click:

**Nuevo estado:**
- `editingPaymentId: string | null` - ID del pago en edicion
- `editingPaymentField: "description" | "amount" | null` - campo en edicion
- `editingPaymentValue: string` - valor temporal

**Comportamiento:**
- Doble click en descripcion o monto de un pago: activa modo edicion mostrando un `Input` en la celda
- Enter o blur: guarda el cambio con update a `oc_payment_plans`
- Escape: cancela la edicion
- Solo funciona si `!readOnly && request.status === "pending"`
- El monto se edita en CLP; al guardar se convierte a UF usando `uf_value_at_entry` del request

### 4. Formulario "Agregar Pago" en CLP

- Cambiar label de "Monto (UF) *" a "Monto ($) *"
- El input de monto ahora acepta CLP
- Al guardar (`handleAddPayment`): convertir CLP a UF dividiendo por `ufValue` (o `request.uf_value_at_entry` si existe)
- Guardar `amount_uf` convertido en la base de datos

### Archivo afectado

| Archivo | Cambios |
|---------|--------|
| `src/components/budget/OCRequestViewDialog.tsx` | Montos en CLP, eliminar "marcar pagada", edicion inline doble click, formulario agregar pago en CLP |

### Detalles tecnicos

**Inline editing state:**
```text
editingPaymentId: string | null = null
editingPaymentField: "description" | "amount" | null = null  
editingPaymentValue: string = ""
```

**Double click handler:**
```text
onDoubleClick -> setEditingPaymentId(plan.id), setEditingPaymentField(field), setEditingPaymentValue(currentValue)
```

**Save inline edit:**
```text
Si field === "amount":
  amountClp = parseFloat(editingPaymentValue)
  amountUf = amountClp / ufValue
  update oc_payment_plans set amount_uf = amountUf where id = editingPaymentId
Si field === "description":
  update oc_payment_plans set description = editingPaymentValue where id = editingPaymentId
```

**Conversion helper para display:**
```text
formatCLP(plan.amount_uf * ufValue)  // linea principal
formatUF(plan.amount_uf)              // linea secundaria (texto muted pequeno)
```

