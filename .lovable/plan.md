
# Fijar ancho de columna Nombre para alinear columnas

## Problema
Actualmente la columna "Nombre" de las lineas de presupuesto usa `min-w-[250px]` sin un ancho maximo, lo que permite que nombres largos empujen las demas columnas de forma desigual. Esto causa desalineacion visual entre filas.

## Solucion
Fijar el ancho de la columna Nombre con un ancho maximo y truncar nombres largos, de modo que las columnas de cantidad, precio, total, monto UF, CLP, estado y proveedor queden siempre alineadas.

## Cambios en `src/components/budget/BudgetLineTree.tsx`

1. **Columna Nombre (linea ~367-383)**: Cambiar de `min-w-[250px]` a un ancho fijo con `w-[280px] min-w-[280px] max-w-[280px] truncate` para que el nombre ocupe siempre el mismo espacio y se trunque si es muy largo, con tooltip para ver el nombre completo.

2. **Input de edicion de nombre (linea ~363)**: Ajustar el input a `w-[280px]` para que coincida con el ancho fijo del nombre.

3. **Seccion de cantidad/precio (linea ~387)**: Mantener `min-w-[320px]` pero agregar tambien un ancho fijo `w-[320px] max-w-[320px]` para uniformar la columna de inputs.

4. **Seccion de totales/estado (linea ~594)**: Mantener el ancho actual pero asegurar consistencia con `ml-auto` o `flex-shrink-0` para que siempre quede a la derecha.

Esto garantiza que todas las filas (hojas y padres) tengan la columna de nombre del mismo ancho, forzando la alineacion de las columnas restantes.
