# Integrar GeoLoc en gplanet con Google Drive como repositorio

Traer el proyecto [GeoLoc](/projects/539697f7-2650-4d5a-a297-18f86170697b) completo a gplanet como una nueva sección **GEOLOC** en el home. Toda la información generada por el módulo (POIs, capas de usuario, carpetas, archivos importados como KML/GeoJSON/Shapefile/Excel) se almacenará en **Google Drive**, alineado con la política central del proyecto. Supabase se usará únicamente para metadata mínima (índice/lookup).

## Arquitectura de almacenamiento

**Regla**: el contenido pesado vive en Drive. Supabase guarda solo punteros.

```text
Google Drive
└── GEOLOC/                         (carpeta raíz, configurable)
    ├── POIs/
    │   └── <carpeta_usuario>/
    │       └── pois.geojson        (FeatureCollection con todos los POIs)
    ├── Capas de usuario/
    │   └── <nombre_capa>.geojson
    ├── Importados/
    │   └── <archivo_original>.kml/.shp/.xlsx
    └── Análisis/
        └── isocronas, exports, etc.
```

**En Supabase** (metadata únicamente):
- `geoloc_drive_files`: `id, user_id, kind ('poi_collection'|'user_layer'|'import'|'analysis'), name, drive_file_id, parent_drive_folder_id, size_bytes, mime_type, updated_at`
- `geoloc_poi_folders`: `id, user_id, name, drive_folder_id, parent_id, display_order` (estructura jerárquica liviana)
- `geoloc_settings`: `user_id, root_drive_folder_id` (carpeta raíz GEOLOC del usuario / proyecto)

No se almacena GeoJSON ni binarios en Supabase. Las capas se cargan leyendo el archivo desde Drive.

## Reutilización de la infraestructura Drive ya existente

gplanet ya tiene:
- Edge function `google-drive` (con OAuth, refresh, fallback) — la usamos para list/upload/download/delete.
- Secret `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GOOGLE_SERVICE_ACCOUNT_KEY`.
- Helpers `src/lib/driveUploadHelpers.ts`, `src/lib/googleDriveOAuth.ts`.
- Patrón de "two-step transfer" (Storage temporal → Drive) y resolución jerárquica de carpetas.

GeoLoc se conectará a esa misma capa en lugar de tener su propio almacenamiento.

## Qué se trae desde GeoLoc

**Páginas / componentes**
- `pages/MapaComunasPage.tsx`
- `components/MapaComunas.tsx`
- `components/map/*` (11 capas: comunas, GSE, isócronas, manzanas, microzonas, POIs, tráfico, capas de usuario, etc.)
- `components/panels/*` (panel de análisis, comparación, búsqueda, editor de POIs, etc.)
- `components/layout/*`, `components/ui-overlays/*`

**Lógica**
- `src/services/*` (communeDataService, gseService, ineService, isochroneService, manzanaService, overpassService, poiCache)
- Hooks específicos (`useComunasGeoIndex`, `useGseManzanas`, `useManzanas`, `usePoiFolders`, `useSavedPois`)
- `src/data/communes.ts`, `src/lib/*`, `src/utils/*`, `src/types/*`

**Backend**
- Edge function `isochrone` (cálculo de isócronas)

## Adaptaciones clave (Drive-first)

1. **`useSavedPois` y `usePoiFolders`** → reescribir para leer/escribir GeoJSON contra Drive vía edge function `google-drive`. Cache local con `idb-keyval` (ya está en GeoLoc) para offline / rendimiento; sync diferido a Drive con debounce.
2. **`poiCache.ts`** → mantener como caché IndexedDB local; fuente de verdad = Drive.
3. **Capas de usuario (`UserLayersLayer`)** → cuando el usuario importe KML/GeoJSON/Shapefile/Excel, se sube el archivo original a Drive (`GEOLOC/Importados/`) y la capa renderizada se guarda como GeoJSON en `GEOLOC/Capas de usuario/`.
4. **Auth**: reemplazar `useAuth` de GeoLoc por el de gplanet.
5. **Cliente Supabase**: usar `@/integrations/supabase/client`.
6. **Tipos**: las nuevas tablas `geoloc_*` aparecerán automáticamente en `types.ts` tras la migración.

