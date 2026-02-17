
# Plan: Corregir la logica de precios unitarios en el presupuesto

## Problema identificado

Los valores de `unit_price` en la tabla `budget_lines` estan **corruptos**. Durante la importacion desde la plantilla, se calculo incorrectamente `unit_price = amount_uf / quantity`, generando valores diminutos sin sentido. Por ejemplo:

- "Armado Gondolas Centrales": precio plantilla = 0.65 UF/m2, pero `unit_price` = 0.026 (0.65 / 25)
- "Pulido Radier": precio plantilla = 0.3 UF/m2, pero `unit_price` = 0.000584 (0.3 / 513.69)

El campo `amount_uf` en realidad guarda el precio unitario correcto (igual al `default_amount_uf` de la plantilla), NO el total.

La logica actual `localP > 0 ? localP : templateUnitPrice` siempre elige el valor corrupto porque es > 0.

## Solucion

### Paso 1: Corregir datos corruptos en la base de datos

Ejecutar una migracion SQL que resetee los `unit_price` corruptos. Para las lineas que tienen `template_line_id`, si el `unit_price` actual NO coincide con el `default_amount_uf` de la plantilla y el usuario NO ha editado manualmente el precio, se debe corregir:

```text
UPDATE budget_lines bl
SET unit_price = btl.default_amount_uf,
    amount_uf = btl.default_amount_uf  -- amount_uf = precio unitario de plantilla
FROM budget_template_lines btl
WHERE bl.template_line_id = btl.id
  AND btl.default_amount_uf > 0
  AND bl.unit_price != btl.default_amount_uf
  AND bl.unit_price > 0;
```

### Paso 2: Corregir la logica de importacion en BudgetModule.tsx

Al importar lineas desde una plantilla, asegurar que `unit_price` se establezca directamente como `default_amount_uf` (el precio unitario de la plantilla), sin dividir por cantidad.

### Paso 3: Corregir `amount_uf` para que sea el total real

Actualmente `amount_uf` almacena el precio unitario (copia de `default_amount_uf`). Despues de corregir `unit_price`, recalcular `amount_uf = quantity * unit_price` para que represente el total real de la linea.

### Paso 4: Simplificar la logica de display en BudgetLineTree.tsx

Una vez corregidos los datos:
- El precio unitario mostrado sera simplemente `line.unit_price` (ya correcto)
- El fallback a `templateUnitPrice` solo aplica cuando `unit_price` es 0 (linea nueva sin precio)
- Eliminar la dependencia excesiva de `templatePricesMap` para calculos de subtotales, ya que los precios estaran correctos en la linea misma

### Paso 5: Proteger ediciones futuras del usuario

- Cuando el usuario edita el precio unitario (doble clic), se guarda su valor en `unit_price`
- Se recalcula `amount_uf = quantity * unit_price` (total real)
- Este valor local prevalece sobre el de plantilla en todas las vistas

## Archivos a modificar

1. **Migracion SQL** -- Corregir datos existentes
2. **src/components/budget/BudgetModule.tsx** -- Corregir logica de importacion de plantilla
3. **src/components/budget/BudgetLineTree.tsx** -- Simplificar display y calculos con datos ya corregidos
4. **src/components/budget/BudgetDashboard.tsx** -- Alinear calculos del dashboard

## Detalles tecnicos

- `budget_template_lines.default_amount_uf` = precio unitario (ej: 0.3 UF/m2)
- `budget_lines.unit_price` = debe ser el precio unitario (igual a template o editado por usuario)
- `budget_lines.amount_uf` = debe ser el total (quantity x unit_price, convertido a UF si es CLP)
- La conversion a CLP se muestra debajo del precio unitario en texto pequeno
