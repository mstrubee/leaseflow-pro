

## Optimizar velocidad de carga del Dashboard

### Problema identificado

La funcion `loadStats()` en `DashboardStats.tsx` realiza una consulta pesada que:
1. Trae TODOS los contratos con 3 JOINs anidados (`contract_addresses`, `termination_notices`, `contract_companies` con `companies`)
2. Procesa toda la agregacion (conteos por region, comuna, empresa) en el cliente
3. Puede chocar con el limite de 1000 filas de la base de datos
4. El componente `EconomicIndicators` llama a una Edge Function que agrega latencia
5. El modulo `PatentsModule` se carga inline, bloqueando el render inicial

### Solucion: Mover agregaciones al servidor + carga paralela

#### 1. Crear funcion RPC `get_dashboard_stats`

Una funcion SQL que calcula todas las estadisticas directamente en la base de datos y devuelve el resultado agregado en una sola llamada, eliminando la transferencia de datos crudos y el procesamiento en el cliente.

La funcion retornara:
- Totales generales (contratos, vigentes, negociacion, vencidos, atencion especial)
- Conteos por empresa (Autoplanet, Agroplanet, Grupo Planet)
- Desglose por region y comuna
- Alertas de terminacion

#### 2. Crear funcion RPC `get_termination_alerts`

Separar la consulta de alertas de terminacion para mantener la funcion principal ligera.

#### 3. Modificar `DashboardStats.tsx`

- Reemplazar la consulta con joins por llamadas a las funciones RPC
- Ejecutar `loadStats` y la carga de permisos en paralelo
- Renderizar las tarjetas de estadisticas inmediatamente y cargar la tabla regional de forma diferida (lazy)

#### 4. Lazy load del modulo de Patentes

Cargar `PatentsModule` con `React.lazy` + `Suspense` para que no bloquee el render inicial del dashboard.

### Archivos a modificar

- **Nueva migracion SQL**: Crear funciones RPC `get_dashboard_stats` y `get_termination_alerts`
- **`src/components/dashboard/DashboardStats.tsx`**: Reemplazar `loadStats` por llamadas RPC, lazy load de PatentsModule

### Resultado esperado

- Reduccion significativa del tiempo de carga (de segundos a milisegundos para las estadisticas)
- Sin limite de 1000 filas ya que la agregacion ocurre en la base de datos
- Las tarjetas principales aparecen casi instantaneamente
- El modulo de patentes se carga en segundo plano

