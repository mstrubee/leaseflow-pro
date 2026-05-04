## Problema

Las cartas Gantt creadas por el admin no son visibles para usuarios no-admin que tienen permiso de ver/editar la sección, aunque sí tengan acceso al contrato.

## Causa raíz

Las políticas RLS de las tablas `gantt_timelines`, `gantt_tasks`, `gantt_task_dependencies` y `gantt_task_purchase_orders` validan permisos contra el recurso `'gantt'`:

```
has_permission(auth.uid(), 'gantt', 'view'|'edit'|'all')
```

Pero en este proyecto el identificador de recurso usado en `user_permissions` (y en el selector visual de permisos / RBAC) es **`contract_gantt`** — no existe ningún registro con `resource = 'gantt'`. Resultado: para no-admins, `has_permission(...)` siempre devuelve false y RLS bloquea el SELECT, por lo que el módulo aparece vacío (sin timeline).

Verificado en BD:
- `SELECT DISTINCT resource FROM user_permissions WHERE resource ILIKE '%gantt%'` → solo `contract_gantt`.
- Políticas actuales referencian `'gantt'`.

## Solución

Migración SQL que recrea las políticas RLS de las 4 tablas Gantt para usar el recurso correcto `'contract_gantt'` en `has_permission(...)`. Los admins seguirán pasando por la rama `has_role(..., 'admin')` que ya está en `has_permission`.

Tablas a actualizar:
- `gantt_timelines` (SELECT, INSERT, UPDATE, DELETE)
- `gantt_tasks` (SELECT, INSERT, UPDATE, DELETE)
- `gantt_task_dependencies` (SELECT, INSERT, UPDATE, DELETE)
- `gantt_task_purchase_orders` (SELECT, INSERT, UPDATE, DELETE)

Adicionalmente, las políticas de INSERT actuales tienen `qual = NULL` (no validan nada en USING porque INSERT usa WITH CHECK). Se reemplazarán para que el WITH CHECK también requiera `contract_gantt:edit|all`, evitando que cualquier autenticado pueda insertar.

No se tocan `gantt_templates`, `gantt_template_tasks`, `gantt_template_dependencies` (siguen siendo gestionables solo por admin y visibles a cualquier autenticado, lo cual es correcto).

## Realtime (opcional, recomendado)

Para que los cambios del admin se reflejen sin recargar en sesiones de no-admin abiertas en paralelo:
- Añadir `gantt_timelines`, `gantt_tasks`, `gantt_task_dependencies` a la publicación `supabase_realtime`.
- Suscribir `useGantt` a `postgres_changes` filtrando por `contract_id` para refrescar.

Confirmar si quieres incluir también esta parte de realtime en la misma entrega o solo el fix de RLS.

## Resultado esperado

Tras aplicar la migración, cualquier usuario con `contract_gantt` en `view`, `edit` o `all` verá las líneas de tiempo, tareas y dependencias creadas por el admin para los contratos a los que ya tiene acceso.
