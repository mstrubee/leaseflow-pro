

## Plan: Sub-estados personalizables, auto-revisado y mejoras de cache

### ✅ COMPLETADO

1. **Auto-cambio a "Revisado" al guardar comentarios** — Implementado en MaintenanceModule.tsx. Al guardar un comentario con Ctrl+Enter, si el form está en estado "solicitado", se marca automáticamente como "revisado" sin preguntar.

2. **Componente admin `MaintenanceSubStatusManager.tsx`** — Creado con CRUD completo para sub-estados personalizables (label, descripción, responsable, color, orden).

3. **Integración en AdminPanel** — El componente está ubicado entre "Estados Comité GP" y "Criticidad de Mantenciones".

4. **Hook dinámico `useMaintenanceSubStatuses.ts`** — Carga sub-estados desde BD con cache en sessionStorage (TTL 10 min).

5. **Refactorización frontend** — MaintenanceModule, MaintenanceEditDialog, maintenanceExport, MaintenanceReports y types.ts usan sub-estados dinámicos del hook.

6. **Cache** — Ya implementado con sessionStorage (TTL 5 min para forms, 10 min para sub-estados).
