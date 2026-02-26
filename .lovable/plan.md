

## Fix: Escritura lenta en campo de busqueda

### Problema
El campo de busqueda usa `startTransition` para actualizar el estado del filtro. Esto hace que React difiera la actualizacion del valor, pero como el input esta controlado (`value={filters.search}`), el texto aparece con retraso y se siente erratico.

Lo mismo aplica al campo "Buscar contrato..." que usa el mismo patron.

### Solucion
Usar un estado local para el valor del input y sincronizarlo con el filtro mediante un debounce o un `useEffect`. Asi el input responde inmediatamente al teclado, y el filtrado pesado se ejecuta con un pequeno retraso.

### Cambios en `src/components/maintenance/MaintenanceModule.tsx`

1. **Agregar estado local para los campos de texto** -- dos variables: `localSearch` y `localContractSearch`, inicializadas desde `filters`.

2. **Sincronizar con debounce** -- usar `useEffect` con un `setTimeout` de ~300ms para propagar el valor local al filtro real.

3. **Cambiar los inputs** -- los inputs usaran el estado local (`value={localSearch}`) y actualizaran el estado local directamente (`onChange={e => setLocalSearch(e.target.value)}`), sin pasar por `startTransition`.

### Detalle tecnico

```text
// Nuevos estados locales
const [localSearch, setLocalSearch] = useState(filters.search);
const [localContractSearch, setLocalContractSearch] = useState(filters.contractSearch);

// Debounce: sincronizar estado local -> filtro
useEffect(() => {
  const t = setTimeout(() => updateFilter("search", localSearch), 300);
  return () => clearTimeout(t);
}, [localSearch]);

useEffect(() => {
  const t = setTimeout(() => updateFilter("contractSearch", localContractSearch), 300);
  return () => clearTimeout(t);
}, [localContractSearch]);

// Inputs usan estado local
<Input value={localSearch} onChange={e => setLocalSearch(e.target.value)} ... />
<Input value={localContractSearch} onChange={e => setLocalContractSearch(e.target.value)} ... />
```

Esto hace que la escritura sea instantanea y el filtrado se aplique 300ms despues de dejar de escribir.

