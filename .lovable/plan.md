
# Zona de Influencia para Proveedores

## Resumen
Agregar un campo "Zona de Influencia" al formulario de proveedores que permita seleccionar multiples regiones y comunas donde el proveedor opera. Las opciones disponibles se filtran a solo las regiones y comunas donde Autoplanet y Agroplanet tienen presencia (basado en la tabla `contract_addresses`).

## Cambios en Base de Datos

### Nueva tabla: `supplier_influence_zones`
```sql
CREATE TABLE supplier_influence_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  commune TEXT,  -- NULL significa "toda la region"
  created_at TIMESTAMPTZ DEFAULT now()
);
```
- Cada fila representa una region o comuna seleccionada.
- Si `commune` es NULL, significa que se selecciono la region completa.
- Se agregan politicas RLS similares a las de `supplier_emails` y `supplier_opex_categories`.

## Cambios en Codigo

### 1. Tipos (`src/components/suppliers/types.ts`)
- Agregar interface `SupplierInfluenceZone` con campos `id`, `supplier_id`, `region`, `commune`, `created_at`.
- Agregar campo `influence_zones: { region: string; commune: string | null }[]` a `SupplierFormData`.

### 2. Nuevo componente: `src/components/suppliers/InfluenceZoneSelect.tsx`
- Componente multi-seleccion de regiones y comunas.
- Al montar, consulta `contract_addresses` para obtener las regiones y comunas con presencia de las empresas.
- Muestra las regiones disponibles como checkboxes. Al seleccionar una region, se despliegan sus comunas disponibles (tambien como checkboxes).
- Permite seleccionar regiones completas o comunas individuales.
- Muestra las selecciones actuales como Badges removibles.

### 3. Formulario (`src/components/suppliers/SupplierForm.tsx`)
- Agregar campo `influence_zones` al estado `formData` (default: `[]`).
- En `loadSupplierData`, cargar las zonas desde `supplier_influence_zones`.
- En `handleSubmit`, guardar las zonas (delete + insert, mismo patron que emails y opex categories).
- Agregar seccion "Zona de Influencia" en el formulario, entre la seccion de Categorias OPEX y el checkbox de proveedor generico.

### 4. Flujo de datos
- Al abrir el selector, se hace una consulta a `contract_addresses` con `SELECT DISTINCT region, commune` para obtener solo ubicaciones con presencia real.
- Las regiones y comunas se agrupan y presentan en una estructura de arbol con checkboxes.
- Al guardar, se eliminan las zonas anteriores del proveedor y se insertan las nuevas.

## Seccion tecnica

### Consulta para obtener ubicaciones con presencia
```sql
SELECT DISTINCT region, commune 
FROM contract_addresses 
WHERE region IS NOT NULL 
ORDER BY region, commune
```

### Patron de guardado (mismo que emails/opex)
```typescript
// Delete existing
await supabase.from("supplier_influence_zones").delete().eq("supplier_id", supplierId);
// Insert new
if (formData.influence_zones.length > 0) {
  await supabase.from("supplier_influence_zones").insert(
    formData.influence_zones.map(zone => ({
      supplier_id: supplierId,
      region: zone.region,
      commune: zone.commune,
    }))
  );
}
```

### UI del selector
- Seccion con titulo "Zona de Influencia (opcional)"
- Descripcion: "Selecciona las regiones y comunas donde el proveedor tiene cobertura"
- Lista de regiones con checkboxes, cada una expandible para mostrar sus comunas
- Badges en la parte superior mostrando las selecciones actuales con boton X para remover
