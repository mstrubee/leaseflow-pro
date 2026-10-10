# LeaseFlow Pro

CRM para administración de contratos de arriendo, presupuestos y mantención de propiedades. Desarrollado para el mercado chileno / LATAM.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Deploy**: Vercel (rama `migration`) → Plataforma Oficial
- **Módulo GeoLoc**: React + Leaflet/Google Maps, stack separado en `src/geoloc/`

## Estructura de ramas

| Rama | Descripción |
|---|---|
| `main` | Versión de Estudio (Lovable) — solo referencia, no se modifica |
| `migration` | **Plataforma Oficial** — desplegada en Vercel, conectada a Supabase `ilcumthwzhmtumaklgvo` |

> **Regla crítica**: nunca hacer commit a `main`. Todo el trabajo va en `migration`.

## Desarrollo local

```sh
# 1. Clonar y pararse en la rama de trabajo
git clone <repo-url>
git checkout migration

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con las credenciales del Supabase oficial

# 4. Iniciar servidor de desarrollo
npm run dev
```

## Variables de entorno

Ver `.env.example` para la lista completa. Las claves necesarias:

```
VITE_SUPABASE_URL=https://ilcumthwzhmtumaklgvo.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_GOOGLE_MAPS_KEY=<opcional>
```

## Base de datos

- **Proyecto Supabase**: `ilcumthwzhmtumaklgvo`
- RLS habilitado en todas las tablas
- 17 Edge Functions desplegadas y activas
- Migraciones SQL: aplicar vía Supabase Dashboard o Management API

## Edge Functions

| Función | Descripción |
|---|---|
| `create-user` / `delete-user` / `update-user` | Gestión de usuarios con service role |
| `economic-indicators` / `refresh-economic-indicators` | Caché de UF/UTM desde mindicador.cl |
| `extract-contract-data` | Extracción AI de datos de contratos |
| `process-alerts` / `process-patent-alerts` | Procesamiento de alertas automáticas |
| `isochrone` | Cálculo de isócronas para GeoLoc |
| `google-drive` / `onedrive` | Integración con almacenamiento en la nube |
| `send-contract-email` | Envío de emails de contratos |
| `summarize-text` | Resumen AI de documentos |
| `match-contracts` | Matching automático de contratos |
| `recent-logins` / `force-logout-all` | Auditoría y control de sesiones |
| `recommend-form-time` | Sugerencia de tiempos en formularios |

## Sistema de permisos

- `isAdmin`: acceso total
- `hasPermission(resource, level)`: verifica tabla `user_permissions` para "view" / "edit"
- `user_profile_templates` + `profile_template_permissions`: roles reutilizables (se asignan desde AdminPanel → Roles)
- Árbol de permisos en `PermissionTreeEditor` con herencia padre-hijo

## Módulos

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
