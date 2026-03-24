

## Plan: Mejorar dropdown "Mover a otro rubro" en CategoryManager

### Cambios en `src/components/suppliers/CategoryManager.tsx`

**1. Agregar campo de búsqueda dentro del DropdownMenuContent**
- Agregar un `Input` con icono de `Search` al inicio del dropdown (fuera del scroll) para filtrar los destinos por nombre.
- Usar estado local `moveSearch` para el filtro.
- Filtrar `targets` por coincidencia parcial case-insensitive.

**2. Mostrar jerarquía clara de rubros y subrubros**
- Aplicar indentación visual por nivel (como ya existe parcialmente con `target.level * 8`).
- Rubros padre en **negrita** (level 0), subrubros con `↳` como prefijo.
- Separador visual entre rubros principales.

**3. Ampliar dimensiones del dropdown al 200% en alto**
- Cambiar `max-h-64` (256px) a `max-h-[512px]` en el DropdownMenuContent.
- Aumentar `min-w-[200px]` a `min-w-[280px]` para mejor legibilidad.

### Detalle técnico
- El campo de búsqueda usará `e.stopPropagation()` en `onKeyDown` para evitar que el DropdownMenu capture las teclas.
- Se separará el área de scroll (lista de items) del input de búsqueda que permanece fijo arriba.

