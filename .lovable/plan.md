

## Lineas Calculadas por Porcentaje en Plantillas de Presupuesto

### Objetivo
Agregar la capacidad de crear lineas de tipo "porcentaje" en las plantillas CAPEX/OPEX. Estas lineas calculan su valor como un porcentaje del subtotal de otra linea madre configurable. Casos de uso principales: **Gastos Generales** y **Utilidades**.

### Ejemplo de uso
```text
Obras Civiles (linea madre)
  ├── Demoliciones        = 100 UF
  ├── Albañileria         = 200 UF
  └── Instalaciones       = 150 UF
  Subtotal Obras Civiles  = 450 UF

Gastos Generales (% de Obras Civiles, 10%)  = 45 UF
Utilidades (% de Obras Civiles, 8%)         = 36 UF
```

Las lineas calculadas son lineas raiz (mismo nivel que "Obras Civiles"), cada una referencia a la linea madre fuente y almacena el porcentaje. El calculo es siempre: **Subtotal de la linea fuente * porcentaje / 100**.

---

### 1. Migracion de Base de Datos

Agregar 3 columnas a **`budget_template_lines`**:
- `calc_type` TEXT (null = linea normal, `'percentage'` = linea calculada por porcentaje)
- `calc_source_line_id` UUID (FK a `budget_template_lines`, nullable) -- la linea madre de referencia
- `calc_percentage` NUMERIC (nullable) -- el porcentaje a aplicar

Agregar 3 columnas equivalentes a **`budget_lines`**:
- `calc_type` TEXT (nullable)
- `calc_source_line_id` UUID (FK a `budget_lines`, nullable) -- referencia a la linea madre en el presupuesto real
- `calc_percentage` NUMERIC (nullable)

### 2. Interfaz de Plantilla (`BudgetTemplateLineTree.tsx`)

Modificar la interfaz `TemplateLine` para incluir los 3 nuevos campos.

Para lineas **sin hijos** (hojas) que tengan `calc_type = 'percentage'`, cambiar la visualizacion:
- En lugar de los campos normales (cantidad, unidad, precio), mostrar:
  - Un selector de "Linea fuente" (dropdown con las lineas madre raiz de la plantilla)
  - Un campo de porcentaje (input numerico con sufijo "%")
  - El total calculado en tiempo real basado en el subtotal de la fuente seleccionada

Para configurar una linea como calculada:
- Agregar una opcion en el menu de acciones o un toggle que marque la linea como `calc_type = 'percentage'`
- Al activar, ocultar campos de cantidad/precio y mostrar selector de fuente + porcentaje

### 3. Aplicacion de Plantilla (`BudgetTemplateSelector.tsx`)

Al aplicar una plantilla a un presupuesto:
1. Crear todas las lineas normales como actualmente
2. Para lineas con `calc_type = 'percentage'`:
   - Mapear `calc_source_line_id` del template al nuevo ID en `budget_lines` usando el `idMap` existente
   - Calcular `amount_uf` = subtotal de la linea fuente en el presupuesto * `calc_percentage` / 100
   - Guardar `calc_type`, `calc_source_line_id` (mapeado), y `calc_percentage`

Al actualizar plantilla (preservando valores):
- Las lineas calculadas se recalculan automaticamente, no preservan valores del usuario

### 4. Visualizacion en Presupuesto Real (`BudgetLineTree.tsx`)

Para lineas con `calc_type = 'percentage'` en el presupuesto:
- Mostrar el porcentaje y la linea fuente referenciada
- El monto se recalcula automaticamente cuando cambian los valores de la linea fuente
- Marcar visualmente la linea como "calculada" (por ejemplo, con un badge o icono de porcentaje)

### 5. Exportacion Excel (`BudgetModule.tsx`)

En la exportacion Excel, las lineas calculadas se incluyen normalmente mostrando su monto calculado, sin cambios especiales necesarios.

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| Migracion SQL | Agregar columnas a `budget_template_lines` y `budget_lines` |
| `BudgetTemplateLineTree.tsx` | Interfaz para configurar lineas calculadas (fuente + porcentaje) |
| `BudgetTemplateManager.tsx` | Propagar los nuevos campos en duplicacion de plantilla |
| `BudgetTemplateSelector.tsx` | Logica de aplicacion/actualizacion con calculo de porcentajes |
| `BudgetLineTree.tsx` | Visualizacion de lineas calculadas en presupuesto real |
| `BudgetModule.tsx` | Soporte en carga de datos y recalculo |

### Detalle tecnico del calculo

```text
Para cada linea con calc_type = 'percentage':
  1. Encontrar la linea fuente por calc_source_line_id
  2. Calcular subtotal de la fuente (suma recursiva de hijos)
  3. amount_uf = subtotal * calc_percentage / 100
  4. Este valor se actualiza en tiempo real en la UI
  5. Al guardar/autorizar, se persiste el monto calculado
```
