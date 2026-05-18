## Cambio en columna "Comité GP" de `ContractsTable.tsx`

En `src/components/contracts/ContractsTable.tsx` (líneas ~838-861):

1. **Ancho del SelectTrigger**: quitar `w-[110px]` y reemplazar por `w-full`, y eliminar el wrapper `<div className="flex justify-center">` para que el trigger ocupe todo el ancho disponible de la celda. La celda mantiene `min-w-[120px]` (se puede subir a ~160px si hace falta más espacio) para que los nombres largos como "Revisión Etapa 2" se lean completos.

2. **Respetar el orden manual**: el `.sort((a, b) => a.name.localeCompare(b.name, "es"))` en la línea 850 reordena alfabéticamente y anula el orden manual configurado en Admin. Quitar el `sort` para que el dropdown use `display_order` (ya viene ordenado desde el hook).

Sin cambios de datos ni de esquema.
