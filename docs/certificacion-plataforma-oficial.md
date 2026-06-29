# Certificación — Plataforma Oficial LeaseFlow-pro

**Fecha:** 2026-06-29  
**Rama certificada:** `migration`  
**Deploy:** Vercel (auto-deploy desde `migration`)  
**DB:** Supabase `ilcumthwzhmtumaklgvo`

---

## ✅ Checklist de certificación

### Código
- [x] TypeScript sin errores (`npx tsc --noEmit` → limpio)
- [x] Sin dependencias funcionales de Lovable en `src/`
- [x] `lovable-tagger` removido de devDependencies y vite.config.ts
- [x] Sistema `SelectableElement` / `PermissionSelectionContext` eliminado
- [x] `GeoLocSyncDialog` eliminado (usaba `window.parent.postMessage` con Lovable)
- [x] `package.json` name: `"leaseflow-pro"` (no `"vite_react_shadcn_ts"`)
- [x] localStorage keys: `geoplanet.*` (no `lovable.*`)
- [x] `googleDriveOAuth.ts`: solo URL Vercel en `ALLOWED_OAUTH_ORIGINS`

### Repositorio
- [x] `.env` / `.env.production` NO están en el tracking de Git
- [x] `.env.example` presente con variables documentadas
- [x] `.gitignore` excluye `.env` y `.env.*`
- [x] `bun.lock` / `bun.lockb` eliminados (proyecto usa npm)
- [x] Rama `main` intacta (Lovable puede seguir operando)
- [x] Rama `migration` sincronizada con `origin/migration`

### Base de datos
- [x] RLS habilitado en todas las tablas sensibles
- [x] 5 tablas `geoloc_sync_*` eliminadas (artefactos Lovable)
- [x] Tablas alineadas con el código del frontend

### Edge Functions
- [x] 18/18 funciones ACTIVE en DB oficial
- [x] CORS incluye `gplanet.vercel.app` y `localhost` en todas las funciones relevantes
- [x] `admin-export-org-members` desplegada (nueva desde sync Etapa 7)

### Documentación
- [x] `README.md` reescrito (sin referencias a Lovable)
- [x] `CHANGELOG.md` con historial de etapas
- [x] `CLAUDE.md` actualizado con arquitectura actual
- [x] `docs/sync-lovable-a-oficial.md` — guía de sync para futuros cambios

---

## ⚠️ Caveats conocidos (no bloquean la certificación)

### 1. `ai.gateway.lovable.dev` en dos Edge Functions
Las funciones `extract-contract-data` y `match-contracts` usan el gateway de IA de Lovable:
```
https://ai.gateway.lovable.dev/v1/chat/completions
```
**Impacto:** Dependencia de infraestructura de Lovable. Si el gateway cae o la key expira, estas funciones fallan.  
**Plan:** Migrar a Anthropic API directo (`https://api.anthropic.com/v1/messages`) con la key del proyecto.

### 2. CORS con orígenes Lovable en Edge Functions
Varias Edge Functions tienen `*.lovable.app` en su CORS allowlist. No causa problemas funcionales — solo permite que Lovable también llame a estas funciones.  
**Plan:** Remover en Etapa siguiente cuando el tiempo libre lo permita.

### 3. `process-alerts` construye URL de emails con sufijo `.lovable.app`
```ts
const appUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "";
```
**Impacto:** Los links en emails de alertas apuntan a la URL de Lovable, no a Vercel.  
**Plan:** Agregar variable de entorno `APP_URL` en la Edge Function con el dominio correcto.

### 4. `useUserPermissions.ts` — wrapper deprecado
Sigue en uso en `DashboardStats.tsx` y `ContractDetail.tsx`. Funciona correctamente; es deuda técnica de migración progresiva a `hasPermission`.  
**Plan:** Migrar cuando se toquen esos archivos en desarrollo futuro.

---

## Estado final de las 8 etapas

| Etapa | Descripción | Estado |
|---|---|---|
| 1 | Auditoría de código | ✅ |
| 2 | Eliminar dependencias Lovable | ✅ |
| 3 | Auditoría y limpieza de DB | ✅ |
| 4 | Auditoría funcional | ✅ |
| 5 | Refactoring — código muerto | ✅ |
| 6 | Profesionalización — docs | ✅ |
| 7 | Sync Lovable → Oficial | ✅ |
| 8 | Certificación | ✅ |

**La Plataforma Oficial está certificada para uso en producción.**
