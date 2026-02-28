

## Eliminar funcionalidad de colapsar en la pagina de Patentes

### Que se hara

Remover el `Collapsible`, `CollapsibleTrigger` y `CollapsibleContent` del componente `PatentsModule.tsx`, dejando el contenido siempre visible. Tambien se eliminaran las importaciones y el hook `useSingleCollapsible` que ya no se necesitan.

### Archivo a modificar

**`src/components/patents/PatentsModule.tsx`**:

1. Eliminar importaciones de `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` (linea 6), `ChevronDown` de lucide (linea 7), y `useSingleCollapsible` (linea 10)
2. Eliminar la linea del hook `useSingleCollapsible` (linea 39 aprox)
3. En el return (lineas 108-259):
   - Reemplazar `<Collapsible>` wrapper por un simple fragmento o nada
   - Cambiar el `CollapsibleTrigger` + `Button` por un simple `CardTitle` sin boton ni chevron
   - Reemplazar `<CollapsibleContent>` por renderizado directo del `CardContent`

**Resultado**: El card de Patentes se muestra siempre abierto, sin boton de colapsar ni icono de flecha.

