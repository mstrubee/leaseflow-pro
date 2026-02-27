

## Correccion sistematica: usar amount_clp almacenado en datos transaccionales

### Problema

Multiples componentes del sistema de presupuesto siguen usando `convertUFToPesos(amount_uf)` para mostrar montos de datos transaccionales (OC, facturas, notas de credito, solicitudes). Esto causa que los montos fluctuen con la UF del dia en vez de mostrar el valor real en Pesos registrado al momento de la creacion.

El campo `amount_clp` ya existe en todas las tablas relevantes (`purchase_orders`, `invoices`, `credit_notes`, `oc_requests`) pero no se consulta ni usa en varios lugares.

---

### Archivos afectados y cambios

**1. `src/components/budget/BudgetModule.tsx` - Detalle de linea (queries y display)**

- **Queries (lineas 816-846)**: Agregar `amount_clp, uf_value_at_entry` a los `.select()` de purchase_orders, invoices, credit_notes, y oc_requests en `handleViewLineDetails`
- **Interfaces (lineas 98-114)**: Agregar `amount_clp` a las interfaces de `lineDetailsOCs` y `lineDetailsRequests`
- **Display solicitudes (linea 1416)**: `convertUFToPesos(req.amount_uf)` a `req.amount_clp || convertUFToPesos(req.amount_uf)`
- **Display OC monto (linea 1438)**: Idem
- **Display facturas (linea 1466)**: Idem
- **Display notas credito (linea 1469, 1488)**: Idem
- **Totales facturado/neto (lineas 1424-1426, 1498, 1502, 1506)**: Sumar `amount_clp` en vez de `amount_uf` y no reconvertir

- **OC select en Invoice dialog (linea 1307)**: Agregar `amount_clp` a la query de lineOCs y usar `oc.amount_clp || convertUFToPesos(oc.amount_uf)` en display
- **lineOCs query (linea 83)**: Actualizar interfaz para incluir `amount_clp`

Crear un helper local `resolveClp` para fallback:
```text
const resolveClp = (rec: { amount_clp?: number | null; amount_uf: number }) => 
  rec.amount_clp || Math.round(convertUFToPesos(rec.amount_uf));
```

**2. `src/components/budget/InvoiceList.tsx` - Facturas y notas de credito**

- **Interfaces (lineas 19-38)**: Agregar `amount_clp: number | null` a `Invoice` y `CreditNote`
- **Queries**: Agregar `amount_clp` a todos los `.select()` que traen invoices y credit_notes
- **Display factura (linea 841)**: `convertUFToPesos(invoice.amount_uf)` a `invoice.amount_clp || convertUFToPesos(invoice.amount_uf)`
- **Display NC badge (linea 850)**: Idem con credit note
- **Display neto (linea 863)**: Calcular con CLP almacenado
- **Select factura en NC dialog (linea 1031)**: Idem

**3. `src/components/budget/PurchaseOrdersModule.tsx` - Confirmacion de eliminacion**

- **Linea 2029**: Cambiar `formatUF(deleteOrder?.amount_uf || 0)` a `formatCLP(deleteOrder?.amount_clp || convertUFToPesos(deleteOrder?.amount_uf || 0))` como monto principal

---

### Principio aplicado

- Datos **transaccionales** (OC, facturas, NC, solicitudes): siempre usar `amount_clp` almacenado. Fallback: `convertUFToPesos(amount_uf)` solo si `amount_clp` es null (datos legacy).
- Datos **de planificacion** (lineas de presupuesto): convertir con UF del dia (correcto, representan valor actual).
- UF siempre como dato secundario informativo.

