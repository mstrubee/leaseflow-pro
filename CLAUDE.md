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
- ✅ Etapa 8: Certificación final — cerrados los caveats pendientes de la certificación 2026-06-29:
  - `extract-contract-data` y `match-contracts` migradas de `ai.gateway.lovable.dev` a la API directa de Anthropic (`ANTHROPIC_API_KEY`)
  - CORS `*.lovable.app` removido de las 6 Edge Functions que lo tenían
  - `process-alerts` ahora arma los links de email con `APP_URL` (default `gplanet.vercel.app`), no con `.lovable.app`
  - Pendiente aparte (no bloqueante): confirmar si queda algo en la DB de Lovable (`tgxiqvfpirwvhktgqqfa`) sin reflejar en la oficial antes de darla de baja — requiere una comparación puntual, no se ejecutó todavía

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
- `useUserPermissions.ts`: wrapper deprecado, aún en uso en DashboardStats y ContractDetail — migrar a `hasPermission` cuando se toque esos archivos

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

## Reglas de desarrollo

1. **Cambios pequeños y testeables** — un commit por tema
2. **Variables de entorno** — nunca hardcodear URLs, keys ni credenciales
3. **Nombres en inglés** para código, **UI en español** para usuarios finales
4. **RLS siempre** — cualquier tabla nueva debe tener RLS habilitado
5. **TypeScript estricto** — correr `npx tsc --noEmit` antes de cada commit

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

## Notas para Claude

- Matias es el founder. No técnico — explicar decisiones en lenguaje simple cuando sea relevante.
- Cuando haya más de una forma de hacer algo, presentar opciones con trade-offs antes de implementar.
- Si algo no está claro sobre datos de usuarios reales, preguntar antes de asumir.
- Al correr SQL en la DB oficial, siempre confirmar que el proyecto destino es `ilcumthwzhmtumaklgvo`.
- Comunicarse siempre en español genérico/neutro, nunca con modismos ni tono argentino (nada de "vos", "che", etc.).
