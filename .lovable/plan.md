

## Cambio automático a "Clasificado" al asignar criticidad

### Situación actual
Actualmente, cuando se asigna una clasificación de criticidad a un FORM, el sub-estado solo cambia a "Clasificacion_de_Criticidad" si el FORM está en sub-estado "solicitado". Si ya avanzó a otro sub-estado, no se modifica.

### Cambio propuesto
Modificar la lógica para que **siempre** que se asigne una criticidad (valor distinto de "ninguno"), el sub-estado pase automáticamente a "Clasificacion_de_Criticidad" y el estado principal a "proceso", sin importar en qué sub-estado se encuentre actualmente el FORM.

### Archivo a modificar

**`src/components/maintenance/MaintenanceModule.tsx`** (función `handleCriticalityChange`, líneas ~637-656)

- Eliminar la condición `form.sub_status === "solicitado"` del check `shouldAdvance`
- La condición será simplemente: si se asigna una criticidad (no null), entonces avanzar a "Clasificacion_de_Criticidad"
- Si se remueve la criticidad (valor "none"), solo se limpia el campo sin cambiar sub-estado

### Detalle técnico

```text
Antes:  shouldAdvance = newVal && form && form.sub_status === "solicitado"
Después: shouldAdvance = newVal && form
```

Esto asegura que cualquier asignación de criticidad siempre posicione el FORM en el sub-estado "Clasificado", desde donde el usuario puede continuar avanzando manualmente.

