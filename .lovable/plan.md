

## Fix: Escritura extremadamente lenta en campos de busqueda

### Problema raiz
Aunque se agrego estado local (`localSearch`), cada pulsacion de tecla llama `setLocalSearch`, lo que re-renderiza **todo** el componente `MaintenanceModule` (~1243 lineas). Los multiples `useMemo`, la tabla completa y todos los filtros se recalculan/re-renderizan en cada teclazo, causando el retraso visible.

### Solucion
Extraer los campos de busqueda en componentes independientes con `memo`. Asi, al escribir solo se re-renderiza el pequeno componente del input, no el modulo completo. El componente padre solo se entera cuando el debounce dispara el callback.

### Cambios en `src/components/maintenance/MaintenanceModule.tsx`

1. **Crear un componente `DebouncedInput`** (dentro del mismo archivo o separado) que:
   - Mantiene su propio estado local
   - Usa un `useEffect` con debounce interno
   - Llama un callback `onDebouncedChange` cuando el valor se estabiliza
   - Esta envuelto en `memo` para no re-renderizarse por cambios del padre

2. **Eliminar `localSearch`, `localContractSearch` y sus `useEffect`** del componente principal.

3. **Reemplazar los inputs** por `<DebouncedInput>` pasando `onDebouncedChange` que llama directamente a `setFilters` (sin `startTransition`, ya que el debounce ya absorbe la latencia).

### Detalle tecnico

```text
// Componente aislado - se re-renderiza solo cuando escribe
const DebouncedInput = memo(({ value, onChange, delay = 300, ...props }) => {
  const [local, setLocal] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const t = setTimeout(() => onChangeRef.current(local), delay);
    return () => clearTimeout(t);
  }, [local, delay]);

  // Sincronizar si el padre cambia el valor (ej: "limpiar filtros")
  useEffect(() => { setLocal(value); }, [value]);

  return <Input {...props} value={local} onChange={e => setLocal(e.target.value)} />;
});

// Uso en el modulo:
<DebouncedInput
  value={filters.search}
  onChange={val => setFilters(prev => ({ ...prev, search: val }))}
  placeholder="N° FORM, contrato..."
  className="pl-8"
/>
```

Esto asegura que al escribir, solo el input se re-renderiza. El filtrado pesado se ejecuta 300ms despues, una sola vez.

