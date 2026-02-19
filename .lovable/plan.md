
# Informes de Proveedores

## Resumen
Agregar una nueva seccion "Informe de Proveedores" en el modulo de Informes (`ReportsDashboard.tsx`), con estadisticas de proveedores por zona de influencia y por tipo (rubro/categoria). Ademas, hacer que todas las secciones existentes del modulo de informes sean colapsables.

## Cambios

### 1. Nuevo componente: `src/components/suppliers/SupplierReports.tsx`
Componente dedicado que contiene los informes de proveedores, con las siguientes sub-secciones (todas colapsables):

**a) Resumen General**
- Total de proveedores
- Proveedores genericos vs especificos
- Fecha del proveedor mas antiguo y mas reciente

**b) Proveedores por Zona de Influencia**
- Tabla con regiones y cantidad de proveedores asignados a cada una
- Detalle expandible por region mostrando comunas y proveedores
- Grafico circular (PieChart) con distribucion por region

**c) Proveedores por Rubro (Categoria)**
- Tabla con cada rubro y cantidad de proveedores
- Grafico circular con distribucion por rubro
- Diferenciacion entre genericos y especificos

**d) Proveedores por Fecha de Creacion**
- Filtro por rango de fechas (mes/ano)
- Conteo de proveedores creados por periodo

### 2. Datos consultados
```sql
-- Proveedores con categoria
SELECT s.*, sc.name as category_name 
FROM suppliers s 
LEFT JOIN supplier_categories sc ON s.category_id = sc.id

-- Zonas de influencia
SELECT sz.*, s.name as supplier_name 
FROM supplier_influence_zones sz 
JOIN suppliers s ON sz.supplier_id = s.id
```

### 3. Hacer todas las secciones colapsables en `ReportsDashboard.tsx`
- La seccion de Patentes ya usa `Collapsible` - mantener asi
- La seccion de Mantenimiento (`MaintenanceReports`) se envolvera en un `Collapsible` con el mismo patron visual
- La nueva seccion de Proveedores tambien usara `Collapsible`
- Cada seccion usara `useSingleCollapsible` para persistir su estado

### 4. Integracion en `ReportsDashboard.tsx`
- Importar `SupplierReports`
- Agregar la seccion entre Patentes y Mantenimiento (o al final)
- Envolver la seccion de Mantenimiento en un `Collapsible` con `CardHeader` clickeable, igual que Patentes

## Seccion Tecnica

### Estructura del componente `SupplierReports.tsx`
- Usa `useSingleCollapsible` para cada sub-seccion
- Carga datos al montar con `useEffect`
- Consulta `suppliers` con join a `supplier_categories`
- Consulta `supplier_influence_zones` para las zonas
- Usa `useMemo` para calcular estadisticas
- Usa `PieChart` de recharts para graficos (mismo patron que patentes)
- Exportacion PDF con logo corporativo y tablas (jspdf + autotable)

### Patron visual (mismo que secciones existentes)
```tsx
<Collapsible open={isOpen} onOpenChange={setIsOpen}>
  <Card>
    <CollapsibleTrigger asChild>
      <CardHeader className="cursor-pointer hover:bg-muted/50">
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown /> : <ChevronRight />}
          <CardTitle>Informe de Proveedores</CardTitle>
        </div>
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent>
        {/* Sub-secciones colapsables */}
      </CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

### Seccion de Mantenimiento - hacer colapsable
Envolver el `MaintenanceReports` existente en un `Collapsible` + `Card` con el mismo patron, agregando un `useSingleCollapsible("reports-maintenance-section", true)`.
