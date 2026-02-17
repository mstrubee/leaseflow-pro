

## Plan: Cantidad indexada a superficies del contrato en plantillas de presupuesto

### Objetivo
Permitir que cada linea de plantilla pueda definir su cantidad de dos formas:
1. **Manual**: el usuario escribe un valor fijo (comportamiento actual)
2. **Indexada a superficie**: la cantidad se obtiene automaticamente del campo de superficie del contrato al momento de aplicar la plantilla

### Cambios en base de datos

Agregar columna `quantity_source` a la tabla `budget_template_lines`:
- Tipo: `text`, nullable, default `null`
- Valores posibles:
  - `null` o `"manual"` = cantidad manual (comportamiento actual)
  - `"superficie_terreno"` = Terreno (m2)
  - `"superficie_showroom"` = Showroom (m2)
  - `"superficie_bodega_backoffice"` = Bodega & Backoffice (m2)
  - `"superficie_edificada_local"` = Edificada Local (m2, calculado)
  - `"superficie_exterior_cubierto"` = Exterior Cubierto (m2)
  - `"superficie_exterior_descubierto"` = Exterior Descubierto (m2, calculado)
  - `"num_estacionamientos"` = Estacionamientos (unidades)
  - `"metros_lineales_frente"` = Metros Lineales Frente (mL)

### Cambios en la interfaz (BudgetTemplateLineTree)

En la columna de **Cantidad** de cada linea hoja:
- Reemplazar el campo numerico por un selector que permita elegir entre:
  - **Valor manual**: muestra el input numerico actual
  - **Campo de superficie**: muestra un dropdown con las 8 opciones de superficie del contrato
- Cuando se selecciona un campo de superficie, la cantidad muestra una etiqueta como `[Terreno]` en vez de un numero, indicando que se resolvera al aplicar la plantilla
- El campo numerico de cantidad se oculta cuando hay una fuente indexada seleccionada

### Cambios en la logica de aplicacion (BudgetTemplateSelector)

En la funcion `applyBudgetTemplate`:
1. Recibir un parametro adicional `contractId`
2. Al encontrar una linea con `quantity_source` distinto de `null`/`"manual"`, consultar el campo correspondiente de la tabla `contracts` para obtener el valor de superficie
3. Usar ese valor como `quantity` en la linea del presupuesto creada

### Detalles tecnicos

```text
budget_template_lines
+-------------------+------+----------+
| quantity_source   | text | nullable |
+-------------------+------+----------+

Valores: null, "manual", "superficie_terreno", "superficie_showroom",
         "superficie_bodega_backoffice", "superficie_edificada_local",
         "superficie_exterior_cubierto", "superficie_exterior_descubierto",
         "num_estacionamientos", "metros_lineales_frente"
```

**Archivos a modificar:**
- `src/components/budget/BudgetTemplateLineTree.tsx`: agregar UI para seleccionar fuente de cantidad (manual vs campo de superficie), mostrar etiqueta visual cuando es indexada
- `src/components/budget/BudgetTemplateSelector.tsx`: actualizar `applyBudgetTemplate` y `updateBudgetTemplatePreservingValues` para resolver referencias de superficie desde el contrato
- `src/components/budget/BudgetTemplateManager.tsx`: pasar `quantity_source` en duplicacion de plantillas
- Migracion SQL: agregar columna `quantity_source`

**Interfaz del selector de cantidad:**
- Al hacer doble clic en la cantidad, se muestra un pequeno popover o dropdown con dos secciones:
  - "Manual" (input numerico)
  - "Desde superficie" (lista de campos disponibles)
- Cuando hay una fuente indexada, la celda muestra un badge con el nombre del campo (ej: `[Terreno m2]`) en lugar de un numero

