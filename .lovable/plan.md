# Business Case Financiero por Contrato

Crear una nueva función dentro de la sección de contrato que genere un **Business Case financiero visual**, replicando el modelo del archivo `Tipo.xlsx`. Es una feature in-app (no un "skill"): un skill solo serviría si quisieras que yo genere estos archivos en el chat repetidamente; para un botón que usan los usuarios, lo correcto es construirlo como feature.

## Qué se construye

1. **Botón nuevo** "Business Case Financiero" en el header del contrato, junto al botón actual "Business Case" (que seguirá siendo la galería de imágenes). Abre un diálogo a pantalla casi completa.

2. **Formulario de entrada** con autocompletado desde el contrato + edición por admin:
   - Autollenado: Nombre, Dirección, Comuna, Empresa, Superficie (m²), Canon (UF), Gastos Comunes, plazo (años), garantía, fecha inicio/gracia.
   - Editables por admin: Ventas proyectadas (venta/mes por año), Margen directo %, Inventario, Inversiones (Habilitación, Mobiliario, Tecnología, Marketing en CLP), tasa de descuento, bases de gastos (Personal, Generales, Tecnología, Ocupación, Publicidad), depreciación, impuesto %, UF proyectada por año.
   - **Todos los valores calculados también son editables** (override manual "en caso de errores"), guardando el override.
   - Sección "Otros" para campos extra que defina el admin.

3. **Motor de cálculo** (módulo TS puro) que reproduce el Excel: P&L años 0–5, Margen de contribución, GAVs, EBITDA, Depreciación, EBIT, Impuesto, UDI, Capex, Flujo operativo, **TIR (IRR), VAN (NPV), Payback, Capital empleado, Rentabilidad**.

4. **Panel visual** con: tarjetas KPI (TIR, VAN, Payback, EBITDA año estable, Inversión total, Canon), tabla P&L proyectada, y gráficos (ventas/EBITDA por año, flujo acumulado/payback, composición de inversión).

5. **Exportación**: botón PDF (panel visual en una hoja apaisada) y botón Excel (mismo formato de hojas Datos / Resumen business case).

6. **Persistencia**: tabla nueva por contrato que guarda inputs, overrides y resultados; se recalcula al abrir y se puede guardar.

## Modelo financiero (resumen)

Unidades en MM CLP. Año 1 opera meses parciales según fecha de apertura (gracia).
- Canon UF = Superficie × Valor UF/m² (o canon directo del contrato).
- Ingresos = venta/mes × meses operativos del año.
- Costo de ventas = Ingresos × (1 − Margen directo%); + Otros costos directos y Costos variables (% de ingresos).
- Margen de contribución = Ingresos − costos.
- GAVs = Personal + Publicidad + Generales + Tecnología + Ocupación + Canon (UF×UF del año) + Gasto común.
- EBITDA = Margen − GAVs; EBIT = EBITDA − Depreciación; Impuesto = EBIT×27% (si >0); UDI = EBIT − Impuesto.
- Capex año 0 = −(Habilitación + Mobiliario + Inventario + Tecnología + Marketing).
- Flujo operativo = UDI + Depreciación; año 0 = Capex.
- TIR = IRR(flujos); VAN = NPV(tasa, flujos); Payback = año en que el acumulado cruza 0.
- UF proyectada por año seedeada desde el indicador UF actual (cache de la app), crecimiento editable (~3,4%/año).

## Detalles técnicos

**Base de datos (migración):**
- Tabla `contract_business_cases`: `contract_id` (único, FK contracts), `inputs jsonb`, `overrides jsonb`, `computed jsonb`, `created_by`, timestamps.
- GRANTs a `authenticated` y `service_role`; RLS: ver/crear/editar para usuarios con permiso de contratos o admin (mismo patrón que las tablas hijas de contratos). Trigger `updated_at`.

**Frontend:**
- `src/lib/businessCase/calc.ts` — motor de cálculo puro + IRR/NPV.
- `src/lib/businessCase/exportPDF.ts` y `exportExcel.ts` — reusan jsPDF y la librería `xlsx` ya presentes en el proyecto (Gantt/KPI exports).
- `src/components/contracts/BusinessCaseFinanciero/` — diálogo, formulario, panel KPI, tabla P&L, gráficos (recharts).
- `src/hooks/useBusinessCase.ts` — cargar/guardar por contrato, autollenado desde el contrato.
- Botón nuevo en `src/pages/ContractDetail.tsx`.

**Sin IA por ahora** (según tu elección). El motor es 100% determinístico; si más adelante quieres que Gemini redacte el resumen ejecutivo o la ficha de mercado, se agrega como paso opcional.

**Moneda:** se respeta el estándar del proyecto (CLP primario, UF secundaria) en la presentación de los KPIs.

## Validación
- Cargar el contrato actual, comprobar autollenado y que TIR/VAN/Payback coincidan con la lógica del Excel usando los datos de ejemplo (TIR ≈ 47%, VAN ≈ 331, Payback año 3).
- Verificar export PDF y Excel (QA visual del PDF).
