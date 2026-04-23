
## Plan: revisar y acelerar la respuesta general del sistema

### Objetivo
Reducir la sensación de lentitud en toda la app, especialmente en:
- carga inicial
- navegación entre módulos
- selección y edición inline
- escritura en formularios
- detalle de contratos y presupuesto

### Hallazgos principales
1. La app está cargando demasiados módulos pesados desde el arranque:
   - no hay `React.lazy`
   - varias páginas grandes se importan de forma eager
   - se cargan librerías pesadas aunque no se usen en la vista actual (`jspdf`, `pptxgenjs`, `xlsx`, páginas grandes como `PurchaseOrdersDashboard`)
2. Hay procesos globales que siguen activos en casi todas las rutas:
   - heartbeat de presencia hace `PATCH` al perfil cada 30s
   - paneles flotantes y subscripciones en tiempo real viven a nivel global
3. El detalle de contrato monta secciones muy pesadas dentro de una sola página:
   - presupuesto
   - repositorio
   - gantt
   - versiones/documentos
   aunque estén colapsadas o no se usen de inmediato
4. En presupuesto, la edición inline dispara updates frecuentes y recalcula árbol/porcentajes, lo que puede degradar selección, tipeo y respuesta visual.
5. Hay duplicación de lecturas de permisos/perfil:
   - `useAuth` ya carga roles/permisos
   - `useUserPermissions` vuelve a consultar `user_permissions`
   - varias pantallas consultan `profiles` por separado

### Cambios propuestos

#### 1) Reducir carga inicial de la app
**Archivo principal:** `src/App.tsx`

- Convertir páginas grandes a carga diferida con `React.lazy` + `Suspense`
- Priorizar eager solo para:
  - `Auth`
  - `Index/Welcome`
  - layout/auth esenciales
- Pasar a lazy páginas pesadas como:
  - `ContractDetail`
  - `EditContract`
  - `PurchaseOrdersDashboard`
  - `OpexDashboard`
  - `CapexDashboard`
  - `ReportsDashboard`
  - `KPIDashboard`
  - `MaintenanceDashboard`
  - `PatentsDashboard`
  - `AdminPanel`

Impacto esperado:
- mejor tiempo de primer render
- menos bloqueo al iniciar
- menor descarga de JS que no se usa

#### 2) Desacoplar librerías pesadas del bundle principal
**Archivos probables:** exportadores y módulos que los usan

- Mover imports pesados a `import()` dinámicos en el momento de exportar:
  - `xlsx`
  - `jspdf`
  - `pptxgenjs`
- Evitar que esos paquetes entren al bundle inicial de navegación normal

Impacto esperado:
- menos peso inicial
- menos trabajo de parse/execute al cargar cualquier pantalla

#### 3) Bajar el costo de procesos globales siempre montados
**Archivos:**  
- `src/components/layout/MainLayout.tsx`
- `src/hooks/usePresenceHeartbeat.ts`
- `src/components/alerts/TodayAlertsFloating.tsx`

Cambios:
- limitar `usePresenceHeartbeat()` a usuarios autenticados y rutas donde realmente aporta
- evitar update periódico si la pestaña está oculta (`document.visibilityState`)
- no hacer `supabase.auth.getUser()` en cada heartbeat; reutilizar usuario ya resuelto desde auth/context
- espaciar heartbeat o hacerlo inteligente:
  - inmediato al entrar/cambiar sección
  - luego intervalos más largos si no hay actividad real
- revisar `TodayAlertsFloating` para que no cargue/subscriba globalmente si está cerrado o si la vista no lo necesita

Impacto esperado:
- menos tráfico constante
- menos renders y menos trabajo en background
- menor interferencia con edición/selección

#### 4) Evitar doble lectura de permisos y datos base
**Archivos:**  
- `src/hooks/useAuth.tsx`
- `src/hooks/useUserPermissions.ts`
- consumidores como `src/pages/ContractDetail.tsx` y `src/components/dashboard/DashboardStats.tsx`

Cambios:
- unificar permisos en una sola fuente de verdad basada en `useAuth`
- eliminar fetch redundante a `user_permissions` desde `useUserPermissions` o convertirlo en wrapper liviano sobre el contexto
- donde solo se necesita ocultar secciones, resolver desde permisos ya cargados en memoria
- revisar lecturas repetidas de `profiles` cuando solo se necesita nombre del usuario actual

