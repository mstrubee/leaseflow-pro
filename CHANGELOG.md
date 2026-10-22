# Changelog

## [Unreleased] — rama `migration`

### OPEX — planificación del año siguiente y categorías por año (2026-10-20)
- Botón "Planificar Presupuesto 2027" en `/opex` (ADMIN): análisis por categoría, mes, local y proveedor, OPEX agregado
  (general o desde un contrato vigente), edición directa del monto general, exclusión (tarjado) de líneas con "Excluidas".
- Categorías por año: fusionar, renombrar y retirar **desde 2027** (el 2026 no se toca), con deshacer y el paso
  "Aplicar categorías 2027" después del cierre. Detalle, orden de aplicación y reversión en `docs/opex-categorias-2027.md`.
- Los selectores de OC, proveedores, plantilla y carga Excel de presupuesto muestran solo las categorías vigentes en el
  año de la fecha de la OC; un trigger en `purchase_orders` lo exige en la base. Mensajes de error en español.
- Planificación: buscador de categorías con selección acumulada, retiros separados de las fusiones y edición de una
  fusión (nombre, agregar y quitar categorías) con deshacer de la fusión completa.
- Deshacer una fusión o renombre siempre se permite antes de "Aplicar categorías 2027": los montos de la categoría creada
  (OPEX agregado, OC, presupuesto, adicionales, proveedores) vuelven a la categoría original que se elija en un diálogo.
- Migraciones nuevas: `20261016120000`, `20261016180000`, `20261020120000`, `20261021120000`, `20261021180000`.

### Etapa 5 — Refactoring (2026-06-29)
- Eliminado sistema visual de permisos Lovable-era: `SelectableElement`, `FloatingPermissionSelector`, `PermissionSelectionContext`
- Limpiados 11 archivos de imports y wrappers vacíos (-834 líneas)
- Eliminada página `Welcome.tsx` que no tenía ruta en el router

### Etapa 3 — Datos (2026-06-29)
- Eliminadas 5 tablas `geoloc_sync_*` de la DB oficial (artefactos del sync Lovable, todas vacías)

### Etapa 2 — Infraestructura (2026-06-29)
- Eliminados `GeoLocSyncDialog` y `useGeoLocSync`: dependencias funcionales de Lovable via `window.parent.postMessage`
- Eliminado botón "Ver Backend" que apuntaba al Supabase de Lovable
- `.env` / `.env.production` removidos del tracking de Git, añadidos a `.gitignore`
- Creado `.env.example` con variables documentadas
- `lovable-tagger` removido de devDependencies y `vite.config.ts`
- Claves localStorage `lovable.*` renombradas a `geoplanet.*`
- `StorageMonitor`: "Lovable Cloud" → "Supabase"
- `googleDriveOAuth`: eliminadas URLs `lovable.app` y `lovableproject.com`
- `bun.lock` / `bun.lockb` eliminados (proyecto usa npm)
- `tmp-patent-upload-probe.txt` eliminado del repo
- `package.json` name: `"vite_react_shadcn_ts"` → `"leaseflow-pro"`

### Sistema de Roles (2026-06-29)
- `hasPermission` implementado en `TeamKPIDashboard` con visibilidad por sub-KPI
- Renombre sistemático "perfil de permisos" → "Rol" en toda la UI
- `ProfileManager.tsx` renombrado a `RoleManager.tsx`
- Corregido bug de asignación de roles: política RLS faltante en tabla `profiles`
- `RoleManager` ahora se refresca automáticamente tras guardar un usuario
- Selector de rol de plantilla ahora visible para todos los usuarios (incluyendo admin)
- Removido selector `app_role` (admin/user/operador_terreno) de `UserFormDialog`
- Removido badge de `app_role` del listado de usuarios en AdminPanel
- Removido botón "Ver Backend" del AdminPanel
