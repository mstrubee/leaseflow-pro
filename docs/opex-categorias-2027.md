# OPEX: categorías por año (renombrar, fusionar y retirar desde 2027)

Regla de negocio: toda la nueva definición de categorías OPEX (renombrar, fusionar, retirar) rige **solo desde 2027**.
El año 2026 no se toca: sus OC, presupuestos y reportes conservan las categorías y los nombres de hoy.

## Cómo funciona

1. **Planificar** (`Planificar Presupuesto 2027` en `/opex`, pestaña "Por categoría", solo ADMIN):
   - Marcar 2 o más categorías y **Fusionar** (destino: una existente o un nombre nuevo).
   - Lápiz = **Renombrar** (una fusión de una sola categoría hacia un nombre nuevo).
   - Papelera = **Retirar** (nunca se borra la categoría). Si tiene OPEX agregado o presupuesto 2027, la pantalla pide a
     qué categoría pasarlos (eso es una fusión).
   - La tabla muestra la categoría final sumando OC 2026, promedio, propuesta base y OPEX agregado de las originales.
   - **Buscador por nombre** sobre la tabla (sin distinguir tildes ni mayúsculas; todas las palabras, en cualquier
     orden). Muestra todos los resultados. La selección es acumulada: lo marcado se conserva al cambiar la búsqueda
     y se ve como etiquetas sobre la tabla (con opción de quitar o limpiar). El destino de una fusión o retiro también
     se elige con un selector con búsqueda.
   - "Cambios de categorías 2027" lista por separado las **fusiones y renombres** (una fila por categoría final, con
     todas las categorías que la forman) y los **retiros**.
   - **Editar una fusión** (botón "Editar"): cambiar el nombre de la categoría final (solo si la creó la fusión; una
     categoría que ya existía no se renombra, porque su nombre también rige para 2026), quitar categorías y agregar otras
     con búsqueda. La fusión debe conservar al menos una categoría. "Deshacer" en una fusión la deshace completa (primero
     los lotes que solo agregaron categorías y al final el que creó la categoría final).
   - Cada cambio se puede **deshacer** mientras no se haya ejecutado "Aplicar categorías 2027".
2. **Cierre de 2026** (`OpexCloseYear`, sin cambios de lógica): copia `opex_master_budget` a 2027 y crea
   `opex_local_additional` 2027 por los montos no facturados, **con las categorías antiguas**.
3. **Aplicar categorías 2027** (botón en la planificación, ADMIN, después del cierre): una sola función de base de datos
   (`apply_opex_category_mappings`, todo o nada) que pasa las filas de 2027 a la categoría nueva sumando las fusionadas
   (respeta `UNIQUE(year, category_id)` y `UNIQUE(contract_id, year, category_id)`), mueve el OPEX agregado de la
   planificación, agrega los vínculos proveedor–categoría nuevos (conserva los antiguos) y marca `applied_at`.
   - Se puede ejecutar más de una vez sin riesgo: solo procesa lo que aún no se aplicó.
   - **No modifica ninguna OC.** Solo informa cuántas OC de 2027 siguen con una categoría que cambió.
   - Se niega si una categoría retirada **sin destino** conserva montos en 2027 (por ejemplo, copiados por el cierre).
     La pantalla ofrece "Fusionar con..." (deshace el retiro y fusiona).
   - Exige que 2026 esté cerrado (las filas de 2027 las crea el cierre).
4. Con `applied_at` en cualquier cambio de 2027, **fusionar, renombrar, retirar y deshacer quedan bloqueados** para ese año.

Mientras no se aplique, la planificación muestra un aviso. También hay un aviso (solo visual) en la pantalla de cierre del año
y en "Por categoría" si hay categorías retiradas sin destino que tienen presupuesto 2026 y recibirán presupuesto al cerrar.

## Base de datos (`supabase/migrations/20261020120000_opex_category_changes_2027.sql`)

- `opex_categories.valid_from_year` / `valid_to_year` (NULL = sin límite). "Eliminar" = `valid_to_year = 2026`.
- `opex_category_mappings` (lote, año, categoría antigua, categoría nueva o NULL si se retira, `applied_at`).
- Funciones `merge_opex_categories`, `retire_opex_category`, `undo_opex_category_change`,
  `apply_opex_category_mappings`, `update_opex_category_merge` (editar una fusión; migración
  `20261021120000_opex_category_merge_edit.sql`); ayudas internas `opex_first_category_year` (2027), `opex_assert_category_year_open`,
  `opex_lock_sources_for_change`. Todas **SECURITY INVOKER**; `REVOKE` de PUBLIC y anon, `GRANT` a authenticated.
