

# Registrar Proveedor y OC en cada FORM de Mantencion

## Objetivo
Cada formulario de mantencion debe poder registrar:
- **Proveedor asignado** (con link para navegar a `/suppliers`)
- **Orden de Compra (OC) asignada** (con link para navegar a `/purchase-orders?search=OC-XXXX`)

Estas asignaciones se muestran como informacion de solo lectura con enlaces de navegacion directa.

## Cambios

### 1. Migracion de base de datos

Agregar dos columnas a `maintenance_forms`:
- `supplier_id` (uuid, nullable, FK a `suppliers`)
- `supplier_name` (text, nullable) -- cache del nombre para evitar joins
- `purchase_order_id` (uuid, nullable, FK a `purchase_orders`)
- `purchase_order_number` (text, nullable) -- cache del numero de OC

### 2. Sincronizacion automatica desde OC

Cuando se crea una OC que referencia forms (campo `maintenance_form_ids` en `purchase_orders`), actualizar automaticamente los forms referenciados con el `purchase_order_id`, `purchase_order_number`, `supplier_id` y `supplier_name` de esa OC. Esto se hara:
- En `CentralizedOrderCreator.tsx`: despues de crear la OC, actualizar los forms vinculados.

### 3. Cambios en el dialogo de edicion (`MaintenanceEditDialog.tsx`)

Agregar una seccion de solo lectura debajo de "Contrato" que muestre:
- **Proveedor**: nombre con icono de link que navega a `/suppliers`
- **OC**: numero de orden con icono de link que navega a `/purchase-orders?search=OC-XXXX`

Si no tiene proveedor/OC asignada, mostrar "Sin asignar" en gris.

### 4. Columnas en la tabla principal (`MaintenanceModule.tsx`)

Agregar columnas opcionales en la tabla de listado:
- **Proveedor** (nombre, clickeable)
- **OC** (numero, clickeable)

### 5. Tipos (`types.ts`)

Agregar los campos al tipo `MaintenanceForm`:
- `supplier_id: string | null`
- `supplier_name: string | null`
- `purchase_order_id: string | null`
- `purchase_order_number: string | null`

## Seccion Tecnica

### Migracion SQL

```sql
ALTER TABLE public.maintenance_forms
  ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN supplier_name text,
  ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN purchase_order_number text;
```

### Archivos a modificar

1. **`src/components/maintenance/types.ts`** -- Agregar 4 campos nuevos al tipo MaintenanceForm
2. **`src/components/maintenance/MaintenanceEditDialog.tsx`** -- Seccion de solo lectura con links de navegacion a proveedor y OC
3. **`src/components/maintenance/MaintenanceModule.tsx`** -- Columnas de Proveedor y OC en la tabla (con links)
4. **`src/components/budget/CentralizedOrderCreator.tsx`** -- Al crear OC, actualizar los forms vinculados con supplier_id, supplier_name, purchase_order_id, purchase_order_number

### Navegacion

- Click en proveedor: `navigate("/suppliers")` (con filtro de busqueda si es posible)
- Click en OC: `navigate("/purchase-orders?search=OC-XXXX")`

