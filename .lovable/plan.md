

# Correccion de logica: Salida se ejecuta N meses desde el aviso, no dentro del rango

## Contexto del cambio

Actualmente el sistema calcula la fecha tope de aviso como `rango.end_month - N meses`, implicando que la salida ocurre dentro del rango. La logica correcta es:

- El **rango de salida** define la ventana donde se PUEDE ejecutar la salida
- Para poder salir, se debe dar aviso con **N meses de anticipacion**
- La **fecha tope de aviso** es el limite para dar el aviso (calculada como `rango.end_month - N`)
- La **salida efectiva** ocurre **N meses despues de la fecha en que se da el aviso**, no necesariamente dentro del rango

Ejemplo: Rango M60-M72, aviso de 12 meses. Si doy aviso en M55, la salida es en M67 (55+12). Si doy aviso en M60 (tope), la salida seria en M72.

## Cambios requeridos

### 1. MultipleNoticesSection.tsx - Corregir textos y calculo de "Salida Esperada"

- Cambiar la descripcion de cada aviso: actualmente dice "X meses antes de la fecha de termino anticipado", debe decir "La salida se ejecutara X meses despues de dar el aviso"
- Ajustar la etiqueta del rango seleccionado: en vez de solo "Aviso tope: Mes N", agregar contexto de que la salida sera N meses despues del aviso
- Actualizar `createAlertsFromNotices`: el mensaje de alerta debe reflejar que la salida es N meses despues del aviso, no una fecha fija del rango

### 2. TerminationNoticesSection.tsx - Auto-calcular fecha de salida

- Cuando el usuario registra un aviso (sent/received) con fecha de aviso, **auto-calcular** la "Fecha de Salida Requerida" como `fecha_aviso + N meses`
- Obtener el valor N del contrato (months_before del aviso configurado o notice_value de la version)
- Pre-llenar el campo `requiredExitDate` al cambiar `noticeDate`, permitiendo override manual
- Agregar props para recibir la configuracion de meses de aviso del contrato

### 3. CompactEscalationChart.tsx - Actualizar visualizacion

- Mantener las areas sombreadas como "Rango Salida" (correcto, son las ventanas de salida)
- Mantener las lineas de "Tope Aviso" (correcto, son los limites para dar aviso)
- Cuando hay un aviso registrado (terminationNotices), la "Salida Esperada" debe calcularse como `fecha_aviso + N meses`, no como un punto fijo del rango
- Agregar prop para pasar los meses de aviso (N) para el calculo correcto de la linea de salida esperada

### 4. CommercialConditionsSummary.tsx - Corregir label de fecha

- En la seccion "Fecha Tope Aviso" para rangos, aclarar que es la fecha limite para dar aviso
- Agregar texto explicativo: "La salida se ejecuta N meses despues del aviso"

### 5. createAlertsFromNotices (en MultipleNoticesSection.tsx) - Corregir mensaje

- Actualizar el mensaje de alerta para reflejar la logica correcta
- En vez de "Fecha limite: [fecha tope]", incluir "Dar aviso antes del [fecha tope]. La salida se ejecutara [N] meses despues del aviso"

## Seccion tecnica

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/contracts/MultipleNoticesSection.tsx` | Textos descriptivos, mensaje de alertas |
| `src/components/contracts/TerminationNoticesSection.tsx` | Auto-calculo de exit date = notice_date + N meses |
| `src/components/contracts/CompactEscalationChart.tsx` | Calculo de salida esperada basado en aviso + N |
| `src/components/contracts/CommercialConditionsSummary.tsx` | Label explicativo en seccion de aviso |
| `src/pages/ContractDetail.tsx` | Pasar meses de aviso como prop a TerminationNoticesSection |

### Logica de calculo

```text
ANTES (incorrecto):
  Tope Aviso = rango.end_month - N
  Salida = dentro del rango (implicito)

DESPUES (correcto):
  Tope Aviso = rango.end_month - N  (no cambia)
  Salida Esperada = fecha_aviso_real + N meses
  
  Si no hay aviso registrado, se muestra solo el Tope Aviso
  Si hay aviso registrado, se calcula: salida = aviso + N
```

### Flujo al registrar aviso

```text
1. Usuario selecciona fecha de aviso (ej: 15-mar-2028)
2. Sistema auto-calcula: Salida = 15-mar-2028 + 12 meses = 15-mar-2029
3. Campo "Fecha de Salida" se pre-llena con 15-mar-2029
4. Usuario puede modificar si es necesario
5. Al guardar, el chart muestra la linea de "Salida Esperada" en la fecha correcta
```

### Sin cambios en base de datos

No se requieren migraciones. Los campos existentes (`required_exit_date`, `notice_date`) ya soportan esta logica. Solo cambia como se calculan y presentan.

