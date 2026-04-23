

## Revisión de operatividad: FloatingCalculator

He revisado a fondo `src/components/FloatingCalculator.tsx` y encontré varios problemas de operatividad reales que afectan el uso diario de la calculadora.

### Problemas detectados

**1. Operadores encadenados rompen el cálculo inicial**
En `pushEntry` (línea 113), cuando es la primera entrada, sólo se inserta el valor pero **se descarta la operación pendiente** porque la rama `if (entries.length === 0 && !pendingOp)` no usa `op`. Resultado: si tras `=` el usuario presiona `+ 5 =`, el operador se pierde en el primer push.

**2. `handleEquals` con un solo número repite el resultado**
Al pulsar `=` sin operador previo y con historial vacío, se crea una entrada extra duplicando el valor (línea 146). El display muestra `5` pero internamente se inserta una entrada redundante.

**3. Edición de valor no permite vaciar el campo**
`updateEntryValue` (línea 177) deja el input editable, pero `parseNum("")` devuelve 0 y eso recalcula toda la cadena con ceros. Si el usuario borra para escribir, todos los resultados posteriores colapsan a 0 hasta terminar de escribir.

**4. El input del historial colisiona con el teclado de la calculadora**
Aunque hay `onKeyDown={e => e.stopPropagation()}` en el input (línea 275), al estar dentro del div con `onKeyDown={handleKeyDown}` y ser foco activo, las teclas numéricas se duplican en algunos navegadores porque el `Tab` de tabla recibe foco doble.

**5. Conversor UF↔$ no maneja entrada vacía/inválida con elegancia**
`ufToCLP` y `clpToUF` (líneas 221–222) usan `parseFloat || 0` y muestran "$ 0" cuando el usuario borra, en vez de ocultar la línea. Funciona, pero es ruidoso.

**6. Drag se reinicia tras 5 s aunque el usuario quiera mantener la posición**
El `setTimeout` de retorno (línea 100) es agresivo: si el usuario reposiciona la calculadora y se queda mirando, salta de vuelta a la esquina sin previo aviso.

**7. Sin persistencia del historial**
Si el usuario navega entre páginas, el historial se pierde. Para una calculadora "flotante de trabajo" sería útil mantenerlo en `sessionStorage`.

**8. UF del header sin formato de miles consistente con el conversor**
El badge muestra `$40.013,88` pero la línea del tab Convertir muestra `$40.014` (sin decimales). Inconsistencia visual menor.

### Plan de correcciones

**A. Lógica de cálculo (núcleo)**
- En `pushEntry`, si `entries.length === 0` y hay valor, crear la primera entrada y, si llega un operador, guardarlo en `pendingOp` (ya se hace) — eliminar el caso especial que descarta el operador.
- En `handleEquals`, si no hay `pendingOp` ni entradas previas, **no crear entrada nueva**: simplemente dejar `currentInput` como está.
- En `updateEntryValue`, tratar string vacío manteniendo `value=""` pero sin recalcular hasta `onBlur`, o usar `parseNum` que devuelva `NaN` y propagar `—` en los resultados intermedios para no mostrar ceros engañosos.

**B. UX del conversor**
- Ocultar la línea de equivalencia cuando el input es 0 o vacío (cambiar condición de truthy del string a `parseNum > 0`).
- Unificar formato de UF: mostrar siempre con 2 decimales en ambos lugares (`$40.013,88`).

**C. Drag**
- Aumentar el timeout de retorno de 5 s a 30 s, o mejor: eliminarlo y agregar un botón "↺" pequeño para volver a la posición original cuando esté desplazada. Más predecible.

**D. Persistencia**
- Guardar `entries`, `currentInput` y `pendingOp` en `sessionStorage` con clave `floating-calc-state`. Restaurar al montar. Esto sobrevive navegación entre rutas dentro de la misma sesión.

**E. Teclado**
- Mover el `onKeyDown` del contenedor a un handler que ignore eventos cuyo `target` sea un `<input>` o `<button>` interno del historial, para prevenir doble manejo.

### Archivos a modificar
- `src/components/FloatingCalculator.tsx` (único archivo)

### Detalles técnicos
- Sin cambios de tipos ni de hooks externos.
- `useEconomicIndicators` permanece intacto.
- Sin migraciones de BD ni edge functions.
- Cambios contenidos: ~60 líneas modificadas, sin nuevas dependencias.

