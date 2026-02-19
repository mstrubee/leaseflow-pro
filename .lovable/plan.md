

# Carpeta "Patentes" con Subcarpetas por Contrato Vigente

## Objetivo
Crear una carpeta "Patentes" en el repositorio comun con subcarpetas por cada contrato vigente. El nombre de cada subcarpeta sigue el formato:

```text
[AG|AP] - [Codigo] - [CEBE] - [Nombre Contrato]
```

Ejemplos reales:
- `AG - AG0007 - H0489P1390 - Talca AG`
- `AP - AP0006 - H0415P1290 - Quilicura`
- `AG - AG0027 - H04A1P1390 / H0480P1290 - Parral`

Si falta CEBE o Codigo, se omiten del nombre (ej: `AP - Autoplanet - 10 de Julio`).

## Cambios

### Migracion SQL (unico cambio)

No se modifica ningun archivo de codigo. Todo se resuelve con una migracion SQL que:

1. **Crea la carpeta raiz "Patentes"** en `repository_folders` con `contract_id = NULL`, `folder_type = 'patent_shared_contracts'`, `is_base_folder = true`.

2. **Genera subcarpetas iniciales** para todos los contratos con `status = 'firmado'`, construyendo el nombre con:
   - Prefijo: se determina buscando el nombre de la empresa en `contract_companies` + `companies`. Si contiene "agroplanet" => `AG`, si contiene "autoplanet" => `AP`, sino vacio.
   - Codigo y CEBE: se obtienen de `contract_custom_field_values` cruzando con `contract_custom_fields` por nombre de campo.
   - Nombre del contrato.

3. **Crea la funcion `create_patent_contract_folder()`** que:
   - Busca la carpeta raiz "Patentes" por `folder_type = 'patent_shared_contracts'`.
   - Determina el prefijo de empresa (AG/AP) consultando `contract_companies` y `companies`.
   - Obtiene CEBE y Codigo de `contract_custom_field_values`.
   - Construye el nombre con el formato `[Prefijo] - [Codigo] - [CEBE] - [Nombre]`, omitiendo partes vacias.
   - Verifica que no exista ya una subcarpeta con ese nombre.
   - Inserta la subcarpeta.

4. **Crea dos triggers**:
   - `AFTER UPDATE ON contracts`: se dispara cuando `NEW.status = 'firmado' AND OLD.status IS DISTINCT FROM 'firmado'`.
   - `AFTER INSERT ON contracts`: se dispara cuando `NEW.status = 'firmado'`.

### Detalle tecnico de la funcion del trigger

```text
create_patent_contract_folder()
  Variables:
    v_parent_id  -- ID de carpeta "Patentes"
    v_prefix     -- 'AG' o 'AP' o ''
    v_cebe       -- valor del campo custom CEBE
    v_codigo     -- valor del campo custom Codigo
    v_folder_name -- nombre final construido

  1. SELECT id INTO v_parent_id FROM repository_folders
     WHERE folder_type = 'patent_shared_contracts' AND contract_id IS NULL
  
  2. Si no existe v_parent_id, salir (RETURN NEW)

  3. Determinar prefijo:
     SELECT company.name INTO v_company
     FROM contract_companies cc JOIN companies company ON ...
     WHERE cc.contract_id = NEW.id LIMIT 1
     
     Si contiene 'agroplanet' => 'AG'
     Si contiene 'autoplanet' => 'AP'

  4. Obtener CEBE y Codigo desde contract_custom_field_values

  5. Construir nombre: concatenar partes no vacias con ' - '
     Ejemplo: 'AG' || ' - ' || 'AG0007' || ' - ' || 'H0489P1390' || ' - ' || 'Talca AG'

  6. Verificar que no exista subcarpeta con ese nombre bajo v_parent_id

  7. INSERT INTO repository_folders (name, parent_id, contract_id, folder_type, is_base_folder)
     VALUES (v_folder_name, v_parent_id, NULL, 'patent_contract_sub', false)
```

### Inicializacion

La migracion genera las ~50 subcarpetas existentes con un solo INSERT...SELECT que aplica la misma logica de nombre (prefijo + codigo + cebe + nombre).

### Interfaz

No requiere cambios. El repositorio comun ya muestra todas las carpetas con `contract_id IS NULL`, por lo que la carpeta "Patentes" y sus subcarpetas apareceran automaticamente.
