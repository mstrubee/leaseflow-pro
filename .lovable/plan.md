## Problema

En el panel de admin, "Secciones Principales" no incluye **CAPEX**. Actualmente CAPEX se controla con el permiso de "Órdenes de Compra" (`purchase_orders`), lo que impide diferenciar el acceso entre ambos módulos.

Revisé el resto de rutas/menúes y CAPEX es la única sección visible (Dashboard, Welcome, header) que no tiene su propio recurso. El resto (Contratos, Dashboard, Repositorio, Proveedores, Mantenciones, Órdenes de Compra, OPEX, Alertas, Informes, KPI, Patentes, Atención Especial, GEOLOC) ya están listados.

## Cambios

1. **`src/pages/AdminPanel.tsx`** — agregar entrada en `MAIN_RESOURCES`:
   ```
   { id: "capex", label: "CAPEX", category: "principal" }
   ```
   (insertada justo después de `purchase_orders`).

2. **`src/App.tsx`** — cambiar la protección de la ruta `/capex` de `resource="purchase_orders"` a `resource="capex"`.

3. **`src/pages/Welcome.tsx`** — cambiar `resource: "purchase_orders"` por `resource: "capex"` en la tarjeta de CAPEX.

4. **`src/pages/Dashboard.tsx`** — el botón "CAPEX" del header usa `hasPermission("purchase_orders", "view")`; cambiarlo a `hasPermission("capex", "view")`.

5. **Migración de datos**: para los usuarios existentes que ya tenían acceso a `purchase_orders`, copiar ese permiso al recurso `capex` con un INSERT idempotente, para que no pierdan acceso a CAPEX tras el cambio.

## Fuera de alcance

- No se toca la lógica interna de cálculo de CAPEX ni los queries con `budget_type = 'capex'`.
- No se agregan sub-secciones dentro de CAPEX.