## Migraciones SQL (mínimas, solo metadata)

```sql
create table public.geoloc_settings (
  user_id uuid primary key references auth.users on delete cascade,
  root_drive_folder_id text,
  updated_at timestamptz default now()
);

create table public.geoloc_poi_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  parent_id uuid references public.geoloc_poi_folders on delete cascade,
  name text not null,
  drive_folder_id text,
  display_order int default 0,
  created_at timestamptz default now()
);

create table public.geoloc_drive_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  folder_id uuid references public.geoloc_poi_folders on delete set null,
  kind text not null check (kind in ('poi_collection','user_layer','import','analysis')),
  name text not null,
  drive_file_id text not null,
  parent_drive_folder_id text,
  mime_type text,
  size_bytes bigint,
  updated_at timestamptz default now()
);
```
RLS: cada usuario solo ve/edita sus propias filas (`auth.uid() = user_id`).

## Integración en el home

En `src/pages/Welcome.tsx`, agregar a `ALL_MODULES`:

```ts
{ id: "geoloc", label: "GEOLOC", desc: "Sistema de información geográfica territorial",
  icon: MapPin, path: "/geoloc", resource: null, color: "text-green-600 bg-green-100" }
```

Aparece como tarjeta en la grilla arrastrable.

## Rutas

En `src/App.tsx` agregar `/geoloc` envuelto en `ProtectedRoute`.

## Dependencias nuevas

```
leaflet@1.9.4  react-leaflet@4.2.1  @types/leaflet@1.9.12  @types/geojson
@tmcw/togeojson  idb-keyval  jszip  xlsx
@turf/area @turf/bbox @turf/boolean-intersects @turf/boolean-point-in-polygon
@turf/buffer @turf/centroid @turf/helpers @turf/length
@turf/polygon-to-line @turf/simplify @turf/voronoi
```

## Plan de ejecución

1. Crear migración SQL: `geoloc_settings`, `geoloc_poi_folders`, `geoloc_drive_files` con RLS por `user_id`.
2. Instalar dependencias.
3. Copiar archivos del módulo GeoLoc (páginas, componentes mapa/panels, services, hooks, data, lib, utils, types).
4. Reescribir `useSavedPois` y `usePoiFolders` para usar la edge function `google-drive` (leer/escribir GeoJSON en `GEOLOC/POIs/`).
5. Adaptar `UserLayersLayer` y los flujos de import (KML/GeoJSON/Shapefile/Excel) para subir a `GEOLOC/Importados/` y `GEOLOC/Capas de usuario/`.
6. Crear bootstrap: al primer ingreso del usuario al módulo, crear la carpeta raíz `GEOLOC` en Drive y guardar su ID en `geoloc_settings.root_drive_folder_id`.
7. Reemplazar imports de auth/cliente Supabase al estándar gplanet.
8. Desplegar edge function `isochrone`.
9. Agregar `import "leaflet/dist/leaflet.css"`.
10. Crear `src/pages/GeoLocPage.tsx` con `ProtectedRoute` + botón "Volver al inicio".
11. Registrar ruta `/geoloc` en `App.tsx`.
12. Agregar tarjeta **GEOLOC** en `Welcome.tsx`.
13. Guardar memoria del módulo: regla "GEOLOC: POIs y capas se almacenan exclusivamente en Google Drive bajo la carpeta `GEOLOC/`. Supabase guarda solo metadata (`geoloc_*` tablas)."

## Notas

- No se trae la página `Auth` ni `Index` de GeoLoc.
- Cualquier futuro "otro sistema" que se conecte a GEOLOC (ej. capas compartidas, datasets, exports) seguirá la misma regla: archivos a Drive, metadata a Supabase.
- Si una tabla nueva colisiona con nombres existentes se prefija con `geoloc_` (ya aplicado).
