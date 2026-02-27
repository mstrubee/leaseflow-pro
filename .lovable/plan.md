

## Evitar recarga de formularios al abrir la seccion de Mantenciones

### Problema

Actualmente, cada vez que se abre la seccion de Mantenciones, el sistema re-descarga **todos** los formularios desde la base de datos (lineas 429-438), incluso cuando ya existen datos en cache. Esto ocurre porque el `useEffect` siempre ejecuta `fetchForms()`, aunque haya datos cacheados en `sessionStorage`.

### Solucion

Modificar la logica de carga inicial para que, si hay datos en cache validos, **no se vuelva a consultar la base de datos**. Solo se recargaran los formularios en dos casos:
1. Primera visita (sin cache)
2. Despues de una carga masiva por Excel (ya manejado por `handleDataChanged`)

### Cambios en `src/components/maintenance/MaintenanceModule.tsx`

**1. Aumentar TTL del cache**
- Cambiar de 5 minutos a 30 minutos para que el cache persista durante la sesion de trabajo normal

**2. Modificar el useEffect de carga inicial (lineas 429-438)**
- Si hay datos en cache validos, NO llamar a `fetchForms` - usar los datos cacheados directamente
- Solo llamar a `fetchForms` si no hay cache

Logica actual:
```text
// Siempre llama fetchForms, incluso con cache
if (cachedForms) {
  fetchForms(false);  // <-- recarga innecesaria
} else {
  fetchForms(true);
}
```

Logica nueva:
```text
// Solo fetch si NO hay cache
if (!cachedForms) {
  fetchForms(true);
}
// Si hay cache, los datos ya estan en el state inicial via useState
```

**3. Aplicar lo mismo a criticality y company map (lineas 440-476)**
- Si hay datos cacheados de criticality, no re-consultar
- Si hay datos cacheados de company map, no re-consultar

### Archivo a modificar
- `src/components/maintenance/MaintenanceModule.tsx`

### Resultado esperado
- Al navegar a Mantenciones con datos ya cargados: apertura instantanea sin consultas a la base de datos
- Al cargar formularios nuevos via Excel: recarga completa como hasta ahora
- Los cambios del usuario (criticidad, sub-estados, comentarios) se mantienen intactos en el cache

