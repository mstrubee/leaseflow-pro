
# Toggle de Repositorio Compartido en Items del Checklist

## Objetivo
Agregar un boton/toggle en cada linea de la seccion "Items" del panel de administracion de patentes que permita:
1. Definir si esa linea se lee desde el Repositorio Comun o si opera con carga directa por contrato.
2. Si se activa el repositorio, permitir seleccionar a que carpeta del repositorio comun apunta.

## Estado actual
- Ya existe la tabla `patent_shared_items` que mapea `checklist_item_id` a `shared_folder_id`.
- Ya existen 6 items mapeados (Constitucion de Sociedad, Vigencia de Sociedad, etc.).
- Ya existen carpetas compartidas en `repository_folders` con `contract_id = NULL`.
- El `PatentChecklist.tsx` ya consume `sharedItems` y redirige archivos al repositorio comun.

Lo que falta es la interfaz en el Admin Panel para gestionar estos mapeos de forma visual.

## Cambios

### Archivo: `src/components/patents/PatentAdminPanel.tsx`

1. **Cargar datos del repositorio compartido**: Al abrir el panel, cargar las carpetas compartidas (`repository_folders WHERE contract_id IS NULL`) y los mapeos existentes de `patent_shared_items`.

2. **Nueva columna "Repositorio" en la tabla de Items**: Agregar una columna entre "Emisores Fijos" y "Acciones" con un Switch (toggle) que indica si la linea usa repositorio compartido.

3. **Selector de carpeta**: Cuando el toggle esta activado, mostrar un Select con las carpetas del repositorio comun (incluyendo subcarpetas con su ruta completa) para elegir a que carpeta apunta.

4. **Logica de activacion/desactivacion**:
   - Al activar: Insertar en `patent_shared_items` con la carpeta seleccionada.
   - Al cambiar carpeta: Actualizar el `shared_folder_id` en `patent_shared_items`.
   - Al desactivar: Eliminar el registro de `patent_shared_items`.

5. **Propagacion**: Llamar `onDataChange()` al modificar los mapeos para que el modulo principal recargue los datos y el checklist refleje los cambios inmediatamente.

### Seccion Tecnica

**Datos a cargar** (en `loadRepositoryFolders` existente o funcion nueva):
```sql
-- Carpetas compartidas (ya existen)
SELECT id, name, parent_id FROM repository_folders WHERE contract_id IS NULL

-- Mapeos actuales
SELECT * FROM patent_shared_items
```

**Operaciones CRUD en `patent_shared_items`**:
- INSERT: al activar toggle, con carpeta por defecto o seleccionada
- UPDATE: al cambiar carpeta seleccionada
- DELETE: al desactivar toggle

**Columna nueva en la tabla de Items**:
- Header: "Repositorio"
- Contenido: Switch + Select de carpeta (condicional)

**Carpetas mostradas en el Select**: Se construye un arbol con paths legibles (ej: "Documentacion Legal / Constitucion de Sociedad") usando la misma logica de `loadRepositoryFolders` que ya existe, pero apuntando a `repository_folders` con `contract_id IS NULL` en vez de `folder_templates`.