- Trigger `trg_po_opex_category_year` en `purchase_orders`: una OC solo puede usar categorías vigentes en el **año de su
  fecha de OC** (`order_date`). En UPDATE solo valida si cambian de verdad la categoría o la fecha, así una OC anterior
  a una fusión se puede seguir editando (por ejemplo, para agregar una factura). El mensaje de error está en español.
- Orden de aplicación: `20261016120000` (plan items) → `20261016180000` (exclusiones) → `20261020120000` (categorías por año) → `20261021120000` (editar fusiones).

### Cómo aplicarlo (orden exacto, en el proyecto Supabase `ilcumthwzhmtumaklgvo`)

1. **Respaldo** (SQL Editor): copia las tablas afectadas a un esquema aparte y compara los conteos. Además, confirmar en
   Database → Backups que hay un backup automático de las últimas 24 horas.
   ```sql
   CREATE SCHEMA IF NOT EXISTS backup_20261020;
   CREATE TABLE backup_20261020.opex_categories AS TABLE public.opex_categories;
   CREATE TABLE backup_20261020.opex_master_budget AS TABLE public.opex_master_budget;
   CREATE TABLE backup_20261020.opex_local_additional AS TABLE public.opex_local_additional;
   CREATE TABLE backup_20261020.opex_budget_plan_items AS TABLE public.opex_budget_plan_items;
   CREATE TABLE backup_20261020.supplier_opex_categories AS TABLE public.supplier_opex_categories;
   CREATE TABLE backup_20261020.purchase_orders AS TABLE public.purchase_orders;
   ```
2. SQL de exclusiones: `20261016180000_opex_plan_exclusions.sql`.
3. SQL de categorías: `20261020120000_opex_category_changes_2027.sql`.
4. Consulta de verificación: los valores esperados van en el nombre de cada columna (`__esperado_N`).
5. Recién entonces, merge del código a `migration`.

Consulta de verificación:
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'opex_categories'
     AND column_name IN ('valid_from_year', 'valid_to_year')) AS columnas_vigencia__esperado_2,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'opex_budget_plan_items'
     AND column_name = 'excluded_at') AS excluded_at__esperado_1,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
     AND table_name IN ('opex_category_mappings', 'opex_budget_plan_exclusions')) AS tablas_nuevas__esperado_2,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('opex_category_mappings', 'opex_budget_plan_exclusions', 'opex_budget_plan_items')
       AND c.relrowsecurity) AS tablas_con_rls__esperado_3,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('merge_opex_categories', 'retire_opex_category', 'undo_opex_category_change',
       'apply_opex_category_mappings', 'opex_assert_category_year_open', 'opex_lock_sources_for_change',
       'opex_first_category_year', 'check_po_opex_category_year')) AS funciones__esperado_8,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef AND p.proname IN ('merge_opex_categories', 'retire_opex_category',
       'undo_opex_category_change', 'apply_opex_category_mappings', 'opex_assert_category_year_open',
       'opex_lock_sources_for_change', 'opex_first_category_year', 'check_po_opex_category_year')) AS security_definer__esperado_0,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_po_opex_category_year' AND NOT tgisinternal) AS trigger__esperado_1,
  has_function_privilege('anon', 'public.merge_opex_categories(integer,uuid[],uuid,text)', 'EXECUTE') AS anon_puede_fusionar__esperado_false,
  has_function_privilege('authenticated', 'public.merge_opex_categories(integer,uuid[],uuid,text)', 'EXECUTE') AS authenticated_puede_fusionar__esperado_true,
  (SELECT count(*) FROM public.opex_categories WHERE valid_from_year IS NOT NULL OR valid_to_year IS NOT NULL) AS categorias_con_vigencia__esperado_0,
  (SELECT count(*) FROM public.opex_category_mappings) AS cambios_registrados__esperado_0;
