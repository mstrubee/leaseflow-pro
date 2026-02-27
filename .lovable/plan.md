

## Dialogo de resolucion con observaciones y ajuste de columna Fecha

### Resumen

Dos cambios: (1) Al marcar un Form como "resuelto" (desde SubStatusCell o desde el boton "Guardar y Avanzar" en el EditDialog), se muestra un dialogo intermedio con dos opciones: "Marcar como resuelto" y "Resuelto con observaciones". La segunda opcion abre un campo de texto para ingresar observaciones antes de confirmar. (2) Ensanchar la columna "Fecha" un 20% y mostrar los dias de antiguedad en una segunda linea.

---

### 1. Nueva columna en base de datos

Agregar campo `resolution_observations` (text, nullable) a la tabla `maintenance_forms` via migracion SQL.

Tambien actualizar el tipo `MaintenanceForm` en `src/components/maintenance/types.ts` para incluir `resolution_observations: string | null`.

---

### 2. Nuevo componente: `ResolutionDialog`

Crear `src/components/maintenance/ResolutionDialog.tsx`:

- **Paso 1 (dialogo principal)**: Muestra dos botones:
  - "Marcar como resuelto" -- cierra el dialogo y ejecuta la accion de marcar como resuelto directamente
  - "Resuelto con observaciones" -- cambia al paso 2
  - "Cancelar" -- cierra todo

- **Paso 2 (observaciones)**: Muestra un Textarea con las observaciones existentes (si las hay, precargadas para edicion). Botones:
  - "Guardar y Resolver" -- guarda observaciones y marca como resuelto
  - "Cancelar" -- vuelve al paso 1

Props del componente:
```text
open: boolean
onOpenChange: (open: boolean) => void
existingObservations: string | null
onResolve: (observations: string | null) => void
```

---

### 3. Integracion en SubStatusCell

En `MaintenanceModule.tsx`, modificar `handleSubStatusChange`:
- Cuando `newSubStatus === "resuelto"`, en vez de ejecutar directamente, abrir el `ResolutionDialog`
- Agregar estado: `resolutionTarget` (formId que se quiere resolver) y `resolutionOpen` (boolean)
- Al confirmar en el dialogo, ejecutar el update incluyendo `resolution_observations` en el payload

---

### 4. Integracion en MaintenanceEditDialog

En `MaintenanceEditDialog.tsx`:
- Agregar `resolution_observations` al formData state
- Mostrar un campo Textarea "Resuelto con Observaciones - Control de Gestion" (editable) debajo de "Comentarios Tecnicos"
- Cuando `doSave(advance)` detecta que el `finalSubStatus === "resuelto"`, abrir el `ResolutionDialog` en vez de guardar directamente
- Si hay observaciones existentes en el form, precargarlas en el dialogo

---

### 5. Columna "Fecha" mas ancha con dias de antiguedad

En `MaintenanceModule.tsx`:
- Cambiar `className="w-28"` de la columna Fecha a `className="w-[8.4rem]"` (20% mas ancho que w-28 = 7rem)
- En la celda de fecha, agregar una segunda linea con los dias de antiguedad:

```text
Linea 1: dd/MM/yyyy (fecha formateada)
Linea 2: "X dias" en texto muted mas pequeno
```

Calculo: `Math.floor((Date.now() - new Date(f.created_date).getTime()) / 86400000)` dias.

---

### Archivos afectados

| Archivo | Accion |
|---------|--------|
| Migracion SQL | Agregar `resolution_observations` a `maintenance_forms` |
| `src/components/maintenance/types.ts` | Agregar campo `resolution_observations` |
| `src/components/maintenance/ResolutionDialog.tsx` | Crear componente nuevo (dialogo 2 pasos) |
| `src/components/maintenance/MaintenanceModule.tsx` | Interceptar cambio a "resuelto" con dialogo, ensanchar columna fecha, agregar dias |
| `src/components/maintenance/MaintenanceEditDialog.tsx` | Campo observaciones + interceptar resolucion con dialogo |

