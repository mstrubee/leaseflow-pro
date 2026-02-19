
# Subida masiva de patentes con auto-clasificacion y busqueda de carpetas

## Objetivo
Agregar dos funcionalidades al Repositorio Comun de Patentes:

1. **Busqueda de carpetas por nombre**: Un campo de busqueda en el repositorio que filtre las carpetas visibles en tiempo real.
2. **Subida masiva con auto-clasificacion**: Un boton "Subida Masiva" que permita subir multiples archivos de patentes, los intente asociar automaticamente a la carpeta correcta segun el nombre del archivo, y permita al usuario elegir manualmente la carpeta destino para los que no se puedan clasificar.

## Logica de auto-clasificacion

Dado un archivo como `Patente_AP_Angol.jpeg`:
1. Extraer el prefijo (`AP` o `AG`) del nombre del archivo.
2. Extraer el nombre del local (ej: `Angol`, `10_de_Julio` -> `10 de Julio`, `Rotonda_Atenas` -> `Rotonda Atenas`).
3. Buscar en las subcarpetas de "Patentes" aquella que:
   - Comience con el mismo prefijo (AP/AG)
   - Contenga el nombre del local (busqueda case-insensitive, reemplazando guiones bajos por espacios)
4. Si hay match unico, asignar automaticamente.
5. Si no hay match o hay multiples matches, marcar como "sin clasificar" y permitir seleccion manual con un buscador de carpetas.

## Cambios

### 1. PatentSharedRepository.tsx

**Busqueda de carpetas:**
- Agregar un campo `Input` con icono de busqueda (Search) debajo del breadcrumb / toolbar.
- Filtrar `folders` en el render segun el texto de busqueda (case-insensitive, match parcial).
- Solo se muestra cuando hay carpetas visibles (no en carpetas vacias).

**Boton de subida masiva:**
- Agregar un boton "Subida Masiva" en la barra de herramientas del nivel raiz o dentro de la carpeta "Patentes".
- Al hacer clic, abre un nuevo componente/dialog `PatentBulkUploadDialog`.

### 2. Nuevo componente: PatentBulkUploadDialog.tsx

Dialogo modal que:
1. Permite seleccionar multiples archivos (drag & drop o input file).
2. Muestra una tabla con cada archivo y su carpeta destino asignada:
   - Columna "Archivo" con el nombre del archivo.
   - Columna "Carpeta destino" con la carpeta auto-detectada o un selector.
   - Indicador visual: verde si fue auto-clasificado, amarillo si necesita seleccion manual.
3. Para archivos sin match automatico, muestra un `Select` o combobox con busqueda que lista todas las subcarpetas de "Patentes".
4. Boton "Subir Todos" que sube cada archivo a la carpeta asignada (usando la misma logica de storage existente: subir a `repository-files` bucket y crear registro en `repository_files`).
5. Barra de progreso durante la subida.

**Logica de matching (frontend):**
```text
function matchFileToFolder(fileName, folders):
  // Limpiar nombre: quitar extension y "Patente_"
  cleanName = fileName.replace(/\.(pdf|jpeg|jpg|png)$/i, '').replace(/^Patente_/, '')
  
  // Extraer prefijo: AP o AG (primeras 2 letras)
  prefix = cleanName.substring(0, 2)  // "AP" o "AG"
  localName = cleanName.substring(3).replace(/_/g, ' ')  // "Angol", "10 de Julio", etc.
  
  // Buscar carpeta que empiece con el prefijo y contenga el nombre
  matches = folders.filter(f => 
    f.name.startsWith(prefix) && 
    f.name.toLowerCase().includes(localName.toLowerCase())
  )
  
  return matches.length === 1 ? matches[0] : null
```

### 3. Datos necesarios

El dialogo de subida masiva necesita cargar todas las subcarpetas de la carpeta "Patentes" (folder_type = 'patent_contract_sub'). Se obtienen con una sola query:

```text
SELECT id, name FROM repository_folders 
WHERE folder_type = 'patent_contract_sub' AND contract_id IS NULL
ORDER BY name
```

## Secuencia de implementacion

1. Agregar campo de busqueda en `PatentSharedRepository.tsx`
2. Crear `PatentBulkUploadDialog.tsx` con la logica de auto-clasificacion
3. Integrar el boton de subida masiva en `PatentSharedRepository.tsx`

## Detalle tecnico

- Cada archivo subido se almacena en `repository-files` bucket con path `shared-patents/{folder_id}/{timestamp}_{sanitizedName}`.
- Se crea un registro en `repository_files` con `folder_id`, `name`, `url` (storage path), y `file_type`.
- La busqueda de carpetas en el repositorio es un filtro local (no requiere cambios de base de datos).
- No se requieren migraciones SQL.
