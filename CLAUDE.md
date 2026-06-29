# LeaseFlow-pro — Instrucciones para Claude Code

## Qué es este proyecto

LeaseFlow-pro es un CRM para administración de contratos de arriendo, presupuestos y mantención de propiedades. Con usuarios activos en producción. Originado en Lovable; la **Plataforma Oficial** corre en Vercel + Supabase propio.

---

## Estado actual de la migración (2026-06-29)

La migración estructural está completa. La Plataforma Oficial (`migration`) es la versión canónica:

- ✅ Etapa 1: Auditoría de código completada
- ✅ Etapa 2: Dependencias Lovable eliminadas (GeoLocSyncDialog, Ver Backend, lovable-tagger, .env, localStorage keys, etc.)
- ✅ Etapa 3: Auditoría de DB — tablas geoloc_sync* eliminadas, 17/17 Edge Functions activas
- ✅ Etapa 4: Auditoría funcional — código muerto identificado
- ✅ Etapa 5: Refactoring — sistema SelectableElement/PermissionSelection eliminado (-834 líneas)
- ✅ Etapa 6: Profesionalización (este archivo + README + CHANGELOG)
- ⏳ Etapa 7: Diseño "Sync a Oficial" (pendiente)
- ⏳ Etapa 8: Certificación final (pendiente)

---

## Arquitectura

| Componente | Valor |
|---|---|
| **Plataforma Oficial** | Vercel + rama `migration` |
| **DB Oficial** | Supabase `ilcumthwzhmtumaklgvo` |
| **Versión de Estudio** | Lovable + rama `main` + Supabase `tgxiqvfpirwvhktgqqfa` |
| **Edge Functions** | 17 funciones, todas ACTIVE en DB oficial |

---

## ⛔ REGLAS DE SEGURIDAD — LEER ANTES DE CUALQUIER ACCIÓN

### Rama `main` = Lovable. ES INTOCABLE.
- **NUNCA** hacer commit a `main`
- **NUNCA** hacer `git push` a `main` sin confirmación explícita de Matias
- Todo el trabajo va en rama `migration`

### DB: solo operar sobre `ilcumthwzhmtumaklgvo`
- **NUNCA** correr SQL en `tgxiqvfpirwvhktgqqfa` (DB de Lovable)
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
