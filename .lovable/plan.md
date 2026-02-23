
## Boton de descarga Excel del presupuesto CAPEX

### Objetivo
Agregar un boton "Descargar Excel" junto al boton "Actualizar Plantilla" en cada presupuesto de contrato dentro del modulo CAPEX, que exporte las lineas del presupuesto a un archivo Excel (.xlsx).

### Cambios en `src/components/budget/BudgetModule.tsx`

1. **Importar dependencias**
   - Importar `Download` de `lucide-react`
   - Importar `* as XLSX` de `xlsx`

2. **Crear funcion `handleExportExcel`**
   - Recorre las lineas del presupuesto (arbol aplanado con indentacion)
   - Columnas: Linea (con indentacion para jerarquia), Cantidad, Unidad, Precio Unitario (UF), Total (UF), Total (CLP), Estado
   - Genera un libro Excel con nombre del contrato + ano
   - Descarga automaticamente el archivo

3. **Agregar boton en la UI** (linea ~791, junto a "Actualizar Plantilla")
   - Boton con icono `Download` y texto "Descargar Excel"
   - Variante `outline`, tamano `sm`
   - Visible tanto cuando el presupuesto esta abierto como cerrado (a diferencia de "Actualizar Plantilla" que solo aparece cuando no esta cerrado)

### Detalle tecnico

```text
Funcion handleExportExcel:
  1. Aplanar arbol de lineas recursivamente con nivel de profundidad
  2. Mapear a filas Excel:
     - Linea: nombre con espacios de indentacion segun nivel
     - Cantidad: line.quantity
     - Unidad: line.unit_type
     - P. Unitario UF: line.unit_price
     - Total UF: line.amount_uf
     - Total CLP: line.amount_uf * ufValue
     - Estado: line.status
  3. Agregar fila de totales al final
  4. Crear worksheet y workbook con XLSX
  5. Descargar como "{contractName} - CAPEX {year}.xlsx"

Ubicacion del boton:
  Dentro del div flex justify-end gap-2 (linea 751)
  Despues del boton "Actualizar Plantilla"
  El boton tambien se muestra cuando isClosed (mover fuera del condicional !isClosed)
```

### Archivo modificado
- `src/components/budget/BudgetModule.tsx`
