# LeaseFlow-pro — Instrucciones para Claude Code

## Qué es este proyecto

LeaseFlow-pro es un CRM para administración de contratos de arriendo, presupuestos y mantención de propiedades. Con usuarios activos en producción. Originado en Lovable; la **Plataforma Oficial** corre en Vercel + Supabase propio. **Lovable está retirado** (nadie lo usa, confirmado 2026-09-07) — `main` queda congelada como archivo histórico.

---

## Estado actual de la migración (actualizado 2026-09-07)

La migración está completa, Lovable retirado:

- ✅ Etapa 1: Auditoría de código completada
- ✅ Etapa 2: Dependencias Lovable eliminadas (GeoLocSyncDialog, Ver Backend, lovable-tagger, .env, localStorage keys, etc.)
- ✅ Etapa 3: Auditoría de DB — tablas geoloc_sync* eliminadas, 17/17 Edge Functions activas
- ✅ Etapa 4: Auditoría funcional — código muerto identificado
- ✅ Etapa 5: Refactoring — sistema SelectableElement/PermissionSelection eliminado (-834 líneas)
- ✅ Etapa 6: Profesionalización (este archivo + README + CHANGELOG)
- ✅ Etapa 7: Sync Lovable → Oficial (`main` congelada, ya no aplica — ver abajo)
- 🟡 Etapa 8: Certificación final — de los caveats pendientes de la certificación 2026-06-29, resueltos:
  - CORS `*.lovable.app` removido de las 6 Edge Functions que lo tenían
  - `process-alerts` ahora arma los links de email con `APP_URL` (default `gplanet.vercel.app`), no con `.lovable.app`

  Pendientes, sin resolver (decisión de Matias, 2026-09-07):
  - `extract-contract-data` y `match-contracts` **siguen llamando a `ai.gateway.lovable.dev`** (Gemini) — es una dependencia real de infraestructura de Lovable, pero cambiar de proveedor de IA no es viable por ahora. Sigue siendo un riesgo: si Lovable da de baja ese gateway, estas 2 funciones (extracción de datos de contratos e importación de Excel con matching) dejan de funcionar.
  - Confirmar si queda algo en la DB de Lovable (`tgxiqvfpirwvhktgqqfa`) sin reflejar en la oficial antes de darla de baja — requiere una comparación puntual con SQL de solo lectura, que necesita confirmación explícita de Matias antes de ejecutarse (ver regla de seguridad abajo)

**`main` (Lovable) queda congelada** — no se espera desarrollo nuevo ahí. El workflow de `docs/sync-lovable-a-oficial.md` ya no aplica en el día a día (queda como referencia histórica).

---

## Arquitectura

| Componente | Valor |
|---|---|
| **Plataforma Oficial** | Vercel + rama `migration` |
| **DB Oficial** | Supabase `ilcumthwzhmtumaklgvo` |
| **Versión de Estudio (retirada)** | Lovable + rama `main` (congelada) + Supabase `tgxiqvfpirwvhktgqqfa` (legacy, nadie la usa) |
| **Edge Functions** | 18 funciones, todas ACTIVE en DB oficial |

---

## ⛔ REGLAS DE SEGURIDAD — LEER ANTES DE CUALQUIER ACCIÓN

### Rama `main` = Lovable, congelada. Se mantiene como archivo histórico.
- **NUNCA** hacer commit a `main` sin pedirlo explícitamente — ya no recibe desarrollo activo
- **NUNCA** hacer `git push` a `main` sin confirmación explícita de Matias
- Todo el trabajo va en rama `migration`

