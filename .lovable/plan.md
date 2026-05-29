## Plan: Arreglar panel flotante de Usuarios Conectados

### Problemas detectados en `src/components/FloatingUserStatus.tsx`

1. **Scroll no funciona**: `<ScrollArea className="max-h-72">` no garantiza scroll porque el componente `ScrollArea` de Radix requiere una altura fija explícita en el contenedor. Solo `max-h-72` no activa el scrollbar cuando el contenido excede la altura.
2. **No cierra al hacer click fuera**: No existe un `useEffect` ni `useRef` para detectar clicks fuera del panel y cerrarlo automáticamente.

### Cambios a realizar

1. **Arreglar scroll**: Reemplazar `max-h-72` por `h-72` en el `ScrollArea`, asegurando que el contenedor tenga altura fija y el scroll se active correctamente cuando hay muchos usuarios.
2. **Cerrar al hacer click fuera**: Agregar un `useRef` al contenedor del panel, y un `useEffect` que escuche eventos `mousedown` a nivel documento. Si el click ocurre fuera del panel **y** fuera del botón trigger, cerrar (`setOpen(false)`).

### Archivo a editar
- `src/components/FloatingUserStatus.tsx`