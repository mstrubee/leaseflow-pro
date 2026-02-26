

## Reglas de flujo de sub-estados en Mantenciones

### Resumen de cambios

Se implementaran 4 reglas de negocio para el flujo de sub-estados:

1. **"Solicitado" solo cambia con asignacion de criticidad** -- no se puede cambiar manualmente ni por comentario.
2. **Estado "Solucionado" solo cuando sub-estado es "Resuelto"** -- el estado principal cambia automaticamente.
3. **Criticidad siempre lleva a sub-estado "clasificado"** (no "Clasificacion_de_Criticidad") -- se corrige el nombre del sub-estado.
4. **Una vez clasificado, el usuario puede cambiar manualmente pero no volver a "Solicitado"**.

---

### Archivos a modificar

#### 1. `src/components/maintenance/MaintenanceModule.tsx`

**handleCriticalityChange (~linea 637-656)**
- Cambiar `"Clasificacion_de_Criticidad"` por `"clasificado"` en el sub_status que se asigna automaticamente.

**saveComment (~linea 659-682)**
- Eliminar la logica que cambia sub_status de "solicitado" a "revisado" al guardar un comentario. Los comentarios ya no deben cambiar el sub-estado.

**handleSubStatusChange (~linea 684-706)**
- Agregar validacion: si el FORM esta en sub_status "solicitado", bloquear el cambio manual y mostrar un toast indicando que debe asignarse criticidad primero.
- Agregar validacion: no permitir seleccionar "solicitado" manualmente (solo el estado inicial).
- Agregar logica: si el nuevo sub-estado es "resuelto", cambiar automaticamente el status principal a "solucionado".
- Si el sub-estado cambia desde "resuelto" a otro, volver status a "proceso".

**SubStatusCell (~linea 106-188)**
- Filtrar la opcion "Solicitado" del dropdown cuando el FORM ya no esta en "solicitado" (para que no se pueda volver).
- Si el FORM esta en "solicitado", deshabilitar el dropdown o mostrar mensaje de que debe asignarse criticidad.

#### 2. `src/components/maintenance/MaintenanceEditDialog.tsx`

**doSave (~linea 63-90)**
- Agregar logica: si finalSubStatus es "resuelto", el status debe ser "solucionado".
- Si el FORM esta en "solicitado", no permitir cambio manual de sub-estado.

**Select de Sub Estado (~linea 123-140)**
- Filtrar "solicitado" de las opciones cuando el FORM ya fue clasificado.
- Deshabilitar el select si el sub_status actual es "solicitado".

---

### Detalle tecnico

```text
Reglas:
  solicitado -> clasificado    (solo via criticidad)
  clasificado -> [manual]      (excepto volver a solicitado)
  resuelto -> status=solucionado (automatico)
  cualquier otro -> status=proceso
```