### Merge a `migration`: autorización permanente (Matias, 2026-10-15)
- Cuando una sesión trabaja en una rama propia (p. ej. `claude/...`), al terminar y verificar un cambio Claude **hace el merge a `migration` y lo pushea sin pedir confirmación**. Vercel despliega desde `migration`.
- Condiciones previas: pipeline de revisión sin alertas pendientes, `npx tsc --noEmit` sin errores nuevos respecto a `migration`, `git fetch` hecho y conflictos resueltos conservando lo que ya tiene `migration`.
- **No cubre `main`**: sigue requiriendo confirmación explícita de Matias.
- **No cubre `supabase/migrations/` ni `supabase/config.toml`** (ni SQL sobre ninguna DB): si un cambio los toca, confirmar antes.
- Si el pipeline da `PLATFORM ⚠️`, esperar confirmación antes de mergear.

### DB: solo operar sobre `ilcumthwzhmtumaklgvo`
- **NUNCA** correr SQL en `tgxiqvfpirwvhktgqqfa` (DB de Lovable, legacy) sin confirmación explícita de Matias — aunque esté retirada, no se debe tocar por default
- Para SQL en DB oficial: usar Management API con PAT disponible en memoria

### Antes de cualquier commit verificar:
1. `git branch` → debe decir `migration`
2. Ningún archivo de `supabase/migrations/` ni `supabase/config.toml` modificado

---

## Sistema de permisos

```typescript
// Sistema NUEVO (usar este)
const { isAdmin, hasPermission } = useAuth();
const canView = isAdmin || hasPermission("resource_name", "view");
const canEdit = isAdmin || hasPermission("resource_name", "edit");

// Patrón padre-hijo (la vista del padre da acceso a hijos)
const parentEdit = isAdmin || hasPermission("contract_gantt", "edit");
const canEditTasks = parentEdit || hasPermission("gantt_editar_tareas", "edit");
```

- `user_permissions` table: permisos granulares por usuario
- `user_profile_templates` + `profile_template_permissions`: roles reutilizables
- `PermissionTreeEditor`: árbol jerárquico de permisos con herencia
- `useUserPermissions.ts` (wrapper deprecado) eliminado 2026-09-07 — `DashboardStats.tsx` y `ContractDetail.tsx` ya usan `useAuth()` directo (`hasPermission`, `isHidden`), único sistema de permisos en todo el código

---

## Módulos del sistema

| Módulo | Ruta | Estado |
|---|---|---|
| Contratos | `/contracts` | ✅ Producción |
| Presupuestos | `/capex`, `/opex` | ✅ Producción |
| Mantención | `/maintenance` | ✅ Producción |
| Patentes | `/patents` | ✅ Producción |
| KPI | `/kpi` | ✅ Producción |
| Proveedores | `/suppliers` | ✅ Producción |
| Alertas | `/alerts` | ✅ Producción |
| GeoLoc | `/geoloc` | ✅ Producción |
| Órdenes de Compra | `/purchase-orders` | ✅ Producción |
| Reportes | `/reports` | ✅ Producción |
| Admin | `/admin` | ✅ Producción |

---

## OPEX: categorías por año (desde 2027)
- Renombrar, fusionar y retirar categorías OPEX rige **solo desde 2027**; 2026 no se toca. "Eliminar" = retirar
  (`valid_to_year`), nunca borrar. Una OC solo usa categorías vigentes en el año de su fecha de OC (trigger en la base).
- Los cambios se hacen en `Planificar Presupuesto 2027` (ADMIN) y se aplican con "Aplicar categorías 2027" después del
  cierre de 2026. Detalle, diferencia `created_at` / `order_date` / `year` y reversión: `docs/opex-categorias-2027.md`.

---

## Reglas de desarrollo

