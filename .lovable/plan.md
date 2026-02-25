

## Plan: Filtro de fecha inmediato, deseleccion del card y boton "Limpiar filtros" flotante

### 1. Al seleccionar fecha, filtrar de inmediato

Actualmente, cambiar la fecha en el input solo actualiza `dateCardValue`, y el filtro solo se aplica al hacer clic en el card. Se cambiara el `onChange` del input de fecha (linea 517-523) para que siempre aplique el filtro de fecha al cambiar el valor:

```typescript
onChange={e => {
  e.stopPropagation();
  const newDate = e.target.value;
  setDateCardValue(newDate);
  updateFilter("dateFilter", newDate);  // siempre filtrar
}}
```

### 2. Deseleccionar el card para limpiar el filtro de fecha

El card ya tiene logica de toggle (lineas 499-504): si `dateFilter` esta activo, al hacer clic lo limpia. Esto ya funciona correctamente, no requiere cambios.

### 3. Boton "Limpiar filtros" flotante en esquina superior derecha

Mover el boton fuera del flujo normal de filtros y hacerlo `fixed` en la esquina superior derecha de la pantalla.

**Cambios:**

- **Remover** el boton "Limpiar filtros" de su posicion actual (lineas 741-753) dentro del div de filtros.
- **Agregar** el boton como elemento `fixed` justo antes del cierre del componente, con clases `fixed top-4 right-4 z-50` para que flote en la esquina superior derecha, visible solo cuando hay filtros activos.

### Detalle tecnico

**Archivo: `src/components/maintenance/MaintenanceModule.tsx`**

1. **Input de fecha (lineas 517-523):** Cambiar para que siempre aplique `updateFilter("dateFilter", newDate)` al cambiar la fecha.

2. **Boton limpiar filtros (lineas 741-753):** Eliminar de su ubicacion actual y moverlo como elemento flotante `fixed top-4 right-4 z-50` al final del return, antes del cierre `</div>`. Se mostrara con una sombra para destacar visualmente.

