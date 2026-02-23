

## Dropdowns buscables y logos en selectores de contratos

### Resumen
Se requieren dos mejoras globales:
1. **Todos los dropdowns del sistema** deben permitir escribir para buscar/filtrar opciones
2. **Todos los dropdowns que listen contratos** deben mostrar el logo de empresa (CompanyLogo)

### Estrategia

Se crearan **2 componentes reutilizables** que reemplazaran los `<Select>` actuales en todo el sistema:

1. **`SearchableSelect`** - Dropdown generico con busqueda integrada (usa Popover + Command)
2. **`ContractSelect`** - Variante especializada que siempre incluye logos de empresa

Ambos componentes usaran el patron Popover + Command (cmdk) que ya existe en `RegionCommuneSelect.tsx` y `CompanySelect.tsx`.

---

### Componentes nuevos

#### 1. `src/components/ui/searchable-select.tsx`
Componente generico que reemplaza `<Select>` con busqueda:
- Props: `value`, `onValueChange`, `placeholder`, `options: {value, label, icon?}[]`, `className`, `disabled`, `triggerClassName`
- Permite opcion especial "todos" o similar
- Usa `Popover` + `Command` + `CommandInput` + `CommandList` + `CommandItem`
- Soporta renderizado custom de items via `renderItem` prop

#### 2. `src/components/contracts/ContractSearchSelect.tsx`
Componente especializado para contratos:
- Props: `value`, `onValueChange`, `contracts: {id, name, cebe?, company_names}[]`, `placeholder`, `disabled`, `showAllOption?`, `allOptionLabel?`
- Siempre muestra `CompanyLogo` junto al nombre
- Incluye busqueda por nombre y CEBE
- Cualquier futuro dropdown de contratos solo necesita usar este componente

---

### Archivos a modificar

#### Dropdowns de contratos (reemplazar con `ContractSearchSelect` + logos):

| Archivo | Descripcion |
|---------|-------------|
| `src/pages/PurchaseOrdersDashboard.tsx` | 3 selectores de contratos (filtros OC, filtros solicitudes, agregar contrato multi-OC) |
| `src/pages/OpexDashboard.tsx` | 1 selector de contratos (filtro locales) |
| `src/components/alerts/AlertForm.tsx` | 1 selector de contrato (local) |
| `src/components/budget/CentralizedOrderCreator.tsx` | 1 selector ya tiene logo, convertir a searchable |
| `src/components/budget/OCRequestViewDialog.tsx` | 1 selector de contratos (conversion multi) |
| `src/components/opex/OpexCreateDialog.tsx` | 1 selector de contratos |
| `src/components/bulk-upload/ValidationErrorsTable.tsx` | 1 selector de contratos existentes |

#### Dropdowns genericos (reemplazar con `SearchableSelect`):

| Archivo | Dropdowns |
|---------|-----------|
| `src/pages/PurchaseOrdersDashboard.tsx` | Clasificacion, categoria, monto, ano, estado, moneda |
| `src/pages/OpexDashboard.tsx` | Empresa, categoria, ano |
| `src/components/alerts/AlertForm.tsx` | Tipo alerta, categoria, responsable |
| `src/components/budget/CentralizedOrderCreator.tsx` | Clasificacion, categoria OPEX, moneda |
| `src/components/budget/InvoiceList.tsx` | Moneda, facturas |
| `src/components/budget/OCRequestDialog.tsx` | Moneda, clasificacion |
| `src/components/suppliers/SupplierSelect.tsx` | Proveedores |
| `src/components/suppliers/CategorySelect.tsx` | Categorias |
| `src/components/maintenance/MaintenanceEditDialog.tsx` | Estado, sub-estado |
| `src/components/maintenance/MaintenanceModule.tsx` | Filtros varios |
| `src/pages/EditContract.tsx` | Moneda, tipo termino |
| `src/pages/NewContract.tsx` | Dropdowns de formulario |
| `src/components/admin/OrgChartManager.tsx` | Filtros de contratos |
| `src/components/kpi/KPIForm.tsx` | Selecciones KPI |
| `src/components/gantt/GanttModule.tsx` | Filtros Gantt |
| Y otros archivos con `<Select>` |

---

### Detalle tecnico

```text
SearchableSelect (Popover + Command pattern):
  - Popover trigger muestra valor seleccionado
  - CommandInput para escribir y filtrar
  - CommandList con CommandItem para cada opcion
  - Cierra al seleccionar
  - Soporta opciones con pocos items (< 5) sin busqueda visible opcionalmente

ContractSearchSelect:
  - Extiende SearchableSelect
  - Cada item: <CompanyLogo size="sm" /> + nombre + (cebe)
  - Query de contratos debe incluir contract_companies(companies(name))
  - Archivos que cargan contratos deben agregar company_names al fetch
```

### Orden de implementacion

1. Crear `SearchableSelect` y `ContractSearchSelect`
2. Actualizar archivos principales (PurchaseOrdersDashboard, OpexDashboard, AlertForm, CentralizedOrderCreator)
3. Actualizar archivos secundarios (InvoiceList, OCRequestDialog, suppliers, maintenance, etc.)
4. Actualizar archivos restantes

### Nota sobre datos
Los archivos que cargan contratos y aun no incluyen `contract_companies(companies(name))` en su query necesitaran actualizarse para obtener los nombres de empresa necesarios para el logo.