1. **Cambios pequeños y testeables** — un commit por tema
2. **Variables de entorno** — nunca hardcodear URLs, keys ni credenciales
3. **Nombres en inglés** para código, **UI en español** para usuarios finales
4. **RLS siempre** — cualquier tabla nueva debe tener RLS habilitado
5. **TypeScript estricto** — correr `npx tsc --noEmit` antes de cada commit
6. **GRANT explícito en cada tabla nueva** — desde el 2026-10-30 Supabase ya no da acceso Data API automático a las tablas
   nuevas de `public` (aviso de Supabase, 2026-10-20). Toda migración que haga `CREATE TABLE` debe incluir sus `GRANT` en el
   mismo archivo; sin ellos supabase-js recibe `permission denied`. Esto vale también para `supabase db reset`, ramas de
   preview y proyectos nuevos, porque repiten todas las migraciones desde cero.

   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO authenticated;
   GRANT ALL ON public.<tabla> TO service_role;
   -- anon solo si la tabla debe leerse sin iniciar sesión (hoy ninguna lo necesita)
   ```

   - Dar a `authenticated` solo los permisos que la tabla necesita (p. ej. solo `SELECT` si se escribe vía RPC/Edge Function);
     el acceso fino lo sigue controlando RLS (regla 4).
   - Tablas con secretos (p. ej. `oc_verification_secret`) no se exponen a `authenticated` ni `anon`.
   - Verificación en la DB oficial (debe devolver 0 filas):
     `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not (has_table_privilege('authenticated',c.oid,'SELECT') and has_table_privilege('service_role',c.oid,'SELECT'));`
   - Deuda conocida: 29 tablas creadas entre 2026-06-25 y 2026-10-20 no traen `GRANT` en su migración (en la DB oficial
     funcionan porque se crearon antes del cambio). Una reconstrucción desde cero las dejaría sin acceso. Pendiente: migración
     con `GRANT` idempotentes para esas tablas (toca `supabase/migrations/`, confirmar con Matias antes).

---

## Pipeline de revisión obligatorio

Antes de entregar cualquier código, ejecutar internamente:

**🔒 Agente 1 — Auditor de Seguridad**
- ¿Datos sensibles expuestos? ¿RLS correcto? ¿Keys en código?
- Output: `[SECURITY: ✅ OK]` o `[SECURITY: ⚠️ RIESGO — descripción]`

**🧪 Agente 2 — Revisor de Calidad**
- ¿Código legible? ¿Responsabilidad única? ¿Estados de carga/error manejados?
- Output: `[QUALITY: ✅ OK]` o `[QUALITY: ⚠️ OBSERVACIÓN — descripción]`

**🏗️ Agente 3 — Auditor de Plataforma**
- ¿Cambio va en rama `migration`? ¿Toca algún archivo que no debe cambiar?
- Output: `[PLATFORM: ✅ OK]` o `[PLATFORM: ⚠️ ALERTA — descripción]`

---

## Restricciones conocidas — NO volver a intentar

| Restricción | Detalle |
|---|---|
| Supabase de Lovable (`tgxiqvfpirwvhktgqqfa`) | **No accesible.** Lovable no entrega acceso directo a la base de datos ni a las claves de servicio. No intentar pg_dump, CLI link, ni pedir credenciales. |
| `.env.production` en `main` | **Nunca debe existir.** Está en `.gitignore`. Su presencia causa que Lovable autentique contra el Supabase nuevo (vacío), rompiendo el login de todos los usuarios. |
| MariaDB (herramienta `mcp__MariaDB_GrupoPlanet__*`) | **No mencionar ni usar.** Es un sistema de GrupoPlanet totalmente distinto a la base de datos de LeaseFlow-pro (que es Supabase/Postgres). Nunca asumir que es la base de este proyecto. Solo usarla si Matias pide explícitamente una migración desde Supabase hacia ese sistema. |

---

## Notas para Claude

- Matias es el founder. No técnico — explicar decisiones en lenguaje simple cuando sea relevante.
- Cuando haya más de una forma de hacer algo, presentar opciones con trade-offs antes de implementar.
- Si algo no está claro sobre datos de usuarios reales, preguntar antes de asumir.
- Al correr SQL en la DB oficial, siempre confirmar que el proyecto destino es `ilcumthwzhmtumaklgvo`.
- Comunicarse siempre en español genérico/neutro, nunca con modismos ni tono argentino (nada de "vos", "che", etc.).
