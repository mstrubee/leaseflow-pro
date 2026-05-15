## Diagnóstico

Comparé los datos del contrato **Melipilla (2026)** entre el listado de contratos (columna CAPEX) y el dashboard del módulo Presupuesto. Los montos no son iguales **a propósito**: cada vista usa una fórmula distinta. Pero hay inconsistencias reales que conviene corregir.

### Datos reales en BD (año 2026)

- 1 presupuesto CAPEX (sin presupuesto OPEX), 27 líneas activas (0 eliminadas).
- Líneas hoja autorizadas: **2.117,44 UF** (13 en CLP por 46.011.893 + 7 en UF por 962,37).
- Líneas hoja "no autorizado": **188,24 UF**.
- Total UF en líneas (autorizadas + no autorizadas): **2.305,68 UF**.
- 18 órdenes de compra activas: 12 CAPEX (50.685.318 CLP) + 6 OPEX (7.028.815 CLP).
- 21 facturas activas asociadas.

### Por qué no cuadra

| Vista | Qué suma | Cómo lo calcula |
|---|---|---|
| Columna **CAPEX** del listado de contratos | Líneas hoja **autorizadas + no autorizadas** | Usa el `amount_uf` ya guardado |
| Dashboard → "Total Presupuesto" | Líneas hoja **solo autorizadas** + **OCs OPEX del año** | Recalcula `cantidad × precio_unitario` y convierte con la UF **actual** |

Tres causas concretas del descuadre:

1. El dashboard **excluye las líneas "no autorizado"** (188,24 UF) que sí aparecen en la columna del listado.
2. El dashboard **suma las OCs OPEX** (7.028.815 CLP) al "Total Presupuesto", aunque no exista presupuesto OPEX cargado.
3. El dashboard **recalcula CLP con la UF de hoy** (`qty × precio` y luego × UF actual), mientras que la columna del listado usa el `amount_uf` congelado al momento de cargar la línea (con la UF de ese día). Si la UF cambió, los CLP cambian.

Resultado verificado para Melipilla (2026):
- Columna del listado: 2.305,68 UF (autorizado + no autorizado).
- Dashboard "Total Presupuesto" ≈ 46.011.893 (CLP autorizado) + 962,37 × UF_actual + 7.028.815 (OPEX OCs) ≈ **91.863.541 CLP** ✅ (calza con el valor visible).

### OCs y facturas visibles

- Las **18 OCs** y **21 facturas** del año están todas presentes en BD.
- La consulta del dashboard (`loadBudgetTypeTotals`) las trae correctamente filtrando por `contract_id`, `year` y `deleted_at IS NULL`, separando CAPEX vs OPEX según `budget_classification`, `budget_line_id`, `opex_master_id`/`opex_category_id`. OCs sin clasificación caen en CAPEX por defecto (1 caso: OC 4900041003).
- No detecté OCs ni facturas perdidas u ocultas.

## Propuesta de corrección

Para que la columna CAPEX del listado y el dashboard hablen el mismo idioma, propongo unificar la definición de "Presupuesto CAPEX" así:

1. **Definición única (autorizado del CAPEX, en UF guardado):**
   - Cambiar el dashboard `loadBudgetTypeSummary` para usar `amount_uf` guardado (igual que la columna del listado), filtrando por `deleted_at IS NULL`. Esto elimina el efecto de la UF actual y de discrepancias de `qty × precio` vs `amount_uf`.
   - Cambiar la columna del listado para mostrar solo **autorizado** (excluir "no autorizado"), y opcionalmente un tooltip con el "no autorizado" aparte.

2. **Renombrar/separar tarjeta del dashboard:**
   - "Total Presupuesto" hoy mezcla CAPEX autorizado con OCs OPEX. Renombrarla a **"Presupuesto CAPEX + Gasto OPEX del año"** o, mejor, dividirla en dos métricas (CAPEX autorizado y OPEX comprometido) para que no se confunda con un "presupuesto" puro.

3. **Mostrar la UF de referencia** al lado de los montos CLP en el dashboard, para que el usuario entienda cómo se convirtió.

## Cambios técnicos concretos

- `src/components/budget/BudgetDashboard.tsx`
  - `loadBudgetTypeSummary`: reemplazar el cálculo `qty × unit_price (+ template fallback + conversión UF)` por `SUM(amount_uf)` de líneas hoja activas, agrupado por `status`. Filtrar `deleted_at IS NULL`.
  - Tarjeta "TOTAL GENERAL": separar el monto en dos líneas (Presupuesto CAPEX autorizado y OCs OPEX del año), o renombrar la etiqueta.
- `src/components/contracts/ContractsTable.tsx`
  - Mostrar solo `authorized` UF en la columna CAPEX. Dejar el `unauthorized` como tooltip o segunda línea pequeña.

¿Procedo con esta unificación, o prefieres que solo deje el dashboard alineado a la columna del listado (sin tocar la columna)?