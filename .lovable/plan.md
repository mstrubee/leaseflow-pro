

## Columna CAPEX en tabla de contratos + aumento de ancho

### Resumen
1. Aumentar el ancho de la Card de filtros y la ContractsTable en un 20% (de 108% a ~130%)
2. Agregar columna "CAPEX" entre "Venta Est." y "Costo Arriendo" en la vista de negociacion, mostrando el CAPEX total asignado al contrato

### Cambios por archivo

#### 1. `src/pages/Contracts.tsx`
- Cambiar el `width` de la Card de filtros de `"108%"` a `"130%"`

#### 2. `src/components/contracts/ContractsTable.tsx`

**Ancho**:
- Cambiar el `width` del contenedor de `"108%"` a `"130%"`

**Datos CAPEX**:
- Al montar el componente, hacer query a `contract_budgets` filtrando `budget_type = 'capex'` para el ano actual
- Guardar en un estado `capexByContract: Record<string, number>` (contract_id -> amount_uf)

**Nueva columna (solo en vista negociacion)**:
- Agregar `<TableHead>` con label "CAPEX" entre "Venta Est." y "Costo Arriendo"
- Agregar `<TableCell>` correspondiente en cada fila

**Contenido de la celda CAPEX**:
- Si el contrato tiene CAPEX (`capexByContract[contract.id] > 0`):
  - Linea 1 (principal): Monto en CLP (`$ X.XXX.XXX`)
  - Linea 2 (secundaria, texto pequeno): Monto en UF (`X,XX UF`)
  - Linea 3 (secundaria, texto pequeno): UF/m2 = `amount_uf / superficie_edificada_local` (solo si superficie > 0)
- Si no tiene CAPEX: mostrar "-" en texto tenue

### Formato visual de la celda

```text
$ 45.000.000
120,50 UF
3,45 UF/m2
```

Linea 1 en font-medium, lineas 2 y 3 en text-[10px] text-muted-foreground.

### Detalle tecnico

**Query de CAPEX** (en useEffect del componente):
```typescript
const { data } = await supabase
  .from("contract_budgets")
  .select("contract_id, amount_uf")
  .eq("budget_type", "capex")
  .eq("year", new Date().getFullYear());
```

**Calculo UF/m2**:
```typescript
const capexUF = capexByContract[contract.id] || 0;
const superficie = contract.superficie_edificada_local || 0;
const perM2 = superficie > 0 ? capexUF / superficie : 0;
```

### Archivos a modificar
- `src/pages/Contracts.tsx` -- ancho Card filtros
- `src/components/contracts/ContractsTable.tsx` -- ancho tabla + columna CAPEX

