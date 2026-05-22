Voy a deshacer la parte que introduje con `window.open`/popup y volver a una descarga directa desde el click del usuario.

Plan:
1. Cambiar `src/components/budget/CapexExcelExport.ts` para eliminar el flujo de popup/nueva pestaña.
2. Usar descarga directa con un `<a download>` temporal y `Blob`, disparada dentro del mismo evento del botón.
3. Agregar validación mínima: si no se puede crear el archivo, lanzar error para que no aparezca “Excel descargado” falsamente.
4. Revisar el handler en `src/pages/CapexDashboard.tsx` para que el toast de éxito solo aparezca después de ejecutar correctamente la descarga.

Detalle técnico:
- El cambio roto más probable es el `window.open(url, "_blank")`: para `blob:` en iframe/preview puede abrir o consumir el gesto del usuario sin iniciar una descarga real, aunque el popup no esté bloqueado.
- La corrección será eliminar esa rama y dejar un único método de descarga, similar al patrón que ya funciona en otros módulos del proyecto.