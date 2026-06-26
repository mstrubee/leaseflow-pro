## Qué está pasando (en simple)

Al entrar al contrato **Antofagasta**, el cronograma se congela y cae a pantalla gris. La causa NO es pérdida de datos: es un **bucle de cálculo**.

El cronograma tiene **3 dependencias circulares** (una tarea que, siguiendo la cadena, termina dependiendo de sí misma):

```
1. "Corte de Cinta"  ↔  su tarea madre "Coordinación Corte de Cinta"
2. Grupo Marketing/Logística: "Branding Ventanales", "Imagen", "Recepción Productos"... (20 tareas enlazadas en círculo)
3. Grupo Compras: "Compra Productos", "Aprobación de Comité", "Materialización"... (11 tareas en círculo)
```

Cuando el motor calcula fechas y encuentra un círculo, **nunca termina**: empuja las fechas cada vez más al futuro (llegaron al año 2124 / 2557). Eso genera decenas de miles de columnas de días y el navegador se queda sin memoria → freeze → pantalla gris. Además, la versión anterior **guardaba** esas fechas erradas en cada apertura, empeorándolo cada vez.

**Lo que NO se perdió:** las duraciones (plazos), los tipos de duración, todas las dependencias y sus lags están intactos en la base de datos. Hay tareas ancla intactas en enero 2026 ("Negociación" 10-01-2026). Por eso el cronograma **se puede reconstruir**.

## Plan

### 1. Anti-congelamiento (que nunca más se trabe)
- `GanttChart.tsx`: limitar el rango de fechas que se dibuja. Si los datos contienen fechas absurdas, la interfaz acota el rango a un horizonte máximo (~5–6 años) en vez de intentar pintar 100+ años. Garantiza que el contrato siempre abra, aunque haya datos malos.

### 2. Frenar la corrupción (motor de fechas)
- `useGantt.ts` → quitar la **persistencia automática al cargar** (`loadTimeline`). Cargar las fechas tal como están guardadas; nunca recalcular-y-guardar en silencio al abrir.
- `useGantt.ts` → `computeScheduleDiff`: hacerlo **a prueba de ciclos**. Se reemplaza el bucle de punto-fijo (que puede no converger) por un cálculo en **orden topológico de una sola pasada** que:
  - detecta ciclos y los rompe (ignora la arista que cierra el círculo) en vez de iterar al infinito;
  - aplica un **tope de horizonte**: ninguna fecha puede saltar más allá de un límite razonable;
  - elimina el "parent-block-shift" recursivo, que era la fuente del arrastre infinito.
- El recálculo en cascada sigue ocurriendo **solo ante ediciones explícitas** del usuario (cambiar fecha/plazo/dependencia), nunca al abrir.

### 3. Recuperar las fechas de Antofagasta (una sola vez)
- Eliminar las **3 dependencias circulares** (son inválidas: por ejemplo, una tarea madre no puede depender de su propia hija). Se documentará cuáles se quitaron para que las revises.
- Reconstruir todas las fechas con una migración puntual:
  - anclar en las tareas intactas de enero 2026;
  - recorrer la red de dependencias (ya sin ciclos) respetando cada **plazo**, lag y días hábiles/feriados;
  - calcular inicio = fecha más tardía de sus precedentes (la regla que ya pediste);
  - subir las fechas de las tareas madre desde sus hijas.
- Resultado esperado: cronograma coherente en **2026–2027**, con todos los plazos y dependencias válidas respetados.

### Nota honesta sobre exactitud
Las **duraciones y dependencias se recuperan al 100%**. Las **fechas absolutas** se reconstruyen desde las anclas de 2026; un puñado de tareas que quedaron sueltas (sin una dependencia válida que las ate a las anclas, por los ciclos eliminados) podrían necesitar que confirmes su fecha de inicio manualmente. Te entregaré la lista exacta de esas tareas (estimo unas 3–6) tras la reconstrucción para que las ajustes en segundos. No es posible adivinar con certeza la posición absoluta original de esas pocas tareas porque la lógica anterior sobreescribió su fecha; todo lo demás queda exacto.

## Detalles técnicos
- Archivos: `src/components/gantt/GanttChart.tsx` (guarda de rango), `src/hooks/useGantt.ts` (motor topológico cycle-safe, sin auto-persist en load).
- Datos: migración SQL que (a) borra las 3 filas inválidas de `gantt_task_dependencies` y (b) hace `UPDATE` de `start_date`/`end_date` en `gantt_tasks` del timeline de Antofagasta con las fechas reconstruidas. Se calcula primero en seco y se te muestra el antes/después antes de aplicar.
- Se valida que el resto de los cronogramas (que están sanos) no se vean afectados: el cambio de motor es global pero solo recalcula ante edición; la migración de datos afecta únicamente al timeline de Antofagasta.
- Guardar en memoria del proyecto la regla: **prohibidas las dependencias que formen ciclos** (incluida tarea madre ↔ hija), y el motor del Gantt debe ser topológico con tope de horizonte y sin persistencia automática en la carga.