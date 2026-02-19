
# Carpeta "Patentes" con Subcarpetas por Contrato Vigente

## Objetivo
Crear una carpeta "Patentes" en el repositorio comun (con `contract_id = NULL`) que contenga una subcarpeta por cada contrato vigente (status = "firmado"). Cuando un contrato se marque como vigente, se debe crear automaticamente su subcarpeta.

## Cambios

### 1. Migracion de base de datos

Crear la carpeta raiz "Patentes" en el repositorio comun y generar subcarpetas para todos los contratos vigentes existentes.

Ademas, crear un **trigger en la tabla `contracts`** que detecte cuando un contrato cambia a status "firmado" y cree automaticamente la subcarpeta correspondiente en la carpeta "Patentes". Si el contrato deja de ser "firmado", la carpeta no se elimina (para preservar archivos).

### 2. Detalle tecnico

**Carpeta raiz:**
- `repository_folders` con `contract_id = NULL`, `name = 'Patentes'`, `folder_type = 'patent_shared_contracts'`, `is_base_folder = true`, `parent_id = NULL`

**Subcarpetas (una por contrato vigente):**
- `repository_folders` con `contract_id = NULL`, `parent_id = <id carpeta Patentes>`, `name = <nombre contrato>`, `folder_type = 'patent_contract_sub'`, `is_base_folder = false`

**Trigger SQL:**
```text
Funcion: create_patent_contract_folder()
  - Se ejecuta en UPDATE de contracts
  - Condicion: NEW.status = 'firmado' AND (OLD.status != 'firmado' OR OLD.status IS NULL)
  - Accion: Busca la carpeta "Patentes" (folder_type = 'patent_shared_contracts', contract_id IS NULL)
  - Si existe, verifica que no haya ya una subcarpeta con el mismo nombre
  - Si no existe subcarpeta, la crea

Trigger: AFTER UPDATE ON contracts FOR EACH ROW
  WHEN (NEW.status = 'firmado' AND OLD.status IS DISTINCT FROM 'firmado')
```

Tambien se agregara un trigger para INSERT (contratos nuevos creados directamente como firmados):
```text
Trigger: AFTER INSERT ON contracts FOR EACH ROW
  WHEN (NEW.status = 'firmado')
```

**Inicializacion:** La migracion insertara subcarpetas para los ~50 contratos vigentes existentes en una sola operacion.

### 3. Archivos a modificar

Ninguno. Todo se resuelve con la migracion SQL (carpeta raiz + subcarpetas iniciales + trigger). La interfaz del repositorio comun ya muestra todas las carpetas con `contract_id IS NULL`, por lo que la carpeta "Patentes" y sus subcarpetas apareceran automaticamente.

### Resumen de la migracion

1. Insertar carpeta "Patentes" en `repository_folders`
2. Insertar subcarpetas para cada contrato con `status = 'firmado'`
3. Crear funcion `create_patent_contract_folder()`
4. Crear triggers AFTER INSERT y AFTER UPDATE en `contracts`
