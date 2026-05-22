## Plan

1. **Reemplazar el método de descarga del Excel CAPEX**
   - Cambiar `src/components/budget/CapexExcelExport.ts` para que deje de depender de `XLSX.writeFile`, que puede no disparar descarga de forma confiable en el preview/iframe.
   - Generar explícitamente el `.xlsx` con `XLSX.write(..., { type: "array" })`, crear un `Blob`, preparar un `<a download>`, hacer click programático y limpiar el objeto URL después.
   - Este patrón ya existe y funciona en otros exportadores del proyecto.

2. **Evitar el toast falso de éxito**
   - Hacer que `exportCapexToExcel` retorne información del archivo generado, al menos `filename` y tamaño del `Blob`.
   - Si el buffer/Blob queda vacío o falla la creación del link, lanzar error para que no aparezca “Excel descargado”.

3. **Actualizar el handler del dashboard**
   - En `src/pages/CapexDashboard.tsx`, mostrar éxito solo cuando `exportCapexToExcel` termine con archivo válido.
   - Mantener el botón bloqueado durante la generación y conservar el manejo de error actual.

4. **Verificación**
   - Revisar que el flujo compile a nivel de código y que no quede ningún `window.open` ni popup involucrado.
   - Usar el patrón con `data-interception="off"` si aplica, igual que el PPT, para que Lovable/preview no intercepte el enlace de descarga.