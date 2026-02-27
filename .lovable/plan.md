

## Agregar card "Sin Criticidad" y rango de antigüedad a todas las cards

### Cambios en `src/components/maintenance/MaintenanceModule.tsx`

**1. Nueva card "Sin Criticidad"**
- Agregar una card adicional al grid de criticidad que muestre la cantidad de forms en estado "En Proceso" (`status === "proceso"`) que NO tienen `criticality_category_id` asignado.
- La card tendrá un estilo diferenciado (borde gris/amber) y al hacer clic filtrará por forms sin criticidad.

**2. Rango de antigüedad en cada card (incluida la nueva)**
- En cada card de criticidad (y en la nueva "Sin Criticidad"), calcular el rango de días de antigüedad de los forms que pertenecen a esa categoría.
- La antigüedad se calcula como la diferencia en días entre `hoy` y `created_date` de cada form.
- Se mostrará debajo del nombre como texto pequeño: "1 - 45 días" (mínimo y máximo).
- Si solo hay 1 form, mostrar "N días". Si no hay forms, no mostrar rango.

### Detalle técnico

**Nuevo `useMemo` para calcular rangos de antigüedad:**
```text
// Para cada categoría + "sin criticidad", calcular min/max días
const criticalityAgeRanges = useMemo(() => {
  const today = new Date();
  const ranges: Record<string, {min: number, max: number} | null> = {};
  
  // Por cada categoría
  criticalityCategories.forEach(c => { ... });
  
  // Sin criticidad
  const noCritForms = forms.filter(f => f.status === "proceso" && !f.criticality_category_id);
  // calcular min/max días desde created_date
  
  return ranges;
}, [forms, criticalityCategories]);
```

**Modificar grid de cards:**
- Agregar la card "Sin Criticidad" al final del `.map()` de categorías
- En cada card, agregar un `<span>` debajo del nombre con el rango de días
- Agregar handler `handleNoCriticalityCardClick` para filtrar forms sin criticidad

### Archivo a modificar
- `src/components/maintenance/MaintenanceModule.tsx`
