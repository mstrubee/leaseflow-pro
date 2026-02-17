
# Hacer el monto CAPEX opcional al crear un nuevo ano

## Problema actual
Al crear un CAPEX para un nuevo ano, el sistema exige un monto mayor a 0. Sin embargo, el monto puede definirse posteriormente desde la plantilla de presupuesto, por lo que no deberia ser obligatorio.

## Cambios a realizar

### Archivo: `src/components/budget/BudgetDashboard.tsx`

1. **Modificar la validacion en `handleCreateNewYear`** (linea 510-514): Eliminar la validacion que exige un monto mayor a 0. Permitir que `capexAmount` sea vacio o 0, en cuyo caso `amount_uf` se insertara como 0.

2. **Modificar el boton "Crear CAPEX"** (linea 1092): Eliminar la condicion `!capexAmount || parseFloat(capexAmount) <= 0` del `disabled`. El boton solo quedara deshabilitado mientras `creatingYear` sea true.

3. **Ajustar el mensaje de exito** (linea 549): Si el monto es 0, mostrar un mensaje como "Presupuesto CAPEX para {ano} creado (sin monto asignado)" en lugar de mostrar "con 0.00 UF".

---

### Detalle tecnico

```
handleCreateNewYear:
  - const numAmount = parseFloat(capexAmount) || 0;
  - Eliminar el bloque if (numAmount <= 0) { return; }
  - Mantener la conversion CLP->UF si numAmount > 0
  - Insertar amount_uf: amountUf (que sera 0 si no se ingreso monto)

Boton disabled:
  - Antes:  disabled={creatingYear || !capexAmount || parseFloat(capexAmount) <= 0}
  - Despues: disabled={creatingYear}
```

Esto permite crear el ano CAPEX sin monto y luego definirlo desde la plantilla o editando el presupuesto directamente.
