

# Plan: Seccion "Organigrama" en el Panel de Administracion

## Resumen

Crear una nueva seccion en el Panel de Administracion que permita gestionar un organigrama de gerencias y jefaturas por empresa. Cada persona del organigrama tendra nombre, telefono, email, y podra asociarse a uno o mas contratos. En la tabla expandible de locales del CompanyManager, se agregara una columna "Gerencia" mostrando las personas asignadas.

## Modelo de Datos

Se crearan 2 nuevas tablas:

```text
org_members                          org_member_contracts
+------------------+                 +------------------+
| id (uuid, PK)   |                 | id (uuid, PK)   |
| company_id (FK)  |<---+           | org_member_id FK |
| name (text)      |    |           | contract_id (FK) |
| position (text)  |    +---------->| created_at       |
| phone (text)     |                 +------------------+
| email (text)     |
| parent_id (FK)   |  -- para jerarquia (gerente -> jefaturas)
| display_order    |
| created_at       |
+------------------+
```

- `org_members`: Personas del organigrama, vinculadas a una empresa. `parent_id` permite jerarquia (gerencia contiene jefaturas).
- `org_member_contracts`: Tabla pivote que asocia miembros a contratos.
- RLS: Solo usuarios autenticados pueden leer; solo admins pueden crear/editar/eliminar.

## Cambios en el Frontend

### 1. Nuevo componente `OrgChartManager.tsx`
- Ubicacion: `src/components/admin/OrgChartManager.tsx`
- Usa `CollapsibleCard` con icono `Users` (lucide), igual que las demas secciones del admin.
- Selector de empresa en la parte superior.
- Al seleccionar una empresa, muestra un arbol jerarquico de personas (gerencias y jefaturas subordinadas).
- Acciones CRUD:
  - **Crear**: Dialog con campos Nombre, Cargo/Posicion, Telefono, Email, Gerencia padre (opcional, select de miembros existentes de esa empresa).
  - **Editar**: Mismo dialog pre-llenado.
  - **Eliminar**: Doble confirmacion (mismo patron que CompanyManager).
- Asignacion de contratos: Al crear/editar un miembro, se muestra un multi-select con los contratos de esa empresa (obtenidos via `contract_companies`).

### 2. Modificacion de `CompanyManager.tsx`
- En la tabla expandible de locales, agregar una columna **"Gerencia"**.
- Al cargar los contratos de la empresa, tambien obtener los `org_member_contracts` para esos contratos.
- Cruzar con `org_members` para mostrar los nombres de las personas asignadas a cada contrato en la columna Gerencia.

### 3. Modificacion de `AdminPanel.tsx`
- Importar y renderizar `OrgChartManager` como nueva seccion colapsable, debajo de `CompanyManager`.

## Detalles Tecnicos

### Migracion SQL
```sql
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  parent_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read org_members"
  ON public.org_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage org_members"
  ON public.org_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.org_member_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id UUID NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_member_id, contract_id)
);

ALTER TABLE public.org_member_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read org_member_contracts"
  ON public.org_member_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage org_member_contracts"
  ON public.org_member_contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

### Archivos a crear
- `src/components/admin/OrgChartManager.tsx` -- componente principal

### Archivos a modificar
- `src/pages/AdminPanel.tsx` -- agregar import y render de OrgChartManager
- `src/components/admin/CompanyManager.tsx` -- agregar columna "Gerencia" en tabla expandible de locales

