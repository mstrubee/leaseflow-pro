
# Modulo de Mantenciones - Paso 1: Carga desde Excel

## Resumen
Crear la base del modulo de Mantenciones con la tabla en base de datos, la pagina principal y la funcionalidad de carga masiva desde Excel. El Excel tiene columnas fijas (A-L) que se mapean a los campos del FORM.

## Mapeo de columnas Excel

| Columna | Indice | Campo BD |
|---------|--------|----------|
| A | 0 | form_number (ID del FORM) |
| B | 1 | status (Proceso / Solucionado) |
| C | 2 | created_date (Fecha de creacion) |
| D | 3 | (no especificado, se ignorara) |
| E | 4 | contract_name (para vincular con contrato) |
| F | 5 | (no especificado, se ignorara) |
| G | 6 | general_description (Descripcion General) |
| H | 7 | electrical_description (Requerimiento Electrico) |
| I | 8 | civil_description (Requerimiento Obra Civil) |
| J | 9 | hvac_description (Requerimiento Climatizacion) |
| K | 10 | fixed_assets_description (Requerimiento Activos Fijos) |
| L | 11 | additional_comments (Comentarios Adicionales) |

## Cambios a implementar

### 1. Base de datos
Crear tabla `maintenance_forms` con:
- id, form_number, status, created_date, resolution_date
- contract_id (FK a contracts, nullable)
- contract_name (text, para guardar el nombre original del Excel)
- general_description, electrical_description, civil_description, hvac_description, fixed_assets_description, additional_comments
- year, created_at, updated_at, deleted_at, created_by
- Politicas RLS para usuarios autenticados (lectura y escritura)

### 2. Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| src/pages/MaintenanceDashboard.tsx | Pagina principal con tabla de FORMs y boton de carga Excel |
| src/components/maintenance/MaintenanceModule.tsx | Tabla principal con filtros y busqueda |
| src/components/maintenance/MaintenanceExcelUpload.tsx | Dialog de carga masiva: sube Excel, parsea columnas A-L, preview con validacion, vincula contratos por nombre, e inserta masivamente |
| src/components/maintenance/types.ts | Interfaces TypeScript (MaintenanceForm, ParsedMaintenanceRow) |

### 3. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| src/App.tsx | Agregar ruta /maintenance con ProtectedRoute |
| src/pages/Dashboard.tsx | Agregar boton "Mantenciones" en la barra de navegacion |

### 4. Logica de carga Excel
- Parsear Excel usando libreria xlsx (ya instalada)
- Validar archivo con excelFileValidation.ts existente
- Detectar fila de encabezados automaticamente
- Para cada fila: extraer columnas A-L segun mapeo
- Validar status (debe ser "Proceso" o "Solucionado")
- Parsear fecha de columna C
- Buscar contrato por nombre (columna E) en la tabla contracts
- Mostrar preview con tabla: N FORM, Estado, Fecha, Contrato, Descripcion General, validacion
- Marcar filas con contrato no encontrado como advertencia (se cargan igual con contract_name guardado)
- Boton "Cargar" para insercion masiva

### 5. Tabla principal (MaintenanceModule)
- Columnas visibles: N FORM, Estado (badge color), Fecha, Contrato, Descripcion General, Tipo detectado
- El "tipo" se detecta automaticamente segun cual columna de descripcion tiene contenido (Electrico, Obra Civil, Climatizacion, Activos Fijos, o General)
- Filtros: estado, tipo
- Busqueda por N FORM, contrato, descripcion
- Indicadores: Total FORMs, En Proceso, Solucionados

## Seccion tecnica

### Migracion SQL
```sql
CREATE TABLE public.maintenance_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number text NOT NULL,
  status text NOT NULL DEFAULT 'proceso',
  created_date date,
  resolution_date date,
  contract_id uuid REFERENCES public.contracts(id),
  contract_name text,
  general_description text,
  electrical_description text,
  civil_description text,
  hvac_description text,
  fixed_assets_description text,
  additional_comments text,
  year integer DEFAULT EXTRACT(YEAR FROM now()),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid
);

ALTER TABLE public.maintenance_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read maintenance_forms"
  ON public.maintenance_forms FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert maintenance_forms"
  ON public.maintenance_forms FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update maintenance_forms"
  ON public.maintenance_forms FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
```

### Deteccion automatica de tipo
Se determinara el tipo de mantencion segun cual campo de descripcion especifica tiene contenido:
- Si electrical_description tiene texto: "Electrico"
- Si civil_description tiene texto: "Obra Civil"
- Si hvac_description tiene texto: "Climatizacion"
- Si fixed_assets_description tiene texto: "Activos Fijos"
- Si solo general_description tiene texto: "General"
- Si hay multiples, se muestra el primero encontrado
