

## Mejoras al Welcome Page: alertas, cards uniformes y colores de iconos

### Cambio 1: Alertas de la semana expandidas por defecto + eliminar "Ver todas"

**`src/components/alerts/WelcomeAlertsBar.tsx`**:
- Cambiar estado inicial: `expanded` a `true` y `viewMode` a `"week"` (lineas 53-54)
- Eliminar el boton "Ver todas" (lineas 234-241)

### Cambio 2: Cards del mismo tamano

**`src/pages/Welcome.tsx`** - en `SortableModuleCard`:
- Agregar `h-full` al Card (linea 53) para que todas las cards ocupen el alto completo de la celda del grid
- Agregar `h-full` al div contenedor (linea 52)
- Hacer lo mismo con la card de Admin (linea 194)

### Cambio 3: Colores distintos para iconos de cada modulo

**`src/pages/Welcome.tsx`**:
- Agregar propiedad `color` al tipo `ModuleItem` (string para clase de Tailwind)
- Asignar un color unico a cada modulo en `ALL_MODULES`:
  - Contratos: `text-blue-600 bg-blue-100`
  - Patentes: `text-purple-600 bg-purple-100`
  - Ordenes de Compra: `text-orange-600 bg-orange-100`
  - OPEX: `text-emerald-600 bg-emerald-100`
  - CAPEX: `text-amber-600 bg-amber-100`
  - Alertas: `text-red-600 bg-red-100`
  - Informes: `text-cyan-600 bg-cyan-100`
  - KPI: `text-indigo-600 bg-indigo-100`
  - Proveedores: `text-teal-600 bg-teal-100`
  - Mantenciones: `text-rose-600 bg-rose-100`
- Usar estos colores en `SortableModuleCard` en vez del generico `bg-primary/10 text-primary`

### Archivos a modificar
- `src/components/alerts/WelcomeAlertsBar.tsx` - expandir semana por defecto, quitar "Ver todas"
- `src/pages/Welcome.tsx` - cards uniformes en alto, colores de iconos por modulo
