

## Mostrar logos en el selector de contratos del Creador Centralizado de OC

### Objetivo
Agregar el logo de la empresa (Agroplanet/Autoplanet) a la izquierda de cada nombre de contrato en el listado desplegable del componente `CentralizedOrderCreator.tsx`.

### Cambios en `src/components/budget/CentralizedOrderCreator.tsx`

1. **Actualizar interfaz `Contract`** (linea 19)
   - Agregar campo `company_names: string[]`.

2. **Actualizar query de contratos** (linea 136)
   - Modificar el select para incluir `contract_companies(companies(name))`.
   - Mapear los datos para extraer los nombres de empresa usando `getCompanyNames`.

3. **Importar componentes de logo** (imports)
   - Importar `CompanyLogo` y `getCompanyNames` desde `@/components/contracts/CompanyLogo`.

4. **Agregar logo en el SelectItem** (linea 942-948)
   - Insertar `<CompanyLogo companyNames={c.company_names} size="sm" />` dentro del `div` existente, antes del nombre del contrato.

### Detalle tecnico

```text
Interface Contract (actualizado):
  id, name, cebe, company_names: string[]

Query (actualizada):
  .select("id, name, contract_companies(companies(name))")

SelectItem:
  <div className="flex items-center gap-2">
    <CompanyLogo companyNames={c.company_names} size="sm" />
    <span>{c.name}</span>
    {c.cebe && <span>({c.cebe})</span>}
  </div>
```

Solo se modifica un archivo: `src/components/budget/CentralizedOrderCreator.tsx`.
