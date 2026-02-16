

# Corregir escritura erratica en filtros del listado de contratos

## Problema identificado

El campo de busqueda y los filtros del listado de contratos actualizan los parametros de la URL (`searchParams`) en cada tecla presionada. Esto provoca:

1. Re-renderizado completo de la pagina en cada caracter
2. Re-ejecucion de `filterAndSortContracts` que procesa todos los contratos
3. Perdida de foco o texto por la actualizacion constante de la URL

## Solucion

Introducir un estado local para el campo de busqueda con un **debounce** que sincronice hacia la URL solo despues de que el usuario deje de escribir (300ms).

## Cambios planificados

### Archivo: `src/pages/Contracts.tsx`

1. Agregar un estado local `localSearchTerm` para el Input de busqueda
2. Sincronizar `localSearchTerm` desde la URL al montar (y cuando cambie externamente)
3. Usar un `useEffect` con `setTimeout` de 300ms para hacer debounce de la escritura hacia la URL
4. Cambiar el Input para usar `localSearchTerm` y `setLocalSearchTerm` en lugar de `searchTerm` y `setSearchTerm`

### Detalle tecnico

```text
Estado actual:
  Input onChange -> updateFilter("search", value) -> setSearchParams() -> re-render completo

Estado propuesto:
  Input onChange -> setLocalSearchTerm(value) -> [render solo del input]
                                              -> useEffect con debounce 300ms
                                              -> updateFilter("search", value)
                                              -> setSearchParams() -> re-render completo
```

Esto permite que el usuario escriba fluidamente sin esperar el ciclo completo de filtrado en cada tecla.

