## Diagnóstico

CAPEX (y otras secciones) muestra 0 porque las políticas de lectura (RLS `SELECT`) en la base de datos exigen que el usuario tenga una fila explícita en `user_permissions` para `'budget'`, `'contract_budget'` o `'contracts'`. Hoy ningún usuario no-admin tiene esas filas, así que aunque el front lo deje entrar a `/capex`, el `SELECT` sobre `budget_lines`, `contracts`, etc. devuelve cero filas.

Tablas afectadas con `SELECT` restringido por `has_permission`:

`alert_recipients`, `budget_carryover`, `budget_lines`, `budget_reassignments`, `contract_addresses`, `contract_budgets`, `contract_companies`, `contract_contacts`, `contract_documents`, `contract_import_audit`, `contract_patents`, `contract_versions`, `contracts`, `credit_notes`, `finalized_contracts`, `folder_statuses`, `gantt_task_dependencies`, `gantt_task_purchase_orders`, `gantt_tasks`, `gantt_timelines`, `invoices`, `notice_ranges`, `opex_master_budget`, `patent_document_alerts`, `patent_documents`, `purchase_items`, `purchase_orders`, `renegotiation_draft_escalations`, `renegotiation_draft_notice_ranges`, `renegotiation_drafts`, `rent_escalations`, `repository_files`, `repository_folders`, `supplier_categories`, `supplier_emails`, `supplier_influence_zones`, `supplier_products`, `suppliers`, `termination_notices`, `version_notices`.

## Cambios

**Migración SQL única**: reemplazar la política `SELECT` actual de cada una de estas tablas por:

```sql
USING (auth.uid() IS NOT NULL)
```

Es decir: cualquier usuario autenticado puede leer. Las políticas de `INSERT` / `UPDATE` / `DELETE` permanecen intactas y siguen exigiendo `has_permission(...)` o rol admin, así que la edición sigue restringida como hoy.

Para cada tabla:
1. `DROP POLICY` la política `SELECT` existente que usa `has_permission`.
2. `CREATE POLICY` nueva: `FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)`.

**No se tocan**:
- Tablas de seguridad/credenciales: `user_roles`, `user_permissions`, `profiles`, `cloud_storage_tokens`, `auth.*`, `storage.*`.
- Tablas donde la lectura ya es libre para autenticados.
- Las políticas de escritura (`INSERT`/`UPDATE`/`DELETE`/`ALL`) — quedan exactamente como están.

**Front-end**: no requiere cambios. El gating de UI (botones, rutas) lo seguirá manejando `useAuth.hasPermission` / `ProtectedRoute`. Si el usuario llega a la pantalla, ahora la verá con datos.

## Fuera de alcance

- No se elimina ninguna política de escritura.
- No se cambian recursos de admin (`user_roles`, `user_permissions`).
- No se modifica `useAuth` ni la lógica de permisos del front.

## Pregunta

¿Hay alguna sección/tabla en particular que SÍ debas mantener oculta para usuarios sin permiso explícito de lectura? Si no me indicas excepciones, aplico el criterio "lectura abierta a autenticados" a todas las tablas listadas arriba.
