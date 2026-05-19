## Problema

En el listado de contratos, la columna "Costo Arriendo" usa `calculateWeightedAverageTotalArriendo` cuando el contrato tiene múltiples periodos (escalonamientos/reajustes) y muestra el **promedio ponderado** en la moneda de presentación del contrato (`display_currency`, CLP o UF).

El PDF (y Excel) usan otra ruta: `calculateTotalArriendoUF` con la versión vigente "punto en el tiempo", siempre en UF. Por eso para muchos contratos el monto no coincide con el que el usuario ve en pantalla.

## Cambios

### 1. `src/components/contracts/ContractsTablePDF.tsx` — case `"costo_arriendo"`

Replicar la lógica de la tabla (`ContractsTable.tsx` líneas ~1090‑1165):

- Calcular `gastosComunesTotal` con la misma rama `percentage` vs `uf_m2` (incluyendo tope, `hasExtended`, ml de frente, kwh, adicional admin, fixed admin UF).
- Llamar a `calculateWeightedAverageTotalArriendo` para obtener `{ promedio, hasMultiplePeriods }`.
- Calcular `currentRentVal2` con `calculateCurrentRent` para obtener el canon actual.
- Total mostrado:
  - Si `hasMultiplePeriods`: `promedio` con sufijo "Promedio (incluye GGCC, FP y Otros)".
  - Si no: `currentRentVal2 + gastosComunesTotal + fondoP + otros`, con desglose Canon / GC / F. Prom / Otros.
- Usar `contract.display_currency` con un helper `formatAmount` equivalente (CLP con separador miles + "$"; UF con 2 decimales + " UF") en lugar de forzar UF.

### 2. `src/components/contracts/ContractsTableExcel.ts` — case `"costo_arriendo"`

Aplicar el mismo cálculo (promedio ponderado + display_currency) para que el Excel también coincida con el listado.

### 3. Pasar `display_currency` en el tipo `Contract` de ambos archivos

Añadir el campo opcional `display_currency?: "CLP" | "UF" | null` a las interfaces locales `Contract` en `ContractsTablePDF.tsx` y `ContractsTableExcel.ts`. Los datos ya vienen en `filteredContracts` desde `Contracts.tsx`.

### 4. Helper compartido

Extraer `formatAmount(value, currency, ufValue?)` a `src/lib/contractRent.ts` (o nuevo archivo `src/lib/contractAmount.ts`) para evitar duplicación entre tabla, PDF y Excel.

## Fuera de alcance

- No se cambia la lógica del listado en `ContractsTable.tsx`.
- No se modifican otras columnas del PDF (categoría, venta estimada, etc.) salvo que el usuario lo pida.
- No se tocan edge functions, RLS ni datos.

## Resultado

El PDF y el Excel mostrarán exactamente el mismo monto de "Costo Arriendo" que se ve en la tabla del listado, en la misma moneda y con el mismo desglose, sin depender de cálculos distintos por contrato.
