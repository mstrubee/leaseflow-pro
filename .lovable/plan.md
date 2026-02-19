
# Repositorio Comun de Patentes

## Resumen
Crear un repositorio compartido accesible desde el modulo de patentes, donde se almacenan documentos comunes a todos los contratos (ej: Constitucion de Sociedad, RUT Empresa, etc.). Las lineas del checklist que correspondan a estos documentos mostraran/subiran archivos desde este repositorio en lugar de hacerlo por contrato individual.

## Cambios

### 1. Base de datos

La tabla `repository_folders` ya permite `contract_id = NULL`. Se usara esta condicion para identificar carpetas del repositorio comun. Se crearan las carpetas iniciales via migracion:

- **Documentacion Legal** (carpeta raiz, `contract_id = NULL`)
  - Constitucion de Sociedad
  - Vigencia de Sociedad
  - Poderes de Rep. Legal
  - Vigencia de Poderes
  - RUT Empresa
  - RUT Rep. Legal

Adicionalmente se creara una tabla `patent_shared_items` que mapee cuales `patent_checklist_items` usan el repositorio comun (vinculando item_id con el folder_id del repositorio compartido). Esto permite que en el futuro se agreguen o quiten items compartidos sin tocar codigo.

### 2. Nuevo componente: `PatentSharedRepository.tsx`

Un dialog/panel que se abre desde un boton "Repositorio" ubicado entre "Administrar" y el boton de salir en el header del modulo de patentes.

Caracteristicas:
- Navegacion por carpetas y subcarpetas (igual que RepositorySection)
- Crear carpetas y subcarpetas
- Subir archivos a carpetas
- Eliminar archivos y carpetas
- Renombrar carpetas (editables como se solicito)
- Sin dependencia de Google Drive (archivos en Supabase Storage)

Se reutilizara la logica de `repository_folders` y `repository_files` existente, filtrando por `contract_id IS NULL`.

### 3. Cambios en `PatentChecklist.tsx` (columna Archivo)

Para las 6 lineas compartidas:
- La columna "Archivo" mostrara los archivos del repositorio comun (consultando `repository_files` de la subcarpeta correspondiente).
- El boton de subir archivo subira directamente a la subcarpeta del repositorio comun que coincida con el nombre de la linea.
- Se usara un icono o badge distinto para indicar visualmente que el archivo proviene del repositorio comun.

### 4. Cambios en `PatentsModule.tsx`

Agregar el boton "Repositorio" en el header, entre "Administrar" y el extremo derecho:

```text
[Patentes]                    [Repositorio] [Administrar (admin)]
```

### 5. Tabla nueva: `patent_shared_items`

```text
patent_shared_items
+--------------------+----------------------------------------------+
| id                 | uuid (PK)                                    |
| checklist_item_id  | uuid (FK patent_checklist_items, UNIQUE)      |
| shared_folder_id   | uuid (FK repository_folders)                 |
+--------------------+----------------------------------------------+
```

Esto permite determinar programaticamente que items usan el repositorio comun y hacia que carpeta apuntan.

## Seccion Tecnica

### Migracion SQL

```sql
-- 1. Crear carpeta raiz del repositorio comun
INSERT INTO public.repository_folders (id, contract_id, parent_id, name, is_base_folder, folder_type)
VALUES (gen_random_uuid(), NULL, NULL, 'Documentación Legal', true, 'patent_shared_legal');

-- 2. Crear subcarpetas (usando subquery para parent_id)
-- Constitucion de Sociedad, Vigencia de Sociedad, etc.

-- 3. Tabla de mapeo items compartidos
CREATE TABLE public.patent_shared_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL UNIQUE REFERENCES public.patent_checklist_items(id) ON DELETE CASCADE,
  shared_folder_id uuid NOT NULL REFERENCES public.repository_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patent_shared_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.patent_shared_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage" ON public.patent_shared_items
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 4. Insertar mapeos para las 6 lineas
-- (INSERT patent_shared_items vinculando cada item_id con su subcarpeta)
```

### Archivos a crear
1. **`src/components/patents/PatentSharedRepository.tsx`** -- Componente del repositorio comun (Dialog con navegacion de carpetas, subida de archivos, CRUD de carpetas)

### Archivos a modificar
1. **`src/components/patents/PatentsModule.tsx`** -- Agregar boton "Repositorio" en el header
2. **`src/components/patents/PatentChecklist.tsx`** -- En la columna "Archivo", para items compartidos: mostrar archivos del repositorio comun y subir a la carpeta compartida correspondiente
3. **`src/hooks/usePatents.ts`** -- Cargar `patent_shared_items` para saber cuales items son compartidos y sus folder_ids
4. **`src/components/patents/types.ts`** -- Agregar tipo `PatentSharedItem`

### Flujo de uso

1. Admin sube "Constitucion de Sociedad.pdf" al repositorio comun (carpeta Documentacion Legal > Constitucion de Sociedad)
2. Al abrir cualquier contrato en patentes, la linea "Constitucion de Sociedad" muestra automaticamente ese archivo
3. Si un usuario sube un archivo desde la linea del checklist, este se sube a la subcarpeta correspondiente del repositorio comun (no al contrato individual)
4. Todos los contratos ven el mismo archivo actualizado