```

Verificación de `20261021120000` (editar fusiones; el valor esperado va en cada fila):
```sql
WITH checks(orden, revision, esperado, obtenido) AS (
  VALUES
  (1, 'Función update_opex_category_merge creada', '1',
     (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'update_opex_category_merge')),
  (2, 'Con permisos de creador (SECURITY DEFINER)', '0',
     (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'update_opex_category_merge' AND p.prosecdef)),
  (3, 'Usuarios sin sesión (anon) pueden usarla', 'false',
     has_function_privilege('anon', 'public.update_opex_category_merge(integer,uuid,text,uuid[],uuid[])', 'EXECUTE')::text),
  (4, 'Usuarios con sesión (authenticated) pueden usarla', 'true',
     has_function_privilege('authenticated', 'public.update_opex_category_merge(integer,uuid,text,uuid[],uuid[])', 'EXECUTE')::text)
)
SELECT orden, revision, esperado, obtenido,
       CASE WHEN esperado = obtenido THEN '✅ OK' ELSE '⚠️ REVISAR' END AS resultado
FROM checks
ORDER BY orden;
```

### Reversión

Solo si **no hay cambios de categorías activos** (si los hay, primero deshacerlos desde la app; si ya se aplicaron, no hay
vuelta atrás automática porque las filas de 2027 quedaron sumadas: restaurar desde el respaldo).
```sql
DROP FUNCTION IF EXISTS public.update_opex_category_merge(INTEGER, UUID, TEXT, UUID[], UUID[]);  -- solo si se aplicó 20261021120000
DROP TRIGGER IF EXISTS trg_po_opex_category_year ON public.purchase_orders;
DROP FUNCTION IF EXISTS public.check_po_opex_category_year();
DROP FUNCTION IF EXISTS public.apply_opex_category_mappings(INTEGER);
DROP FUNCTION IF EXISTS public.undo_opex_category_change(UUID);
DROP FUNCTION IF EXISTS public.retire_opex_category(INTEGER, UUID);
DROP FUNCTION IF EXISTS public.merge_opex_categories(INTEGER, UUID[], UUID, TEXT);
DROP FUNCTION IF EXISTS public.opex_lock_sources_for_change(INTEGER, UUID[]);
DROP FUNCTION IF EXISTS public.opex_assert_category_year_open(INTEGER);
DROP FUNCTION IF EXISTS public.opex_first_category_year();
DROP TABLE IF EXISTS public.opex_category_mappings;
ALTER TABLE public.opex_categories DROP COLUMN valid_from_year, DROP COLUMN valid_to_year;
-- y, si también se revierten las exclusiones de líneas:
DROP TABLE IF EXISTS public.opex_budget_plan_exclusions;
ALTER TABLE public.opex_budget_plan_items DROP COLUMN excluded_at;
```

## Dónde se filtran las categorías por año

| Pantalla | Qué año usa |
|---|---|
| OC: crear y editar (`PurchaseOrdersModule`) | año de la fecha de la OC (más la categoría actual de la OC) |
| OC: edición en `PurchaseOrdersDashboard` | año de la fecha de la OC (más la actual) |
| Orden centralizada (`CentralizedOrderCreator`) | año de la fecha de la OC del formulario |
| Conversión de solicitudes (`ConvertOCRequestDialog`) | año de hoy (la OC se crea con la fecha de hoy) |
| Proveedores (`OpexCategoryMultiSelect`) | año actual (más las categorías que el proveedor ya tiene) |
| Plantilla Excel de presupuesto | año de la plantilla |
| Carga Excel de presupuesto (`OpexExcelUpload`, `OpexCreateDialog`) | año del presupuesto: un nombre antiguo se carga en su categoría nueva (sumando filas que caen en la misma); una categoría retirada se rechaza antes de escribir |
| Filtros y reportes de OC | todas las categorías (el histórico conserva los nombres antiguos) |

Si la base rechaza una OC por categoría no vigente, las pantallas de OC muestran el mensaje en español
(`error.message`). En la carga Excel de OC (`BulkOCImport`) el Excel no trae categoría, pero un reemplazo que cambie la
fecha de una OC con categoría retirada puede ser rechazado: ahora se avisa con ese mensaje (antes solo iba a la consola).

## Tres definiciones distintas del "año de una OC" (documentado, no se cambió)

| Campo | Quién lo usa |
|---|---|
| `purchase_orders.created_at` | `OpexCloseYear` (arrastre de saldos no facturados: filtra por el año de `created_at`) |
| `purchase_orders.year` | dashboard `/opex`, consumos, `MasterBudgetTable` y la ventana de planificación |
| `purchase_orders.order_date` | esta regla de categorías (trigger y selectores de OC) |

No siempre coinciden: hay OC con `year = 2026` y `order_date` de diciembre de 2025, y las cargas masivas se crearon
(`created_at`) en febrero y agosto de 2026 con fechas de OC distintas. Consecuencias a tener presente:

- Una OC con `year = 2027` pero `order_date` de diciembre de 2026 usa categorías de 2026 (por su fecha) y cuenta en el
  presupuesto 2027 (por su año). Tras aplicar, la categoría puede ya no existir en 2027: "Aplicar" informa cuántas OC
  de 2027 quedan con una categoría que cambió (`purchase_orders_with_old_category`) y no las modifica.
- El arrastre del cierre de 2026 usa `created_at`, no `order_date` ni `year`; no se cambió en este trabajo.

### Propuesta (pendiente): unificar el "año de la OC"

**Decisión (2026-10-20): por ahora no se unifica; se decide después del cierre 2026.** Propuesta preliminar para esa
conversación: usar **`order_date`** como único criterio ("año de la OC = año de su fecha de OC"), porque es lo que ve el
usuario en la OC y coincide con la regla de categorías y con el trigger.

Qué implicaría:

1. **Diagnóstico previo (solo lectura):** cuántas OC tienen `year` distinto del año de `order_date`, cuántas no tienen
   fecha y por qué monto, para decidir con datos.
   ```sql
   SELECT year AS year_campo, extract(year FROM order_date)::int AS year_fecha,
          count(*) AS oc, round(sum(coalesce(amount_clp, 0))) AS monto_clp
   FROM public.purchase_orders
   WHERE deleted_at IS NULL AND (order_date IS NULL OR year IS DISTINCT FROM extract(year FROM order_date)::int)
   GROUP BY 1, 2 ORDER BY 1, 2;
   ```
2. **Base de datos:** `purchase_orders.year` pasaría a derivarse de `order_date` (trigger o columna generada) o se dejaría
   de usar. Las OC sin fecha necesitan una regla (hoy dependen de `year`).
3. **Código:** cambiar los filtros por `year` de OC (alrededor de 14 archivos leen `purchase_orders` y filtran por
   `.eq("year", …)`: dashboard `/opex`, consumos, `MasterBudgetTable`, planificación, CAPEX, etc.; hay que revisar cuáles
   filtran realmente OC) a un rango de `order_date`, y `OpexCloseYear` de `created_at` a `order_date`.
4. **Efecto en cifras:** las OC con `year` ≠ año de su fecha cambian de año en reportes y presupuestos (por ejemplo, las
   OC de diciembre de 2025 con `year = 2026` pasarían a 2025), y el arrastre del cierre dejaría de depender de cuándo se
   cargó la OC (hoy las cargas masivas de febrero y agosto de 2026 cuentan por `created_at`). Los totales históricos ya
   comparados o cerrados cambiarían: requiere OK explícito de Matias.
5. **Momento:** después del cierre 2026, para no alterar el arrastre en curso. Orden sugerido: diagnóstico → decisión →
   migración de datos y trigger → cambio de pantallas → cierre 2027 ya con el criterio nuevo.

Alternativa más liviana: dejar `year` como "año presupuestario" explícito y alinear la regla de categorías (trigger y
selectores) a `year` en vez de `order_date`. Cambia menos datos, pero la fecha visible de una OC puede contradecir su año
presupuestario.

## Limitaciones conocidas

- Los cambios solo se hacen sobre el año planificado (hoy 2027). Cambios para años siguientes se harán desde la
  planificación de ese año.
- "Fusionar con..." sobre una retirada con montos son dos llamadas (deshacer el retiro y fusionar): si la segunda falla,
  la categoría queda vigente de nuevo, sin pérdida de datos.
- La renombrada global de `OpexCategoryManager` sigue cambiando el nombre en todos los años; usarla solo para corregir errores
  de tipeo. Para renombrar desde 2027 usar la planificación.
