

# Registro de Fechas de Cambio de Estado y Sub Estado

## Objetivo
Registrar automaticamente la fecha exacta en que cada form cambia de Estado y Sub Estado. Estas fechas seran inmutables (no editables por el usuario) y serviran como base para futuros informes de tasa de respuesta y rendimiento por responsable.

## Cambios

### 1. Nueva tabla: `maintenance_status_history`

Se creara una tabla de historial que registre cada cambio de estado/sub-estado con timestamp automatico:

```text
maintenance_status_history
+-------------------+----------------------------+
| id                | uuid (PK)                  |
| form_id           | uuid (FK maintenance_forms)|
| field_changed     | text (status / sub_status) |
| old_value         | text                       |
| new_value         | text                       |
| changed_at        | timestamptz (default now) |
| changed_by        | uuid (auth.uid())          |
+-------------------+----------------------------+
```

- `changed_at` se establece automaticamente con `now()` y no se puede modificar desde el frontend.
- Politicas RLS: lectura para usuarios autenticados, insercion solo via trigger (o desde el codigo con el usuario actual).

### 2. Columnas de fecha por sub-estado en `maintenance_forms`

Para facilitar consultas rapidas de rendimiento sin necesidad de recorrer el historial, se agregaran columnas de fecha directamente en la tabla principal:

- `status_changed_at` (timestamptz) -- ultima vez que cambio el campo status
- `sub_status_solicitado_at` (timestamptz)
- `sub_status_pre_aprobado_at` (timestamptz)
- `sub_status_evaluado_at` (timestamptz)
- `sub_status_cotizando_at` (timestamptz)
- `sub_status_en_ejecucion_at` (timestamptz)
- `sub_status_resuelto_at` (timestamptz)

Estas columnas se llenaran automaticamente via un **trigger de base de datos** cada vez que el sub_status cambie.

### 3. Trigger de base de datos

Un trigger `BEFORE UPDATE` en `maintenance_forms` que:
1. Si `status` cambio: registra `status_changed_at = now()` y agrega registro en `maintenance_status_history`.
2. Si `sub_status` cambio: establece la columna correspondiente (`sub_status_[nuevo_valor]_at = now()`) y agrega registro en `maintenance_status_history`.

Esto garantiza que las fechas se registran a nivel de base de datos y no pueden ser manipuladas desde el frontend.

### 4. Cambios en `MaintenanceEditDialog.tsx`

- Mostrar las fechas de sub-estado como campos de solo lectura en el dialogo de edicion (seccion informativa tipo timeline).
- No se permitira editar estas fechas desde la interfaz.

### 5. Cambios en `types.ts`

- Agregar las nuevas columnas al tipo `MaintenanceForm`.

### 6. Inicializacion de datos existentes

- Los 2,402 forms que ya estan en estado "resuelto" no tendran fechas historicas (ya que no existia el tracking). Se dejara `null` y solo se registraran cambios futuros.
- Opcionalmente, para los forms existentes con `status = 'solucionado'` y `sub_status = 'resuelto'`, se puede establecer `sub_status_resuelto_at = updated_at` como aproximacion.

## Seccion Tecnica

### Migracion SQL

```sql
-- Tabla de historial
CREATE TABLE public.maintenance_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.maintenance_forms(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

ALTER TABLE public.maintenance_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.maintenance_status_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON public.maintenance_status_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- Columnas de fecha en maintenance_forms
ALTER TABLE public.maintenance_forms
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN sub_status_solicitado_at timestamptz,
  ADD COLUMN sub_status_pre_aprobado_at timestamptz,
  ADD COLUMN sub_status_evaluado_at timestamptz,
  ADD COLUMN sub_status_cotizando_at timestamptz,
  ADD COLUMN sub_status_en_ejecucion_at timestamptz,
  ADD COLUMN sub_status_resuelto_at timestamptz;

-- Trigger function
CREATE OR REPLACE FUNCTION public.track_maintenance_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Track status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
    INSERT INTO maintenance_status_history (form_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;

  -- Track sub_status change
  IF OLD.sub_status IS DISTINCT FROM NEW.sub_status THEN
    -- Set the timestamp column for the new sub_status
    CASE NEW.sub_status
      WHEN 'solicitado' THEN NEW.sub_status_solicitado_at := now();
      WHEN 'pre_aprobado' THEN NEW.sub_status_pre_aprobado_at := now();
      WHEN 'evaluado' THEN NEW.sub_status_evaluado_at := now();
      WHEN 'cotizando' THEN NEW.sub_status_cotizando_at := now();
      WHEN 'en_ejecucion' THEN NEW.sub_status_en_ejecucion_at := now();
      WHEN 'resuelto' THEN NEW.sub_status_resuelto_at := now();
      ELSE NULL;
    END CASE;

    INSERT INTO maintenance_status_history (form_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'sub_status', OLD.sub_status, NEW.sub_status, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_maintenance_status_change
  BEFORE UPDATE ON public.maintenance_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.track_maintenance_status_change();

-- Seed: approximate dates for existing resolved forms
UPDATE maintenance_forms
SET sub_status_resuelto_at = updated_at
WHERE sub_status = 'resuelto' AND sub_status_resuelto_at IS NULL;
```

### Archivos a modificar

1. **`src/components/maintenance/types.ts`** -- Agregar campos de fecha al tipo `MaintenanceForm`
2. **`src/components/maintenance/MaintenanceEditDialog.tsx`** -- Mostrar timeline de fechas de sub-estado (solo lectura)
3. **`src/components/maintenance/MaintenanceExcelUpload.tsx`** -- Al insertar forms nuevos, establecer `sub_status_solicitado_at = now()` si el sub_status inicial es "solicitado"

