# Sync: Lovable → Plataforma Oficial

Proceso para traer cambios desde la Versión de Estudio (Lovable / rama `main`) a la Plataforma Oficial (Vercel / rama `migration`).

## ¿Cuándo hacer un sync?

- Cuando en Lovable se desarrolló una feature nueva que queremos en producción
- Cuando hay bug fixes en Lovable que aplican a la Plataforma Oficial
- No es necesario sync inmediato — Lovable es laboratorio; el sync es una decisión editorial

## Proceso (paso a paso)

### 1. Ver qué hay pendiente

```sh
git fetch origin
git log origin/main ^origin/migration --oneline
```

Identifica los commits con descripción significativa (ignorar los genéricos "Changes").

### 2. Ver qué archivos cambiaron en total

```sh
git diff origin/migration...origin/main --name-only | grep -v "^\.lovable"
```

### 3. Clasificar cada archivo

| Situación | Acción |
|---|---|
| Archivo nuevo sin refs Lovable | `git checkout origin/main -- <archivo>` |
| Archivo con cambios buenos + sin refs Lovable | `git checkout origin/main -- <archivo>` |
| Archivo que modificamos en migration (ej: AdminPanel) | Revisar diff y aplicar manualmente |
| `.env.production`, `CLAUDE.md`, `.gitignore` | SKIP — nuestras versiones son correctas |
| `.lovable/*` | SKIP siempre |

Para revisar el diff de un archivo específico:
```sh
git diff origin/migration...origin/main -- src/pages/MiArchivo.tsx
```

### 4. Detectar código Lovable en los archivos traídos

Buscar patrones que indican dependencias Lovable:
```sh
grep -r "lovable\|lovable-tagger\|lovable:chat\|window\.parent\.postMessage\|lovable\.app\|lovableproject\.com" src/ supabase/functions/ --include="*.ts" --include="*.tsx" -i
```

Si encuentra algo, corregir antes de commitear.

### 5. Verificar TypeScript

```sh
npx tsc --noEmit
```

### 6. Commit y push

```sh
git add <archivos-traídos>
git commit -m "feat(sync): <descripción de lo que se trae>"
git push origin migration
```

La nueva Edge Function se despliega automáticamente en Vercel. Si hay una Edge Function nueva, también deployarla en Supabase si no se hace automáticamente.

## Archivos que NUNCA traer de main

- `.env.production` — apunta a Supabase de Lovable
- `CLAUDE.md` — nuestra versión es la autoritativa
- `.lovable/*` — metadatos internos de Lovable
- Cualquier archivo que reintroduzca `lovable-tagger`, `SelectableElement`, `GeoLocSyncDialog`

## Historial de syncs

| Fecha | Commits traídos | Descripción |
|---|---|---|
| 2026-06-29 | 77 commits acumulados | Primer sync: Gantt fixes, export org, DataExportDialog, CAPEX fix, Edge Function admin-export-org-members |
