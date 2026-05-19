## Problema

En **Reportes → Gantt**, la tarjeta de cada contrato muestra "CAPEX Total" como `UF X / $Y`. Estos montos **no coinciden** con el total visible en *Control de Presupuesto* del contrato, porque cada vista calcula el CAPEX con su propia lógica replicada.

Hoy existen al menos **tres caminos paralelos** que calculan el mismo número (y por eso se desincronizan):

| Vista | Función | Considera template price | Considera surcharges/merged/ghosts | Considera supplier interno |
|---|---|---|---|---|
| `BudgetModule` (Control de Presupuesto) | `calculateGrandTotal` en `BudgetLineTree.tsx` | ✅ | ✅ | ✅ |
| `BudgetDashboard` (resumen CAPEX/OPEX) | `loadBudgetTypeSummary` (suma cruda `amount_uf`) | ❌ | ❌ | ❌ |
| `GanttReportsSection` (reporte global) | `getEffectiveAmount` local | ✅ | ❌ | ❌ |
| `CapexDashboard` | `getEffectiveUF` local | ❌ (no usa template) | ❌ | ❌ |

Para Antofagasta (393 m²) los tres dan números distintos (≈ 4981, ≈ 5046 y 5059 UF en mi verificación), y ninguno coincide con el 6981,36 UF que reporta el usuario en el detalle. Antes de tocar fórmulas hay que confirmar de qué pantalla viene esa cifra (puede haber recargo, arrastre u OPEX incluido).

Además, el usuario pide que el reporte muestre también **UF/m²** (eficiencia por superficie), métrica que ya existe en `BudgetModule` (`Total /m²`) pero no se replicó en el reporte.

## Cambios propuestos

### 1. Fuente única de verdad para CAPEX

Reutilizar las funciones ya existentes y probadas en `src/components/budget/BudgetLineTree.tsx`:

- `calculateGrandTotal(lines, templatePricesMap, ufValue, internalTransferSupplierIds)`
- `calculateAuthorizedTotal` / `calculateUnauthorizedTotal`

Estas funciones ya manejan `is_ghost`, `merged_into_line_id`, `is_surcharge`, `calc_type='percentage'`, conversión CLP→UF y exclusión de proveedores de transferencia interna.

### 2. `src/components/gantt/GanttReportsSection.tsx`

- Cargar las líneas igual que hoy, **más** los flags `is_ghost`, `merged_into_line_id`, `is_surcharge`, `supplier_id`.
- Construir el árbol con `buildTree` (ya disponible en `BudgetLineTree`).
- Construir `templatePricesMap` keyed por `line.id` (mismo formato que `BudgetModule`).
- Cargar `internal_transfer_supplier_ids` (mismo set usado en BudgetModule, si existe; si no, omitir).
- Calcular `capexUF = calculateGrandTotal(tree, templatePricesMap, ufValue, internalSet)`.
- Cargar `contracts.superficie_edificada_local` junto con los timelines.
- Mostrar en la tarjeta:
  ```
  CAPEX Total
  UF 5.046,68 / $203.927.204
  12,84 UF/m²
  ```
- Replicar el mismo cálculo y formato en `exportPDF` (líneas ~629 y ~663) y agregar la columna `UF/m²` en la tabla del PDF.

### 3. `src/components/budget/BudgetDashboard.tsx` (`loadBudgetTypeSummary`)

Hoy suma `amount_uf` crudo de hojas y se desalinea con el árbol. Reemplazar por:

- Cargar líneas con todos los campos requeridos por `getEffectiveAmount`.
- Construir árbol con `buildTree`.
- `authorized = calculateAuthorizedTotal(tree, templatePricesMap, ufValue, internalSet)`
- `unauthorized = calculateUnauthorizedTotal(tree, templatePricesMap, ufValue, internalSet)`

Esto asegura que la tarjeta superior de CAPEX/OPEX y el árbol muestren exactamente el mismo número.

### 4. `src/pages/CapexDashboard.tsx`

Mismo refactor: usar `calculateGrandTotal` / `calculateAuthorizedTotal` / `calculateUnauthorizedTotal` sobre el árbol, en lugar de la versión local `getEffectiveUF` que ignora `template_line_id`, `is_surcharge`, `is_ghost`, etc. Así el total por contrato del dashboard global cuadra con el del contrato.

### 5. Verificación

- Para Antofagasta, tras el cambio, los tres lugares (Control de Presupuesto, Reporte Gantt, CAPEX Dashboard) deben mostrar el **mismo** valor en UF y CLP, y el reporte además mostrar `X UF/m²`.
- Hacer un sanity-check con 2–3 contratos adicionales (uno con surcharges, uno con líneas en CLP) y registrar los valores en consola para comparar.

## Fuera de alcance

- No se modifica la lógica de OC, facturas ni semáforo.
- No se agregan nuevas columnas al PDF más allá de `UF/m²`.

## Duda para confirmar antes de implementar

En la base, el único presupuesto CAPEX de Antofagasta (año 2026) suma **5.046,68 UF** con la fórmula del árbol (≈ $203,9 MM), no los **6.981,36 UF / $282,1 MM** que mencionas. ¿Esa cifra de 6.981,36 UF la estás viendo en:

a) la tarjeta superior "CAPEX" del *Control de Presupuesto* del contrato,
b) el árbol de líneas (suma al pie),
c) el *CAPEX Dashboard* global, o
d) otro lugar (ej. una versión exportada antigua)?

Saberlo me permite confirmar que el refactor a `calculateGrandTotal` deja a Antofagasta efectivamente en 6.981,36 UF y no en 5.046,68 UF, o detectar si hay líneas faltantes (p. ej. surcharges no migrados) que también haya que recuperar.
