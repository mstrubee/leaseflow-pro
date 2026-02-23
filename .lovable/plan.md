

## Mostrar "Total / Superficie" en lineas madre y barra superior

### Resumen
Agregar el indicador **Total linea madre / Superficie Edificada Local** (en UF/m2 y $/m2) junto al nombre de cada linea madre (level === 0), y tambien mostrar el **gran total / superficie** en la barra de botones superior del modulo.

### Origen de datos
- **Superficie Total Arrendada** = campo `superficie_edificada_local` de la tabla `contracts`
- Se cargara en `BudgetDashboard` (ya hace query al contrato) y se pasara como prop a `BudgetModule` y luego a `BudgetLineTree`

### Cambios por archivo

#### 1. `src/components/budget/BudgetDashboard.tsx`
- En `loadContractName`, agregar `superficie_edificada_local` al SELECT
- Guardar en nuevo estado `superficieEdificada`
- Pasar `superficieEdificada` como nueva prop a ambos `BudgetModule` (capex y opex)

#### 2. `src/components/budget/BudgetModule.tsx`
- Agregar prop `superficieEdificada?: number` a `BudgetModuleProps`
- **Barra superior** (junto a botones Expandir/Colapsar/Actualizar/Descargar): mostrar un badge/texto con el calculo `suma de todas las lineas madre / superficie` en UF/m2 y $/m2
  - La suma de lineas madre = suma de `calculatedAmount` de cada linea de nivel 0 (roots)
  - Se calcula con `calculateAuthorizedTotal` que ya existe
- Pasar `superficieEdificada` al `BudgetLineTree`

#### 3. `src/components/budget/BudgetLineTree.tsx`
- Agregar prop `superficieEdificada?: number` a `BudgetLineTreeProps` y `BudgetLineItemProps`
- **En cada linea madre (level === 0, isParent)**: junto al nombre (despues del `<span>` del nombre en linea 479-501), mostrar un texto pequeno con:
  - `UF X,XX /m2` (total de la linea madre en UF / superficie)
  - `$ X.XXX /m2` (total en CLP / superficie)
- Solo mostrar cuando `superficieEdificada > 0`
- Agregar `superficieEdificada` al comparador de `React.memo` (es estable, casi nunca cambia)

### Formato visual

**En linea madre (al lado del nombre)**:
```
Proyectos  |  UF 1,23 /m2  ·  $45.678 /m2
```
Texto pequeno, color tenue, separado del nombre por un pipe.

**En barra superior**:
```
[Expandir] [Colapsar] [Actualizar] [Excel]    Total: UF 5,67 /m2 · $123.456 /m2
```
Mostrado como badge o texto alineado a la derecha.

### Detalle tecnico

**Calculo por linea madre**:
```typescript
// parentTotal ya existe en BudgetLineItemInner (linea 252)
const perM2UF = superficieEdificada > 0 ? calculatedAmount / superficieEdificada : 0;
const perM2CLP = superficieEdificada > 0 ? convertUFToPesos(calculatedAmount) / superficieEdificada : 0;
```

**Calculo global (barra superior en BudgetModule)**:
```typescript
const totalAuthorized = calculateAuthorizedTotal(lines, templatePricesMap, ufValue);
const totalPerM2UF = superficieEdificada > 0 ? totalAuthorized / superficieEdificada : 0;
const totalPerM2CLP = superficieEdificada > 0 ? (totalAuthorized * ufValue) / superficieEdificada : 0;
```

### Archivos a modificar
- `src/components/budget/BudgetDashboard.tsx` -- cargar superficie, pasar como prop
- `src/components/budget/BudgetModule.tsx` -- recibir prop, mostrar total/m2 en barra superior
- `src/components/budget/BudgetLineTree.tsx` -- recibir prop, mostrar por linea madre

