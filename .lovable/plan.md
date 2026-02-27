

## Redimensionar ventana flotante de alertas hacia arriba

Agregar una funcionalidad de resize manual en el borde superior de la ventana flotante de alertas, permitiendo al usuario arrastrar hacia arriba para ampliar la lista visible cuando esta expandida.

### Cambios

**Archivo: `src/components/alerts/TodayAlertsFloating.tsx`**

1. **Nuevo estado para altura personalizada**: Agregar `customHeight` (number | null) que controle la altura maxima del listado de alertas (reemplazando el `max-h-60` fijo).

2. **Handle de resize en el borde superior**: Agregar un elemento pequeno (barra horizontal de 4px) en la parte superior de la Card que actue como "resize handle". El usuario arrastra hacia arriba para aumentar la altura del contenedor de alertas.

3. **Logica de resize**:
   - `onPointerDown` en el handle: captura la posicion Y inicial y la altura actual
   - `onPointerMove`: calcula la diferencia Y (hacia arriba = mayor altura) y actualiza `customHeight`
   - `onPointerUp`: termina el resize
   - Limites: minimo 240px (equivalente a max-h-60), maximo ~70% del viewport

4. **Aplicar altura dinamica**: El div del listado (`max-h-60 overflow-y-auto`) usara `style={{ maxHeight: customHeight || 240 }}` en lugar de la clase fija.

5. **Reset al colapsar**: Cuando `isOpen` cambia a false, resetear `customHeight` a null para que al reabrir vuelva al tamano por defecto.

6. **Indicador visual**: El handle tendra un cursor `ns-resize` y mostrara una linea sutil (similar a un grip horizontal) para indicar que es arrastrable.

### Detalle tecnico

```text
Estado nuevo:
  customHeight: number | null  (default: null, usa 240px)
  isResizing: boolean (default: false)
  resizeStartY: useRef<number>
  resizeStartHeight: useRef<number>

Handle de resize (div encima de la Card):
  - height: 6px, cursor: ns-resize
  - Icono: linea horizontal centrada (GripHorizontal de lucide o borde visual)
  - Solo visible cuando isOpen === true

Logica:
  onPointerDown -> captura Y, captura height actual, setPointerCapture
  onPointerMove -> newHeight = startHeight + (startY - currentY)  // hacia arriba = mayor
  onPointerUp -> fin
  Clamp entre 150 y window.innerHeight * 0.7

Listado de alertas:
  <div style={{ maxHeight: customHeight ?? 240 }} className="space-y-2 overflow-y-auto">
```

### Archivo afectado

| Archivo | Cambio |
|---------|--------|
| `src/components/alerts/TodayAlertsFloating.tsx` | Agregar resize handle, estado de altura, logica de arrastre |

