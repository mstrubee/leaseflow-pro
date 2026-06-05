## Plan

Corregiré el congelamiento que deja la pantalla negra con la ventana emergente visible en **Registro Reuniones**.

### Cambios propuestos

1. **Eliminar el conflicto de modales simultáneos**
   - El problema persiste porque el `AlertDialog` de confirmación se abre mientras el `Dialog` principal sigue activo.
   - Cambiaré la confirmación de eliminación para que no use un segundo modal Radix sobre el modal principal.

2. **Reemplazar la confirmación por un estado inline**
   - Al presionar el basurero, la fila de la reunión mostrará acciones inline: **Cancelar** y **Eliminar**.
   - Esto evita overlay adicional, focus-lock duplicado y `pointer-events` bloqueado en el `body`.

3. **Limpiar estados bloqueantes**
   - Cerraré cualquier popover/directorio abierto al cerrar el modal principal.
   - Mantendré una limpieza defensiva de `document.body.style.pointerEvents` al cerrar/desmontar.

4. **Validación**
   - Verificaré que abrir/cerrar Registro Reuniones no deje pantalla negra congelada.
   - Verificaré que eliminar o cancelar una reunión mantenga el modal y la página interactivos.