## Qué pasó (en simple)

Las **fechas** del cronograma Antofagasta ya están correctas en la base de datos: todo el proyecto vive entre **dic-2025 y nov-2026** (lo verifiqué tarea por tarea).

El problema que ves en pantalla viene de otro campo: el **Plazo** (días de duración). En la época del bug, el plazo de las **tareas madre y de algunos grupos** quedó guardado con valores absurdos (4.911, 35.902, 8.817… días). Mi recuperación anterior corrigió inicio y término, pero **no reescribió esos plazos**.

La pantalla dibuja cada barra calculando `inicio = término − plazo`. Con un plazo de 35.000 días, el inicio se va a **2013** y el término aparente a **2050**, aunque la fecha real guardada sea 2026. Por eso los plazos se ven "cambiados arbitrariamente".

## Alcance exacto (medido en la base)

- **148 tareas** en total, todas en modo *calendario*.
- **28 tareas** tienen el plazo descuadrado respecto de sus fechas reales (7 tareas madre + 21 entre grupos, hitos y hojas).
- Las otras **120 tareas hoja están perfectas** y no se tocan.
- La convención correcta, confirmada en las tareas sanas, es: **Plazo = (Término − Inicio) + 1 día** (ej. del 26-abr al 15-may = 20 días).

## Corrección

### 1. Reparar los plazos (una sola vez, datos)
Recalcular `duration_days` de las **28 tareas inconsistentes** para que sea igual al lapso real entre su inicio y su término ya recuperados (`(término − inicio) + 1`). Las 120 tareas que ya están bien quedan intactas.

Resultado: Inicio, Plazo y Término quedan coherentes; las barras vuelven a su lugar (dic-2025 → nov-2026) y desaparecen los 2013/2050.

### 2. Blindar la vista (código, anti-recaída)
En el Gantt, hacer que las **tareas madre/grupo muestren su inicio y término a partir del rango real de sus hijas** (no del plazo guardado), y acotar cualquier plazo fuera de rango. Así, aunque algún plazo quedara mal en el futuro, la vista nunca más se irá a 2013/2050.

## Nota honesta
No estoy "inventando" plazos: los derivo de las fechas que ya recuperamos y validamos. Como esos plazos madre/grupo son **calculados** (la suma de sus hijas), el valor reconstruido es el correcto por definición. Las duraciones de las tareas hoja reales no se alteran.

## Detalle técnico

- **DB (cronograma `ec5721cf-…`, Antofagasta):**
  ```sql
  UPDATE gantt_tasks
  SET duration_days = (end_date - start_date) + 1
  WHERE timeline_id = 'ec5721cf-9d6d-4684-8f39-d9053ba89ba0'
    AND duration_type = 'calendar'
    AND duration_days <> (end_date - start_date) + 1;
  ```
  Afecta exactamente 28 filas; las consistentes quedan sin cambios.

- **`src/components/gantt/GanttChart.tsx`:** al renderizar filas con hijos, derivar `start/end` mostrados del span de descendientes (mín. inicio / máx. término) en vez de `término − duration_days`; clamp del plazo al horizonte ya existente. Sin tocar el motor de cálculo (`useGantt.ts`), que ya quedó a prueba de ciclos.

- **Verificación:** tras el UPDATE, re-consultar que no queden filas con `duration_days <> (end_date - start_date) + 1`, y abrir el contrato en preview para confirmar que Inicio/Plazo/Término de las 7 madres se ven en 2026.
