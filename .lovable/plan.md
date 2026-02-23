

## Dropdowns buscables y logos en selectores de contratos

### Resumen
Se requieren dos mejoras globales:
1. **Todos los dropdowns del sistema** deben permitir escribir para buscar/filtrar opciones
2. **Todos los dropdowns que listen contratos** deben mostrar el logo de empresa (CompanyLogo)

### Estado actual

#### ✅ Completado
- `src/components/ui/searchable-select.tsx` - Componente genérico creado
- `src/components/contracts/ContractSearchSelect.tsx` - Componente de contratos con logos creado
- `src/pages/PurchaseOrdersDashboard.tsx` - Todos los filtros migrados (año, local, tipo, categoría, monto, estado, categoría OPEX en edit, agregar contrato en edit)
- `src/pages/OpexDashboard.tsx` - Todos los filtros migrados (año, empresa, local, categoría)
- `src/components/alerts/AlertForm.tsx` - Todos los selects migrados (tipo alerta, categoría, local, responsable)
- `src/components/budget/CentralizedOrderCreator.tsx` - Migrado (tipo presupuesto, categoría OPEX, moneda, contrato single, contrato allocation)

#### 🔲 Pendiente
- `src/components/budget/OCRequestDialog.tsx` - Moneda
- `src/components/budget/OCRequestViewDialog.tsx` - Contratos (conversión multi)
- `src/components/budget/InvoiceList.tsx` - Moneda, facturas
- `src/components/opex/OpexCreateDialog.tsx` - Contratos
- `src/components/bulk-upload/ValidationErrorsTable.tsx` - Contratos existentes
- `src/components/suppliers/SupplierSelect.tsx` - Proveedores
- `src/components/suppliers/CategorySelect.tsx` - Categorías
- `src/components/maintenance/MaintenanceEditDialog.tsx` - Estado, sub-estado
- `src/components/maintenance/MaintenanceModule.tsx` - Filtros varios
- `src/pages/EditContract.tsx` - Moneda, tipo término
- `src/pages/NewContract.tsx` - Dropdowns de formulario
- `src/components/admin/OrgChartManager.tsx` - Filtros de contratos
- `src/components/kpi/KPIForm.tsx` - Selecciones KPI
- `src/components/gantt/GanttModule.tsx` - Filtros Gantt