Impacto esperado:
- menos roundtrips
- menos estados de loading
- navegación más rápida entre vistas

#### 5) Carga diferida de secciones pesadas en detalle de contrato
**Archivo clave:** `src/pages/ContractDetail.tsx`

Cambios:
- no montar todo el contenido pesado desde el inicio
- cargar bajo demanda las secciones complejas cuando:
  - se expanden por primera vez, o
  - el usuario navega explícitamente a ellas
- aplicar lazy/lazy-inner a:
  - `BudgetDashboard`
  - `RepositorySection`
  - `GanttModule`
  - paneles de versiones/documentos si corresponde

Opcional recomendado:
- cachear la primera carga por sección para que al reabrir no recargue de cero

Impacto esperado:
- detalle de contrato más ágil
- mejor respuesta al hacer click, escribir y navegar dentro del contrato

#### 6) Optimizar edición y selección en presupuesto
**Archivos:**  
- `src/components/budget/BudgetModule.tsx`
- `src/components/budget/BudgetLineTree.tsx`

Cambios:
- separar edición visual local de persistencia remota:
  - el input responde instantáneamente
  - el guardado ocurre en blur/Enter, no durante cada microcambio innecesario
- revisar `applyLineUpdate` y `recalcPercentageLinesLocally` para evitar trabajo repetido sobre todo el árbol en cada edición menor
- evitar que la recalculación use un snapshot viejo de `lines`
- donde sea posible, recalcular solo subárbol afectado y líneas porcentaje dependientes
- confirmar que selección de filas no dependa de rerenders grandes del árbol completo

Impacto esperado:
- typing más fluido
- menos lag al editar montos/cantidades
- selección visual más inmediata

#### 7) Revisar suscripciones en tiempo real y cargas abiertas
**Archivos probables:**  
- `TodayAlertsFloating`
- `WelcomeAlertsBar`
- `AdminPanel`
- otros módulos con `.channel(...)`

Cambios:
- suscribirse solo cuando la UI correspondiente esté visible/abierta
- evitar recargar listas completas ante cualquier cambio si basta actualizar el registro afectado
- desmontar canales en cuanto no se usen

Impacto esperado:
- menos trabajo en segundo plano
- menos interferencia con interacción principal

### Validación esperada
Después de implementar:
1. La carga inicial debe sentirse claramente más rápida.
2. Entrar a detalle de contrato no debe bloquear varios segundos.
3. Seleccionar y editar líneas de presupuesto debe responder al instante.
4. Escribir en campos no debe tener sensación de “teclado atrasado”.
5. Navegar entre módulos debe evitar recargas pesadas innecesarias.
6. El tráfico en background debe bajar, especialmente updates periódicos de presencia.

### Archivos más probables a tocar
- `src/App.tsx`
- `src/components/layout/MainLayout.tsx`
- `src/hooks/usePresenceHeartbeat.ts`
- `src/hooks/useAuth.tsx`
- `src/hooks/useUserPermissions.ts`
- `src/components/alerts/TodayAlertsFloating.tsx`
- `src/pages/ContractDetail.tsx`
- `src/components/budget/BudgetModule.tsx`
- `src/components/budget/BudgetLineTree.tsx`
- archivos de exportación/importación que hoy importan `xlsx`, `jspdf`, `pptxgenjs` en forma directa

## Detalle técnico
Se detectaron señales claras de sobrecarga frontend:
- primer contenido visible muy tardío
- bundle con muchos scripts cargados al inicio
- ausencia de lazy loading en rutas
- heartbeat global haciendo `PATCH` periódico al perfil
- detalle de contrato montando secciones complejas de una vez
- presupuesto con árbol grande + recálculo optimista + persistencia frecuente

Secuencia recomendada de implementación:

```text
1. Lazy routes
2. Dynamic import de librerías pesadas
3. Reducir trabajo global (heartbeat + flotantes + subscripciones)
4. Eliminar fetch redundante de permisos
5. Lazy mount en ContractDetail
6. Optimizar árbol y edición de presupuesto
7. Verificar mejora percibida y perf browser
```

### Prioridad
- Alta: `App.tsx`, `ContractDetail.tsx`, `usePresenceHeartbeat.ts`, `BudgetModule.tsx`
- Media: `TodayAlertsFloating.tsx`, `useUserPermissions.ts`
- Media/Alta: imports dinámicos de `xlsx/jspdf/pptxgenjs`
